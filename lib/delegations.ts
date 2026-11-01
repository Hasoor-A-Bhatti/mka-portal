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
  /** "aek" when the head of delegation uploaded it through their link. */
  source?: "team" | "aek";
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

// ---------- AeK (Amir-e-Kafla, head of delegation) ----------

export const AEK_LABEL = "AeK";
export const AEK_TITLE = "Amir-e-Kafla (head of delegation)";

export type AekLink = { id: string; token: string; created_at: string; revoked_at: string | null };

export type AekUpdate = {
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_travel: string | null;
  arrival_place: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_travel: string | null;
  departure_place: string | null;
  head_name: string | null;
  head_contact: string | null;
  members: number | null;
  notes: string | null;
  submitted_at: string;
};

/**
 * When a link stops working: 7 days after departure, and never sooner than 14
 * days after it was made. Matches public.aek_delegation() in the database.
 */
export function aekExpiry(createdAt: string, departure: string | null): Date {
  const made = new Date(createdAt);
  const minimum = new Date(made.getTime() + 14 * 86_400_000);
  const fromDates = departure
    ? new Date(`${addDays(departure, 8)}T00:00:00Z`)
    : new Date(`${addDays(made.toISOString().slice(0, 10), 60)}T00:00:00Z`);
  return fromDates > minimum ? fromDates : minimum;
}

/** "14:30 · BA 0123 · Heathrow T5" from the parts the AeK filled in. */
export function aekTravelLine(time: string | null, travel: string | null, place: string | null) {
  return [time ? hhmm(time) : null, travel, place].filter(Boolean).join(" · ");
}

// ---------- Share links (AeK and Region Guidance) ----------

export type ShareKind = "aek" | "region";

/** A working link, ready to share. */
export type ShareLink = { id: string; url: string; createdAt: string; expires: string };

export type ShareState = {
  /** False until the link's migration has been run. */
  ready: boolean;
  link: ShareLink | null;
  /** Whether the other side has filled it in yet, for the status line. */
  received: string | null;
};

export const SHARE_KINDS: Record<ShareKind, { label: string; short: string; path: string; table: string; migration: string }> = {
  aek: { label: "AeK link", short: "AeK", path: "visit", table: "delegation_aek_links", migration: "0007_aek_links.sql" },
  region: {
    label: "Region Guidance",
    short: "Region",
    path: "region",
    table: "delegation_region_links",
    migration: "0008_region_guidance.sql",
  },
};

export type Driver = {
  leg: "pickup" | "dropoff";
  full_name: string | null;
  aims: string | null;
  phone: string | null;
};

/** tel: link for a phone number as typed. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

/** A link row from the database as a working link, or null if it has expired. */
export function toShareLink(
  row: { id: string; token: string; created_at: string } | null | undefined,
  kind: ShareKind,
  departure: string | null,
  origin: string,
): ShareLink | null {
  if (!row) return null;
  const expires = aekExpiry(row.created_at, departure);
  if (expires <= new Date()) return null;
  return { id: row.id, url: `${origin}/${SHARE_KINDS[kind].path}/${row.token}`, createdAt: row.created_at, expires: expires.toISOString() };
}

/** Status line for a Region Guidance link, from the drivers added so far. */
export function driversReceived(drivers: Pick<Driver, "leg">[]): string | null {
  const up = drivers.filter((d) => d.leg === "pickup").length;
  const down = drivers.filter((d) => d.leg === "dropoff").length;
  if (!up && !down) return null;
  const n = (k: number, what: string) => `${k} ${what} driver${k === 1 ? "" : "s"}`;
  return [up ? n(up, "pickup") : null, down ? n(down, "drop-off") : null].filter(Boolean).join(", ");
}
