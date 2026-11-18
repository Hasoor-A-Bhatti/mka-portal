"use server";

import { createClient } from "@/lib/supabase/server";

export type AekResult = { ok?: boolean; error?: string; savedAt?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const TEXT_LIMITS: Record<string, number> = {
  arrival_travel: 120,
  arrival_place: 120,
  departure_travel: 120,
  departure_place: 120,
  head_name: 120,
  head_contact: 40,
  notes: 2000,
};

function message(e: { message: string; code?: string } | null): string {
  if (!e) return "Something went wrong. Please try again.";
  if (e.code === "P0001") return e.message;
  if (e.code === "22007" || e.code === "22008") return "One of the dates or times isn't valid.";
  if (e.code === "23514") return "Some of the details are too long. Please shorten them and try again.";
  return "Your details couldn't be saved. Please try again, or contact the MKA Delegations team.";
}

/** Saves what the AeK filled in. The database checks the link. */
export async function submitAek(token: string, fd: FormData): Promise<AekResult> {
  const p: Record<string, string> = {};
  for (const k of ["arrival_date", "departure_date"]) {
    const v = String(fd.get(k) ?? "").trim();
    if (v && !DATE.test(v)) return { error: "One of the dates isn't valid." };
    p[k] = v;
  }
  for (const k of ["arrival_time", "departure_time"]) {
    const v = String(fd.get(k) ?? "").trim().slice(0, 5);
    if (v && !TIME.test(v)) return { error: "One of the times isn't valid." };
    p[k] = v;
  }
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    const v = String(fd.get(k) ?? "").trim();
    if (v.length > max) return { error: "One of the answers is too long." };
    p[k] = v;
  }
  const members = String(fd.get("members") ?? "").trim();
  if (members && (!/^\d+$/.test(members) || Number(members) > 2000)) return { error: "Group size must be a whole number." };
  p.members = members;
  if (p.arrival_date && p.departure_date && p.departure_date < p.arrival_date) {
    return { error: "Departure can't be before arrival." };
  }

  // Activities, Khuddam and Food arrive as JSON. The database cleans them too.
  const plans: Record<string, unknown> = {};
  for (const [k, kind, max] of [
    ["activities", "object", 100_000],
    ["khuddam", "array", 100_000],
    ["meal_requests", "object", 20_000],
  ] as const) {
    const raw = String(fd.get(k) ?? "");
    if (!raw) continue;
    if (raw.length > max) return { error: k === "khuddam" ? "That's too many khuddam to send at once." : "One of the answers is too long." };
    try {
      const v = JSON.parse(raw);
      if (kind === "array" ? !Array.isArray(v) : typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
      plans[k] = v;
    } catch {
      return { error: "Something went wrong reading the form. Please reload the page and try again." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aek_submit", { tok: token, p: { ...p, ...plans } });
  if (error) return { error: message(error) };
  return { ok: true, savedAt: String(data) };
}

/** Records an itinerary the AeK has uploaded to storage. */
export async function registerAekFile(
  token: string,
  file: { path: string; fileName: string; mimeType: string; size: number },
): Promise<AekResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aek_add_file", {
    tok: token,
    path: file.path,
    file_name: file.fileName,
    mime_type: file.mimeType,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("delegations").remove([file.path]);
    return { error: message(error) };
  }
  return { ok: true };
}

export type ReturnJourney = {
  id: string;
  departure_date: string;
  departure_time: string;
  departure_flight: string;
  departure_place: string;
  needs_dropoff: boolean;
};

/** Saves each person's return journey. The database checks the link and that each person is in this delegation. */
export async function submitReturnJourneys(token: string, rows: ReturnJourney[]): Promise<AekResult> {
  if (!Array.isArray(rows) || rows.length > 1000) return { error: "Something went wrong reading the list. Please reload the page and try again." };
  const clean = [];
  for (const r of rows) {
    const d = String(r.departure_date ?? "").trim();
    const t = String(r.departure_time ?? "").trim().slice(0, 5);
    if (d && !DATE.test(d)) return { error: "One of the dates isn't valid." };
    if (t && !TIME.test(t)) return { error: "One of the times isn't valid." };
    clean.push({
      id: String(r.id),
      departure_date: d,
      departure_time: t,
      departure_flight: String(r.departure_flight ?? "").trim().slice(0, 40),
      departure_place: String(r.departure_place ?? "").trim().slice(0, 80),
      needs_dropoff: Boolean(r.needs_dropoff),
    });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aek_save_travellers", { tok: token, p: clean });
  if (error) return { error: message(error) };
  return { ok: true, savedAt: String(data) };
}
