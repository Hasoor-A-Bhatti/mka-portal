"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  SEVERITIES,
  TASK_STATUSES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  londonToISO,
  todayISO,
  type FileKind,
} from "@/lib/fleet";

export type Result = { ok?: boolean; error?: string; id?: string };

type DbError = { code?: string; message: string };

function friendly(error: DbError): string {
  if (error.code === "23505") return "That already exists.";
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23514") return "One of the values isn't allowed.";
  if (error.code === "23502") return "A required field is empty.";
  return error.message;
}

/** Signed-in Fleet user. Department admins (and administrators) count as managers. */
async function fleet(needManager: boolean) {
  const session = await getSession();
  if (!session.canAccess("fleet")) return { error: "Fleet isn't on your account." } as const;
  if (needManager && !session.isManager("fleet")) {
    return { error: "Only Fleet department admins can do that." } as const;
  }
  return { supabase: session.supabase, manager: session.isManager("fleet") } as const;
}

function done(vehicleId?: string): Result {
  revalidatePath("/fleet");
  if (vehicleId) revalidatePath(`/fleet/${vehicleId}`);
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true };
}

// ---------- Form parsing ----------

class Invalid extends Error {}

function text(fd: FormData, name: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  return v.slice(0, opts.max ?? 300);
}

function pick<T extends readonly string[]>(fd: FormData, name: string, label: string, options: T, fallback?: T[number]) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v && fallback) return fallback;
  if (!options.includes(v)) throw new Invalid(`Pick a ${label.toLowerCase()} from the list.`);
  return v as T[number];
}

function whole(fd: FormData, name: string, label: string, opts: { required?: boolean; min?: number; max?: number } = {}) {
  const raw = String(fd.get(name) ?? "").replace(/[,\s]/g, "");
  if (!raw) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < (opts.min ?? 0) || n > (opts.max ?? 99_999_999)) {
    throw new Invalid(`${label} must be a whole number${opts.min ? ` from ${opts.min}` : ""}${opts.max ? ` up to ${opts.max}` : ""}.`);
  }
  return n;
}

function pounds(fd: FormData, name: string, label: string) {
  const raw = String(fd.get(name) ?? "").replace(/[£,\s]/g, "");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Invalid(`${label} must be an amount like 120 or 120.50.`);
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

async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}

/** Removes storage objects for file rows matching a filter, before the rows themselves go. */
async function removeStoredFiles(
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"],
  column: "vehicle_id" | "maintenance_id" | "incident_id" | "id",
  value: string,
) {
  const { data } = await supabase.from("fleet_files").select("file_path").eq(column, value);
  const paths = (data ?? []).map((f: { file_path: string }) => f.file_path);
  if (paths.length) await supabase.storage.from("fleet").remove(paths);
}

// ---------- Vehicles ----------

export async function saveVehicle(id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await fleet(true);
    if ("error" in c) return { error: c.error };

    const registration = text(fd, "registration", "Registration", { required: true, max: 12 })!.toUpperCase();
    const payload = {
      registration,
      make_model: text(fd, "make_model", "Name", { required: true }),
      vehicle_type: pick(fd, "vehicle_type", "Vehicle type", VEHICLE_TYPES, "Car"),
      year: whole(fd, "year", "Year first registered", { min: 1900, max: Number(todayISO().slice(0, 4)) }),
      status: pick(fd, "status", "Status", VEHICLE_STATUSES, "Active"),
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };

    const { data, error } = id
      ? await c.supabase.from("fleet_vehicles").update(payload).eq("id", id).select("id")
      : await c.supabase.from("fleet_vehicles").insert(payload).select("id");

    if (error) {
      return { error: error.code === "23505" ? `${registration} is already in the fleet.` : friendly(error) };
    }
    if (!data?.length) return { error: "That vehicle couldn't be saved." };
    return { ...done(data[0].id), id: data[0].id };
  });
}

export async function deleteVehicle(id: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  await removeStoredFiles(c.supabase, "vehicle_id", id);
  const { data, error } = await c.supabase.from("fleet_vehicles").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That vehicle couldn't be removed." };
  revalidatePath("/fleet");
  return { ok: true };
}

// ---------- Mileage ----------

