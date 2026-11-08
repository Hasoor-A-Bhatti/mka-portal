import { createClient } from "@/lib/supabase/server";
import { loadJaidat } from "@/lib/jaidat-server";
import { daysUntil, dueItems, todayISO } from "@/lib/jaidat";

export const dynamic = "force-dynamic";

/** Renewals and due dates for the next year as a calendar file (.ics) for Google Calendar or Outlook. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const { data } = await loadJaidat(supabase);
  const today = todayISO();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const next = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };

  const events = dueItems(data)
    .filter((e) => {
      const n = daysUntil(e.date, today);
      return n >= -30 && n <= 366;
    })
    .map((e, i) =>
      [
        "BEGIN:VEVENT",
        `UID:jaidat-${e.date}-${i}-${e.title.length}@mka-portal`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${next(e.date)}`,
        `SUMMARY:${esc(`${e.who}: ${e.title}`)}`,
        `DESCRIPTION:${esc(`${e.kind} · MKA Jaidat`)}`,
        "END:VEVENT",
      ].join("\r\n"),
    );

  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MKA Portal//Jaidat//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:MKA Jaidat renewals", ...events, "END:VCALENDAR"].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="jaidat-renewals.ics"',
      "Cache-Control": "no-store",
    },
  });
}
