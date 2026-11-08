"use server";

import { createClient } from "@/lib/supabase/server";

export type ReportResult = { ok?: boolean; error?: string; ref?: string };

const LIMITS: Record<string, number> = {
  name: 120,
  contact: 160,
  property_id: 40,
  location: 200,
  category: 40,
  urgency: 20,
  title: 120,
  description: 4000,
  website: 200,
};

/** Sends a public report. The database checks and stores it as a new ticket. */
export async function sendReport(fd: FormData): Promise<ReportResult> {
  const p: Record<string, string> = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = String(fd.get(k) ?? "").trim();
    if (v.length > max) return { error: k === "description" ? "Please keep the description under 4,000 characters." : "One of the answers is too long." };
    p[k] = v;
  }
  p.consent = fd.get("consent") === "on" ? "true" : "false";
  if (!p.name || !p.contact || !p.description) return { error: "Please give your name, a way to contact you and what happened." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("jaidat_report", { p });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    return { error: "Your report couldn't be sent. Please try again, or email jaidad@khuddam.co.uk." };
  }
  return { ok: true, ref: String(data) };
}
