"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  APPLICABILITY,
  CONTRACTOR_STATUSES,
  COST_CATEGORIES,
  COST_STATUSES,
  COVER_TYPES,
  DOC_CATEGORIES,
  EVIDENCE_STATUSES,
  INSPECTION_TYPES,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  OUTCOMES,
  PRIORITIES,
  PROPERTY_STATUSES,
  RECORD_STATUSES,
  REQUEST_STATUSES,
  TRADES,
  WALK_CHECKS,
  WORKSTREAMS,
  nextDueFrom,
  todayISO,
  type ChecklistEntry,
} from "@/lib/jaidat";

export type Result = { ok?: boolean; error?: string; id?: string };

type DbError = { code?: string; message: string };

function friendly(error: DbError): string {
  if (error.code === "23505") return "That already exists.";
  if (error.code === "42501") return error.message.startsWith("Only") ? error.message : "You don't have permission to do that.";
  if (error.code === "23514") return "One of the values isn't allowed, or is too long.";
  if (error.code === "23502") return "A required field is empty.";
  if (error.code === "23503") return "That links to something that no longer exists.";
  return error.message;
}

/** Signed-in Jaidat user. "manage" needs a department admin (or administrator). */
async function jaidat(need: "edit" | "manage") {
  const session = await getSession();
  if (!session.canAccess("jaidat")) return { error: "Jaidat isn't on your account." } as const;
  if (!session.canEdit("jaidat")) return { error: "Your Jaidat access is view only." } as const;
  if (need === "manage" && !session.isManager("jaidat")) return { error: "Only the Jaidad department admin can do that." } as const;
  return { supabase: session.supabase, manager: session.isManager("jaidat") } as const;
}

function done(id?: string): Result {
  revalidatePath("/jaidat", "layout");
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true, id };
}

// ---------- Form parsing ----------

class Invalid extends Error {}

function text(fd: FormData, name: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  if (v.length > (opts.max ?? 300)) throw new Invalid(`${label} is too long (${opts.max ?? 300} characters at most).`);
  return v;
}

function pick<T extends readonly string[]>(fd: FormData, name: string, label: string, options: T, fallback?: T[number]) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v && fallback) return fallback;
  if (!options.includes(v)) throw new Invalid(`Pick a ${label.toLowerCase()} from the list.`);
  return v as T[number];
}

function whole(fd: FormData, name: string, label: string, opts: { min?: number; max?: number } = {}) {
  const raw = String(fd.get(name) ?? "").replace(/[,\s]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < (opts.min ?? 0) || n > (opts.max ?? 99_999_999)) {
    throw new Invalid(`${label} must be a whole number${opts.max ? ` from ${opts.min ?? 0} to ${opts.max}` : ""}.`);
  }
  return n;
}

function pounds(fd: FormData, name: string, label: string) {
  const raw = String(fd.get(name) ?? "").replace(/[£,\s]/g, "");
  if (!raw) return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw new Invalid(`${label} must be an amount like 120 or 120.50.`);
  return Number(raw);
}

function date(fd: FormData, name: string, label: string, opts: { required?: boolean; notFuture?: boolean } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Invalid(`${label} isn't a valid date.`);
  if (opts.notFuture && v > todayISO()) throw new Invalid(`${label} can't be in the future.`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ref(fd: FormData, name: string) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) return null;
  if (!UUID.test(v)) throw new Invalid("Pick from the list.");
  return v;
}

const checked = (fd: FormData, name: string) => fd.get(name) === "on" || fd.get(name) === "true";

async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}

type Supa = Awaited<ReturnType<typeof getSession>>["supabase"];

async function save(supabase: Supa, table: string, id: string | null, payload: Record<string, unknown>, what: string): Promise<Result> {
  const { data, error } = id
    ? await supabase.from(table).update(payload).eq("id", id).select("id")
    : await supabase.from(table).insert(payload).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: `That ${what} couldn't be saved.` };
  return done(data[0].id);
}

