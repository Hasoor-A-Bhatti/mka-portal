// MKA Storage and Equipment Loans: shared types, lists and small helpers.

import { formatDate } from "@/lib/format";

export const ITEM_STATUSES = ["In stock", "Low stock", "Out of stock", "Missing"] as const;

export const LOAN_STATUSES = ["Pending", "Approved", "Rejected", "Collected", "Returned", "Cancelled"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Stock changes, in the order they're offered. */
export const ADJUSTMENTS = [
  { kind: "Added", label: "Add stock", help: "More of this item have arrived." },
  { kind: "Removed", label: "Remove stock", help: "Used up, given away or thrown out." },
  { kind: "Missing", label: "Mark as missing", help: "Can't be found. Moved out of stock until found." },
  { kind: "Found", label: "Mark as found", help: "Missing units turned up again." },
  { kind: "Written off", label: "Write off missing", help: "Missing units won't be found." },
  { kind: "Stock take", label: "Stock take", help: "Set the count to what's actually there." },
] as const;
export type AdjustKind = (typeof ADJUSTMENTS)[number]["kind"];

export const CATEGORY_SUGGESTIONS = [
  "Audio/visual",
  "Catering",
  "Cleaning",
  "Electrical",
  "First aid",
  "Furniture",
  "Hi-vis and safety",
  "Marquees and gazebos",
  "Signage and banners",
  "Sports",
  "Stationery",
  "Tools",
];

export const OWNER_SUGGESTIONS = ["MKA Storage", "Delegations", "Fleet", "Jaidad", "Special Arrangements"];

type Stamped = { created_at: string; updated_at?: string };

export type Location = Stamped & {
  id: string;
  name: string;
  site: string | null;
  position: number;
  notes: string | null;
  active: boolean;
};

export type Item = Stamped & {
  id: string;
  item_name: string;
  category: string | null;
  location: string | null;
  location_id: string | null;
  owned_by: string | null;
  quantity: number;
  missing_qty: number;
  min_qty: number | null;
  loanable: boolean;
  status: string;
  notes: string | null;
};

export type Movement = Stamped & {
  id: string;
  item_id: string;
  kind: string;
  change: number;
  quantity_after: number | null;
  missing_after: number | null;
  note: string | null;
  actor_name: string | null;
};

export type Loan = Stamped & {
  id: string;
  ref: string;
  item_id: string | null;
  item_name: string;
  location_name: string | null;
  owned_by: string | null;
  quantity: number;
  start_date: string;
  end_date: string;
  purpose: string | null;
  borrower_department: string | null;
  phone: string | null;
  requested_by: string | null;
  requester_name: string | null;
  requester_email: string | null;
  status: LoanStatus;
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  collected_at: string | null;
  returned_at: string | null;
  return_note: string | null;
};

export type Message = Stamped & {
  id: string;
  loan_id: string;
  body: string;
  from_storage: boolean;
  author_name: string | null;
  read_at: string | null;
};

export type Borrower = {
  email: string;
  full_name: string | null;
  department: string | null;
  signed_in: boolean;
  requests: number;
  added_at: string;
};

export type SearchResult = {
  id: string;
  item_name: string;
  category: string | null;
  location_name: string | null;
  site: string | null;
  owned_by: string | null;
  quantity: number;
  available: number;
};

/** Today in London, as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Out on loan and past its return date. */
export function loanOverdue(l: Pick<Loan, "status" | "end_date">, today = todayISO()) {
  return l.status === "Collected" && l.end_date < today;
}

/** Approved, but the collection date has passed without it being collected. */
export function collectionLate(l: Pick<Loan, "status" | "start_date">, today = todayISO()) {
  return l.status === "Approved" && l.start_date < today;
}

/** Where a loan stands, in words for the borrower. */
export function loanHeadline(l: Loan, today = todayISO()) {
  switch (l.status) {
    case "Pending":
      return "Waiting for MKA Storage to approve";
    case "Approved":
      return l.start_date <= today ? "Approved: ready to collect" : `Approved: collect from ${l.start_date === addDays(today, 1) ? "tomorrow" : formatDate(l.start_date)}`;
    case "Collected":
      return loanOverdue(l, today) ? "Overdue: please return it" : "On loan";
    case "Returned":
      return "Returned";
    case "Rejected":
      return "Not approved";
    case "Cancelled":
      return "Cancelled";
  }
}

export const LOAN_TONES: Record<string, string> = {
  Pending: "#9a6600",
  Approved: "#3f51c9",
  Collected: "#5024a8",
  Returned: "#15805a",
  Rejected: "#c43a3a",
  Cancelled: "#6b6383",
  Overdue: "#c43a3a",
  "In stock": "#15805a",
  "Low stock": "#9a6600",
  "Out of stock": "#c43a3a",
  Missing: "#c43a3a",
  "Not loanable": "#6b6383",
};

export function loanTone(s: string) {
  return LOAN_TONES[s] ?? "#6b6383";
}

/** Locations grouped by site, in order. */
export function bySite(locations: Location[]) {
  const groups = new Map<string, Location[]>();
  for (const l of [...locations].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
    const site = l.site?.trim() || "Other locations";
    groups.set(site, [...(groups.get(site) ?? []), l]);
  }
  return [...groups.entries()];
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** Unique, sorted non-empty values, plus suggestions. */
export function options(values: (string | null | undefined)[], extra: string[] = []) {
  return [...new Set([...values, ...extra].map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

/** Units of an item already promised (approved or out) on any day in a date range. Mirrors storage_booked in the database. */
export function bookedFor(loans: Loan[], itemId: string, from: string, to: string, skip?: string) {
  return loans
    .filter((l) => l.item_id === itemId && l.id !== skip && (l.status === "Approved" || l.status === "Collected") && l.start_date <= to && l.end_date >= from)
    .reduce((n, l) => n + l.quantity, 0);
}

/** "15 Nov to 19 Nov 2026 · 5 days" */
export function dateRange(from: string, to: string) {
  const days = daysBetween(from, to) + 1;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const range = from === to ? formatDate(from) : `${sameYear ? short(from) : formatDate(from)} to ${formatDate(to)}`;
  return `${range} · ${days} day${days === 1 ? "" : "s"}`;
}
