"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getDepartment } from "@/lib/departments";
import { MEALS, TRANSPORT_TYPES, dayRange, fromCalendar, type MealKey } from "@/lib/delegations";

export type Result = { ok?: boolean; error?: string };

type DbError = { code?: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = getDepartment("delegations")!.statuses;

function friendly(error: DbError): string {
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23514") return "One of the values isn't allowed.";
  if (error.code === "23502") return "A required field is empty.";
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Delegation planning isn't set up yet: run supabase/migrations/0005_delegation_planning.sql in Supabase.";
  }
  return error.message;
}

class Invalid extends Error {}

async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}

/** The signed-in user's client and the delegation, or an error. */
async function delegation(id: string, needManager = false) {
  if (!UUID.test(id)) throw new Invalid("That delegation doesn't exist.");
  const session = await getSession();
  if (!session.canAccess("delegations")) throw new Invalid("Delegations isn't on your account.");
  if (needManager && !session.isManager("delegations")) {
    throw new Invalid("Only Delegations department admins can remove things.");
  }
  const { data } = await session.supabase
    .from("delegations")
    .select("id, arrival_date, departure_date, calendar_event_ids")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Invalid("That delegation doesn't exist any more.");
  return {
    supabase: session.supabase,
    row: data as { id: string; arrival_date: string | null; departure_date: string | null; calendar_event_ids: string[] | null },
  };
}

function done(id: string): Result {
  revalidatePath(`/delegations/${id}`);
  revalidatePath("/delegations");
  revalidatePath("/activity");
  return { ok: true };
}

/** Checks a change actually reached a row; RLS turns refusals into "no rows". */
function check(res: { error: DbError | null; data: unknown[] | null }, what: string): Result | null {
  if (res.error) return { error: friendly(res.error) };
  if (!res.data?.length) return { error: `Couldn't save the ${what}. You may not have access any more.` };
  return null;
}

// ---------- Form parsing ----------

function text(fd: FormData, name: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  return v.slice(0, opts.max ?? 300);
}

function date(fd: FormData, name: string, label: string, required = false) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (required) throw new Invalid(`${label} is required.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Invalid(`${label} isn't a valid date.`);
  return v;
}

function time(fd: FormData, name: string, label: string) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Invalid(`${label} isn't a valid time.`);
  return v;
}

function whole(fd: FormData, name: string, label: string) {
  const raw = String(fd.get(name) ?? "").replace(/[,\s]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new Invalid(`${label} must be a whole number.`);
  return n;
}

/** Start and end dates that sit inside the delegation's stay. */
function within(
  fd: FormData,
  row: { arrival_date: string | null; departure_date: string | null },
  names: [string, string] = ["start_date", "end_date"],
) {
  const start = date(fd, names[0], "Start date", true)!;
  const end = date(fd, names[1], "End date") ?? start;
  if (end < start) throw new Invalid("The end date is before the start date.");
  if (row.arrival_date && row.departure_date && (start < row.arrival_date || end > row.departure_date)) {
    throw new Invalid(`Pick dates within the stay (${dayRange(row.arrival_date, row.departure_date)}).`);
  }
  return { start, end };
}

// ---------- Info ----------

export async function saveDelegationInfo(id: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const { supabase, row } = await delegation(id);
    const status = String(fd.get("status") ?? "");
    if (!STATUSES.includes(status)) throw new Invalid("Pick a status from the list.");

    const payload: Record<string, unknown> = {
      head_of_delegation: text(fd, "head_of_delegation", "Head of delegation"),
      head_contact: text(fd, "head_contact", "Contact number", { max: 40 }),
      country: text(fd, "country", "Country"),
      members: whole(fd, "members", "Members"),
      venue: text(fd, "venue", "Venue"),
      status,
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };
    const phone = payload.head_contact as string | null;
    if (phone && !/^[+()\d\s-]{6,}$/.test(phone)) throw new Invalid("The contact number should only have digits, spaces and +.");

    // Name and dates of calendar delegations follow the calendar.
    if (!fromCalendar(row)) {
      payload.name = text(fd, "name", "Delegation", { required: true });
      payload.arrival_date = date(fd, "arrival_date", "Arrives");
      payload.departure_date = date(fd, "departure_date", "Departs");
      if (payload.arrival_date && payload.departure_date && payload.departure_date < payload.arrival_date) {
        throw new Invalid("Departure is before arrival.");
      }
    }

    const res = await supabase.from("delegations").update(payload).eq("id", id).select("id");
    return check(res, "delegation") ?? done(id);
  });
}

// ---------- Itinerary files ----------

export async function registerItinerary(
  id: string,
  file: { path: string; fileName: string; mimeType: string; size: number },
): Promise<Result> {
  return guarded(async () => {
    const { supabase } = await delegation(id);
    if (!file.path.startsWith(`${id}/itinerary/`)) throw new Invalid("That upload doesn't belong to this delegation.");
    const res = await supabase
      .from("delegation_files")
      .insert({
        delegation_id: id,
        kind: "itinerary",
        file_path: file.path,
        file_name: file.fileName.slice(0, 200),
        mime_type: file.mimeType,
        size_bytes: file.size,
      })
      .select("id");
    if (res.error) await supabase.storage.from("delegations").remove([file.path]);
    return check(res, "itinerary") ?? done(id);
  });
}