async function remove(table: string, id: string, what: string): Promise<Result> {
  const c = await jaidat("manage");
  if ("error" in c) return { error: c.error };
  await removeStored(c.supabase, table, id);
  const { data, error } = await c.supabase.from(table).delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: `That ${what} couldn't be removed.` };
  return done();
}

const FILE_LINKS: Record<string, string> = {
  jaidat_records: "record_id",
  jaidat_compliance: "compliance_id",
  jaidat_insurance: "insurance_id",
  jaidat_issues: "issue_id",
  jaidat_costs: "cost_id",
  jaidat_inspections: "inspection_id",
  jaidat_properties: "property_id",
};

/** Removes stored files attached to a row before the row (and its file records) go. */
async function removeStored(supabase: Supa, table: string, id: string) {
  const column = table === "jaidat_files" ? "id" : FILE_LINKS[table];
  if (!column) return;
  const { data } = await supabase.from("jaidat_files").select("file_path").eq(column, id);
  const paths = (data ?? []).map((f: { file_path: string | null }) => f.file_path).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from("jaidat").remove(paths);
}

// ---------- Properties ----------

export async function saveProperty(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const leaseStart = date(fd, "lease_start", "Lease start");
    const leaseEnd = date(fd, "lease_end", "Lease end");
    if (leaseStart && leaseEnd && leaseEnd < leaseStart) return { error: "The lease can't end before it starts." };
    const payload = {
      name: text(fd, "name", "Name", { required: true, max: 120 }),
      short_name: text(fd, "short_name", "Short name", { max: 40 }),
      use_description: text(fd, "use_description", "Use", { max: 200 }),
      property_type: text(fd, "property_type", "Type", { max: 60 }),
      status: pick(fd, "status", "Status", PROPERTY_STATUSES, "Active"),
      ownership: text(fd, "ownership", "Ownership", { max: 200 }),
      address: text(fd, "address", "Address", { max: 300 }),
      address_verified: checked(fd, "address_verified"),
      location: text(fd, "location", "Area", { max: 120 }),
      initial_scope: checked(fd, "initial_scope"),
      capacity: whole(fd, "capacity", "Capacity", { max: 100000 }),
      caretaker: text(fd, "caretaker", "Caretaker", { max: 120 }),
      caretaker_phone: text(fd, "caretaker_phone", "Caretaker phone", { max: 40 }),
      lease_party: text(fd, "lease_party", "Landlord or tenant", { max: 200 }),
      lease_start: leaseStart,
      lease_end: leaseEnd,
      rent_monthly: pounds(fd, "rent_monthly", "Monthly rent"),
      considerations: text(fd, "considerations", "What to keep in mind", { max: 2000 }),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    return save(c.supabase, "jaidat_properties", id, payload, "property");
  });
}

export async function saveRooms(id: string, rooms: string[]): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  const clean = [...new Set(rooms.map((r) => r.trim()).filter(Boolean))];
  if (clean.length > 80) return { error: "80 rooms at most." };
  if (clean.some((r) => r.length > 60)) return { error: "Keep each room name under 60 characters." };
  return save(c.supabase, "jaidat_properties", id, { rooms: clean }, "property");
}

export async function deleteProperty(id: string): Promise<Result> {
  return remove("jaidat_properties", id, "property");
}

// ---------- Records checklist ----------

export async function setRecordStatus(id: string, status: string): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  if (!(RECORD_STATUSES as readonly string[]).includes(status)) return { error: "Pick a status from the list." };
  return save(c.supabase, "jaidat_records", id, { status }, "item");
}

