// Region Guidance: the pickup and drop-off runs, for delegations with a traveller list (0018).

import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { fmtDay, hhmm, legUnknown, runTime, telHref, travelRuns, type Traveller, type TravelLeg } from "@/lib/delegations";

/** "4 runs over 3 days, 52 people" for the task list. */
export function runsSummary(list: Traveller[], leg: TravelLeg): string {
  const runs = travelRuns(list, leg).filter((r) => r.needUs > 0);
  const people = runs.reduce((n, r) => n + r.needUs, 0);
  if (!runs.length) return leg === "arrival" ? "No pickups needed so far." : "No drop-off details yet.";
  const days = new Set(runs.map((r) => r.date)).size;
  return `${runs.length} run${runs.length === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}, ${people} ${people === 1 ? "person" : "people"}. Details below.`;
}

export function RunsSection({ list, leg, icon }: { list: Traveller[]; leg: TravelLeg; icon: ReactNode }) {
  const arriving = leg === "arrival";
  const needs = (t: Traveller) => (arriving ? t.needs_pickup : t.needs_dropoff);
  const runs = travelRuns(list, leg).filter((r) => r.needUs > 0);
  // People who want a drop-off but haven't said when yet.
  const waiting = arriving ? [] : list.filter((t) => t.needs_dropoff && legUnknown(t, "departure"));
  const days = new Map<string, typeof runs>();
  for (const r of runs) days.set(r.date ?? "", [...(days.get(r.date ?? "") ?? []), r]);

  return (
    <section className="visit-card glass glass-strong">
      <h2>
        {icon} {arriving ? "Airport pickups" : "Airport drop-offs"}
      </h2>
      <p className="visit-lead">
        {arriving
          ? "Everyone to meet, grouped by flight. Times are when the flight lands (UK time)."
          : "Everyone to take to the airport, grouped by flight. Times are when the flight leaves (UK time)."}
      </p>

      {runs.length === 0 && <p className="muted-note">{arriving ? "No pickups needed so far." : "No drop-off flights given yet."}</p>}

      {[...days.entries()].map(([day, list]) => (
        <div key={day || "none"} className="rg-day">
          <h3>{day ? fmtDay(day, { weekday: "long", day: "numeric", month: "long" }) : "Date to be confirmed"}</h3>
          <ul className="rg-runs">
            {list.map((r) => {
              const go = r.people.filter(needs);
              return (
                <li key={r.key} className="rg-run">
                  <details>
                    <summary>
                      <span className="rg-time tnum">{runTime(r)}</span>
                      <span className="rg-what">
                        <strong>{r.flight ?? "Flight not given"}</strong>
                        <small>{r.place ?? "Airport to be confirmed"}</small>
                      </span>
                      <span className="rg-count">
                        {go.length} {go.length === 1 ? "person" : "people"}
                      </span>
                    </summary>
                    <ol className="rg-people">
                      {go.map((t) => (
                        <li key={t.id}>
                          <span className="rg-name">{t.full_name}</span>
                          {t.phone ? (
                            <a href={telHref(t.phone)} className="rg-phone">
                              <Phone size={13} /> {t.phone}
                            </a>
                          ) : (
                            <span className="muted-note">No phone</span>
                          )}
                          {r.from !== r.to && hhmm(arriving ? t.arrival_time : t.departure_time) && (
                            <small>{hhmm(arriving ? t.arrival_time : t.departure_time)}</small>
                          )}
                          {t.notes && <small className="rg-note">{t.notes}</small>}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {waiting.length > 0 && (
        <p className="muted-note rg-waiting">
          {waiting.length} more {waiting.length === 1 ? "person needs" : "people need"} a drop-off, but their flight home isn&apos;t
          known yet. It will appear here once the group sends it.
        </p>
      )}
    </section>
  );
}
