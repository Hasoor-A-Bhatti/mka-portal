"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  List,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/fleet/ui";
import { vars } from "@/lib/css";
import type { CalendarEvent } from "@/lib/google-calendar";

const TZ = "Europe/London";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PILLS = 3;
const SOURCE_KEY = "mka.delegations-calendar.source";

type Source = "all" | "delegation" | "meeting";
const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "delegation", label: "Delegations" },
  { value: "meeting", label: "Meetings" },
];

type Props = {
  events: CalendarEvent[];
  /** Today in London, YYYY-MM-DD. Passed from the server so both sides agree. */
  today: string;
  error: string | null;
  notConfigured?: boolean;
};

// ---------- Date helpers (plain YYYY-MM-DD strings, no time zone surprises) ----------

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function addDays(day: string, n: number) {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return iso(d).slice(0, 7);
}

function fmt(day: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(asDate(day));
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(value));
}

/** The 5 or 6 Monday-first weeks that show a month. */
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const offset = (asDate(first).getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);
  const lastOfMonth = addDays(`${addMonths(month, 1)}-01`, -1);
  const days: string[] = [];
  for (let d = start; days.length % 7 !== 0 || d <= lastOfMonth; d = addDays(d, 1)) days.push(d);
  return days;
}

function timeLabel(e: CalendarEvent) {
  const first = e.days[0];
  const last = e.days[e.days.length - 1];
  const multi = first !== last;
  if (e.allDay) return multi ? `All day · ${fmt(first, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short" })}` : "All day";
  if (multi) {
    return `${fmt(first, { day: "numeric", month: "short" })}, ${time(e.start)} – ${fmt(last, { day: "numeric", month: "short" })}, ${time(e.end)}`;
  }
  return `${time(e.start)} – ${time(e.end)}`;
}

