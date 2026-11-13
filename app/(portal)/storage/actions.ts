"use server";

import { getSession } from "@/lib/session";
import { ADJUSTMENTS, type Movement } from "@/lib/storage";
import { Invalid, checked, date, done, friendly, guarded, isId, ref, text, whole, type Result } from "@/lib/storage-actions";

/** Signed-in Storage user. "manage" needs the Storage department admin (or an administrator). */
async function storage(need: "view" | "edit" | "manage") {
  const session = await getSession();
  if (!session.canAccess("storage")) return { error: "MKA Storage isn't on your account." } as const;
  if (need !== "view" && !session.canEdit("storage")) return { error: "Your Storage access is view only." } as const;
  if (need === "manage" && !session.isManager("storage")) return { error: "Only the Storage department admin can do that." } as const;
  return { supabase: session.supabase } as const;
}

// ---------- Inventory ----------

export async function saveItem(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await storage("edit");
    if ("error" in c) return { error: c.error };
    const payload: Record<string, unknown> = {
      item_name: text(fd, "item_name", "Item", { required: true, max: 160 }),
      category: text(fd, "category", "Category", { max: 80 }),
      location_id: ref(fd, "location_id"),
      owned_by: text(fd, "owned_by", "Owned by", { max: 120 }),
      min_qty: whole(fd, "min_qty", "Low stock level"),
      loanable: checked(fd, "loanable"),
      notes: text(fd, "notes", "Notes", { max: 2000 }),
    };
    // The count only changes through stock changes, so the history stays complete.
    if (!id) payload.quantity = whole(fd, "quantity", "Quantity", { required: true }) ?? 0;
    const { data, error } = id
      ? await c.supabase.from("storage_items").update(payload).eq("id", id).select("id")
      : await c.supabase.from("storage_items").insert(payload).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That item couldn't be saved." };
    return done(data[0].id);
  });
}

export async function deleteItem(id: string): Promise<Result> {
  const c = await storage("manage");
  if ("error" in c) return { error: c.error };
  const { data, error } = await c.supabase.from("storage_items").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That item couldn't be removed." };
  return done();
}

export async function adjustStock(itemId: string, kind: string, amount: number, note: string): Promise<Result> {
  const c = await storage("edit");
  if ("error" in c) return { error: c.error };
  if (!isId(itemId)) return { error: "Pick an item." };
  if (!ADJUSTMENTS.some((a) => a.kind === kind)) return { error: "Pick what's changed." };
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) return { error: "Enter a whole number." };
  if (note.length > 500) return { error: "Keep the note under 500 characters." };
  const { error } = await c.supabase.rpc("storage_adjust", { p_item: itemId, p_kind: kind, p_amount: amount, p_note: note.trim() || null });
  if (error) return { error: friendly(error) };
  return done(itemId);
}

export async function itemHistory(itemId: string): Promise<{ rows?: Movement[]; error?: string }> {
  const c = await storage("view");
  if ("error" in c) return { error: c.error };
  if (!isId(itemId)) return { error: "Pick an item." };
  const { data, error } = await c.supabase
    .from("storage_movements")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { error: friendly(error) };
  return { rows: (data ?? []) as Movement[] };
}

// ---------- Locations ----------

export async function saveLocation(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await storage("manage");
    if ("error" in c) return { error: c.error };
    const payload = {
      name: text(fd, "name", "Name", { required: true, max: 120 }),
      site: text(fd, "site", "Site", { max: 120 }),
      position: whole(fd, "position", "Order", { max: 10000 }) ?? 0,
      notes: text(fd, "notes", "Notes", { max: 1000 }),
      active: !checked(fd, "closed"),
    };
    const { data, error } = id
      ? await c.supabase.from("storage_locations").update(payload).eq("id", id).select("id")
      : await c.supabase.from("storage_locations").insert(payload).select("id");
    if (error) return { error: error.code === "23505" ? "There's already a location with that name." : friendly(error) };
    if (!data?.length) return { error: "That location couldn't be saved." };
    return done(data[0].id);
  });
}

