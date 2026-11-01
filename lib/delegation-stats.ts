/**
 * Quick Stats for the Delegations dashboard, worked out from live records.
 *
 * "Guests" are delegation members. A delegation counts in the month it arrives.
 * Arrived = arrival date is today or earlier; yet to arrive = a later arrival
 * date. Cancelled delegations are left out everywhere.
 *
 * Every chart total is made of per-delegation pieces (`segs`), so the charts
 * can show which delegations make up each bar.
 */

import { addDays, spanDays } from "@/lib/delegations";

/** Stats are counted from this month on. */
export const STATS_FROM = "2026-11-01";

export type StatDelegation = {
  id: string;
  name: string;
  country: string | null;
  members: number | null;
  venue: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  status: string;
};

export type StatStay = { delegation_id: string; venue: string; start_date: string; end_date: string };
export type StatTransport = { delegation_id: string; transport_type: string };
export type StatMeal = { delegation_id: string; day: string; catered: boolean };

/** One delegation's share of a bar. */
export type Seg = { id: string; name: string; guests: number; arrival: string; upcoming: boolean };

/** A bar: its total, the arrived / yet-to-arrive split, and the delegations in it. */
export type Split = { guests: number; arrived: number; upcoming: number; segs: Seg[] };

export type MonthBar = Split & { key: string; label: string; short: string };
export type Ranked = Split & { name: string };
export type OnSiteDay = Split & { day: string; groups: number };
export type Readiness = {
  id: string;
  name: string;
  arrival: string;
  departure: string;
  members: number | null;
  days: number;
  stayDays: number;
  transport: number;
  meals: number;
  mealsTotal: number;
  /** 0–1, accommodation, transport and food weighted equally. */
  score: number;
};

export type QuickStats = {
  from: string;
  today: string;
  guests: number;
  arrived: number;
  upcoming: number;
  delegations: number;
  missingMembers: number;
  countries: Ranked[];
  peak: { label: string; guests: number } | null;
  growth: { value: string; label: string; detail: string; tone: "up" | "down" | "flat" | "none" };
  months: MonthBar[];
  venues: Ranked[];
  onSite: OnSiteDay[];
  readiness: Readiness[];
};

export const NOT_SET = "Not set";

const monthKey = (day: string) => day.slice(0, 7);

function monthLabel(key: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
}

function nextMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const shiftYear = (day: string, n: number) => `${Number(day.slice(0, 4)) + n}${day.slice(4)}`;

// Names written different ways on the calendar and in stays become one venue.
// Short codes are matched in capitals only, so "BE" is Baitul Ehsan but the word "be" isn't.
const VENUES: [RegExp, string][] = [
  [/baitul\s*futuh|\bBF\b/i, "Baitul Futuh"],
  [/baitul\s*ehsan/i, "Baitul Ehsan"],
  [/\bBE\b/, "Baitul Ehsan"],
  [/aiwan|aewan/i, "Aiwan-e-Mahmood"],
  [/islamabad|tilford/i, "Islamabad"],
  [/baitul\s*wahed/i, "Baitul Wahed"],
  [/fazl/i, "Fazl Mosque"],
  [/\bSeM\b|[Ss]erai/, "SeM"],
  [/\bWeA\b/i, "WeA"],
];

function venueName(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return VENUES.find(([re]) => re.test(v))?.[1] ?? v;
}

