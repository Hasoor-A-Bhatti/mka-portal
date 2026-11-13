"use server";

import { getSession } from "@/lib/session";
import { todayISO } from "@/lib/storage";
import { Invalid, date, done, friendly, guarded, isId, text, whole, type Result } from "@/lib/storage-actions";

/** A signed-in borrower (anyone who can edit in Equipment Loans). */
async function borrower() {
  const session = await getSession();
  if (!session.canAccess("equipment-loans")) return { error: "Equipment Loans isn't on your account." } as const;
  if (!session.canEdit("equipment-loans")) return { error: "Your Equipment Loans access is view only." } as const;
  return { supabase: session.supabase, userId: session.user.id } as const;
}

function details(fd: FormData) {
  const start = date(fd, "start_date", "From", { required: true })!;
  const end = date(fd, "end_date", "To", { required: true })!;
  if (start < todayISO()) throw new Invalid("The loan can't start in the past.");
  if (end < start) throw new Invalid("The return date can't be before the start date.");
  return {
    quantity: whole(fd, "quantity", "How many", { min: 1, max: 100000, required: true }),
    start_date: start,
    end_date: end,
    borrower_department: text(fd, "borrower_department", "Your department", { required: true, max: 120 }),
    phone: text(fd, "phone", "Phone", { max: 40 }),
    purpose: text(fd, "purpose", "What it's for", { required: true, max: 1000 }),
  };
}

export async function requestItem(itemId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await borrower();
    if ("error" in c) return { error: c.error };
    if (!isId(itemId)) return { error: "Pick an item." };
    // Item name and location are copied from the catalogue by the database.
    const { data, error } = await c.supabase
      .from("storage_loans")
      .insert({ item_id: itemId, item_name: "-", requested_by: c.userId, ...details(fd) })
      .select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "The request couldn't be sent." };
    return done(data[0].id);
  });
}

export async function updateRequest(id: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await borrower();
    if ("error" in c) return { error: c.error };
    const { data, error } = await c.supabase
      .from("storage_loans")
      .update(details(fd))
      .eq("id", id)
      .eq("requested_by", c.userId)
      .eq("status", "Pending")
      .select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "This request has already been decided, so it can't be changed. Send Storage a message instead." };
    return done(id);
  });
}

export async function cancelRequest(id: string): Promise<Result> {
  const c = await borrower();
  if ("error" in c) return { error: c.error };
  const { data, error } = await c.supabase
    .from("storage_loans")
    .update({ status: "Cancelled" })
    .eq("id", id)
    .eq("requested_by", c.userId)
    .in("status", ["Pending", "Approved"])
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "This request can't be cancelled now." };
  return done(id);
}

export async function borrowerMessage(loanId: string, body: string): Promise<Result> {
  const c = await borrower();
  if ("error" in c) return { error: c.error };
  const b = body.trim();
  if (!isId(loanId)) return { error: "Pick a request." };
  if (!b) return { error: "Write a message first." };
  if (b.length > 2000) return { error: "Keep the message under 2,000 characters." };
  const { error } = await c.supabase.from("storage_loan_messages").insert({ loan_id: loanId, body: b });
  if (error) return { error: friendly(error) };
  return done(loanId);
}
