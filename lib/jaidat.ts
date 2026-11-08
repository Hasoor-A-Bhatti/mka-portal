/** Shared types, labels and calculations for MKA Jaidat (property and estate management). */

import { addDays, daysUntil, money, num, todayISO } from "@/lib/fleet";

export { addDays, daysUntil, money, num, todayISO };

// ---------- Lists ----------

export const PROPERTY_TYPES = [
  "Office",
  "Guest house",
  "MKA-owned, rented out",
  "Privately rented",
  "Managed accommodation",
  "Hall",
  "Land",
  "Other",
] as const;
export const PROPERTY_STATUSES = ["Active", "Under maintenance", "Vacant", "Disposed"] as const;

export const WORKSTREAMS = [
  { key: "records", label: "Property records" },
  { key: "compliance", label: "Compliance" },
  { key: "insurance", label: "Insurance" },
  { key: "maintenance", label: "Maintenance" },
  { key: "finance", label: "Finance" },
] as const;
export type Workstream = (typeof WORKSTREAMS)[number]["key"];

export const RECORD_STATUSES = ["Not started", "Requested", "Received", "Under review", "Verified", "Outstanding"] as const;
export const APPLICABILITY = ["To be confirmed", "Applicable", "Not applicable"] as const;
export const EVIDENCE_STATUSES = ["Awaiting information", "Requested", "Received", "Under review", "Verified", "Outstanding"] as const;
export const COVER_TYPES = ["Buildings", "Public liability", "Employers liability", "Landlord", "Contents", "Other"] as const;

export const PRIORITIES = [
  { key: "P1", label: "P1 Emergency", days: 0, note: "Same day. Escalate by phone straight away." },
  { key: "P2", label: "P2 High", days: 1, note: "Next day" },
  { key: "P3", label: "P3 Normal", days: 5, note: "Within 5 days" },
  { key: "P4", label: "P4 Planned", days: 30, note: "Within 30 days" },
] as const;
export type Priority = (typeof PRIORITIES)[number]["key"];

export const ISSUE_STATUSES = [
  "New",
  "Assigned",
  "Awaiting quote",
  "Awaiting approval",
  "In progress",
  "On hold",
  "Completed",
  "Closed",
  "Cancelled",
] as const;
export const CLOSED_STATUSES = ["Completed", "Closed", "Cancelled"];
export const ISSUE_CATEGORIES = [
  "Repair",
  "Defect",
  "Safety",
  "Damp or mould",
  "Security or access",
  "Pests",
  "Cleaning",
  "Grounds",
  "Inspection finding",
  "Other",
] as const;

export const TRADES = [
  "Plumber",
  "Electrician",
  "Gas engineer",
  "Builder",
  "Roofer",
  "Carpenter",
  "Decorator",
  "Locksmith",
  "Window and glazing",
  "Pest control",
  "Cleaning",
  "Gardener",
  "Fire safety",
  "Surveyor",
  "Handyman",
  "Other",
] as const;
export const CONTRACTOR_STATUSES = ["Not verified", "Verified", "Suspended"] as const;

export const COST_CATEGORIES = [
  "Budget",
  "Maintenance",
  "Repair",
  "Utilities",
  "Council tax",
  "Insurance premium",
  "Service charge",
  "Rent",
  "Cleaning",
  "Compliance check",
  "Furniture and equipment",
  "Other",
] as const;
export const COST_STATUSES = ["Proposed", "Approved", "Paid", "Rejected"] as const;

export const INSPECTION_TYPES = [
  "Walk-round",
  "Routine inspection",
  "Fire safety check",
  "Health and safety",
  "Check-in or check-out",
  "Other",
] as const;
export const OUTCOMES = ["Satisfactory", "Actions needed", "Unsatisfactory"] as const;
/** What a walk-round looks at in each room. Each can be OK, a problem, or not relevant. */
export const WALK_CHECKS = [
  { key: "Cleanliness", category: "Cleaning" },
  { key: "Damage or wear", category: "Defect" },
  { key: "Lighting", category: "Repair" },
  { key: "Fire exits and escape routes", category: "Safety" },
  { key: "Damp, leaks or mould", category: "Damp or mould" },
  { key: "Equipment safety", category: "Safety" },
  { key: "Signs of pests", category: "Pests" },
] as const;
export type CheckResult = "ok" | "issue" | "na";
export type ChecklistEntry = { room: string; check: string; result: CheckResult; note?: string };

