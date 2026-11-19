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
  /** Added in migration 0009; missing before it's run. */
  activities?: AekActivities | null;
  khuddam?: Khadim[] | null;
  meal_requests?: MealRequests | null;
  submitted_at: string;
};

export const DAY_PARTS = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
] as const;

export type DayPart = (typeof DAY_PARTS)[number]["key"];

/** What the AeK plans to do, by day. */
export type AekActivities = Record<string, Partial<Record<DayPart, string>>>;

/** The meals the AeK would like catered, by day. A listed day without a meal means it isn't needed. */
export type MealRequests = Record<string, MealKey[]>;

export type Khadim = { name?: string; flight?: string; allergy?: AllergyKey; allergy_note?: string };

/** Matches public.aek_allergy_keys() in the database. */
export const ALLERGIES = [
  { key: "none", label: "No allergies" },
  { key: "nuts", label: "Nuts (tree nuts)" },
  { key: "peanuts", label: "Peanuts" },
  { key: "gluten", label: "Gluten / wheat" },
  { key: "dairy", label: "Dairy / milk" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "shellfish", label: "Shellfish" },
  { key: "soya", label: "Soya" },
  { key: "sesame", label: "Sesame" },
  { key: "other", label: "Other, or more than one" },
] as const;

export type AllergyKey = (typeof ALLERGIES)[number]["key"];

export const allergyLabel = (k: Khadim) => {
  const base = ALLERGIES.find((a) => a.key === k.allergy)?.label ?? null;
  if (!base || k.allergy === "none") return base;
  return k.allergy_note ? `${base}: ${k.allergy_note}` : base;
};

/** "Nuts ×2 · Gluten ×1", or null when nobody has an allergy. */
export function allergySummary(khuddam: Khadim[] | null | undefined): string | null {
  const counts = new Map<string, number>();
  for (const k of khuddam ?? []) {
    if (!k.allergy || k.allergy === "none") continue;
    const label = k.allergy === "other" ? (k.allergy_note || "Other") : ALLERGIES.find((a) => a.key === k.allergy)!.label.split(" (")[0];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts].map(([label, n]) => `${label} ×${n}`).join(" · ");
}

/**
 * Whether the AeK wants this meal: true (asked for it), false (not needed),
 * or null when they haven't said for that day.
 */
export function mealWanted(requests: MealRequests | null | undefined, day: string, meal: MealKey): boolean | null {
  const list = requests?.[day];
  if (!list) return null;
  return list.includes(meal);
}

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

// ---------- Travellers (0018): one row per person ----------

export type Traveller = {
  id: string;
  ref: number | null;
  full_name: string;
  phone?: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  arrival_flight: string | null;
  arrival_place: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_flight: string | null;
  departure_place: string | null;
  needs_accommodation?: boolean;
  needs_pickup: boolean;
  needs_dropoff: boolean;
  notes?: string | null;
  /** Who added them: the team, or the AeK on their link. */
  source?: "team" | "aek";
  created_at?: string;
};

/**
 * The list in its settled order: the same order the AeK link shows
 * (aek_travellers), so both sides agree on who is number 7.
 */
export function sortTravellers<T extends Pick<Traveller, "ref" | "full_name" | "created_at">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (a.ref ?? Infinity) - (b.ref ?? Infinity) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.full_name.localeCompare(b.full_name),
  );
}

/**
 * Each person's number on the list: always 1, 2, 3… with no gaps, worked out
 * here rather than taken from a file or an import (which can skip numbers or
 * be out of order).
 */
export function travellerNumbers(list: Traveller[]): Map<string, number> {
  return new Map(sortTravellers(list).map((t, i) => [t.id, i + 1]));
}

export type TravelLeg = "arrival" | "departure";

/** Everyone on the same flight (or, without a flight number, the same time) into or out of the same airport on the same day. */
export type TravelRun = {
  key: string;
  leg: TravelLeg;
  date: string | null;
  flight: string | null;
  place: string | null;
  /** Earliest and latest time given, "09:35" to "09:45". */
  from: string | null;
  to: string | null;
  people: Traveller[];
  /** People on it who need us there (pickup or drop-off). */
  needUs: number;
};