export async function deleteLocation(id: string): Promise<Result> {
  const c = await storage("manage");
  if ("error" in c) return { error: c.error };
  const { count } = await c.supabase.from("storage_items").select("id", { count: "exact", head: true }).eq("location_id", id);
  if (count) return { error: `Move its ${count} item${count === 1 ? "" : "s"} somewhere else first.` };
  const { data, error } = await c.supabase.from("storage_locations").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That location couldn't be removed." };
  return done();
}

// ---------- Loan requests ----------

async function message(supabase: Awaited<ReturnType<typeof getSession>>["supabase"], loanId: string, body: string) {
  const { error } = await supabase.from("storage_loan_messages").insert({ loan_id: loanId, body });
  return error ? friendly(error) : null;
}

export async function decideLoan(id: string, decision: "Approved" | "Rejected", note: string): Promise<Result> {
  const c = await storage("manage");
  if ("error" in c) return { error: c.error };
  if (!isId(id) || !["Approved", "Rejected"].includes(decision)) return { error: "Pick approve or reject." };
  const body = note.trim();
  if (body.length > 2000) return { error: "Keep the message under 2,000 characters." };
  const { data, error } = await c.supabase
    .from("storage_loans")
    .update({ status: decision, decision_note: body || null })
    .eq("id", id)
    .eq("status", "Pending")
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That request has already been dealt with. Refresh to see the latest." };
  if (body) {
    const problem = await message(c.supabase, id, body);
    if (problem) return { error: `The request was ${decision.toLowerCase()}, but the message didn't send: ${problem}` };
  }
  return done(id);
}

export async function setLoanStatus(id: string, status: "Collected" | "Returned" | "Cancelled", note: string): Promise<Result> {
  const c = await storage(status === "Cancelled" ? "manage" : "edit");
  if ("error" in c) return { error: c.error };
  if (!isId(id) || !["Collected", "Returned", "Cancelled"].includes(status)) return { error: "Pick a step." };
  const from = status === "Collected" ? ["Approved"] : status === "Returned" ? ["Collected"] : ["Pending", "Approved"];
  const body = note.trim();
  if (body.length > 1000) return { error: "Keep the note under 1,000 characters." };
  const patch: Record<string, unknown> = { status };
  if (status === "Returned" && body) patch.return_note = body;
  const { data, error } = await c.supabase.from("storage_loans").update(patch).eq("id", id).in("status", from).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That request has moved on already. Refresh to see the latest." };
  if (status === "Cancelled" && body) {
    const problem = await message(c.supabase, id, body);
    if (problem) return { error: `Cancelled, but the message didn't send: ${problem}` };
  }
  return done(id);
}

export async function changeLoanDates(id: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await storage("edit");
    if ("error" in c) return { error: c.error };
    const start = date(fd, "start_date", "From", { required: true })!;
    const end = date(fd, "end_date", "Return by", { required: true })!;
    if (end < start) throw new Invalid("The return date can't be before the start date.");
    const { data, error } = await c.supabase.from("storage_loans").update({ start_date: start, end_date: end }).eq("id", id).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That request couldn't be changed." };
    return done(id);
  });
}

export async function staffMessage(loanId: string, body: string): Promise<Result> {
  const c = await storage("edit");
  if ("error" in c) return { error: c.error };
  const b = body.trim();
  if (!isId(loanId)) return { error: "Pick a request." };
  if (!b) return { error: "Write a message first." };
  if (b.length > 2000) return { error: "Keep the message under 2,000 characters." };
  const problem = await message(c.supabase, loanId, b);
  if (problem) return { error: problem };
  return done(loanId);
}

// ---------- Borrowers ----------

export async function addBorrower(fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await storage("manage");
    if ("error" in c) return { error: c.error };
    const email = text(fd, "email", "Email", { required: true, max: 200 })!.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw new Invalid("That email address doesn't look right.");
    const { error } = await c.supabase.rpc("storage_borrower_add", {
      p_email: email,
      p_name: text(fd, "full_name", "Name", { max: 120 }),
      p_department: text(fd, "department", "Department", { max: 120 }),
    });
    if (error) return { error: friendly(error) };
    return done();
  });
}

export async function removeBorrower(email: string): Promise<Result> {
  const c = await storage("manage");
  if ("error" in c) return { error: c.error };
  const { error } = await c.supabase.rpc("storage_borrower_remove", { p_email: email });
  if (error) return { error: friendly(error) };
  return done();
}