export async function saveRecord(id: string | null, propertyId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload: Record<string, unknown> = {
      title: text(fd, "title", "Item", { required: true, max: 200 }),
      workstream: pick(fd, "workstream", "Area", WORKSTREAMS.map((w) => w.key) as unknown as readonly string[]),
      owner_name: text(fd, "owner_name", "Responsible", { max: 120 }),
      support_name: text(fd, "support_name", "Helper", { max: 120 }),
      status: pick(fd, "status", "Status", RECORD_STATUSES, "Not started"),
      requested_on: date(fd, "requested_on", "Requested on"),
      received_on: date(fd, "received_on", "Received on"),
      follow_up_on: date(fd, "follow_up_on", "Follow up on"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    if (!id) {
      payload.property_id = propertyId;
      payload.position = 100;
    }
    const r = await save(c.supabase, "jaidat_records", id, payload, "item");
    if (r.error === "That already exists.") return { error: "This property already has an item with that name in that area." };
    return r;
  });
}

export async function deleteRecord(id: string): Promise<Result> {
  return remove("jaidat_records", id, "item");
}

// ---------- Compliance ----------

export async function saveCompliance(id: string | null, propertyId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };

    const lastDone = date(fd, "last_done", "Last done", { notFuture: true });
    let interval = whole(fd, "interval_months", "How often", { min: 1, max: 240 });
    if (id && !fd.has("interval_months")) {
      const { data } = await c.supabase.from("jaidat_compliance").select("interval_months").eq("id", id).maybeSingle();
      interval = (data?.interval_months as number | null) ?? null;
    }
    const payload: Record<string, unknown> = {
      applicability: pick(fd, "applicability", "Applies?", APPLICABILITY, "To be confirmed"),
      reason: text(fd, "reason", "Reason", { max: 1000 }),
      last_done: lastDone,
      next_due: date(fd, "next_due", "Next due") ?? nextDueFrom(lastDone, interval),
      officer: text(fd, "officer", "Responsible officer", { max: 120 }),
      contractor: text(fd, "contractor", "Contractor or assessor", { max: 200 }),
      evidence_ref: text(fd, "evidence_ref", "Evidence reference", { max: 200 }),
      status: pick(fd, "status", "Evidence", EVIDENCE_STATUSES, "Awaiting information"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    if (fd.has("title")) {
      payload.title = text(fd, "title", "Check", { required: true, max: 200 });
      payload.legislation = text(fd, "legislation", "Legislation", { max: 300 });
      payload.interval_months = interval;
    }
    if (!id) {
      payload.property_id = propertyId;
      payload.item_key = `custom-${crypto.randomUUID()}`;
      payload.position = 200;
    }
    return save(c.supabase, "jaidat_compliance", id, payload, "check");
  });
}

export async function setApplicability(id: string, value: string): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  if (!(APPLICABILITY as readonly string[]).includes(value)) return { error: "Pick from the list." };
  return save(c.supabase, "jaidat_compliance", id, { applicability: value }, "check");
}

export async function deleteCompliance(id: string): Promise<Result> {
  return remove("jaidat_compliance", id, "check");
}

// ---------- Insurance ----------

export async function savePolicy(id: string | null, propertyId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const starts = date(fd, "starts_on", "Starts");
    const expires = date(fd, "expires_on", "Renewal date");
    if (starts && expires && expires < starts) return { error: "The renewal date can't be before the start date." };
    const payload: Record<string, unknown> = {
      cover_type: pick(fd, "cover_type", "Cover", COVER_TYPES),
      insurer: text(fd, "insurer", "Insurer", { max: 200 }),
      policy_number: text(fd, "policy_number", "Policy number", { max: 100 }),
      policyholder: text(fd, "policyholder", "Policyholder", { max: 200 }),
      cover_amount: text(fd, "cover_amount", "Cover and limits", { max: 200 }),
      exclusions: text(fd, "exclusions", "Exclusions and conditions", { max: 2000 }),
      starts_on: starts,
      expires_on: expires,
      premium: pounds(fd, "premium", "Premium"),
      contact: text(fd, "contact", "Contact", { max: 200 }),
      status: pick(fd, "status", "Evidence", EVIDENCE_STATUSES, "Awaiting information"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    if (!id) payload.property_id = propertyId;
    return save(c.supabase, "jaidat_insurance", id, payload, "policy");
  });
}