function countdown(day: string, today: string) {
  const diff = Math.round((asDate(day).getTime() - asDate(today).getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `In ${diff} days`;
  if (diff < 14) return "Next week";
  return `In ${Math.round(diff / 7)} weeks`;
}

// ---------- Component ----------

export function DelegationsCalendar({ events, today, error, notConfigured }: Props) {
  const router = useRouter();
  const thisMonth = today.slice(0, 7);
  const minMonth = addMonths(thisMonth, -1);
  const maxMonth = addMonths(thisMonth, 12);

  const [view, setView] = useState<"month" | "upcoming">("month");
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(today);
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<Source>("all");
  const [query, setQuery] = useState("");

  // Remember the chosen filter in this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOURCE_KEY);
      if (saved === "all" || saved === "delegation" || saved === "meeting") setSource(saved);
    } catch {}
  }, []);

  const chooseSource = (s: Source) => {
    setSource(s);
    try {
      localStorage.setItem(SOURCE_KEY, s);
    } catch {}
  };

  const kindCounts = useMemo(() => {
    const upcomingOnly = events.filter((e) => e.days[e.days.length - 1] >= today);
    return {
      all: upcomingOnly.length,
      delegation: upcomingOnly.filter((e) => e.kind === "delegation").length,
      meeting: upcomingOnly.filter((e) => e.kind === "meeting").length,
    };
  }, [events, today]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (source !== "all" && e.kind !== source) return false;
      if (!q) return true;
      return [e.title, e.location, e.description, e.organizer].some((v) => v?.toLowerCase().includes(q));
    });
  }, [events, source, query]);

  const filtering = source !== "all" || query.trim() !== "";

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of shown) for (const d of e.days) m.set(d, [...(m.get(d) ?? []), e]);
    // All-day events first, then by start time.
    m.forEach((list) => list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)));
    return m;
  }, [shown]);

  const upcoming = useMemo(() => {
    const groups = new Map<string, { event: CalendarEvent; ongoing: boolean }[]>();
    let count = 0;
    for (const e of shown) {
      const last = e.days[e.days.length - 1];
      if (last < today) continue;
      const ongoing = e.days[0] < today;
      const key = ongoing ? today : e.days[0];
      groups.set(key, [...(groups.get(key) ?? []), { event: e, ongoing }]);
      if (++count >= 40) break;
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown, today]);

  const next30 = useMemo(
    () => shown.filter((e) => e.days[e.days.length - 1] >= today && e.days[0] <= addDays(today, 30)).length,
    [shown, today],
  );

  const grid = useMemo(() => monthGrid(month), [month]);
  const selectedEvents = byDay.get(selected) ?? [];

  const goMonth = (n: number) => {
    const m = addMonths(month, n);
    setMonth(m);
    setSelected(m === thisMonth ? today : `${m}-01`);
  };

  const goToday = () => {
    setMonth(thisMonth);
    setSelected(today);
  };

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <section className="panel glass cal rise" style={vars({ "--i": "3" })} aria-label="Delegations calendar">
      <div className="panel-head">
        <div className="cal-title">
          <span className="cal-title-icon" aria-hidden>
            <CalendarDays size={20} />
          </span>
          <div>
            <h2>Delegations calendar</h2>
            <p className="muted-note">
              {notConfigured || error
                ? "Google Calendar"
                : `${next30} event${next30 === 1 ? "" : "s"} in the next 30 days · synced from Google Calendar`}
            </p>
          </div>
        </div>

        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Calendar view">
            <button type="button" role="tab" aria-selected={view === "month"} onClick={() => setView("month")}>
              <CalendarDays size={15} /> Month
            </button>
            <button type="button" role="tab" aria-selected={view === "upcoming"} onClick={() => setView("upcoming")}>
              <List size={15} /> Upcoming
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={refresh} title="Refresh from Google">
            <RefreshCw size={16} className={refreshing ? "spin" : undefined} />
            <span className="sr-only">Refresh from Google</span>
          </button>
        </div>
      </div>

      {!notConfigured && !error && (
        <div className="cal-filters">
          <div className="chips" role="group" aria-label="Show">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`chip cal-chip-${s.value}`}
                aria-pressed={source === s.value}
                onClick={() => chooseSource(s.value)}
                title={`${kindCounts[s.value]} upcoming`}
              >
                {s.value !== "all" && <span className="cal-chip-swatch" aria-hidden />}
                {s.label} <em>{kindCounts[s.value]}</em>
              </button>
            ))}
          </div>
          <label className="search cal-search">
            <Search size={16} />
            <span className="sr-only">Search the calendar</span>
            <input
              className="input"
              type="search"
              placeholder="Search events, places, organisers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      )}

      {notConfigured ? (
        <div className="cal-empty">
          <CalendarDays size={26} />
          <strong>Calendar not connected yet</strong>
          <span>
            Add the Google sign-in settings to the environment variables and run <code>npm run calendar:auth</code> as the calendar
            owner. See &ldquo;Delegations calendar&rdquo; in the README.
          </span>
        </div>
      ) : error ? (
        <p className="form-error" role="alert">
          Couldn't load the Google Calendar: {error}
        </p>
      ) : view === "month" ? (
        <div className="cal-layout">
          <div className="cal-month">
            <div className="cal-nav">
              <h3>{fmt(`${month}-01`, { month: "long", year: "numeric" })}</h3>
              <div className="cal-nav-btns">
                <button type="button" className="btn btn-sm" onClick={goToday} disabled={month === thisMonth && selected === today}>
                  Today
                </button>
                <button type="button" className="btn btn-icon btn-sm" onClick={() => goMonth(-1)} disabled={month <= minMonth}>
                  <ChevronLeft size={17} />
                  <span className="sr-only">Previous month</span>
                </button>
                <button type="button" className="btn btn-icon btn-sm" onClick={() => goMonth(1)} disabled={month >= maxMonth}>
                  <ChevronRight size={17} />
                  <span className="sr-only">Next month</span>
                </button>
              </div>
            </div>

            <div className="cal-grid" role="grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="cal-weekday" role="columnheader">
                  {w}
                </div>
              ))}
              {grid.map((day) => {
                const list = byDay.get(day) ?? [];
                const cls = [
                  "cal-cell",
                  day.slice(0, 7) !== month && "is-outside",
                  day === today && "is-today",
                  day === selected && "is-selected",
                  day < today && "is-past",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    className={cls}
                    aria-selected={day === selected}
                    aria-label={`${fmt(day, { weekday: "long", day: "numeric", month: "long" })}, ${list.length} event${list.length === 1 ? "" : "s"}`}
                    onClick={() => setSelected(day)}
                  >
                    <span className="cal-num">{Number(day.slice(8))}</span>
                    <span className="cal-pills">
                      {list.slice(0, MAX_PILLS).map((e) => (
                        <span
                          key={e.id}
                          className={`cal-pill ${e.kind === "meeting" ? "is-meeting" : e.allDay || e.days.length > 1 ? "is-block" : ""}`}
                          style={vars({ "--ev": e.color })}
                        >
                          {!e.allDay && e.days[0] === day && <b>{time(e.start)}</b>}
                          {e.title}
                        </span>
                      ))}
                      {list.length > MAX_PILLS && <span className="cal-more">+{list.length - MAX_PILLS} more</span>}
                    </span>
                    {list.length > 0 && (
                      <span className="cal-dots" aria-hidden>
                        {list.slice(0, 3).map((e) => (
                          <i key={e.id} style={vars({ "--ev": e.color })} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="cal-day">
            <div className="cal-day-head">
              <span className="cal-day-badge">
                <small>{fmt(selected, { month: "short" })}</small>
                <strong>{Number(selected.slice(8))}</strong>
              </span>
              <div>
                <h3>{fmt(selected, { weekday: "long" })}</h3>
                <p className="muted-note">
                  {selected === today ? "Today" : selected > today ? countdown(selected, today) : fmt(selected, { year: "numeric" })}
                  {" · "}
                  {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="cal-nothing">Nothing scheduled.</p>
            ) : (
              <ul className="cal-events">
                {selectedEvents.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} onOpen={setOpen} />
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : upcoming.length === 0 ? (
        <div className="cal-empty">
          <CalendarDays size={26} />
          <strong>{filtering ? "Nothing upcoming matches" : "No upcoming delegations"}</strong>
          <span>
            {filtering ? "Try another filter or clear the search." : "New events added to the Google Calendar will show here."}
          </span>
        </div>
      ) : (
        <ol className="cal-agenda">
          {upcoming.map(([day, items]) => (
            <li key={day} className="cal-agenda-day">
              <div className={`cal-date ${day === today ? "is-today" : ""}`}>
                <small>{fmt(day, { weekday: "short" })}</small>
                <strong>{Number(day.slice(8))}</strong>
                <small>{fmt(day, { month: "short" })}</small>
              </div>
              <div className="cal-agenda-list">
                <span className="cal-when">{countdown(day, today)}</span>
                <ul className="cal-events">
                  {items.map(({ event, ongoing }) => (
                    <li key={event.id}>
                      <EventCard event={event} onOpen={setOpen} ongoing={ongoing} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      )}

      {open && <EventSheet event={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function EventCard({ event: e, onOpen, ongoing }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void; ongoing?: boolean }) {
  return (
    <button
      type="button"
      className={`cal-event ${e.kind === "meeting" ? "is-meeting" : ""}`}
      style={vars({ "--ev": e.color })}
      onClick={() => onOpen(e)}
    >
      <span className="cal-event-bar" aria-hidden />
      <span className="cal-event-body">
        <strong>
          {e.title}
          {ongoing && <em className="cal-tag">Ongoing</em>}
        </strong>
        <span>
          <Clock size={13} /> {timeLabel(e)}
        </span>
        {e.location && (
          <span>
            <MapPin size={13} /> {e.location}
          </span>
        )}
        {e.organizer && (
          <span>
            <Users size={13} /> Meeting · {e.organizer}
          </span>
        )}
      </span>
    </button>
  );
}

function EventSheet({ event: e, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const first = e.days[0];
  return (
    <Sheet title={e.title} subtitle={fmt(first, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} onClose={onClose}>
      <div className="sheet-body cal-sheet" style={vars({ "--ev": e.color })}>
        <dl className="kv compact">
          <dt>Type</dt>
          <dd>{e.kind === "meeting" ? "Meeting invite" : "Delegation"}</dd>
          <dt>When</dt>
          <dd>{timeLabel(e)}</dd>
          {e.organizer && (
            <>
              <dt>Organiser</dt>
              <dd>{e.organizer}</dd>
            </>
          )}
          {e.location && (
            <>
              <dt>Where</dt>
              <dd>
                <a
                  className="cal-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.location}
                </a>
              </dd>
            </>
          )}
        </dl>
        {e.description && <p className="cal-desc">{e.description}</p>}
        {e.link && (
          <a href={e.link} target="_blank" rel="noreferrer" className="btn btn-sm cal-open">
            <ExternalLink size={15} /> Open in Google Calendar
          </a>
        )}
      </div>
    </Sheet>
  );
}