export async function addMileage(vehicleId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await fleet(false);
    if ("error" in c) return { error: c.error };

    const reading = whole(fd, "reading", "Mileage", { required: true, max: 9_999_999 })!;
    const recordedOn = date(fd, "recorded_on", "Date", { required: true, notFuture: true })!;

    // A reading can't be lower than an earlier one, or higher than a later one.
    const [{ data: before }, { data: after }] = await Promise.all([
      c.supabase.from("fleet_mileage_logs").select("reading, recorded_on").eq("vehicle_id", vehicleId)
        .lte("recorded_on", recordedOn).order("reading", { ascending: false }).limit(1),
      c.supabase.from("fleet_mileage_logs").select("reading, recorded_on").eq("vehicle_id", vehicleId)
        .gt("recorded_on", recordedOn).order("reading", { ascending: true }).limit(1),
    ]);
    const prev = before?.[0];
    const next = after?.[0];
    if (prev && reading < prev.reading) {
      return { error: `That's lower than the ${prev.reading.toLocaleString("en-GB")} miles already recorded. Check the odometer.` };
    }
    if (next && reading > next.reading) {
      return { error: `A later reading of ${next.reading.toLocaleString("en-GB")} miles already exists. Check the date.` };
    }

    const { error } = await c.supabase.from("fleet_mileage_logs").insert({
      vehicle_id: vehicleId,
      reading,
      recorded_on: recordedOn,
      note: text(fd, "note", "Note", { max: 500 }),
    });
    if (error) return { error: friendly(error) };
    return done(vehicleId);
  });
}

export async function deleteMileage(vehicleId: string, id: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  const { data, error } = await c.supabase.from("fleet_mileage_logs").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That reading couldn't be removed." };
  return done(vehicleId);
}

// ---------- Maintenance ----------

export async function saveTask(vehicleId: string, id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await fleet(true);
    if ("error" in c) return { error: c.error };

    const status = pick(fd, "status", "Status", TASK_STATUSES, "Pending");
    let completedOn = date(fd, "completed_on", "Completed on", { notFuture: true });
    if (status === "Completed" && !completedOn) completedOn = todayISO();
    if (status !== "Completed") completedOn = null;

    const payload = {
      vehicle_id: vehicleId,
      description: text(fd, "description", "Description", { required: true, max: 500 }),
      due_date: date(fd, "due_date", "Due date"),
      status,
      cost: pounds(fd, "cost", "Price"),
      completed_on: completedOn,
      notes: text(fd, "notes", "Notes", { max: 5000 }),
    };

    const { data, error } = id
      ? await c.supabase.from("fleet_maintenance").update(payload).eq("id", id).select("id")
      : await c.supabase.from("fleet_maintenance").insert(payload).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That task couldn't be saved." };
    return { ...done(vehicleId), id: data[0].id };
  });
}

export async function deleteTask(vehicleId: string, id: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  await removeStoredFiles(c.supabase, "maintenance_id", id);
  const { data, error } = await c.supabase.from("fleet_maintenance").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That task couldn't be removed." };
  return done(vehicleId);
}

// ---------- Incidents ----------

export async function saveIncident(vehicleId: string, id: string | null, fd: FormData): Promise<Result> {
  return guarded(async () => {
    // Anyone in Fleet can report; only department admins can update a report.
    const c = await fleet(Boolean(id));
    if ("error" in c) return { error: c.error };

    const day = date(fd, "occurred_on", "Date", { required: true, notFuture: true })!;
    const time = String(fd.get("occurred_time") ?? "").trim() || "12:00";
    if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Time isn't valid." };

    const notDrivable = fd.get("not_drivable") === "on";
    const thirdParty = fd.get("third_party") === "on";

    const payload: Record<string, unknown> = {
      vehicle_id: vehicleId,
      occurred_at: londonToISO(day, time),
      incident_type: pick(fd, "incident_type", "Type", INCIDENT_TYPES),
      severity: pick(fd, "severity", "Severity", SEVERITIES, "Minor"),
      location: text(fd, "location", "Location"),
      driver_name: text(fd, "driver_name", "Driver"),
      description: text(fd, "description", "What happened", { required: true, max: 5000 }),
      not_drivable: notDrivable,
      third_party: thirdParty,
      third_party_details: thirdParty ? text(fd, "third_party_details", "Third party details", { max: 2000 }) : null,
      police_reference: text(fd, "police_reference", "Police reference", { max: 100 }),
      claim_reference: text(fd, "claim_reference", "Insurance claim reference", { max: 100 }),
    };
    if (id) {
      payload.status = pick(fd, "status", "Status", INCIDENT_STATUSES, "Open");
      payload.resolution = text(fd, "resolution", "Outcome", { max: 5000 });
    }

    const { data, error } = id
      ? await c.supabase.from("fleet_incidents").update(payload).eq("id", id).select("id")
      : await c.supabase.from("fleet_incidents").insert(payload).select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That report couldn't be saved." };

    // A department admin reporting a vehicle as not drivable marks it Damaged straight away.
    if (notDrivable && c.manager && !id) {
      await c.supabase.from("fleet_vehicles").update({ status: "Damaged" }).eq("id", vehicleId).eq("status", "Active");
    }
    return { ...done(vehicleId), id: data[0].id };
  });
}

export async function deleteIncident(vehicleId: string, id: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  await removeStoredFiles(c.supabase, "incident_id", id);
  const { data, error } = await c.supabase.from("fleet_incidents").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That report couldn't be removed." };
  return done(vehicleId);
}