export async function deletePolicy(id: string): Promise<Result> {
  return remove("jaidat_insurance", id, "policy");
}

// ---------- Tickets ----------

export async function saveIssue(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const status = pick(fd, "status", "Status", ISSUE_STATUSES, "New");
    const officer = text(fd, "officer", "Officer", { max: 120 });
    const payload: Record<string, unknown> = {
      property_id: ref(fd, "property_id"),
      location: text(fd, "location", "Location", { max: 200 }),
      title: text(fd, "title", "What's wrong", { required: true, max: 200 }),
      description: text(fd, "description", "Details", { max: 5000 }),
      category: pick(fd, "category", "Category", ISSUE_CATEGORIES, "Repair"),
      priority: pick(fd, "priority", "Priority", PRIORITIES.map((p) => p.key) as unknown as readonly string[], "P3"),
      // Naming an officer on a new ticket assigns it.
      status: status === "New" && officer && !id ? "Assigned" : status,
      officer,
      contractor_id: ref(fd, "contractor_id"),
      reported_by: text(fd, "reported_by", "Reported by", { max: 120 }),
      reporter_contact: text(fd, "reporter_contact", "Reporter contact", { max: 160 }),
      cost: pounds(fd, "cost", "Cost"),
      lesson: text(fd, "lesson", "Lesson", { max: 2000 }),
    };
    return save(c.supabase, "jaidat_issues", id, payload, "ticket");
  });
}

export async function setIssueStatus(id: string, status: string, lesson?: string): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  if (!(ISSUE_STATUSES as readonly string[]).includes(status)) return { error: "Pick a status from the list." };
  const payload: Record<string, unknown> = { status };
  if (lesson !== undefined) {
    const l = lesson.trim();
    if (l.length > 2000) return { error: "Keep the lesson under 2,000 characters." };
    if (l) payload.lesson = l;
  }
  return save(c.supabase, "jaidat_issues", id, payload, "ticket");
}

export async function deleteIssue(id: string): Promise<Result> {
  return remove("jaidat_issues", id, "ticket");
}

export async function addNote(issueId: string, body: string): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  const b = body.trim();
  if (!b) return { error: "Write a note first." };
  if (b.length > 2000) return { error: "Keep notes under 2,000 characters." };
  return save(c.supabase, "jaidat_issue_notes", null, { issue_id: issueId, body: b }, "note");
}

export async function deleteNote(id: string): Promise<Result> {
  return remove("jaidat_issue_notes", id, "note");
}

export async function saveQuote(issueId: string, id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const contractor = ref(fd, "contractor_id");
    const supplier = text(fd, "supplier", "Supplier", { max: 200 });
    if (!contractor && !supplier) return { error: "Pick a contractor or type the supplier's name." };
    const amount = pounds(fd, "amount", "Amount");
    if (amount === null) return { error: "Amount is required." };
    const payload: Record<string, unknown> = {
      contractor_id: contractor,
      supplier: contractor ? null : supplier,
      amount,
      received_on: date(fd, "received_on", "Received on"),
      notes: text(fd, "notes", "Notes", { max: 2000 }),
    };
    if (!id) payload.issue_id = issueId;
    return save(c.supabase, "jaidat_quotes", id, payload, "quote");
  });
}

