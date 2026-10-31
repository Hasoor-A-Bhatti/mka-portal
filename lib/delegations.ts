/** Shared types, labels and date helpers for delegation planning. */

export const TRANSPORT_TYPES = [
  "Airport pickup",
  "Airport drop-off",
  "Minibus / coach",
  "Hire vehicle",
  "Local transfer",
  "Other",
] as const;

export const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
] as const;

export type MealKey = (typeof MEALS)[number]["key"];

/** Longest stay the planners will draw, so a typo in a date can't produce a 3-year grid. */
export const MAX_PLAN_DAYS = 92;

// ---------- Row types ----------

export type Delegation = {
  id: string;
  name: string;
  country: string | null;
  head_of_delegation: string | null;
  head_contact: string | null;
  members: number | null;
  venue: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  status: string;
  notes: string | null;
  calendar_event_ids: string[] | null;
};

export type DelegationFile = {
  id: string;
  delegation_id: string;
  kind: "itinerary";
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  creator?: { full_name: string | null } | null;
  viewUrl?: string;
  downloadUrl?: string;
};

export type Stay = {
  id: string;
  venue: string;
  start_date: string;
  end_date: string;
  rooms: string | null;
  notes: string | null;
};

export type Transport = {
  id: string;
  transport_type: string;
  vehicle: string | null;
  start_date: string;
  end_date: string;
  pickup_time: string | null;
  pickup: string | null;
  dropoff: string | null;
  driver: string | null;
  booking_ref: string | null;
  notes: string | null;
};

export type Meal = {
  id: string;
  day: string;
  meal: MealKey;
  catered: boolean;
  location: string | null;
  menu: string | null;
};

export type Mulaqat = {
  id: string;
  mulaqat_date: string;
  mulaqat_time: string | null;
  location: string | null;
  notes: string | null;
  attendee_ids: string[];
  other_attendees: string | null;
};

export type TeamMember = { id: string; full_name: string };

// ---------- Dates (plain YYYY-MM-DD strings) ----------

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

export function addDays(day: string, n: number): string {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days between two dates, inclusive of both. */
export function spanDays(from: string, to: string): number {
  return Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000) + 1;
}

/** Every day of the stay, arrival to departure inclusive. Empty when dates are missing. */
export function stayDays(d: Pick<Delegation, "arrival_date" | "departure_date">): string[] {
  if (!d.arrival_date || !d.departure_date || d.departure_date < d.arrival_date) return [];
  const out: string[] = [];
  for (let x = d.arrival_date; x <= d.departure_date && out.length < MAX_PLAN_DAYS; x = addDays(x, 1)) out.push(x);
  return out;
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(asDate(day));
}

/** "Mon 14 Oct" */
export const shortDay = (day: string) => fmtDay(day, { weekday: "short", day: "numeric", month: "short" });

/** "14 Oct – 18 Oct" or "14 Oct" for a single day. */
export function dayRange(from: string, to: string): string {
  const a = fmtDay(from, { day: "numeric", month: "short" });
  return from === to ? a : `${a} – ${fmtDay(to, { day: "numeric", month: "short" })}`;
}

/** "3 days" */
export const daysLabel = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** "14:30:00" → "14:30" */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export const fromCalendar = (d: Pick<Delegation, "calendar_event_ids">) => Boolean(d.calendar_event_ids?.length);
