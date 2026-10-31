"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { daysLabel, fmtDay, spanDays } from "@/lib/delegations";
import { vars } from "@/lib/css";

export type PlanItem = {
  id: string;
  start: string;
  end: string;
  title: string;
  subtitle?: string | null;
  tone: string;
  icon?: ReactNode;
};

/** Puts items into rows so overlapping ones never sit on top of each other. */
function lanes(items: PlanItem[]): PlanItem[][] {
  const out: PlanItem[][] = [];
  for (const item of [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))) {
    const lane = out.find((l) => l[l.length - 1].end < item.start);
    if (lane) lane.push(item);
    else out.push([item]);
  }
  return out;
}

/**
 * A day-by-day planner for the length of a stay. Items are bars across the days
 * they cover. With `gaps`, a row underneath the dates shows which days have nothing.
 */
export function Planner({
  days,
  today,
  items,
  onOpen,
  onAdd,
  gaps,
  addLabel = "Add",
}: {
  days: string[];
  today: string;
  items: PlanItem[];
  onOpen: (id: string) => void;
  onAdd?: (day: string) => void;
  gaps?: { covered: string; missing: string };
  addLabel?: string;
}) {
  const index = new Map(days.map((d, i) => [d, i]));
  const rows = lanes(items.filter((i) => i.end >= days[0] && i.start <= days[days.length - 1]));
  const covered = new Set<string>();
  for (const i of items) for (const d of days) if (d >= i.start && d <= i.end) covered.add(d);

  // Row numbers: dates, optional gaps, one per lane, optional add row.
  const laneStart = gaps ? 3 : 2;
  const template = [
    "auto",
    gaps ? "auto" : null,
    rows.length ? `repeat(${rows.length}, minmax(64px, auto))` : "minmax(64px, auto)",
    onAdd ? "auto" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
    <div className="planner">
      <div
        className="planner-grid"
        style={vars({ "--cols": String(days.length) }, { gridTemplateRows: template })}
        role="grid"
        aria-label="Day planner"
      >
        {/* Column shading behind everything */}
        {days.map((d, i) => {
          const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
          return (
            <span
              key={`bg-${d}`}
              aria-hidden
              className={`planner-col ${dow === 0 || dow === 6 ? "is-weekend" : ""} ${d === today ? "is-today" : ""}`}
              style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
            />
          );
        })}

        {days.map((d, i) => (
          <div key={`h-${d}`} className="planner-day" role="columnheader" style={{ gridColumn: i + 1, gridRow: 1 }}>
            <small>{fmtDay(d, { weekday: "short" })}</small>
            <strong>{fmtDay(d, { day: "numeric" })}</strong>
            <small>{fmtDay(d, { month: "short" })}</small>
            {i === 0 && <em className="planner-tag">Arrives</em>}
            {i === days.length - 1 && i > 0 && <em className="planner-tag">Departs</em>}
            {d === today && <em className="planner-tag is-today">Today</em>}
          </div>
        ))}

        {gaps &&
          days.map((d, i) => (
            <div
              key={`g-${d}`}
              className={`planner-gap ${covered.has(d) ? "is-covered" : "is-missing"}`}
              style={{ gridColumn: i + 1, gridRow: 2 }}
              title={covered.has(d) ? gaps.covered : gaps.missing}
            >
              {covered.has(d) ? <Check size={13} /> : <AlertTriangle size={13} />}
              <span className="sr-only">{covered.has(d) ? gaps.covered : gaps.missing}</span>
            </div>
          ))}

        {rows.length === 0 && (
          <p className="planner-empty" style={{ gridColumn: `1 / -1`, gridRow: laneStart }}>
            Nothing planned yet{onAdd ? `. Use ${addLabel} above, or the + on any day.` : "."}
          </p>
        )}

        {rows.map((lane, r) =>
          lane.map((item) => {
            const from = Math.max(0, index.get(item.start) ?? 0);
            const to = Math.min(days.length - 1, index.get(item.end) ?? days.length - 1);
            const span = spanDays(item.start, item.end);
            return (
              <button
                key={item.id}
                type="button"
                className={`plan-bar ${from === to ? "is-single" : ""}`}
                style={vars({ "--tone": item.tone }, { gridColumn: `${from + 1} / ${to + 2}`, gridRow: laneStart + r })}
                onClick={() => onOpen(item.id)}
                title={`${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""} (${daysLabel(span)})`}
              >
                <span className="plan-bar-title">
                  {item.icon}
                  {item.title}
                </span>
                {item.subtitle && <span className="plan-bar-sub">{item.subtitle}</span>}
                {from !== to && <span className="plan-bar-len">{daysLabel(span)}</span>}
              </button>
            );
          }),
        )}

        {onAdd &&
          days.map((d, i) => (
            <button
              key={`a-${d}`}
              type="button"
              className="planner-add"
              style={{ gridColumn: i + 1, gridRow: laneStart + Math.max(rows.length, 1) }}
              onClick={() => onAdd(d)}
              title={`${addLabel} from ${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}`}
            >
              <Plus size={15} />
              <span className="sr-only">
                {addLabel} from {fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </button>
          ))}
      </div>
    </div>

    <PlannerAgenda days={days} today={today} items={items} onOpen={onOpen} onAdd={onAdd} gaps={gaps} addLabel={addLabel} />
    </>
  );
}

/**
 * The same plan as a list of days, for phones. An item is shown in full on its
 * first day and as a slim "continues" line on the days after.
 */
function PlannerAgenda({
  days,
  today,
  items,
  onOpen,
  onAdd,
  gaps,
  addLabel,
}: {
  days: string[];
  today: string;
  items: PlanItem[];
  onOpen: (id: string) => void;
  onAdd?: (day: string) => void;
  gaps?: { covered: string; missing: string };
  addLabel: string;
}) {
  return (
    <ol className="planner-agenda" aria-label="Day by day">
      {days.map((d, i) => {
        const here = items
          .filter((it) => d >= it.start && d <= it.end)
          .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
        const empty = here.length === 0;
        const tag = i === 0 ? "Arrives" : i === days.length - 1 ? "Departs" : null;
        return (
          <li
            key={d}
            className={`agenda-day ${d === today ? "is-today" : ""} ${empty ? "is-empty" : ""} ${empty && gaps ? "is-gap" : ""}`}
          >
            <div className="agenda-date">
              <small>{fmtDay(d, { weekday: "short" })}</small>
              <strong>{fmtDay(d, { day: "numeric" })}</strong>
              <small>{fmtDay(d, { month: "short" })}</small>
            </div>

            <div className="agenda-body">
              {(tag || d === today) && (
                <div className="agenda-tags">
                  {d === today && <em className="planner-tag is-today">Today</em>}
                  {tag && <em className="planner-tag">{tag}</em>}
                </div>
              )}

              {empty &&
                (gaps ? (
                  <span className="agenda-gap">
                    <AlertTriangle size={14} /> {gaps.missing}
                  </span>
                ) : (
                  <span className="agenda-free">Nothing planned</span>
                ))}

              {here.map((it) => {
                const span = spanDays(it.start, it.end);
                const nth = spanDays(it.start, d);
                const first = d === it.start || (i === 0 && it.start < d);
                return first ? (
                  <button key={it.id} type="button" className="agenda-item" style={vars({ "--tone": it.tone })} onClick={() => onOpen(it.id)}>
                    <span className="agenda-item-title">
                      {it.icon}
                      {it.title}
                    </span>
                    {(it.subtitle || span > 1) && (
                      <span className="agenda-item-sub">
                        {[it.subtitle, span > 1 ? `${daysLabel(span)}${nth > 1 ? `, day ${nth}` : ""}` : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                ) : (
                  <button key={it.id} type="button" className="agenda-cont" style={vars({ "--tone": it.tone })} onClick={() => onOpen(it.id)}>
                    <span className="agenda-cont-line" aria-hidden />
                    {it.title}
                    <small>
                      day {nth} of {span}
                    </small>
                  </button>
                );
              })}
            </div>

            {onAdd && (
              <button type="button" className="agenda-add" onClick={() => onAdd(d)}>
                <Plus size={16} />
                <span className="sr-only">
                  {addLabel} on {fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Repeatable colours for venues, vehicles and so on. */
const PALETTE = ["#4a1fa8", "#0b8043", "#b4592a", "#1f6fb5", "#a2348f", "#8a6210", "#2f7f7a", "#c43a3a"];

export function toneFor(key: string): string {
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
