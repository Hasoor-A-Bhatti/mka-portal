"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BedDouble,
  Bus,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  History,
  ChevronDown,
  Globe2,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import { addDays, fmtDay } from "@/lib/delegations";
import { vars } from "@/lib/css";
import {
  NOT_SET,
  STATS_FROM,
  computeQuickStats,
  type MonthBar,
  type OnSiteDay,
  type QuickStats as Stats,
  type RangePreset,
  type Ranked,
  type Readiness,
  type Split,
  type StatDelegation,
  type StatMeal,
  type StatStay,
  type StatTransport,
} from "@/lib/delegation-stats";

const OPEN_KEY = "mka.delegations.quick-stats.open";
const RANGE_KEY = "mka.delegations.quick-stats.range";
const n = (v: number) => v.toLocaleString("en-GB");

export type QuickStatsData = {
  rows: StatDelegation[];
  stays: StatStay[];
  transport: StatTransport[];
  meals: StatMeal[];
  today: string;
};

const PRESETS: { key: RangePreset; label: string; icon: ReactNode }[] = [
  { key: "all", label: "All time", icon: <History size={15} /> },
  { key: "month", label: "This month", icon: <CalendarDays size={15} /> },
  { key: "ytd", label: "Year to date", icon: <CalendarClock size={15} /> },
  { key: "custom", label: "Date range", icon: <CalendarRange size={15} /> },
];

const short = (d: string) => fmtDay(d, { day: "numeric", month: "short" });
const full = (d: string) => fmtDay(d, { day: "numeric", month: "short", year: "numeric" });

/** "November 2026", "1 Nov – 7 Nov 2026", "Since November 2026". */
function rangeLabel(s: Stats) {
  if (s.preset === "all") return `Since ${fmtDay(s.from, { month: "long", year: "numeric" })}`;
  if (s.preset === "month") return fmtDay(s.from, { month: "long", year: "numeric" });
  if (s.from === s.to) return full(s.from);
  return s.from.slice(0, 4) === s.to.slice(0, 4) ? `${short(s.from)} – ${full(s.to)}` : `${full(s.from)} – ${full(s.to)}`;
}

