// Server only: turns delegation events on the Google Calendar into delegation records.
//
// One delegation is usually one all-day event stretched over the stay. Some have
// a second event (another venue, or a copy in another colour) for the same group;
// those are merged. Arrival = first day, departure = last day.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "@/lib/google-calendar";

export type DerivedDelegation = {
  /** Events merged into this delegation, earliest first. */
  eventIds: string[];
  name: string;
  country: string | null;
  members: number | null;
  venue: string | null;
  arrival: string;
  departure: string;
  /** The title says TBC somewhere, so it isn't confirmed yet. */
  tbc: boolean;
  /** Used to spot the same group across events. */
  key: string;
};

export type SyncResult = {
  created: number;
  updated: number;
  error: string | null;
  /** The 0004 migration hasn't been run yet. */
  needsMigration?: boolean;
};

// Transport bookings and airport runs sit on the same calendar but aren't delegations.
const NOT_A_DELEGATION = [/\bseaters?\b/i, /\bairport\b/i, /\bpick\s*-?\s*up\b/i, /\bdrop\s*-?\s*off\b/i];

const VENUE_CODES: Record<string, string> = { BF: "Baitul Futuh", BE: "Baitul Ehsan" };
const VENUE_WORDS = /\b(baitul|baitun|baitus|bait|masjid|mosque|hall|fazl|tahir|masroor|region)\b/i;
const VENUE_SHORT = /^(BF|BE|SeM|WeA)(\s*\/\s*(BF|BE|SeM|WeA))*$/i;

const COUNTRIES = [
  "Germany", "Canada", "France", "Belgium", "Netherlands", "Holland", "Ireland", "Spain", "Italy", "Switzerland",
  "Austria", "Sweden", "Norway", "Denmark", "Finland", "USA", "America", "Pakistan", "India", "Bangladesh", "Ghana",
  "Nigeria", "Kenya", "Tanzania", "Uganda", "Sierra Leone", "Gambia", "Australia", "New Zealand", "Indonesia",
  "Malaysia", "Singapore", "Japan", "Mauritius", "Portugal", "Poland", "Scotland", "Wales",
];

const MEMBERS = /^(\d+|tbc)\s*members?$/i;

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function expandVenue(s: string) {
  return s.replace(/\b(BF|BE)\b/g, (code) => VENUE_CODES[code]).replace(/\s*\/\s*/g, " / ");
}

/** Reads "MKA Germany - Taunus - 25 Members - Baitul Ehsan" into its parts. */
export function parseTitle(title: string) {
  const tbc = /\btbc\b/i.test(title);
  const clean = title.replace(/\(\s*duration\s+tbc\s*\)/i, " ").replace(/\s+/g, " ").trim();
  const parts = clean
    .split(/\s*-\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    // A bare number after the name is a member count: "Jamia Germany-15-BF".
    .map((p, i) => (i > 0 && /^\d+$/.test(p) ? `${p} Members` : p));

  const at = parts.findIndex((p) => MEMBERS.test(p));
  let head: string[];
  let tail: string[];
  if (at >= 0) {
    head = parts.slice(0, at + 1);
    tail = parts.slice(at + 1);
  } else if (parts.length > 1 && (VENUE_SHORT.test(parts.at(-1)!) || VENUE_WORDS.test(parts.at(-1)!))) {
    head = parts.slice(0, -1);
    tail = parts.slice(-1);
  } else {
    head = parts;
    tail = [];
  }

  const count = at >= 0 ? parts[at].match(/^(\d+)/)?.[1] : undefined;
  const country = COUNTRIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(clean)) ?? null;

  return {
    name: head.map((p) => p.replace(/\bmembers?\b/i, (m) => (m.toLowerCase() === "member" ? "Member" : "Members"))).join(" - "),
    members: count ? Number(count) : null,
    venue: tail.length ? tail.map(expandVenue).join(" · ") : null,
    country: country === "America" ? "USA" : country === "Holland" ? "Netherlands" : country,
    tbc,
    key: head.join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  };
}

export function isDelegationEvent(e: CalendarEvent) {
  return e.kind === "delegation" && e.allDay && !NOT_A_DELEGATION.some((re) => re.test(e.title));
}

/** Groups the calendar's delegation events into delegations. */
export function deriveDelegations(events: CalendarEvent[]): DerivedDelegation[] {
  const candidates = events
    .filter(isDelegationEvent)
    .map((e) => ({ e, p: parseTitle(e.title), arrival: e.days[0], departure: e.days[e.days.length - 1] }))
    .sort((a, b) => a.arrival.localeCompare(b.arrival) || a.e.id.localeCompare(b.e.id));

  const out: DerivedDelegation[] = [];
  for (const { e, p, arrival, departure } of candidates) {
    // Same group, and the stays overlap or run back to back.
    const same = out.find(
      (d) => d.key === p.key && d.arrival <= addDays(departure, 1) && arrival <= addDays(d.departure, 1),
    );
    if (same) {
      same.eventIds.push(e.id);
      if (arrival < same.arrival) same.arrival = arrival;
      if (departure > same.departure) same.departure = departure;
      same.members = same.members ?? p.members;
      same.country = same.country ?? p.country;
      if (p.venue && !(same.venue ?? "").split(" · ").includes(p.venue)) {
        same.venue = same.venue ? `${same.venue} · ${p.venue}` : p.venue;
      }
      same.tbc = same.tbc || p.tbc;
      continue;
    }
    out.push({
      eventIds: [e.id],
      name: p.name || e.title,
      country: p.country,
      members: p.members,
      venue: p.venue,
      arrival,
      departure,
      tbc: p.tbc,
      key: p.key,
    });
  }
  return out;
}