export const DOC_CATEGORIES = [
  "Ownership",
  "Leases and agreements",
  "Plans and drawings",
  "Planning",
  "Occupancy",
  "Compliance",
  "Insurance",
  "Maintenance",
  "Finance",
  "SOPs and guidance",
  "Correspondence",
  "Photos",
  "Other",
] as const;

export const REQUEST_STATUSES = ["Awaiting reply", "Partly replied", "Replied"] as const;

export const ACCEPTED_FILES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Days ahead that count as "due soon" for renewals and checks. */
export const SOON_DAYS = 60;

// ---------- Colours ----------

const GREEN = "#15805a";
const BLUE = "#3f51c9";
const AMBER = "#9a6600";
const RED = "#c43a3a";
const GREY = "#6b6383";
const PURPLE = "#5024a8";

export const TONE: Record<string, string> = {
  // Properties
  Active: GREEN,
  "Under maintenance": AMBER,
  Vacant: GREY,
  Disposed: GREY,
  // Records and evidence
  "Not started": GREY,
  Requested: BLUE,
  Received: PURPLE,
  "Under review": AMBER,
  Verified: GREEN,
  Outstanding: RED,
  "Awaiting information": GREY,
  // Compliance
  Compliant: GREEN,
  "Due soon": AMBER,
  Overdue: RED,
  "Awaiting evidence": BLUE,
  "To decide": AMBER,
  "Not applicable": GREY,
  "To be confirmed": AMBER,
  Applicable: PURPLE,
  // Insurance
  Covered: GREEN,
  "Expiring soon": AMBER,
  Expired: RED,
  Missing: GREY,
  Unverified: BLUE,
  // Tickets
  P1: RED,
  P2: AMBER,
  P3: BLUE,
  P4: GREY,
  New: RED,
  Assigned: BLUE,
  "Awaiting quote": AMBER,
  "Awaiting approval": AMBER,
  "In progress": BLUE,
  "On hold": GREY,
  Completed: GREEN,
  Closed: GREY,
  Cancelled: GREY,
  // Contractors
  "Not verified": AMBER,
  Suspended: RED,
  Approved: GREEN,
  // Costs
  Proposed: AMBER,
  Paid: GREEN,
  Rejected: GREY,
  // Inspections
  Satisfactory: GREEN,
  "Actions needed": AMBER,
  Unsatisfactory: RED,
  // Requests
  "Awaiting reply": AMBER,
  "Partly replied": BLUE,
  Replied: GREEN,
  // Health
  Good: GREEN,
  Fair: AMBER,
  "Needs attention": RED,
};

export const tone = (s: string) => TONE[s] ?? GREY;

// ---------- Row types ----------

type Stamped = {
  created_at: string;
  updated_at?: string;
  creator?: { full_name: string | null } | null;
};

export type Property = Stamped & {
  id: string;
  reference: string;
  name: string;
  short_name: string | null;
  use_description: string | null;
  property_type: string | null;
  ownership: string | null;
  address: string | null;
  address_verified: boolean;
  location: string | null;
  initial_scope: boolean;
  capacity: number | null;
  caretaker: string | null;
  caretaker_phone: string | null;
  rooms: string[];
  lease_party: string | null;
  lease_start: string | null;
  lease_end: string | null;
  rent_monthly: number | string | null;
  considerations: string | null;
  status: string;
  notes: string | null;
};

export type RecordItem = Stamped & {
  id: string;
  property_id: string;
  workstream: Workstream;
  position: number;
  title: string;
  owner_name: string | null;
  support_name: string | null;
  status: string;
  requested_on: string | null;
  received_on: string | null;
  follow_up_on: string | null;
  notes: string | null;
};