export function QuickStats({ data }: { data: QuickStatsData }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const today = data.today;
  const [preset, setPreset] = useState<RangePreset>("all");
  // The custom range starts as this month to 30 days ahead.
  const [custom, setCustom] = useState(() => {
    const start = `${today.slice(0, 7)}-01`;
    return { from: start < STATS_FROM ? STATS_FROM : start, to: addDays(today, 30) };
  });

  const stats = useMemo(
    () => computeQuickStats(data.rows, data.stays, data.transport, data.meals, today, preset === "custom" ? { preset, ...custom } : { preset }),
    [data, today, preset, custom],
  );

  // Remember the choices per browser; open by default on wide screens only.
  useEffect(() => {
    let saved: string | null = null;
    let range: string | null = null;
    try {
      saved = localStorage.getItem(OPEN_KEY);
      range = localStorage.getItem(RANGE_KEY);
    } catch {}
    setOpen(saved ? saved === "1" : window.matchMedia("(min-width: 961px)").matches);
    if (range) {
      try {
        const r = JSON.parse(range) as { preset?: RangePreset; from?: string; to?: string };
        if (r.preset && PRESETS.some((p) => p.key === r.preset)) setPreset(r.preset);
        if (r.from && r.to && /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to)) setCustom({ from: r.from, to: r.to });
      } catch {}
    }
  }, []);

  const choose = (next: RangePreset, dates = custom) => {
    setPreset(next);
    setCustom(dates);
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ preset: next, ...dates }));
    } catch {}
  };

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {}
      return !o;
    });
  };

  const needsWork = stats.readiness.filter((r) => r.score < 1).length;
  const started = today >= STATS_FROM;
  const countryCount = stats.countries.filter((c) => c.name !== NOT_SET).length;

  return (
    <section className={`panel glass qs ${open ? "is-open" : ""}`} aria-label="Quick Stats">
      <button type="button" className="qs-head" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="cal-title-icon" aria-hidden>
          <BarChart3 size={20} />
        </span>
        <span className="qs-head-text">
          <strong>Quick Stats</strong>
          <small>{rangeLabel(stats)} · updates live</small>
        </span>
        <span className="qs-head-chips" aria-hidden={open}>
          <span>
            <b>{n(stats.guests)}</b> guests
          </span>
          <span>
            <b>{countryCount}</b> countries
          </span>
          {stats.readiness.length > 0 && (
            <span className={needsWork ? "is-warn" : "is-ok"}>
              <b>{needsWork}</b> to prepare
            </span>
          )}
        </span>
        <ChevronDown size={20} className="qs-chevron" aria-hidden />
      </button>

      <div id={panelId} className="qs-body" hidden={!open}>
        <div className="qs-range">
          <div className="qs-range-tabs" role="group" aria-label="Date range">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className="qs-range-btn" aria-pressed={preset === p.key} onClick={() => choose(p.key)}>
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="qs-range-dates">
              <label>
                <span>From</span>
                <input
                  type="date"
                  className="input"
                  min={STATS_FROM}
                  value={custom.from}
                  onChange={(e) => e.target.value && choose("custom", { ...custom, from: e.target.value })}
                />
              </label>
              <span className="qs-range-dash" aria-hidden>
                –
              </span>
              <label>
                <span>To</span>
                <input
                  type="date"
                  className="input"
                  min={STATS_FROM}
                  value={custom.to}
                  onChange={(e) => e.target.value && choose("custom", { ...custom, to: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <span className="qs-range-label">
              <CalendarRange size={14} /> {rangeLabel(stats)}
            </span>
          )}
        </div>

        {stats.clamped && (
          <p className="qs-note">Tracking starts on 1 November 2026, so earlier dates aren&apos;t counted.</p>
        )}
        {!started && (
          <p className="qs-note">
            Tracking starts on 1 November 2026. Until then, figures show delegations already booked from that date.
          </p>
        )}

        <div className="qs-tiles">
          <Tile
            icon={<Users size={17} />}
            label="Guests"
            value={n(stats.guests)}
            detail={`${n(stats.arrived)} arrived · ${n(stats.upcoming)} yet to arrive`}
            accent
            split={stats}
          />
          <Tile icon={<CalendarRange size={17} />} label="Delegations" value={n(stats.delegations)} detail={stats.missingMembers ? `${stats.missingMembers} without a member count` : "All with member counts"} />
          <Tile
            icon={<Globe2 size={17} />}
            label="Countries"
            value={n(countryCount)}
            detail={stats.countries[0] && stats.countries[0].name !== NOT_SET ? `Top: ${stats.countries[0].name} (${n(stats.countries[0].guests)})` : "None yet"}
          />
          <Tile
            icon={<BarChart3 size={17} />}
            label={stats.bucket === "week" ? "Busiest week" : "Peak month"}
            value={stats.peak ? stats.peak.label : "—"}
            detail={stats.peak ? `${n(stats.peak.guests)} guests` : "No guests in this range"}
            small
          />
          <Tile
            icon={stats.growth.tone === "down" ? <TrendingDown size={17} /> : <TrendingUp size={17} />}
            label={stats.growth.label}
            value={stats.growth.value}
            detail={stats.growth.detail}
            tone={stats.growth.tone}
          />
        </div>

        <div className="qs-grid">
          <Card
            title={stats.bucket === "week" ? "Weekly guests" : "Monthly guests"}
            note={`By ${stats.bucket} of arrival, split by delegation`}
          >
            <MonthChart months={stats.months} bucket={stats.bucket} />
          </Card>
          <Card title="Guests by country" note={stats.countries.length > 8 ? "Top 8" : undefined}>
            <SplitBars items={stats.countries} empty="No countries yet" caption="Guests by country" />
          </Card>
          <Card title="Guests by accommodation" note="Groups at two venues are shared by days at each">
            <SplitBars items={stats.venues} empty="No accommodation recorded yet" caption="Guests by accommodation" />
          </Card>
          <Card title="Guests on site" note={stats.onSiteNote}>
            <OnSiteChart days={stats.onSite} today={stats.today} />
          </Card>
        </div>

        <Card title="Planning progress" note="Here now or arriving in the next 30 days" wide>
          <ReadinessList items={stats.readiness} today={stats.today} />
        </Card>
      </div>
    </section>
  );
}

// ---------- Pieces ----------

function Tile({
  icon,
  label,
  value,
  detail,
  accent,
  small,
  tone,
  split,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
  small?: boolean;
  tone?: "up" | "down" | "flat" | "none";
  split?: { arrived: number; upcoming: number };
}) {
  return (
    <div className={`qs-tile ${accent ? "is-accent" : ""} ${tone ? `tone-${tone}` : ""}`}>
      <span className="qs-tile-label">
        {label}
        {icon}
      </span>
      <strong className={small ? "is-small" : ""}>{value}</strong>
      <span className="qs-tile-detail">{detail}</span>
      {split && split.arrived + split.upcoming > 0 && (
        <span className="qs-tile-split" aria-hidden>
          {split.arrived > 0 && <span className="is-arrived" style={{ flexGrow: split.arrived }} />}
          {split.upcoming > 0 && <span className="is-upcoming" style={{ flexGrow: split.upcoming }} />}
        </span>
      )}
    </div>
  );
}

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <figure className={`qs-card ${wide ? "is-wide" : ""}`}>
      <figcaption>
        <h3>{title}</h3>
        {note && <small>{note}</small>}
      </figcaption>
      {children}
    </figure>
  );
}

