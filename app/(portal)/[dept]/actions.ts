"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDepartment, type Department } from "@/lib/departments";

export type SaveState = { ok?: boolean; error?: string; savedAt?: number };

type DbError = { code?: string; message: string };

function friendly(error: DbError, dept: Department): string {
  if (error.code === "23505") {
    const label = dept.fields.find((f) => f.name === dept.titleField)?.label ?? "name";
    return `There's already a ${dept.noun} with that ${label.toLowerCase()}.`;
  }
  if (error.code === "42501") return "You don't have permission to do that in this department.";
  if (error.code === "23502") return "A required field is empty.";
  return error.message;
}

/**
 * Creates (id = null) or updates a record. created_by / updated_by and the
 * audit trail are set by the database from the signed-in user, never from here.
 */
export async function saveRecord(
  slug: string,
  id: string | null,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const dept = getDepartment(slug);
  if (!dept) return { error: "That department doesn't exist." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has ended. Sign in again to save." };

  const payload: Record<string, string | number | null> = {};

  for (const f of dept.fields) {
    const raw = String(formData.get(f.name) ?? "").trim();

    if (!raw) {
      if (f.required) return { error: `${f.label} is required.` };
      payload[f.name] = null;
      continue;
    }

    switch (f.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return { error: `${f.label} must be a whole number.` };
        payload[f.name] = n;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: `${f.label} isn't a valid date.` };
        payload[f.name] = raw;
        break;
      case "select":
        if (f.options && !f.options.includes(raw)) return { error: `Pick a ${f.label.toLowerCase()} from the list.` };
        payload[f.name] = raw;
        break;
      default:
        payload[f.name] = raw.slice(0, f.type === "textarea" ? 5000 : 300);
    }
  }

  const { data, error } = id
    ? await supabase.from(dept.table).update(payload).eq("id", id).select("id")
    : await supabase.from(dept.table).insert(payload).select("id");

  if (error) return { error: friendly(error, dept) };
  if (!data || data.length === 0) {
    return { error: "This record couldn't be saved. You may not have access to it any more." };
  }

  revalidatePath(`/${slug}`);
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true, savedAt: Date.now() };
}

export async function deleteRecord(slug: string, id: string): Promise<SaveState> {
  const dept = getDepartment(slug);
  if (!dept) return { error: "That department doesn't exist." };

  const supabase = await createClient();
  const { data, error } = await supabase.from(dept.table).delete().eq("id", id).select("id");

  if (error) return { error: friendly(error, dept) };
  if (!data || data.length === 0) {
    return { error: `Only managers of ${dept.name} can remove records.` };
  }

  revalidatePath(`/${slug}`);
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true, savedAt: Date.now() };
}