export async function deleteItinerary(id: string, fileId: string): Promise<Result> {
  return guarded(async () => {
    const { supabase } = await delegation(id, true);
    const { data } = await supabase.from("delegation_files").select("file_path").eq("id", fileId).eq("delegation_id", id).maybeSingle();
    if (!data) throw new Invalid("That file has already gone.");
    await supabase.storage.from("delegations").remove([data.file_path]);
    const res = await supabase.from("delegation_files").delete().eq("id", fileId).select("id");
    return check(res, "itinerary") ?? done(id);
  });
}

// ---------- Accommodation ----------

export async function saveStay(id: string, stayId: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const { supabase, row } = await delegation(id);
    const { start, end } = within(fd, row);
    const payload = {
      delegation_id: id,
      venue: text(fd, "venue", "Venue", { required: true }),
      start_date: start,
      end_date: end,
      rooms: text(fd, "rooms", "Rooms"),
      notes: text(fd, "notes", "Notes", { max: 3000 }),
    };
    const res = stayId
      ? await supabase.from("delegation_stays").update(payload).eq("id", stayId).eq("delegation_id", id).select("id")
      : await supabase.from("delegation_stays").insert(payload).select("id");
    return check(res, "accommodation") ?? done(id);
  });
}

export async function deleteStay(id: string, stayId: string): Promise<Result> {
  return guarded(async () => {
    const { supabase } = await delegation(id, true);
    const res = await supabase.from("delegation_stays").delete().eq("id", stayId).eq("delegation_id", id).select("id");
    return check(res, "accommodation") ?? done(id);
  });
}

// ---------- Transport ----------

export async function saveTransport(id: string, transportId: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const { supabase, row } = await delegation(id);
    const { start, end } = within(fd, row);
    const type = String(fd.get("transport_type") ?? "");
    if (!(TRANSPORT_TYPES as readonly string[]).includes(type)) throw new Invalid("Pick a type of transport.");
    const payload = {
      delegation_id: id,
      transport_type: type,
      vehicle: text(fd, "vehicle", "Vehicle"),
      start_date: start,
      end_date: end,
      pickup_time: time(fd, "pickup_time", "Pickup time"),
      pickup: text(fd, "pickup", "Pickup"),
      dropoff: text(fd, "dropoff", "Drop-off"),
      driver: text(fd, "driver", "Driver"),
      booking_ref: text(fd, "booking_ref", "Booking reference", { max: 120 }),
      notes: text(fd, "notes", "Notes", { max: 3000 }),
    };
    const res = transportId
      ? await supabase.from("delegation_transport").update(payload).eq("id", transportId).eq("delegation_id", id).select("id")
      : await supabase.from("delegation_transport").insert(payload).select("id");
    return check(res, "transport") ?? done(id);
  });
}

export async function deleteTransport(id: string, transportId: string): Promise<Result> {
  return guarded(async () => {
    const { supabase } = await delegation(id, true);
    const res = await supabase.from("delegation_transport").delete().eq("id", transportId).eq("delegation_id", id).select("id");
    return check(res, "transport") ?? done(id);
  });
}

// ---------- Food ----------

export type MealInput = { meal: MealKey; catered: boolean; location: string; menu: string };

/** Saves one day's meals. Only meals that were sent are written. */
export async function saveMealsDay(id: string, day: string, meals: MealInput[]): Promise<Result> {
  return guarded(async () => {
    const { supabase, row } = await delegation(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Invalid("That day isn't valid.");
    if (row.arrival_date && row.departure_date && (day < row.arrival_date || day > row.departure_date)) {
      throw new Invalid("That day is outside the stay.");
    }
    const keys = MEALS.map((m) => m.key) as string[];
    const rows = meals
      .filter((m) => keys.includes(m.meal))
      .map((m) => ({
        delegation_id: id,
        day,
        meal: m.meal,
        catered: Boolean(m.catered),
        location: m.location.trim().slice(0, 300) || null,
        menu: m.menu.trim().slice(0, 1000) || null,
      }));
    if (!rows.length) return { ok: true };
    const res = await supabase
      .from("delegation_meals")
      .upsert(rows, { onConflict: "delegation_id,day,meal" })
      .select("id");
    return check(res, "meals") ?? done(id);
  });
}

// ---------- Mulaqat ----------

export async function saveMulaqat(id: string, mulaqatId: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const { supabase, row } = await delegation(id);
    const day = date(fd, "mulaqat_date", "Date", true)!;
    if (row.arrival_date && row.departure_date && (day < row.arrival_date || day > row.departure_date)) {
      throw new Invalid(`Pick a date within the stay (${dayRange(row.arrival_date, row.departure_date)}).`);
    }
    const attendees = fd.getAll("attendee_ids").map(String).filter((v) => UUID.test(v));
    const payload = {
      delegation_id: id,
      mulaqat_date: day,
      mulaqat_time: time(fd, "mulaqat_time", "Time"),
      location: text(fd, "location", "Location"),
      notes: text(fd, "notes", "Notes", { max: 3000 }),
      attendee_ids: [...new Set(attendees)].slice(0, 50),
      other_attendees: text(fd, "other_attendees", "Other attendees", { max: 500 }),
    };
    const res = mulaqatId
      ? await supabase.from("delegation_mulaqats").update(payload).eq("id", mulaqatId).eq("delegation_id", id).select("id")
      : await supabase.from("delegation_mulaqats").insert(payload).select("id");
    return check(res, "mulaqat") ?? done(id);
  });
}

export async function deleteMulaqat(id: string, mulaqatId: string): Promise<Result> {
  return guarded(async () => {
    const { supabase } = await delegation(id, true);
    const res = await supabase.from("delegation_mulaqats").delete().eq("id", mulaqatId).eq("delegation_id", id).select("id");
    return check(res, "mulaqat") ?? done(id);
  });
}