/** Accepts one quote for a ticket: the others are un-accepted, and the ticket takes its contractor and price. */
export async function acceptQuote(issueId: string, quoteId: string | null): Promise<Result> {
  const c = await jaidat("manage");
  if ("error" in c) return { error: c.error };
  const { error: e1 } = await c.supabase.from("jaidat_quotes").update({ accepted: false }).eq("issue_id", issueId).eq("accepted", true);
  if (e1) return { error: friendly(e1) };
  if (!quoteId) return done();
  const { data: q, error: e2 } = await c.supabase
    .from("jaidat_quotes")
    .update({ accepted: true })
    .eq("id", quoteId)
    .select("amount, contractor_id")
    .maybeSingle();
  if (e2) return { error: friendly(e2) };
  if (!q) return { error: "That quote couldn't be accepted." };
  const patch: Record<string, unknown> = { cost: q.amount };
  if (q.contractor_id) patch.contractor_id = q.contractor_id;
  await c.supabase.from("jaidat_issues").update(patch).eq("id", issueId);
  return done();
}

export async function deleteQuote(id: string): Promise<Result> {
  return remove("jaidat_quotes", id, "quote");
}

// ---------- Contractors and contacts ----------

export async function saveContractor(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload: Record<string, unknown> = {
      name: text(fd, "name", "Name", { required: true, max: 200 }),
      company: text(fd, "company", "Company", { max: 200 }),
      trade: pick(fd, "trade", "Trade", TRADES, "Other"),
      phone: text(fd, "phone", "Phone", { max: 40 }),
      email: text(fd, "email", "Email", { max: 200 }),
      areas: text(fd, "areas", "Areas covered", { max: 300 }),
      insurance_expiry: date(fd, "insurance_expiry", "Insurance expiry"),
      certifications: text(fd, "certifications", "Certificates", { max: 1000 }),
      rating: whole(fd, "rating", "Rating", { min: 1, max: 5 }),
      status: pick(fd, "status", "Checks", CONTRACTOR_STATUSES, "Not verified"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    if (c.manager) payload.approved = checked(fd, "approved");
    return save(c.supabase, "jaidat_contractors", id, payload, "contractor");
  });
}

export async function deleteContractor(id: string): Promise<Result> {
  return remove("jaidat_contractors", id, "contractor");
}

export async function saveContact(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload = {
      full_name: text(fd, "full_name", "Name", { required: true, max: 120 }),
      role: text(fd, "role", "Role", { max: 200 }),
      department: text(fd, "department", "Department", { max: 120 }),
      in_team: checked(fd, "in_team"),
      phone: text(fd, "phone", "Phone", { max: 40 }),
      email: text(fd, "email", "Email", { max: 200 }),
      responsibilities: text(fd, "responsibilities", "Responsibilities", { max: 2000 }),
    };
    return save(c.supabase, "jaidat_contacts", id, payload, "contact");
  });
}

export async function deleteContact(id: string): Promise<Result> {
  return remove("jaidat_contacts", id, "contact");
}

// ---------- Finance ----------

export async function saveCost(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload: Record<string, unknown> = {
      property_id: ref(fd, "property_id"),
      issue_id: ref(fd, "issue_id"),
      category: pick(fd, "category", "Category", COST_CATEGORIES, "Maintenance"),
      description: text(fd, "description", "Description", { required: true, max: 300 }),
      supplier: text(fd, "supplier", "Supplier", { max: 200 }),
      invoice_number: text(fd, "invoice_number", "Invoice number", { max: 100 }),
      invoice_date: date(fd, "invoice_date", "Invoice date"),
      due_date: date(fd, "due_date", "Due date"),
      proposed: pounds(fd, "proposed", "Amount"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    // Only the department admin changes the decision and the amounts approved and paid.
    if (c.manager && fd.has("status")) {
      payload.status = pick(fd, "status", "Status", COST_STATUSES, "Proposed");
      payload.approved = pounds(fd, "approved", "Approved amount");
      payload.paid = pounds(fd, "paid", "Paid amount");
      payload.paid_on = date(fd, "paid_on", "Paid on");
    }
    return save(c.supabase, "jaidat_costs", id, payload, "cost");
  });
}

