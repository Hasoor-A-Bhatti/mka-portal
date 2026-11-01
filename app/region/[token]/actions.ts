"use server";

import { createClient } from "@/lib/supabase/server";

export type DriverInput = { full_name: string; aims: string; phone: string };
export type DriversResult = { ok?: boolean; error?: string };

const LIMITS = { full_name: 120, aims: 40, phone: 40 } as const;

function clean(list: unknown): DriverInput[] | string {
  if (!Array.isArray(list)) return [];
  if (list.length > 20) return "That's more drivers than we can save at once.";
  const out: DriverInput[] = [];
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const row = {
      full_name: String(r.full_name ?? "").trim(),
      aims: String(r.aims ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
    };
    for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      if (row[k].length > LIMITS[k]) return "One of the answers is too long.";
    }
    if (row.full_name || row.aims || row.phone) out.push(row);
  }
  return out;
}

/** Saves the pickup and drop-off drivers. Nothing is required; empty rows are skipped. */
export async function saveDrivers(token: string, pickup: DriverInput[], dropoff: DriverInput[]): Promise<DriversResult> {
  const up = clean(pickup);
  const down = clean(dropoff);
  if (typeof up === "string") return { error: up };
  if (typeof down === "string") return { error: down };

  const supabase = await createClient();
  const { error } = await supabase.rpc("region_save_drivers", { tok: token, p: { pickup: up, dropoff: down } });
  if (error) {
    return {
      error: error.code === "P0001" ? error.message : "The drivers couldn't be saved. Please try again, or contact the MKA Delegations team.",
    };
  }
  return { ok: true };
}