/** Splits a whole number across weights so the parts add back up exactly. */
function share(total: number, weights: Map<string, number>): Map<string, number> {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (sum <= 0) return out;
  const parts = [...weights.entries()].map(([k, w]) => {
    const exact = (total * w) / sum;
    return { k, whole: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = total - parts.reduce((n, p) => n + p.whole, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    p.whole++;
    left--;
  }
  for (const p of parts) if (p.whole > 0) out.set(p.k, p.whole);
  return out;
}

/** Builds a bar from delegation pieces: arrived first, then by arrival date. */
function split(segs: Seg[]): Split {
  const sorted = segs
    .filter((s) => s.guests > 0)
    .sort((a, b) => Number(a.upcoming) - Number(b.upcoming) || a.arrival.localeCompare(b.arrival) || a.name.localeCompare(b.name));
  const arrived = sorted.filter((s) => !s.upcoming).reduce((n, s) => n + s.guests, 0);
  const upcoming = sorted.filter((s) => s.upcoming).reduce((n, s) => n + s.guests, 0);
  return { guests: arrived + upcoming, arrived, upcoming, segs: sorted };
}

/** Ranks named bars by guests, with "Not set" always last. */
function rank(map: Map<string, Seg[]>): Ranked[] {
  return [...map.entries()]
    .map(([name, segs]) => ({ name, ...split(segs) }))
    .filter((r) => r.guests > 0)
    .sort((a, b) => Number(a.name === NOT_SET) - Number(b.name === NOT_SET) || b.guests - a.guests || a.name.localeCompare(b.name));
}

function push<K>(map: Map<K, Seg[]>, key: K, seg: Seg) {
  const list = map.get(key);
  if (list) list.push(seg);
  else map.set(key, [seg]);
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;

export function computeQuickStats(
  rows: StatDelegation[],
  stays: StatStay[],
  transport: StatTransport[],
  meals: StatMeal[],
  today: string,
): QuickStats {
  const live = rows.filter((r) => r.status !== "Cancelled" && r.arrival_date);
  const inPeriod = live.filter((r) => r.arrival_date! >= STATS_FROM);
  const size = (r: StatDelegation) => Math.max(0, r.members ?? 0);
  const seg = (r: StatDelegation, guests = size(r)): Seg => ({
    id: r.id,
    name: r.name,
    guests,
    arrival: r.arrival_date!,
    upcoming: r.arrival_date! > today,
  });

  const total = split(inPeriod.map((r) => seg(r)));

  // Countries, ignoring differences in capitals and spacing ("uk" and "UK" are one).
  const byCountry = new Map<string, Seg[]>();
  const countryName = new Map<string, string>();
  for (const r of inPeriod) {
    const raw = r.country?.trim().replace(/\s+/g, " ") || NOT_SET;
    const key = raw.toLowerCase();
    if (!countryName.has(key)) countryName.set(key, raw);
    push(byCountry, countryName.get(key)!, seg(r));
  }
  const countries = rank(byCountry);

  // Months: from the start to whichever is later, this month or the last booking (12 at most).
  const lastArrival = inPeriod.reduce((m, r) => (r.arrival_date! > m ? r.arrival_date! : m), today);
  const keys: string[] = [];
  for (let k = monthKey(STATS_FROM); k <= monthKey(lastArrival); k = nextMonth(k)) keys.push(k);
  const months: MonthBar[] = keys.slice(-12).map((key) => ({
    key,
    label: monthLabel(key, { month: "long", year: "numeric" }),
    short: monthLabel(key, { month: "short" }),
    ...split(inPeriod.filter((r) => monthKey(r.arrival_date!) === key).map((r) => seg(r))),
  }));
  const peakMonth = [...months].sort((a, b) => b.guests - a.guests)[0];
  const peak = peakMonth && peakMonth.guests > 0 ? { label: peakMonth.label, guests: peakMonth.guests } : null;

  // Growth: same period last year when there's data for it, otherwise this month against last.
  const lastYear = live
    .filter((r) => r.arrival_date! >= shiftYear(STATS_FROM, -1) && r.arrival_date! <= shiftYear(today, -1))
    .reduce((n, r) => n + size(r), 0);
  let growth: QuickStats["growth"];
  if (lastYear > 0 && today >= STATS_FROM) {
    const change = (total.arrived - lastYear) / lastYear;
    const diff = total.arrived - lastYear;
    growth = {
      value: pct(change),
      label: "Year on year",
      detail: `${diff >= 0 ? `${diff.toLocaleString("en-GB")} more` : `${(-diff).toLocaleString("en-GB")} fewer`} guests than this time last year`,
      tone: change > 0 ? "up" : change < 0 ? "down" : "flat",
    };
  } else {
    const thisKey = monthKey(today);
    const thisM = months.find((m) => m.key === thisKey);
    const prevM = months[months.findIndex((m) => m.key === thisKey) - 1];
    const now = thisM?.guests ?? 0;
    const before = prevM?.guests ?? 0;
    growth =
      prevM && before > 0
        ? {
            value: pct((now - before) / before),
            label: "This month vs last",
            detail: `${now.toLocaleString("en-GB")} guests (incl. bookings) vs ${before.toLocaleString("en-GB")} in ${prevM.short}`,
            tone: now > before ? "up" : now < before ? "down" : "flat",
          }
        : { value: "—", label: "Growth", detail: "Shows once there are two months to compare", tone: "none" };
  }

  // Accommodation: each delegation's guests are shared across its venues by days
  // at each, so a group at two venues is never counted twice. Planned stays come
  // first, then the venue on the delegation, otherwise "Not set".
  const byVenue = new Map<string, Seg[]>();
  for (const r of inPeriod) {
    if (size(r) === 0) continue;
    const weights = new Map<string, number>();
    const own = stays.filter((s) => s.delegation_id === r.id);
    for (const s of own) {
      const v = venueName(s.venue);
      if (v) weights.set(v, (weights.get(v) ?? 0) + Math.max(1, spanDays(s.start_date, s.end_date)));
    }
    if (!weights.size) for (const part of (r.venue ?? "").split(/\s*[·/,&+]\s*/)) {
      const v = venueName(part);
      if (v) weights.set(v, 1);
    }
    if (!weights.size) weights.set(NOT_SET, 1);
    for (const [v, guests] of share(size(r), weights)) push(byVenue, v, seg(r, guests));
  }

  // Guests here each day for the next 30 days.
  const onSite: OnSiteDay[] = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, i);
    const here = live.filter((r) => r.arrival_date! <= day && (r.departure_date ?? r.arrival_date!) >= day);
    onSite.push({ day, groups: here.length, ...split(here.map((r) => seg(r))) });
  }

  // Planning progress for groups here now or arriving within 30 days.
  const horizon = addDays(today, 30);
  const readiness: Readiness[] = live
    .filter((r) => r.departure_date && r.departure_date >= today && r.arrival_date! <= horizon && r.departure_date >= r.arrival_date!)
    .sort((a, b) => a.arrival_date!.localeCompare(b.arrival_date!))
    .map((r) => {
      const a = r.arrival_date!;
      const days = Math.min(spanDays(a, r.departure_date!), 92);
      const d = addDays(a, days - 1);
      const own = stays.filter((s) => s.delegation_id === r.id);
      let stayDays = 0;
      for (let i = 0; i < days; i++) {
        const day = addDays(a, i);
        if (own.some((s) => day >= s.start_date && day <= s.end_date)) stayDays++;
      }
      const t = transport.filter((x) => x.delegation_id === r.id).length;
      const mealsTotal = days * 3;
      const m = Math.min(mealsTotal, meals.filter((x) => x.delegation_id === r.id && x.catered && x.day >= a && x.day <= d).length);
      const score = (stayDays / days + (t > 0 ? 1 : 0) + m / mealsTotal) / 3;
      return { id: r.id, name: r.name, arrival: a, departure: r.departure_date!, members: r.members, days, stayDays, transport: t, meals: m, mealsTotal, score };
    });

  return {
    from: STATS_FROM,
    today,
    guests: total.guests,
    arrived: total.arrived,
    upcoming: total.upcoming,
    delegations: inPeriod.length,
    missingMembers: inPeriod.filter((r) => r.members === null).length,
    countries,
    peak,
    growth,
    months,
    venues: rank(byVenue),
    onSite,
    readiness,
  };
}
