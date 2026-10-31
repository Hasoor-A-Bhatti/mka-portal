// Server only: reads the delegations Google Calendar.
// Never import this from a client component, it uses secrets.
//
// The calendar owner signs in once (npm run calendar:auth), which stores a
// refresh token in the environment. The server swaps it for short-lived access
// tokens and reads the calendar read-only. Viewers never see the token.

const TZ = "Europe/London";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO date-time, or YYYY-MM-DD for all-day events. */
  start: string;
  /** ISO date-time, or YYYY-MM-DD (exclusive) for all-day events. */
  end: string;
  allDay: boolean;
  /** London dates (YYYY-MM-DD) the event covers. */
  days: string[];
  location: string | null;
  description: string | null;
  link: string | null;
  color: string;
  /** "delegation" when the delegations account made it, "meeting" when someone else invited it. */
  kind: "delegation" | "meeting";
  /** Who organised a meeting, e.g. "ijtema@khuddam.co.uk". Null for the calendar's own events. */
  organizer: string | null;
};

export type CalendarResult = {
  events: CalendarEvent[];
  error: string | null;
  /** True when the calendar settings aren't in the environment yet. */
  notConfigured?: boolean;
  /** First day loaded (YYYY-MM-DD). Events before this weren't fetched. */
  from?: string;
};

// Google's event colour ids.
const COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#d9a400",
  "6": "#f4511e",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d50000",
};
const DEFAULT_COLOR = "#4a1fa8";
/** Meetings from other people have no colour of their own. */
const MEETING_COLOR = "#5b6b8c";

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  colorId?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

// ---------- Dates ----------

/** London calendar date for an instant. */
export function londonDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every London date from first to last, inclusive (capped so a long event can't run away). */
function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 62; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** Google descriptions can hold HTML. Keep the text and line breaks only. */
function plainText(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function normalise(e: GoogleEvent, calendarId: string): CalendarEvent | null {
  if (e.status === "cancelled") return null;
  const allDay = Boolean(e.start?.date);
  const start = e.start?.date ?? e.start?.dateTime;
  const end = e.end?.date ?? e.end?.dateTime ?? start;
  if (!start || !end) return null;

  let first: string;
  let last: string;
  if (allDay) {
    first = start;
    last = shiftDay(end, -1); // all-day end dates are exclusive
  } else {
    first = londonDate(new Date(start));
    // An event ending exactly at midnight doesn't spill into the next day.
    last = londonDate(new Date(new Date(end).getTime() - 1));
  }
  if (last < first) last = first;

  const own = !e.organizer || e.organizer.self || e.organizer.email?.toLowerCase() === calendarId.toLowerCase();

  return {
    id: e.id,
    title: e.summary?.trim() || "Untitled event",
    start,
    end,
    allDay,
    days: daysBetween(first, last),
    location: e.location?.trim() || null,
    description: plainText(e.description),
    link: e.htmlLink ?? null,
    color: (e.colorId && COLORS[e.colorId]) || (own ? DEFAULT_COLOR : MEETING_COLOR),
    kind: own ? "delegation" : "meeting",
    organizer: own ? null : e.organizer?.displayName || e.organizer?.email || null,
  };
}

// ---------- Google sign-in ----------

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "invalid_grant") {
      throw new Error("Google access has expired or was removed. Run `npm run calendar:auth` again to reconnect.");
    }
    throw new Error(body.error_description ?? body.error ?? `Google sign-in failed (${res.status})`);
  }

  cachedToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

// ---------- Events ----------

/** Events from the start of last month to a year ahead. */
export async function getCalendarEvents(): Promise<CalendarResult> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!clientId || !clientSecret || !refreshToken || !calendarId) {
    return { events: [], error: null, notConfigured: true };
  }

  const now = new Date();
  const timeMin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const timeMax = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 1, 1));

  try {
    const token = await accessToken(clientId, clientSecret, refreshToken);
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        timeZone: TZ,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`the calendar ${calendarId} wasn't found for the account that signed in.`);
        }
        throw new Error(body.error?.message ?? `Google Calendar returned ${res.status}`);
      }

      for (const item of (body.items ?? []) as GoogleEvent[]) {
        const ev = normalise(item, calendarId);
        if (ev) events.push(ev);
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }

    return { events, error: null, from: timeMin.toISOString().slice(0, 10) };
  } catch (err) {
    return { events: [], error: err instanceof Error ? err.message : "Couldn't reach Google Calendar." };
  }
}