export type ComplianceItem = Stamped & {
  id: string;
  property_id: string;
  item_key: string;
  title: string;
  legislation: string | null;
  interval_months: number | null;
  position: number;
  applicability: string;
  reason: string | null;
  last_done: string | null;
  next_due: string | null;
  officer: string | null;
  contractor: string | null;
  evidence_ref: string | null;
  status: string;
  notes: string | null;
};

export type CatalogueItem = { key: string; title: string; legislation: string; guidance: string | null; interval_months: number | null };

export type Policy = Stamped & {
  id: string;
  property_id: string;
  cover_type: string;
  insurer: string | null;
  policy_number: string | null;
  policyholder: string | null;
  cover_amount: string | null;
  exclusions: string | null;
  starts_on: string | null;
  expires_on: string | null;
  premium: number | string | null;
  contact: string | null;
  status: string;
  notes: string | null;
};

export type Issue = Stamped & {
  id: string;
  ref: string;
  property_id: string | null;
  location: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: Priority;
  status: string;
  officer: string | null;
  contractor_id: string | null;
  reported_by: string | null;
  reporter_contact: string | null;
  source: "team" | "public" | "inspection";
  target_date: string | null;
  cost: number | string | null;
  completed_on: string | null;
  lesson: string | null;
};

export type IssueNote = Stamped & { id: string; issue_id: string; body: string };

export type Quote = Stamped & {
  id: string;
  issue_id: string;
  contractor_id: string | null;
  supplier: string | null;
  amount: number | string;
  received_on: string | null;
  notes: string | null;
  accepted: boolean;
};

export type Contractor = Stamped & {
  id: string;
  name: string;
  company: string | null;
  trade: string;
  phone: string | null;
  email: string | null;
  areas: string | null;
  insurance_expiry: string | null;
  certifications: string | null;
  approved: boolean;
  approved_by: string | null;
  approved_on: string | null;
  rating: number | null;
  status: string;
  notes: string | null;
};

export type Contact = Stamped & {
  id: string;
  full_name: string;
  role: string | null;
  department: string | null;
  in_team: boolean;
  phone: string | null;
  email: string | null;
  responsibilities: string | null;
  position: number;
};

export type Cost = Stamped & {
  id: string;
  property_id: string | null;
  issue_id: string | null;
  category: string;
  description: string;
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  proposed: number | string | null;
  approved: number | string | null;
  paid: number | string | null;
  status: string;
  approved_by: string | null;
  approved_on: string | null;
  paid_on: string | null;
  notes: string | null;
};

export type Inspection = Stamped & {
  id: string;
  property_id: string;
  inspection_type: string;
  inspected_on: string;
  inspector: string | null;
  outcome: string;
  findings: string | null;
  actions: string | null;
  next_due: string | null;
  checklist: ChecklistEntry[];
};

export type JaidatFile = Stamped & {
  id: string;
  property_id: string | null;
  category: string;
  title: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  link_url: string | null;
  expires_on: string | null;
  version: string | null;
  verification: string;
  record_id: string | null;
  compliance_id: string | null;
  insurance_id: string | null;
  issue_id: string | null;
  cost_id: string | null;
  inspection_id: string | null;
  notes: string | null;
  /** Signed links, added on the server before rendering. */
  viewUrl?: string;
  downloadUrl?: string;
};

export type WaitingRequest = Stamped & {
  id: string;
  person: string;
  role: string | null;
  property_id: string | null;
  request: string;
  sent_on: string | null;
  due_on: string | null;
  due_note: string | null;
  status: string;
  reply: string | null;
  notes: string | null;
};

/** Everything the Jaidat pages show. */
export type JaidatData = {
  properties: Property[];
  records: RecordItem[];
  compliance: ComplianceItem[];
  catalogue: CatalogueItem[];
  insurance: Policy[];
  issues: Issue[];
  notes: IssueNote[];
  quotes: Quote[];
  contractors: Contractor[];
  contacts: Contact[];
  costs: Cost[];
  inspections: Inspection[];
  files: JaidatFile[];
  requests: WaitingRequest[];
};

