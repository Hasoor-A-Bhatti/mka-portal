"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { SPECIAL_STATUSES } from "@/lib/special";
import { friendly as baseFriendly, guarded, isId, text, whole, Invalid, type Result } from "@/lib/storage-actions";

const SLUG = "special-arrangements";

type DbError = { code?: string; message: string };

function friendly(error: DbError) {
  const code = error.code ?? "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return "Run supabase/migrations/0016_special_items.sql in Supabase first.";
  return baseFriendly(error);
}

async function special(need: "edit" | "manage") {
  const session = await getSession();
  if (!session.canAccess(SLUG)) return { error: "Special Arrangements isn't on your account." } as const;
  if (!session.canEdit(SLUG)) return { error: "Your Special Arrangements access is view only." } as const;
  if (need === "manage" && !session.isManager(SLUG)) return { error: "Only the Special Arrangements department admin can remove items." } as const;
  return { supabase: session.supabase } as const;
}

function done(): Result {
  revalidatePath(`/${SLUG}`);
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true };
}

function status(v: unknown) {
  const s = String(v ?? "");
  if (!(SPECIAL_STATUSES as readonly string[]).includes(s)) throw new Invalid("Pick Available, Unavailable or Damaged.");
  return s;
}

export async function saveSpecialItem(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await special("edit");
    if ("error" in c) return { error: c.error };
    if (id && !isId(id)) return { error: "That item doesn't exist." };
    const payload = {
      item_name: text(fd, "item_name", "Item", { required: true, max: 160 }),
      quantity: whole(fd, "quantity", "Quantity", { required: true }),
      location: text(fd, "location", "Location", { max: 160 }),
      status: status(fd.get("status")),
      notes: text(fd, "notes", "Notes", { max: 2000 }),
    };
    const { data, error } = id
      ? await c.supabase.from("special_items").update(payload).eq("id", id).select("id")
      : await c.supabase.from("special_items").insert(payload).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That item couldn't be saved." };
    return done();
  });
}

export async function setSpecialStatus(id: string, value: string): Promise<Result> {
  return guarded(async () => {
    const c = await special("edit");
    if ("error" in c) return { error: c.error };
    if (!isId(id)) return { error: "That item doesn't exist." };
    const { data, error } = await c.supabase.from("special_items").update({ status: status(value) }).eq("id", id).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That item couldn't be updated." };
    return done();
  });
}

export async function deleteSpecialItem(id: string): Promise<Result> {
  const c = await special("manage");
  if ("error" in c) return { error: c.error };
  if (!isId(id)) return { error: "That item doesn't exist." };
  const { data, error } = await c.supabase.from("special_items").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That item couldn't be removed." };
  return done();
}