export async function decideCost(id: string, status: "Approved" | "Rejected" | "Paid" | "Proposed"): Promise<Result> {
  const c = await jaidat("manage");
  if ("error" in c) return { error: c.error };
  if (!(COST_STATUSES as readonly string[]).includes(status)) return { error: "Pick a status from the list." };
  const patch: Record<string, unknown> = { status };
  if (status === "Proposed") Object.assign(patch, { approved: null, paid: null, paid_on: null });
  return save(c.supabase, "jaidat_costs", id, patch, "cost");
}

export async function deleteCost(id: string): Promise<Result> {
  return remove("jaidat_costs", id, "cost");
}

// ---------- Inspections ----------

function parseChecklist(raw: string): ChecklistEntry[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Invalid("The checklist couldn't be read. Try again.");
  }
  if (!Array.isArray(v) || v.length > 800) throw new Invalid("The checklist is too long.");
  const checks = WALK_CHECKS.map((w) => w.key) as readonly string[];
  return v
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      room: String(e.room ?? "").trim().slice(0, 60),
      check: String(e.check ?? ""),
      result: (["ok", "issue", "na"].includes(String(e.result)) ? e.result : "ok") as ChecklistEntry["result"],
      note: String(e.note ?? "").trim().slice(0, 300) || undefined,
    }))
    .filter((e) => e.room && checks.includes(e.check));
}

export async function saveInspection(id: string | null, propertyId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const checklist = parseChecklist(String(fd.get("checklist") ?? ""));
    const issues = checklist.filter((e) => e.result === "issue");
    const outcomeRaw = String(fd.get("outcome") ?? "").trim();
    const payload: Record<string, unknown> = {
      inspection_type: pick(fd, "inspection_type", "Type", INSPECTION_TYPES, "Walk-round"),
      inspected_on: date(fd, "inspected_on", "Date", { required: true, notFuture: true }),
      inspector: text(fd, "inspector", "Inspected by", { max: 120 }),
      outcome: outcomeRaw ? pick(fd, "outcome", "Outcome", OUTCOMES) : issues.length ? "Actions needed" : "Satisfactory",
      findings: text(fd, "findings", "Findings", { max: 5000 }),
      actions: text(fd, "actions", "Actions", { max: 5000 }),
      next_due: date(fd, "next_due", "Next due"),
      checklist,
    };
    if (!id) payload.property_id = propertyId;
    const r = await save(c.supabase, "jaidat_inspections", id, payload, "inspection");
    if (r.error) return r;

    // Problems found on a new walk-round become tickets.
    if (!id && checked(fd, "raise_tickets") && issues.length) {
      const rows = issues.map((e) => ({
        property_id: propertyId,
        location: e.room,
        title: `${e.check}: ${e.room}`.slice(0, 200),
        description: e.note ?? `Found on the ${String(payload.inspection_type).toLowerCase()} on ${payload.inspected_on}.`,
        category: WALK_CHECKS.find((w) => w.key === e.check)?.category ?? "Inspection finding",
        priority: "P3",
        status: "New",
        reported_by: (payload.inspector as string | null) ?? null,
        source: "inspection",
      }));
      const { error } = await c.supabase.from("jaidat_issues").insert(rows);
      if (error) return { error: `The inspection was saved, but its tickets weren't: ${friendly(error)}` };
    }
    return r;
  });
}

export async function deleteInspection(id: string): Promise<Result> {
  return remove("jaidat_inspections", id, "inspection");
}

// ---------- Documents ----------

export type NewFile = {
  propertyId: string | null;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  title: string;
  category: string;
  expiresOn?: string | null;
  links?: Partial<Record<"record_id" | "compliance_id" | "insurance_id" | "issue_id" | "cost_id" | "inspection_id", string>>;
};

const LINK_KEYS = ["record_id", "compliance_id", "insurance_id", "issue_id", "cost_id", "inspection_id"] as const;

function cleanLinks(links: NewFile["links"]) {
  const out: Record<string, string> = {};
  for (const k of LINK_KEYS) {
    const v = links?.[k];
    if (v && UUID.test(v)) out[k] = v;
  }
  return out;
}