// ---------- Names ----------

export const shortName = (p: Pick<Property, "short_name" | "name"> | undefined | null) => p?.short_name || p?.name || "No property";

export function propertyMap(properties: Property[]) {
  return new Map(properties.map((p) => [p.id, p]));
}

/** People the team picks from: the contacts list, team first. */
export function peopleNames(contacts: Contact[]) {
  return [...contacts].sort((a, b) => Number(b.in_team) - Number(a.in_team) || a.position - b.position).map((c) => c.full_name);
}

// ---------- Records checklist ----------

export function recordOverdue(r: Pick<RecordItem, "status" | "follow_up_on">, today = todayISO()) {
  return r.status !== "Verified" && Boolean(r.follow_up_on) && r.follow_up_on! < today;
}

export function recordProgress(items: Pick<RecordItem, "status">[]) {
  const total = items.length;
  const verified = items.filter((r) => r.status === "Verified").length;
  const received = items.filter((r) => ["Received", "Under review", "Verified"].includes(r.status)).length;
  return { total, verified, received, pct: total ? Math.round((verified / total) * 100) : 0 };
}

// ---------- Compliance ----------

export type ComplianceState = "Not applicable" | "To decide" | "Overdue" | "Due soon" | "Compliant" | "Awaiting evidence";

/**
 * Where a compliance item stands. Nothing is assumed: an item is "To decide"
 * until someone marks it Applicable or Not applicable.
 */
export function complianceState(c: Pick<ComplianceItem, "applicability" | "next_due" | "status">, today = todayISO()): ComplianceState {
  if (c.applicability === "Not applicable") return "Not applicable";
  if (c.applicability !== "Applicable") return "To decide";
  if (c.next_due && c.next_due < today) return "Overdue";
  if (c.next_due && daysUntil(c.next_due, today) <= SOON_DAYS) return "Due soon";
  if (c.status === "Verified") return "Compliant";
  return "Awaiting evidence";
}