/** Rounded-up axis maximum with 3 even steps, e.g. 208 → 240. */
function niceMax(v: number) {
  if (v <= 0) return 3;
  const step = Math.pow(10, Math.floor(Math.log10(v / 3)));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((u) => u * 3 >= v) ?? step * 10;
  return unit * 3;
}

/** Purple for guests who have arrived, gold for guests still to come. */
function Legend({ split }: { split: { arrived: number; upcoming: number } }) {
  return (
    <div className="qs-legend" aria-hidden>
      <span className={split.arrived ? "" : "is-off"}>
        <i className="sw is-arrived" /> Arrived
      </span>
      <span className={split.upcoming ? "" : "is-off"}>
        <i className="sw is-upcoming" /> Yet to arrive
      </span>
    </div>
  );
}

const sumSplit = (bars: Split[]) => ({
  arrived: bars.reduce((s, b) => s + b.arrived, 0),
  upcoming: bars.reduce((s, b) => s + b.upcoming, 0),
});

/** Hover card listing the delegations that make up a bar. */
function Tip({ title, bar, className = "col-tip" }: { title: string; bar: Split; className?: string }) {
  const shown = bar.segs.slice(0, 6);
  const more = bar.segs.length - shown.length;
  return (
    <span className={`qs-tip ${className}`} role="tooltip">
      <b>{title}</b>
      <span className="tip-sum">
        {n(bar.guests)} guests
        {bar.arrived > 0 && bar.upcoming > 0 && (
          <>
            {" "}
            · {n(bar.arrived)} arrived · {n(bar.upcoming)} to come
          </>
        )}
      </span>
      {shown.map((s, i) => (
        <span key={`${s.id}-${i}`} className="tip-row">
          <i className={`sw ${s.upcoming ? "is-upcoming" : "is-arrived"}`} aria-hidden />
          <span className="tip-name">{s.name}</span>
          <em>{n(s.guests)}</em>
        </span>
      ))}
      {more > 0 && <span className="tip-more">and {more} more</span>}
    </span>
  );
}

/** A stacked column: one piece per delegation, arrived at the bottom. */
function Stack({ bar, max, showValue }: { bar: Split; max: number; showValue?: boolean }) {
  return (
    <div className="col-stack" style={{ height: `${(bar.guests / max) * 100}%` }}>
      {showValue && bar.guests > 0 && <span className="col-value">{n(bar.guests)}</span>}
      {[...bar.segs].reverse().map((s, i) => (
        <span key={`${s.id}-${i}`} className={`seg ${s.upcoming ? "is-upcoming" : "is-arrived"}`} style={{ flexGrow: s.guests }} />
      ))}
    </div>
  );
}

function describe(title: string, bar: Split) {
  const who = bar.segs.map((s) => `${s.name} ${s.guests}${s.upcoming ? " (yet to arrive)" : ""}`).join(", ");
  return `${title}: ${n(bar.guests)} guests${who ? `. ${who}` : ""}`;
}