export function statusFor(arrival: string, departure: string, today: string, tbc: boolean) {
  if (today > departure) return "Departed";
  if (today >= arrival) return "Arrived";
  return tbc ? "Planned" : "Confirmed";
}

type Row = {
  id: string;
  name: string;
  country: string | null;
  members: number | null;
  venue: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  status: string;
  calendar_event_id: string | null;
  calendar_event_ids: string[] | null;
};

const MIGRATION_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

/**
 * Creates and updates delegation records from the calendar. Runs as the signed-in
 * user, so the usual permissions, stamps and audit log all apply. Only fields the
 * calendar knows about are touched; head of delegation and notes are left alone.
 */
export async function syncDelegations(
  supabase: SupabaseClient,
  events: CalendarEvent[],
  loadedFrom: string,
  today: string,
): Promise<SyncResult> {
  const [rowsRes, ignoredRes] = await Promise.all([
    supabase
      .from("delegations")
      .select("id, name, country, members, venue, arrival_date, departure_date, status, calendar_event_id, calendar_event_ids"),
    supabase.from("delegation_calendar_ignored").select("event_id"),
  ]);
  const loadError = rowsRes.error ?? ignoredRes.error;
  if (loadError) {
    return MIGRATION_CODES.has(loadError.code)
      ? { created: 0, updated: 0, error: null, needsMigration: true }
      : { created: 0, updated: 0, error: loadError.message };
  }

  const ignored = new Set((ignoredRes.data ?? []).map((r: { event_id: string }) => r.event_id));
  const linked = ((rowsRes.data ?? []) as Row[]).filter((r) => r.calendar_event_ids?.length);
  const used = new Set<string>();

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  for (const d of deriveDelegations(events)) {
    if (d.eventIds.some((id) => ignored.has(id))) continue;

    const row = linked.find((r) => !used.has(r.id) && r.calendar_event_ids!.some((id) => d.eventIds.includes(id)));
    const wanted: Record<string, unknown> = {
      name: d.name,
      arrival_date: d.arrival,
      departure_date: d.departure,
      calendar_event_id: d.eventIds[0],
      calendar_event_ids: d.eventIds,
    };
    // Only overwrite these when the calendar actually says something.
    if (d.venue) wanted.venue = d.venue;
    if (d.country) wanted.country = d.country;
    if (d.members !== null) wanted.members = d.members;

    if (!row) {
      inserts.push({ ...wanted, status: statusFor(d.arrival, d.departure, today, d.tbc) });
      continue;
    }

    used.add(row.id);
    // A delegation someone has cancelled by hand stays cancelled.
    wanted.status = row.status === "Cancelled" ? "Cancelled" : statusFor(d.arrival, d.departure, today, d.tbc);
    const patch = changed(row, wanted);
    if (patch) updates.push({ id: row.id, patch });
  }

  // Linked delegations whose events are gone.
  for (const row of linked) {
    if (used.has(row.id) || row.status === "Cancelled") continue;
    let status: string;
    if (row.departure_date && row.departure_date < loadedFrom) {
      // Older than what we loaded: just keep the status in step with the dates.
      status = statusFor(row.arrival_date ?? row.departure_date, row.departure_date, today, false);
    } else {
      // It should have been on the calendar, so it was deleted there.
      status = "Cancelled";
    }
    if (status !== row.status) updates.push({ id: row.id, patch: { status } });
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  if (inserts.length) {
    const { data, error } = await supabase
      .from("delegations")
      .upsert(inserts, { onConflict: "calendar_event_id", ignoreDuplicates: true })
      .select("id");
    if (error) errors.push(error.message);
    else created = data?.length ?? 0;
  }

  const results = await Promise.all(
    updates.map(({ id, patch }) => supabase.from("delegations").update(patch).eq("id", id).select("id")),
  );
  for (const r of results) {
    if (r.error) errors.push(r.error.message);
    else if (r.data?.length) updated++;
  }

  return { created, updated, error: errors.length ? errors[0] : null };
}

/** The fields in `wanted` that differ from the row, or null when nothing changed. */
function changed(row: Row, wanted: Record<string, unknown>): Record<string, unknown> | null {
  const norm = (k: string, v: unknown) =>
    v === null || v === undefined ? null : Array.isArray(v) ? v.join("|") : k.endsWith("_date") ? String(v).slice(0, 10) : v;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(wanted)) {
    if (norm(k, (row as Record<string, unknown>)[k]) !== norm(k, v)) patch[k] = v;
  }
  return Object.keys(patch).length ? patch : null;
}