/** Next due date from the last check and how often it's needed. */
export function nextDueFrom(lastDone: string | null, months: number | null): string | null {
  if (!lastDone || !months) return null;
  const d = new Date(`${lastDone}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function intervalLabel(months: number | null) {
  if (!months) return "As needed";
  if (months % 12 === 0) return months === 12 ? "Every year" : `Every ${months / 12} years`;
  return months === 1 ? "Every month" : `Every ${months} months`;
}

// ---------- Insurance ----------

/** The covers a property of this type would normally need. A suggestion, not a rule. */
export function expectedCovers(type: string | null): string[] {
  switch (type) {
    case "Office":
      return ["Buildings", "Public liability", "Employers liability"];
    case "Guest house":
    case "Hall":
      return ["Buildings", "Public liability"];
    case "MKA-owned, rented out":
      return ["Buildings", "Landlord"];
    case "Privately rented":
      return ["Contents"];
    case "Managed accommodation":
    case "Land":
      return ["Public liability"];
    default:
      return ["Buildings", "Public liability"];
  }
}

export type CoverState = "Covered" | "Expiring soon" | "Expired" | "Unverified" | "Missing";

export function policyState(p: Pick<Policy, "expires_on" | "status"> | undefined, today = todayISO()): CoverState {
  if (!p) return "Missing";
  if (p.expires_on && p.expires_on < today) return "Expired";
  if (p.expires_on && daysUntil(p.expires_on, today) <= SOON_DAYS) return "Expiring soon";
  if (p.status !== "Verified") return "Unverified";
  return "Covered";
}

/** The policy that counts for each cover type: the one that runs latest. */
export function currentPolicies(policies: Policy[]) {
  const out = new Map<string, Policy>();
  for (const p of policies) {
    const cur = out.get(p.cover_type);
    if (!cur || (p.expires_on ?? "") > (cur.expires_on ?? "")) out.set(p.cover_type, p);
  }
  return out;
}

// ---------- Tickets ----------

export const isOpen = (i: Pick<Issue, "status">) => !CLOSED_STATUSES.includes(i.status);

export function issueOverdue(i: Pick<Issue, "status" | "target_date">, today = todayISO()) {
  return isOpen(i) && Boolean(i.target_date) && i.target_date! < today;
}

export function priorityLabel(p: string) {
  return PRIORITIES.find((x) => x.key === p)?.label ?? p;
}

/** Quotes for one job compared with each other. */
export function quoteFlag(amount: number, all: number[]): string {
  if (all.length < 2) return "Single quote";
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  const low = Math.min(...all);
  if (amount === low) return "Lowest";
  if (amount > avg * 1.15) return "Over 15% above average";
  return "Within range";
}

// ---------- Inspections ----------

export function latestInspection(list: Inspection[]) {
  return [...list].sort((a, b) => b.inspected_on.localeCompare(a.inspected_on))[0];
}

export type InspectionState = "Up to date" | "Due soon" | "Overdue" | "Not scheduled";

export function inspectionState(list: Inspection[], today = todayISO()): InspectionState {
  const latest = latestInspection(list);
  if (!latest?.next_due) return "Not scheduled";
  if (latest.next_due < today) return "Overdue";
  if (daysUntil(latest.next_due, today) <= 30) return "Due soon";
  return "Up to date";
}

// ---------- Building health ----------

export type Health = { score: number; rating: "Good" | "Fair" | "Needs attention"; reasons: string[] };

/**
 * A score out of 100 for one property. It starts at 100 and loses points for
 * overdue checks, missing or expired insurance, open tickets and overdue
 * inspections. It's a prompt for where to look, not an official rating.
 */
export function healthScore(p: Property, d: JaidatData, today = todayISO()): Health {
  let score = 100;
  const reasons: string[] = [];
  const take = (n: number, why: string) => {
    if (n <= 0) return;
    score -= n;
    reasons.push(why);
  };

  const comp = d.compliance.filter((c) => c.property_id === p.id).map((c) => complianceState(c, today));
  const overdue = comp.filter((s) => s === "Overdue").length;
  const soon = comp.filter((s) => s === "Due soon").length;
  const waiting = comp.filter((s) => s === "Awaiting evidence").length;
  const undecided = comp.filter((s) => s === "To decide").length;
  take(Math.min(30, overdue * 10), `${overdue} compliance check${overdue === 1 ? "" : "s"} overdue`);
  take(Math.min(12, soon * 3), `${soon} compliance check${soon === 1 ? "" : "s"} due soon`);
  take(Math.min(16, waiting * 2), `${waiting} applicable check${waiting === 1 ? "" : "s"} without verified evidence`);
  take(Math.min(10, Math.ceil(undecided / 2)), `${undecided} compliance item${undecided === 1 ? "" : "s"} not yet decided`);

  const policies = currentPolicies(d.insurance.filter((x) => x.property_id === p.id));
  for (const cover of expectedCovers(p.property_type)) {
    const s = policyState(policies.get(cover), today);
    if (s === "Expired") take(15, `${cover} insurance expired`);
    else if (s === "Expiring soon") take(5, `${cover} insurance expiring soon`);
    else if (s === "Missing") take(5, `No ${cover.toLowerCase()} insurance on record`);
  }

  const weights: Record<string, number> = { P1: 20, P2: 10, P3: 3, P4: 1 };
  const open = d.issues.filter((i) => i.property_id === p.id && isOpen(i));
  const ticketPoints = open.reduce((n, i) => n + (weights[i.priority] ?? 0) + (issueOverdue(i, today) ? 2 : 0), 0);
  take(ticketPoints, `${open.length} open ticket${open.length === 1 ? "" : "s"}`);

  const insp = inspectionState(d.inspections.filter((i) => i.property_id === p.id), today);
  if (insp === "Overdue") take(10, "Inspection overdue");
  else if (insp === "Not scheduled") take(3, "No inspection scheduled");

  score = Math.max(0, Math.min(100, score));
  return { score, rating: score >= 80 ? "Good" : score >= 60 ? "Fair" : "Needs attention", reasons };
}

// ---------- Needs attention ----------

export type Alert = { level: "bad" | "warn"; who: string; text: string; href: string; sort: string };

export function buildAlerts(d: JaidatData, today = todayISO(), scope?: string): Alert[] {
  const props = propertyMap(d.properties);
  const alerts: Alert[] = [];
  const inScope = (pid: string | null) => !scope || pid === scope;
  const base = (pid: string | null) => (pid ? `/jaidat/${pid}` : "/jaidat");
  const name = (pid: string | null) => (pid ? shortName(props.get(pid)) : "General");
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  for (const i of d.issues) {
    if (!inScope(i.property_id) || !isOpen(i)) continue;
    const href = `${base(i.property_id)}?tab=tickets&open=${i.id}`;
    if (i.priority === "P1") alerts.push({ level: "bad", who: i.ref, text: `P1 emergency: ${i.title}`, href, sort: "0" });
    else if (issueOverdue(i, today))
      alerts.push({ level: "bad", who: i.ref, text: `Past its target by ${days(-daysUntil(i.target_date!, today))}: ${i.title}`, href, sort: `1${i.target_date}` });
    else if (i.status === "New") alerts.push({ level: "warn", who: i.ref, text: `New, not picked up yet: ${i.title}`, href, sort: `3${i.created_at}` });
    if (!i.officer && i.status !== "New" && isOpen(i)) alerts.push({ level: "warn", who: i.ref, text: "No officer assigned", href, sort: "5" });
  }

  for (const c of d.compliance) {
    if (!inScope(c.property_id)) continue;
    const s = complianceState(c, today);
    const href = `${base(c.property_id)}?tab=compliance&open=${c.id}`;
    if (s === "Overdue") alerts.push({ level: "bad", who: name(c.property_id), text: `${c.title} overdue since ${fmt(c.next_due)}`, href, sort: `1${c.next_due}` });
    else if (s === "Due soon") alerts.push({ level: "warn", who: name(c.property_id), text: `${c.title} due in ${days(daysUntil(c.next_due!, today))}`, href, sort: `2${c.next_due}` });
  }

  for (const p of d.properties) {
    if (!inScope(p.id) || p.status === "Disposed") continue;
    const policies = currentPolicies(d.insurance.filter((x) => x.property_id === p.id));
    for (const [cover, pol] of policies) {
      const s = policyState(pol, today);
      const href = `/jaidat/${p.id}?tab=insurance`;
      if (s === "Expired") alerts.push({ level: "bad", who: shortName(p), text: `${cover} insurance expired ${fmt(pol.expires_on)}`, href, sort: `1${pol.expires_on}` });
      else if (s === "Expiring soon")
        alerts.push({ level: "warn", who: shortName(p), text: `${cover} insurance renews in ${days(daysUntil(pol.expires_on!, today))}`, href, sort: `2${pol.expires_on}` });
    }
    if (p.lease_end && daysUntil(p.lease_end, today) <= 90) {
      const n = daysUntil(p.lease_end, today);
      alerts.push({
        level: n < 0 ? "bad" : "warn",
        who: shortName(p),
        text: n < 0 ? `Lease ended ${fmt(p.lease_end)}` : `Lease ends in ${days(n)}`,
        href: `/jaidat/${p.id}`,
        sort: `2${p.lease_end}`,
      });
    }
    if (inspectionState(d.inspections.filter((x) => x.property_id === p.id), today) === "Overdue") {
      alerts.push({ level: "warn", who: shortName(p), text: "Inspection overdue", href: `/jaidat/${p.id}?tab=inspections`, sort: "4" });
    }
  }

  for (const r of d.records) {
    if (!inScope(r.property_id) || !recordOverdue(r, today)) continue;
    alerts.push({
      level: "warn",
      who: name(r.property_id),
      text: `Follow up: ${r.title}${r.owner_name ? ` (${r.owner_name})` : ""}`,
      href: `${base(r.property_id)}?tab=records`,
      sort: `3${r.follow_up_on}`,
    });
  }

  if (!scope) {
    for (const q of d.requests) {
      if (q.status === "Replied" || !q.due_on || q.due_on >= today) continue;
      alerts.push({ level: "warn", who: q.person, text: `Reply overdue since ${fmt(q.due_on)}`, href: "/jaidat?tab=requests", sort: `3${q.due_on}` });
    }
    const proposed = d.costs.filter((c) => c.status === "Proposed").length;
    if (proposed) alerts.push({ level: "warn", who: "Finance", text: `${proposed} cost${proposed === 1 ? "" : "s"} waiting for approval`, href: "/jaidat?tab=finance", sort: "4" });
  }

  return alerts.sort((a, b) => (a.level === b.level ? a.sort.localeCompare(b.sort) : a.level === "bad" ? -1 : 1));
}

// ---------- Coming up ----------

export type DueItem = { date: string; kind: string; title: string; who: string; href: string };

/** Dated things: renewals, checks, follow-ups, payments and replies. */
export function dueItems(d: JaidatData, scope?: string): DueItem[] {
  const props = propertyMap(d.properties);
  const name = (pid: string | null) => (pid ? shortName(props.get(pid)) : "General");
  const inScope = (pid: string | null) => !scope || pid === scope;
  const out: DueItem[] = [];
  const add = (date: string | null, kind: string, title: string, pid: string | null, href: string) => {
    if (date && inScope(pid)) out.push({ date, kind, title, who: name(pid), href });
  };

  for (const c of d.compliance) if (c.applicability === "Applicable") add(c.next_due, "Compliance", c.title, c.property_id, `/jaidat/${c.property_id}?tab=compliance&open=${c.id}`);
  for (const p of d.insurance) add(p.expires_on, "Insurance", `${p.cover_type} insurance renewal`, p.property_id, `/jaidat/${p.property_id}?tab=insurance`);
  for (const i of d.issues) if (isOpen(i)) add(i.target_date, "Ticket", `${i.ref} ${i.title}`, i.property_id, `${i.property_id ? `/jaidat/${i.property_id}` : "/jaidat"}?tab=tickets&open=${i.id}`);
  for (const r of d.records) if (r.status !== "Verified") add(r.follow_up_on, "Records", `Follow up: ${r.title}`, r.property_id, `/jaidat/${r.property_id}?tab=records`);
  for (const c of d.costs) if (c.status !== "Paid" && c.status !== "Rejected") add(c.due_date, "Payment", `${c.description}${c.proposed ? ` (${money(num(c.approved ?? c.proposed))})` : ""}`, c.property_id, `${c.property_id ? `/jaidat/${c.property_id}` : "/jaidat"}?tab=finance`);
  for (const p of d.properties) add(p.lease_end, "Lease", "Lease ends", p.id, `/jaidat/${p.id}`);
  for (const p of d.properties) {
    const latest = latestInspection(d.inspections.filter((x) => x.property_id === p.id));
    if (latest) add(latest.next_due, "Inspection", `Next ${latest.inspection_type.toLowerCase()}`, p.id, `/jaidat/${p.id}?tab=inspections`);
  }
  for (const f of d.files) add(f.expires_on, "Document", `${f.title} expires`, f.property_id, `${f.property_id ? `/jaidat/${f.property_id}` : "/jaidat"}?tab=documents`);
  if (!scope) {
    for (const q of d.requests) if (q.status !== "Replied") add(q.due_on, "Reply", `Reply due from ${q.person}`, q.property_id, "/jaidat?tab=requests");
    for (const k of d.contractors) if (k.status !== "Suspended") add(k.insurance_expiry, "Contractor", `${k.name}: insurance expires`, null, "/jaidat?tab=contacts");
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Data checks (the Task Audit) ----------

export type Check = { area: string; item: string; problem: string; href: string };

/** Gaps in the records worth fixing before the month end. */
export function dataChecks(d: JaidatData, today = todayISO()): Check[] {
  const props = propertyMap(d.properties);
  const name = (pid: string | null) => (pid ? shortName(props.get(pid)) : "General");
  const out: Check[] = [];
  const add = (area: string, item: string, problem: string, href: string) => out.push({ area, item, problem, href });

  for (const p of d.properties) {
    if (p.status === "Disposed") continue;
    if (!p.address) add("Properties", p.name, "No address", `/jaidat/${p.id}`);
    else if (!p.address_verified) add("Properties", p.name, "Address not yet verified", `/jaidat/${p.id}`);
    if (!p.ownership) add("Properties", p.name, "Ownership not recorded", `/jaidat/${p.id}`);
    const undecided = d.compliance.filter((c) => c.property_id === p.id && c.applicability === "To be confirmed").length;
    if (undecided) add("Compliance", p.name, `${undecided} item${undecided === 1 ? "" : "s"} still to decide (applies or not)`, `/jaidat/${p.id}?tab=compliance`);
  }
  for (const c of d.compliance) {
    if (c.applicability !== "Applicable") continue;
    const where = `${name(c.property_id)} · ${c.title}`;
    const href = `/jaidat/${c.property_id}?tab=compliance&open=${c.id}`;
    if (!c.next_due && c.interval_months) add("Compliance", where, "Applies, but no next due date", href);
    if (!c.officer) add("Compliance", where, "No responsible officer", href);
    if (c.status !== "Verified") add("Compliance", where, "Evidence not yet verified", href);
  }
  for (const r of d.records) {
    const where = `${name(r.property_id)} · ${r.title}`;
    const href = `/jaidat/${r.property_id}?tab=records`;
    if (r.status === "Outstanding") add("Records", where, "Outstanding: needs chasing", href);
    if (recordOverdue(r, today)) add("Records", where, "Follow-up date has passed", href);
  }
  for (const i of d.issues) {
    const where = `${i.ref} · ${i.title}`;
    const href = `${i.property_id ? `/jaidat/${i.property_id}` : "/jaidat"}?tab=tickets&open=${i.id}`;
    if (!i.property_id && isOpen(i)) add("Tickets", where, "No property set", href);
    if (!i.officer && isOpen(i)) add("Tickets", where, "No officer assigned", href);
    if (issueOverdue(i, today)) add("Tickets", where, "Past its target date", href);
    if ((i.status === "Completed" || i.status === "Closed") && !i.lesson) add("Tickets", where, "Closed without a lesson for the SOPs", href);
    const k = i.contractor_id ? d.contractors.find((x) => x.id === i.contractor_id) : null;
    if (k && !k.approved && isOpen(i)) add("Tickets", where, `${k.name} isn't an approved contractor`, href);
  }
  for (const c of d.costs) {
    const where = `${name(c.property_id)} · ${c.description}`;
    if (c.status === "Paid" && !c.paid_on) add("Finance", where, "Paid with no payment date", `/jaidat?tab=finance`);
    if (c.status !== "Paid" && c.status !== "Rejected" && c.due_date && c.due_date < today) add("Finance", where, "Payment date has passed", `/jaidat?tab=finance`);
  }
  for (const k of d.contractors) {
    if (k.status === "Suspended") continue;
    if (!k.approved) add("Contractors", k.name, "Not approved to take work", "/jaidat?tab=contacts");
    if (k.insurance_expiry && k.insurance_expiry < today) add("Contractors", k.name, "Their insurance has expired", "/jaidat?tab=contacts");
  }
  return out;
}

// ---------- Small helpers ----------

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

export function relDays(iso: string | null, today = todayISO()): string {
  if (!iso) return "";
  const n = daysUntil(iso, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileKind(f: Pick<JaidatFile, "mime_type" | "link_url">): string {
  if (!f.mime_type) return f.link_url ? "Link" : "File";
  if (f.mime_type === "application/pdf") return "PDF";
  if (f.mime_type.startsWith("image/")) return "Image";
  if (f.mime_type.includes("word")) return "Word";
  if (f.mime_type.includes("excel") || f.mime_type.includes("sheet")) return "Excel";
  return "File";
}

/** A mailto: link with subject and body. */
export function mailto(to: string | null | undefined, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
