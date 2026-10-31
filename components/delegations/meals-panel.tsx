"use client";

import { useState } from "react";
import { Check, CheckCircle2, Copy, Utensils } from "lucide-react";
import { MEALS, fmtDay, type Meal, type MealKey } from "@/lib/delegations";
import { saveMealsDay, type MealInput } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, useRun } from "@/components/fleet/ui";

type Entry = { catered: boolean; location: string; menu: string };
type DayPlan = Record<MealKey, Entry>;

const EMPTY: Entry = { catered: false, location: "", menu: "" };

function planFor(day: string, meals: Meal[]): DayPlan {
  const plan = { breakfast: { ...EMPTY }, lunch: { ...EMPTY }, dinner: { ...EMPTY } } as DayPlan;
  for (const m of meals) {
    if (m.day === day) plan[m.meal] = { catered: m.catered, location: m.location ?? "", menu: m.menu ?? "" };
  }
  return plan;
}

const same = (a: Entry, b: Entry) => a.catered === b.catered && a.location.trim() === b.location.trim() && a.menu.trim() === b.menu.trim();

export function MealsPanel({
  delegationId,
  days,
  today,
  meals,
}: {
  delegationId: string;
  days: string[];
  today: string;
  meals: Meal[];
}) {
  // Saved plans, kept here so totals update as soon as a day is saved.
  const [saved, setSaved] = useState(() => Object.fromEntries(days.map((d) => [d, planFor(d, meals)])) as Record<string, DayPlan>);

  const total = days.length * MEALS.length;
  const catered = days.reduce((n, d) => n + MEALS.filter((m) => saved[d][m.key].catered).length, 0);
  const pct = total ? Math.round((catered / total) * 100) : 0;

  return (
    <>
      <section className="panel glass meals-summary">
        <div className="meals-progress">
          <div>
            <strong>
              {catered}
              <small> / {total}</small>
            </strong>
            <span>meals arranged across {days.length} day{days.length === 1 ? "" : "s"}</span>
          </div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Meals arranged">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ul className="meals-totals">
          {MEALS.map((m) => {
            const n = days.filter((d) => saved[d][m.key].catered).length;
            return (
              <li key={m.key} className={n === days.length ? "is-done" : ""}>
                <span>{m.label}</span>
                <strong>
                  {n}
                  <small> / {days.length}</small>
                </strong>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="meal-grid">
        {days.map((day, i) => (
          <MealDay
            key={day}
            delegationId={delegationId}
            day={day}
            index={i}
            count={days.length}
            isToday={day === today}
            saved={saved[day]}
            previous={i > 0 ? saved[days[i - 1]] : null}
            onSaved={(plan) => setSaved((s) => ({ ...s, [day]: plan }))}
          />
        ))}
      </div>
    </>
  );
}

function MealDay({
  delegationId,
  day,
  index,
  count,
  isToday,
  saved,
  previous,
  onSaved,
}: {
  delegationId: string;
  day: string;
  index: number;
  count: number;
  isToday: boolean;
  saved: DayPlan;
  previous: DayPlan | null;
  onSaved: (plan: DayPlan) => void;
}) {
  const [plan, setPlan] = useState<DayPlan>(saved);
  const [justSaved, setJustSaved] = useState(false);
  const { pending, error, run } = useRun();

  const changed = MEALS.filter((m) => !same(plan[m.key], saved[m.key]));
  const dirty = changed.length > 0;
  const done = MEALS.filter((m) => plan[m.key].catered).length;

  const set = (meal: MealKey, patch: Partial<Entry>) => {
    setJustSaved(false);
    setPlan((p) => ({ ...p, [meal]: { ...p[meal], ...patch } }));
  };

  const save = () => {
    const payload: MealInput[] = changed.map((m) => ({ meal: m.key, ...plan[m.key] }));
    run(
      () => saveMealsDay(delegationId, day, payload),
      () => {
        onSaved(plan);
        setJustSaved(true);
      },
    );
  };

  const tag = index === 0 ? "Arrives" : index === count - 1 ? "Departs" : null;

  return (
    <article className={`meal-day glass ${done === MEALS.length ? "is-complete" : ""} ${isToday ? "is-today" : ""}`}>
      <header className="meal-day-head">
        <span className="cal-date">
          <small>{fmtDay(day, { weekday: "short" })}</small>
          <strong>{fmtDay(day, { day: "numeric" })}</strong>
          <small>{fmtDay(day, { month: "short" })}</small>
        </span>
        <div>
          <h3>
            Day {index + 1}
            <small> of {count}</small>
          </h3>
          <p>
            {isToday && <em className="planner-tag is-today">Today</em>}
            {tag && <em className="planner-tag">{tag}</em>}
            <span className="meal-dots" aria-label={`${done} of 3 meals arranged`}>
              {MEALS.map((m) => (
                <i key={m.key} className={plan[m.key].catered ? "on" : ""} />
              ))}
            </span>
          </p>
        </div>
        {previous && (
          <button
            type="button"
            className="icon-link"
            title="Same as the day before"
            onClick={() => {
              setJustSaved(false);
              setPlan({ breakfast: { ...previous.breakfast }, lunch: { ...previous.lunch }, dinner: { ...previous.dinner } });
            }}
          >
            <Copy size={15} />
            <span className="sr-only">Copy the day before</span>
          </button>
        )}
      </header>

      <div className="meal-rows">
        {MEALS.map((m) => {
          const e = plan[m.key];
          const id = `${day}-${m.key}`;
          return (
            <div key={m.key} className={`meal-row ${e.catered ? "is-on" : ""}`}>
              <label className="meal-check" htmlFor={id}>
                <input id={id} type="checkbox" checked={e.catered} onChange={(ev) => set(m.key, { catered: ev.target.checked })} />
                <span className="meal-box" aria-hidden>
                  <Check size={13} strokeWidth={3} />
                </span>
                {m.label}
              </label>
              {e.catered && (
                <div className="meal-fields">
                  <input
                    className="input"
                    aria-label={`${m.label} location`}
                    placeholder="Where"
                    value={e.location}
                    onChange={(ev) => set(m.key, { location: ev.target.value })}
                  />
                  <textarea
                    className="textarea"
                    aria-label={`${m.label} menu`}
                    placeholder="Menu served"
                    rows={2}
                    value={e.menu}
                    onChange={(ev) => set(m.key, { menu: ev.target.value })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="meal-day-foot">
        {dirty ? (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setPlan(saved)} disabled={pending}>
              Undo
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save day"}
            </button>
          </>
        ) : justSaved ? (
          <span className="meal-saved">
            <CheckCircle2 size={15} /> Saved
          </span>
        ) : done === 0 ? (
          <span className="meal-none">
            <Utensils size={14} /> No meals arranged
          </span>
        ) : null}
      </footer>
      <FormError error={error} />
    </article>
  );
}