// ---------- Drivers and keys ----------

export async function addDriver(vehicleId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await fleet(true);
    if ("error" in c) return { error: c.error };

    let driverId = String(fd.get("driver_id") ?? "").trim();
    if (!driverId) {
      const { data, error } = await c.supabase
        .from("fleet_drivers")
        .insert({
          full_name: text(fd, "full_name", "Name", { required: true, max: 120 }),
          phone: text(fd, "phone", "Phone", { max: 40 }),
          licence_expiry: date(fd, "licence_expiry", "Licence expiry"),
          notes: text(fd, "notes", "Notes", { max: 1000 }),
        })
        .select("id");
      if (error) return { error: friendly(error) };
      if (!data?.length) return { error: "That driver couldn't be added." };
      driverId = data[0].id;
    }

    const { error } = await c.supabase.from("fleet_vehicle_drivers").insert({ vehicle_id: vehicleId, driver_id: driverId });
    if (error) return { error: error.code === "23505" ? "They can already drive this vehicle." : friendly(error) };
    return done(vehicleId);
  });
}

export async function updateDriver(vehicleId: string, driverId: string, fd: FormData): Promise<Result> {
  return guarded(async () => {
    const c = await fleet(true);
    if ("error" in c) return { error: c.error };
    const { data, error } = await c.supabase
      .from("fleet_drivers")
      .update({
        full_name: text(fd, "full_name", "Name", { required: true, max: 120 }),
        phone: text(fd, "phone", "Phone", { max: 40 }),
        licence_expiry: date(fd, "licence_expiry", "Licence expiry"),
        notes: text(fd, "notes", "Notes", { max: 1000 }),
      })
      .eq("id", driverId)
      .select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "That driver couldn't be saved." };
    return done(vehicleId);
  });
}

export async function removeDriver(vehicleId: string, driverId: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  // If they have the keys, the keys go back to the office.
  await c.supabase.from("fleet_vehicles").update({ key_holder_id: null }).eq("id", vehicleId).eq("key_holder_id", driverId);
  const { error } = await c.supabase.from("fleet_vehicle_drivers").delete().eq("vehicle_id", vehicleId).eq("driver_id", driverId);
  if (error) return { error: friendly(error) };
  return done(vehicleId);
}

export async function setKeyHolder(vehicleId: string, driverId: string | null): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  if (driverId) {
    const { data } = await c.supabase
      .from("fleet_vehicle_drivers")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("driver_id", driverId)
      .limit(1);
    if (!data?.length) return { error: "Add them as a driver for this vehicle first." };
  }
  const { data, error } = await c.supabase.from("fleet_vehicles").update({ key_holder_id: driverId }).eq("id", vehicleId).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "The key holder couldn't be changed." };
  return done(vehicleId);
}

// ---------- Files ----------

export type NewFile = {
  vehicleId: string;
  kind: FileKind;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresOn?: string | null;
  maintenanceId?: string | null;
  incidentId?: string | null;
};

/** Records a file the browser has just uploaded to storage. */
export async function registerFile(f: NewFile): Promise<Result> {
  const c = await fleet(f.kind !== "incident");
  if ("error" in c) {
    await (await getSession()).supabase.storage.from("fleet").remove([f.path]);
    return { error: c.error };
  }
  if (!f.path.startsWith(`${f.vehicleId}/${f.kind}/`)) return { error: "That upload went to the wrong place." };
  if (f.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiresOn)) return { error: "Expiry date isn't valid." };

  const { error } = await c.supabase.from("fleet_files").insert({
    vehicle_id: f.vehicleId,
    kind: f.kind,
    file_path: f.path,
    file_name: f.fileName.slice(0, 200),
    mime_type: f.mimeType.slice(0, 100),
    size_bytes: Math.round(f.size),
    expires_on: f.expiresOn || null,
    maintenance_id: f.maintenanceId || null,
    incident_id: f.incidentId || null,
  });
  if (error) {
    await c.supabase.storage.from("fleet").remove([f.path]);
    return { error: friendly(error) };
  }
  return done(f.vehicleId);
}

export async function updateFileExpiry(vehicleId: string, id: string, expiresOn: string | null): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: "Expiry date isn't valid." };
  const { data, error } = await c.supabase.from("fleet_files").update({ expires_on: expiresOn || null }).eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That couldn't be saved." };
  return done(vehicleId);
}

export async function deleteFile(vehicleId: string, id: string): Promise<Result> {
  const c = await fleet(true);
  if ("error" in c) return { error: c.error };
  await removeStoredFiles(c.supabase, "id", id);
  const { data, error } = await c.supabase.from("fleet_files").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "That file couldn't be removed." };
  return done(vehicleId);
}