/** Records a file the browser has just uploaded to storage. */
export async function registerFile(f: NewFile): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  const folder = f.propertyId ?? "general";
  if (!f.path.startsWith(`${folder}/`) || f.path.includes("..")) return { error: "That upload went to the wrong place." };
  if (f.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiresOn)) return { error: "Expiry date isn't valid." };
  const category = (DOC_CATEGORIES as readonly string[]).includes(f.category) ? f.category : "Other";
  const { error } = await c.supabase.from("jaidat_files").insert({
    property_id: f.propertyId,
    category,
    title: (f.title.trim() || f.fileName).slice(0, 200),
    file_path: f.path,
    file_name: f.fileName.slice(0, 200),
    mime_type: f.mimeType.slice(0, 120),
    size_bytes: Math.round(f.size),
    expires_on: f.expiresOn || null,
    ...cleanLinks(f.links),
  });
  if (error) {
    await c.supabase.storage.from("jaidat").remove([f.path]);
    return { error: friendly(error) };
  }
  return done();
}

/** Saves a Google Drive (or other https) link as a document. */
export async function saveLink(propertyId: string | null, links: NewFile["links"], fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const url = text(fd, "link_url", "Link", { required: true, max: 1000 })!;
    if (!/^https:\/\//i.test(url)) return { error: "Links must start with https://" };
    const payload = {
      property_id: propertyId,
      title: text(fd, "title", "Title", { required: true, max: 200 }),
      category: pick(fd, "category", "Category", DOC_CATEGORIES, "Other"),
      link_url: url,
      expires_on: date(fd, "expires_on", "Expiry date"),
      ...cleanLinks(links),
    };
    return save(c.supabase, "jaidat_files", null, payload, "link");
  });
}

export async function updateFile(id: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload = {
      title: text(fd, "title", "Title", { required: true, max: 200 }),
      category: pick(fd, "category", "Category", DOC_CATEGORIES, "Other"),
      expires_on: date(fd, "expires_on", "Expiry date"),
      version: text(fd, "version", "Version", { max: 40 }),
      verification: pick(fd, "verification", "Checked", EVIDENCE_STATUSES, "Received"),
      notes: text(fd, "notes", "Notes", { max: 2000 }),
    };
    return save(c.supabase, "jaidat_files", id, payload, "document");
  });
}

export async function deleteFile(id: string): Promise<Result> {
  return remove("jaidat_files", id, "document");
}

// ---------- Awaiting replies ----------

export async function saveRequest(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await jaidat("edit");
    if ("error" in c) return { error: c.error };
    const payload = {
      person: text(fd, "person", "Person", { required: true, max: 120 }),
      role: text(fd, "role", "Role or department", { max: 200 }),
      property_id: ref(fd, "property_id"),
      request: text(fd, "request", "What was asked", { required: true, max: 2000 }),
      sent_on: date(fd, "sent_on", "Sent on"),
      due_on: date(fd, "due_on", "Reply due"),
      due_note: text(fd, "due_note", "Due note", { max: 200 }),
      status: pick(fd, "status", "Status", REQUEST_STATUSES, "Awaiting reply"),
      reply: text(fd, "reply", "Reply", { max: 5000 }),
      notes: text(fd, "notes", "Notes", { max: 2000 }),
    };
    return save(c.supabase, "jaidat_requests", id, payload, "request");
  });
}

export async function setRequestStatus(id: string, status: string): Promise<Result> {
  const c = await jaidat("edit");
  if ("error" in c) return { error: c.error };
  if (!(REQUEST_STATUSES as readonly string[]).includes(status)) return { error: "Pick a status from the list." };
  return save(c.supabase, "jaidat_requests", id, { status }, "request");
}

export async function deleteRequest(id: string): Promise<Result> {
  return remove("jaidat_requests", id, "request");
}