function MonthChart({ months, bucket }: { months: MonthBar[]; bucket: "week" | "month" }) {
  if (!months.some((m) => m.guests > 0)) return <p className="qs-empty">No guests arriving in this range.</p>;
  const max = niceMax(Math.max(...months.map((m) => m.guests), 0));
  return (
    <>
      <Legend split={sumSplit(months)} />
      <div className="col-chart" style={vars({ "--cols": String(months.length) })}>
        <Axis max={max} />
        <div className="col-plot">
          {months.map((m) => (
            <div key={m.key} className="col" tabIndex={0} aria-label={describe(m.label, m)}>
              <Stack bar={m} max={max} showValue />
              {m.guests > 0 && <Tip title={m.label} bar={m} />}
            </div>
          ))}
        </div>
        <div className="col-labels">
          {months.map((m) => (
            <span key={m.key}>{m.short}</span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Guests by {bucket} of arrival</caption>
        <thead>
          <tr>
            <th>{bucket === "week" ? "Week" : "Month"}</th>
            <th>Arrived</th>
            <th>Yet to arrive</th>
            <th>Delegations</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td>{m.arrived}</td>
              <td>{m.upcoming}</td>
              <td>{m.segs.map((s) => `${s.name} (${s.guests})`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Axis({ max }: { max: number }) {
  return (
    <div className="col-axis" aria-hidden>
      {[3, 2, 1, 0].map((i) => (
        <span key={i} style={{ bottom: `${(i / 3) * 100}%` }}>
          <em>{n((max / 3) * i)}</em>
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars, each split into its delegations. */
function SplitBars({ items, empty, caption, limit = 8 }: { items: Ranked[]; empty: string; caption: string; limit?: number }) {
  if (!items.length) return <p className="qs-empty">{empty}</p>;
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map((i) => i.guests));
  return (
    <>
      <Legend split={sumSplit(items)} />
      <ul className="bar-list">
        {shown.map((i) => (
          <li key={i.name} tabIndex={0} aria-label={describe(i.name, i)} className={i.name === NOT_SET ? "is-unset" : ""}>
            <span className="bar-name">{i.name}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.max(2, (i.guests / max) * 100)}%` }}>
                {i.segs.map((s, k) => (
                  <span key={`${s.id}-${k}`} className={`bar-seg ${s.upcoming ? "is-upcoming" : "is-arrived"}`} style={{ flexGrow: s.guests }} />
                ))}
              </span>
            </span>
            <span className="bar-value">{n(i.guests)}</span>
            <Tip title={i.name} bar={i} className="bar-tip" />
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Name</th>
            <th>Arrived</th>
            <th>Yet to arrive</th>
            <th>Delegations</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td>{i.name}</td>
              <td>{i.arrived}</td>
              <td>{i.upcoming}</td>
              <td>{i.segs.map((s) => `${s.name} (${s.guests})`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function OnSiteChart({ days, today }: { days: OnSiteDay[]; today: string }) {
  const peak = days.reduce((m, d) => (d.guests > m.guests ? d : m), days[0]);
  if (!peak || peak.guests === 0) return <p className="qs-empty">No guests on site in these dates.</p>;
  const max = niceMax(peak.guests);
  const day = (d: string) => fmtDay(d, { weekday: "short", day: "numeric", month: "short" });
  return (
    <>
      <p className="qs-callout">
        Busiest: <b>{day(peak.day)}</b> with <b>{n(peak.guests)}</b> guests in {peak.groups} group{peak.groups === 1 ? "" : "s"}
      </p>
      <Legend split={sumSplit(days)} />
      <div className="col-chart is-dense" style={vars({ "--cols": String(days.length) })}>
        <Axis max={max} />
        <div className="col-plot">
          {days.map((d) => (
            <div
              key={d.day}
              className={`col ${d.day === today ? "is-today" : ""}`}
              tabIndex={0}
              aria-label={describe(fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" }), d)}
            >
              <Stack bar={d} max={max} showValue={d.day === peak.day} />
              {d.guests > 0 && <Tip title={day(d.day)} bar={d} />}
            </div>
          ))}
        </div>
        <div className="col-labels">
          {days.map((d, i) => (
            <span key={d.day}>
              {i % 7 === 0 && (i <= days.length - 4 || i === 0) ? (d.day === today ? "Today" : fmtDay(d.day, { day: "numeric", month: "short" })) : ""}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function ReadinessList({ items, today }: { items: Readiness[]; today: string }) {
  if (!items.length) return <p className="qs-empty">No delegations here or arriving in the next 30 days.</p>;
  return (
    <ul className="ready-list">
      {items.map((r) => {
        const until = Math.round((new Date(`${r.arrival}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
        const when = until <= 0 ? "Here now" : until === 1 ? "Arrives tomorrow" : `Arrives in ${until} days`;
        return (
          <li key={r.id}>
            <Link href={`/delegations/${r.id}`} className="ready-row">
              <span className="ready-main">
                <strong>{r.name}</strong>
                <small>
                  {when} · {fmtDay(r.arrival, { day: "numeric", month: "short" })} – {fmtDay(r.departure, { day: "numeric", month: "short" })}
                  {r.members !== null && ` · ${r.members} guests`}
                </small>
              </span>
              <span className="ready-checks">
                <Check icon={<BedDouble size={14} />} label="Stay" done={r.stayDays === r.days} value={`${r.stayDays}/${r.days}`} />
                <Check icon={<Bus size={14} />} label="Transport" done={r.transport > 0} value={r.transport > 0 ? String(r.transport) : "None"} />
                <Check icon={<Utensils size={14} />} label="Meals" done={r.meals === r.mealsTotal} value={`${r.meals}/${r.mealsTotal}`} />
              </span>
              <span className="ready-score" style={vars({ "--p": `${Math.round(r.score * 100)}%` })} aria-label={`${Math.round(r.score * 100)}% planned`}>
                {Math.round(r.score * 100)}%
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Check({ icon, label, done, value }: { icon: ReactNode; label: string; done: boolean; value: string }) {
  return (
    <span className={`ready-check ${done ? "is-done" : "is-todo"}`}>
      {icon}
      <span>
        {label} <b>{value}</b>
      </span>
      {done ? <CheckCircle2 size={13} aria-label="done" /> : <AlertTriangle size={13} aria-label="to do" />}
    </span>
  );
}
