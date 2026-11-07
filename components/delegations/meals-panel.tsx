"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Utensils } from "lucide-react";
import { AEK_TITLE, MEALS, fmtDay, mealWanted, type Meal, type MealKey, type MealRequests } from "@/lib/delegations";
import { formatDateTime } from "@/lib/format";
import { saveMealsDay, type MealInput } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

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
  requests,
  requestedAt,
  allergies,
}: {
  delegationId: string;
  days: string[];
  today: string;
  meals: Meal[];
  /** What the AeK asked for, if they've said. */
  requests: MealRequests | null;
  requestedAt: string | null;
  /** "Nuts ×2 · Gluten ×1" from the AeK's list of khuddam. */
  allergies: string | null;
}) {
  // Saved plans, kept here so totals update as soon as a day is saved.
  const [saved, setSaved] = useState(() => Object.fromEntries(days.map((d) => [d, planFor(d, meals)])) as Record<string, DayPlan>);

  // A meal counts unless the AeK said it isn't needed (and we haven't arranged it anyway).
  const counts = (d: string, m: MealKey) => saved[d][m].catered || mealWanted(requests, d, m) !== false;
  const total = days.reduce((n, d) => n + MEALS.filter((m) => counts(d, m.key)).length, 0);
  const catered = days.reduce((n, d) => n + MEALS.filter((m) => saved[d][m.key].catered).length, 0);
  const pct = total ? Math.round((catered / total) * 100) : 0;
  const answered = requests ? days.filter((d) => requests[d]) : [];
  const asked = answered.reduce((n, d) => n + requests![d].length, 0);
  const skipped = answered.length * MEALS.length - asked;

  return (
    <>
      {(answered.length > 0 || allergies) && (
        <section className="panel glass aek-food">
          <span className="aek-chip" title={AEK_TITLE}>
            From AeK
          </span>
          <div>
            {answered.length > 0 && (
              <p>
                <strong>
                  {asked} meal{asked === 1 ? "" : "s"} requested
                </strong>
                {skipped > 0 && (
                  <>
                    {" "}
                    · {skipped} not needed
                  </>
                )}
                {answered.length < days.length && <> · {days.length - answered.length} day{days.length - answered.length === 1 ? "" : "s"} not answered</>}
                {requestedAt && <small> · sent {formatDateTime(requestedAt)}</small>}
              </p>
            )}
            {allergies && (
              <p className="aek-allergies">
                <AlertTriangle size={14} /> Allergies in the group: <strong>{allergies}</strong>
              </p>
            )}
          </div>
        </section>
      )}

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
            const of = days.filter((d) => counts(d, m.key)).length;
            return (
              <li key={m.key} className={n >= of ? "is-done" : ""}>
                <span>{m.label}</span>
                <strong>
                  {n}
                  <small> / {of}</small>
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
            wants={requests?.[day] ?? null}
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
  wants,
  onSaved,
}: {
  delegationId: string;
  day: string;
  index: number;
  count: number;
  isToday: boolean;
  saved: DayPlan;
  previous: DayPlan | null;
  /** The meals the AeK asked for on this day, or null if they haven't said. */
  wants: MealKey[] | null;
  onSaved: (plan: DayPlan) => void;
}) {
  const [plan, setPlan] = useState<DayPlan>(saved);
  const canEdit = useCanEdit();
  const [justSaved, setJustSaved] = useState(false);
  const { pending, error, run } = useRun();

  const changed = MEALS.filter((m) => !same(plan[m.key], saved[m.key]));
  const dirty = changed.length > 0;
  const done = MEALS.filter((m) => plan[m.key].catered).length;
  const skip = (m: MealKey) => Boolean(wants && !wants.includes(m) && !plan[m].catered);
  const needed = MEALS.filter((m) => !skip(m.key)).length;

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
    <article className={`meal-day glass ${done >= needed ? "is-complete" : ""} ${isToday ? "is-today" : ""}`}>
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
            <span className="meal-dots" aria-label={`${done} of ${needed} meals arranged`}>
              {MEALS.map((m) => (
                <i key={m.key} className={plan[m.key].catered ? "on" : skip(m.key) ? "skip" : ""} />
              ))}
            </span>
          </p>
        </div>
        {previous && canEdit && (
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

      <fieldset className="meal-rows" disabled={!canEdit}>
        {MEALS.map((m) => {
          const e = plan[m.key];
          const id = `${day}-${m.key}`;
          return (
            <div key={m.key} className={`meal-row ${e.catered ? "is-on" : ""} ${skip(m.key) ? "is-skip" : ""}`}>
              <div className="meal-row-top">
                <label className="meal-check" htmlFor={id}>
                  <input id={id} type="checkbox" checked={e.catered} onChange={(ev) => set(m.key, { catered: ev.target.checked })} />
                  <span className="meal-box" aria-hidden>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  {m.label}
                </label>
                {wants &&
                  (wants.includes(m.key) ? (
                    <span className="aek-chip" title={`The ${AEK_TITLE} asked for this meal`}>
                      Requested
                    </span>
                  ) : (
                    <span className="aek-chip is-muted" title={`The ${AEK_TITLE} said they don't need this meal`}>
                      Not needed
                    </span>
                  ))}
              </div>
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
      </fieldset>

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
        ) : needed === 0 && done === 0 ? (
          <span className="meal-none">
            <Utensils size={14} /> No meals needed
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