const legOf = (t: Traveller, leg: TravelLeg) =>
  leg === "arrival"
    ? { date: t.arrival_date, time: hhmm(t.arrival_time), flight: t.arrival_flight, place: t.arrival_place, need: t.needs_pickup }
    : { date: t.departure_date, time: hhmm(t.departure_time), flight: t.departure_flight, place: t.departure_place, need: t.needs_dropoff };

/** True when someone has nothing at all for this journey yet. */
export const legUnknown = (t: Traveller, leg: TravelLeg) => {
  const l = legOf(t, leg);
  return !l.date && !l.time && !l.flight && !l.place;
};

/** Groups people into the runs to meet or see off. People with nothing for this journey are left out. */
export function travelRuns(list: Traveller[], leg: TravelLeg): TravelRun[] {
  const runs = new Map<string, TravelRun>();
  for (const t of list) {
    if (legUnknown(t, leg)) continue;
    const l = legOf(t, leg);
    const flight = l.flight?.replace(/\s+/g, "").toUpperCase() || null;
    const key = [l.date ?? "-", flight ?? `@${l.time ?? "-"}`, (l.place ?? "-").toLowerCase()].join("|");
    const run = runs.get(key) ?? { key, leg, date: l.date, flight, place: l.place, from: l.time, to: l.time, people: [], needUs: 0 };
    run.people.push(t);
    if (l.need) run.needUs++;
    if (l.time && (!run.from || l.time < run.from)) run.from = l.time;
    if (l.time && (!run.to || l.time > run.to)) run.to = l.time;
    runs.set(key, run);
  }
  for (const r of runs.values()) r.people.sort((a, b) => (a.ref ?? 9999) - (b.ref ?? 9999) || a.full_name.localeCompare(b.full_name));
  return [...runs.values()].sort(
    (a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || (a.from ?? "99").localeCompare(b.from ?? "99") || (a.flight ?? "").localeCompare(b.flight ?? ""),
  );
}

/** "09:35–09:45" or "09:45". */
export const runTime = (r: Pick<TravelRun, "from" | "to">) => (r.from && r.to && r.from !== r.to ? `${r.from}–${r.to}` : r.from ?? "Time not given");

// ---------- Recommended vehicles ----------

export const CAR_SEATS = 4;
export const VAN_SIZES = [14, 9] as const;

/** The vehicles to hire for one pickup or drop-off run. */
export type VehiclePlan = { people: number; cars: number; van14: number; van9: number; seats: number };

/**
 * What to hire for `people` travelling together (one flight's pickup or drop-off).
 *
 *   4 or fewer → a private car.
 *   5 or more  → vans (9 or 14 seats): first the fewest vans that fit everyone,
 *                then, among those, the fewest empty seats. Since a 14-seater
 *                costs more than a 9-seater, fewer empty seats also means the
 *                cheaper mix (as many 9-seaters as will do).
 *
 *   e.g. 10 → 1 × 14 · 15 → 2 × 9 · 23 → 14 + 9 · 27 → 2 × 14 · 29 → 14 + 2 × 9
 */
export function recommendVehicles(people: number): VehiclePlan {
  const n = Math.max(0, Math.floor(people));
  if (n === 0) return { people: 0, cars: 0, van14: 0, van9: 0, seats: 0 };
  if (n <= CAR_SEATS) return { people: n, cars: 1, van14: 0, van9: 0, seats: CAR_SEATS };
  for (let vans = Math.ceil(n / 14); ; vans++) {
    // Most 9-seaters first: the first mix that fits has the fewest empty seats.
    for (let van9 = vans; van9 >= 0; van9--) {
      const van14 = vans - van9;
      const seats = van14 * 14 + van9 * 9;
      if (seats >= n) return { people: n, cars: 0, van14, van9, seats };
    }
  }
}

/** Flights this close together (minutes, same day) need vehicles at the same time. */
export const TURNAROUND_MIN = 120;

/** The vans to hire for the whole stay, and the moment that decides it. */
export type FleetPlan = {
  van14: number;
  van9: number;
  /** Runs small enough for a private car (4 or fewer). */
  carRuns: number;
  /** Runs that need a van. */
  vanRuns: number;
  /** The busiest window: the most people needing vans at once. */
  peak: { date: string | null; from: string | null; to: string | null; people: number; runs: number } | null;
};

const minutes = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

/** Every way to seat n people in vans without a wasted van: [14-seaters, 9-seaters]. */
function vanOptions(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a <= Math.ceil(n / 14); a++) out.push([a, Math.max(0, Math.ceil((n - 14 * a) / 9))]);
  return out;
}

/** Can a fleet of `a14` + `b9` vans cover these runs at the same time (each run in its own vans)? */
function fleetCovers(runs: number[], a14: number, b9: number): boolean {
  let states = new Set<string>(["0,0"]);
  for (const n of runs) {
    const next = new Set<string>();
    for (const st of states) {
      const [ua, ub] = st.split(",").map(Number);
      for (const [a, b] of vanOptions(n)) if (ua + a <= a14 && ub + b <= b9) next.add(`${ua + a},${ub + b}`);
    }
    if (!next.size) return false;
    states = next;
  }
  return true;
}

/**
 * Vans hired for the length of the stay, shared across every pickup and
 * drop-off (one van can do several trips, on the same or different days).
 *
 * Runs of 4 or fewer go by private car. For the rest, flights within
 * TURNAROUND_MIN of each other on the same day need vans at the same time; the
 * fleet is the fewest vans that can cover every such window, and among those
 * the cheapest mix (as many 9-seaters as will do, since 14-seaters cost more).
 * A run with no time given is treated as needing its vans on its own.
 */
export function recommendFleet(runs: TravelRun[]): FleetPlan {
  const vanRuns = runs.filter((r) => r.needUs > CAR_SEATS);
  const carRuns = runs.filter((r) => r.needUs > 0 && r.needUs <= CAR_SEATS).length;
  if (!vanRuns.length) return { van14: 0, van9: 0, carRuns, vanRuns: 0, peak: null };

  // Each van is out for TURNAROUND_MIN from its flight. At each flight's time, the
  // vans still out are those for flights in the TURNAROUND_MIN before it: that's
  // every moment the fleet has to cover (flights 3 hours apart can share a van).
  const windows = vanRuns.map((r) => {
    const t = minutes(r.from);
    if (t == null) return [r];
    return vanRuns.filter((o) => {
      const to = minutes(o.from);
      return o.date === r.date && to != null && to <= t && t - to < TURNAROUND_MIN;
    });
  });
  const sizes = windows.map((w) => w.map((r) => r.needUs));

  let fleet: [number, number] = [0, 0];
  search: for (let vans = 1; vans <= 200; vans++) {
    for (let b9 = vans; b9 >= 0; b9--) {
      if (sizes.every((w) => fleetCovers(w, vans - b9, b9))) {
        fleet = [vans - b9, b9];
        break search;
      }
    }
  }

  const busiest = windows.reduce((best, w) => (w.reduce((n, r) => n + r.needUs, 0) > best.reduce((n, r) => n + r.needUs, 0) ? w : best), windows[0]);
  const times = busiest.flatMap((r) => [r.from, r.to]).filter(Boolean).sort() as string[];
  return {
    van14: fleet[0],
    van9: fleet[1],
    carRuns,
    vanRuns: vanRuns.length,
    peak: { date: busiest[0].date, from: times[0] ?? null, to: times[times.length - 1] ?? null, people: busiest.reduce((n, r) => n + r.needUs, 0), runs: busiest.length },
  };
}

/** "1 × 14-seater + 1 × 9-seater", "Private car", "2 private cars". */
export function vehicleParts(p: VehiclePlan): { kind: "car" | "van14" | "van9"; label: string }[] {
  const out: { kind: "car" | "van14" | "van9"; label: string }[] = [];
  if (p.van14) out.push({ kind: "van14", label: `${p.van14} × 14-seater` });
  if (p.van9) out.push({ kind: "van9", label: `${p.van9} × 9-seater` });
  if (p.cars) out.push({ kind: "car", label: p.cars === 1 ? "Private car" : `${p.cars} private cars` });
  return out;
}

export const vehicleText = (p: VehiclePlan) => vehicleParts(p).map((x) => x.label).join(" + ") || "None needed";
