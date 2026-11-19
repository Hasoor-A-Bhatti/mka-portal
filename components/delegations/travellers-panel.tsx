"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bus, Car, Check, ChevronsUpDown, Copy, PlaneLanding, PlaneTakeoff, Plus, Radio, Search } from "lucide-react";
import {
  addVehicles,
  fmtDay,
  hhmm,
  recommendVehicles,
  vehicleParts,
  vehicleText,
  legUnknown,
  runTime,
  shortDay,
  telHref,
  travelRuns,
  type Traveller,
  type TravelLeg,
  type TravelRun,
  type VehiclePlan,
} from "@/lib/delegations";
import { deleteTraveller, saveTraveller } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

const AIRPORTS = ["Heathrow T2", "Heathrow T3", "Heathrow T4", "Heathrow T5", "Gatwick North", "Gatwick South", "Stansted", "Luton", "Manchester", "Birmingham"];

type View = "arrivals" | "departures" | "everyone";

export function TravellersPanel({ delegationId, travellers, canManage }: { delegationId: string; travellers: Traveller[]; canManage: boolean }) {
  const canEdit = useCanEdit();
  const [view, setView] = useState<View>("arrivals");
  const [editing, setEditing] = useState<{ t: Traveller | null } | null>(null);

  const fresh = useFresh(travellers);
  const pickups = travellers.filter((t) => t.needs_pickup).length;
  const dropoffs = travellers.filter((t) => t.needs_dropoff).length;
  const open = (t: Traveller | null) => setEditing({ t });

  return (
    <>
      <section className="stats" aria-label="Travellers summary">
        <div className="stat glass is-accent">
          <strong>{travellers.length}</strong>
          <span>{travellers.length === 1 ? "person" : "people"} on the list</span>
        </div>
        <div className="stat glass">
          <strong>{pickups}</strong>
          <span>airport pickup{pickups === 1 ? "" : "s"}</span>
        </div>
        <div className="stat glass">
          <strong>{dropoffs}</strong>
          <span>airport drop-off{dropoffs === 1 ? "" : "s"}</span>
        </div>
        <VehiclesStat travellers={travellers} />
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Travellers</h2>
            <p className="muted-note">Everyone in the group, grouped by flight so each pickup and drop-off can be arranged.</p>
            {fresh.size > 0 && (
              <p className="tv-live" role="status">
                <Radio size={14} /> {fresh.size} {fresh.size === 1 ? "person" : "people"} just added or updated
              </p>
            )}
          </div>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => open(null)}>
              <Plus size={17} /> Add person
            </button>
          )}
        </div>

        <div className="chips" role="group" aria-label="Show">
          {(
            [
              ["arrivals", "Arrivals"],
              ["departures", "Departures"],
              ["everyone", "Everyone"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>

        {travellers.length === 0 ? (
          <div className="empty">
            <strong>No one on the list yet</strong>
            Add each person with their flight, or send the AeK their link: they can drop in the group&apos;s list (Excel, CSV or
            PDF), and everyone appears here as soon as they send it.
          </div>
        ) : view === "everyone" ? (
          <EveryoneTable travellers={travellers} onOpen={open} fresh={fresh} />
        ) : (
          <RunsView key={view} leg={view === "arrivals" ? "arrival" : "departure"} travellers={travellers} onOpen={open} fresh={fresh} />
        )}
      </section>

      {editing && <TravellerDialog delegationId={delegationId} t={editing.t} canManage={canManage} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * People who changed since the list was last shown (the AeK just sent their
 * form, say), so they can be highlighted for a few seconds as they land.
 */
function useFresh(travellers: Traveller[]): Set<string> {
  const seen = useRef<Map<string, string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Map(travellers.map((t) => [t.id, JSON.stringify(t)]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const changed = [...now].filter(([id, sig]) => before.get(id) !== sig).map(([id]) => id);
    if (!changed.length) return;
    setFresh(new Set(changed));
    const timer = setTimeout(() => setFresh(new Set()), 8000);
    return () => clearTimeout(timer);
  }, [travellers]);
  return fresh;
}

// ---------- Recommended vehicles ----------

/**
 * What to hire, worked out flight by flight: everyone we're meeting off one
 * flight (or taking to one) travels together. Totals are per journey, so a
 * van booked for two different flights counts twice.
 */
function VehiclesStat({ travellers }: { travellers: Traveller[] }) {
  const legs = useMemo(
    () =>
      (["arrival", "departure"] as const).map((leg) => {
        const runs = travelRuns(travellers, leg).filter((r) => r.needUs > 0);
        return { leg, runs: runs.length, plan: addVehicles(runs.map((r) => recommendVehicles(r.needUs))) };
      }),
    [travellers],
  );

  return (
    <div className="stat glass tv-veh" title="Worked out per flight: a private car for 4 or fewer; otherwise the fewest 9- and 14-seater vans, with the fewest empty seats.">
      <p className="tv-veh-title">
        <Bus size={15} /> Recommended transport vehicles
      </p>
      {legs.map(({ leg, runs, plan }) => (
        <div key={leg} className="tv-veh-row">
          <span className="tv-veh-leg">
            {leg === "arrival" ? <PlaneLanding size={14} /> : <PlaneTakeoff size={14} />} {leg === "arrival" ? "Arrivals" : "Departures"}
          </span>
          <VehicleChips plan={plan} />
          {runs > 0 && (
            <small className="tv-veh-runs">
              {runs} flight{runs === 1 ? "" : "s"}
            </small>
          )}
        </div>
      ))}
    </div>
  );
}

function VehicleChips({ plan }: { plan: VehiclePlan }) {
  const parts = vehicleParts(plan);
  if (!parts.length) return <em className="tv-veh-none">No flights to meet yet</em>;
  return (
    <span className="tv-veh-chips">
      {parts.map((p) => (
        <b key={p.kind} className={`tv-veh-chip is-${p.kind}`}>
          {p.kind === "car" ? <Car size={13} /> : <Bus size={13} />} {p.label}
        </b>
      ))}
    </span>
  );
}

// ---------- Arrivals / departures ----------

function RunsView({ leg, travellers, onOpen, fresh }: { leg: TravelLeg; travellers: Traveller[]; onOpen: (t: Traveller) => void; fresh: Set<string> }) {
  const all = useMemo(() => travelRuns(travellers, leg), [travellers, leg]);
  // Arrivals: anyone without arrival details. Departures: only people who need a drop-off.
  const unknown = travellers.filter((t) => legUnknown(t, leg) && (leg === "arrival" || t.needs_dropoff));
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  // Flights nobody needs meeting (people who arrive early by themselves) are hidden at first.
  const [onlyOurs, setOnlyOurs] = useState(true);
  const runs = onlyOurs ? all.filter((r) => r.needUs > 0) : all;
  const hidden = all.length - runs.length;

  const days = new Map<string, TravelRun[]>();
  for (const r of runs) days.set(r.date ?? "", [...(days.get(r.date ?? "") ?? []), r]);
  const Icon = leg === "arrival" ? PlaneLanding : PlaneTakeoff;
  const need = leg === "arrival" ? "pickup" : "drop-off";

  return (
    <div className="tv-runs">
      <div className="tv-runs-bar">
        <p className="muted-note">
          {runs.length} {leg === "arrival" ? "pickup" : "drop-off"} run{runs.length === 1 ? "" : "s"} ·{" "}
          {runs.reduce((n, r) => n + r.needUs, 0)} {runs.reduce((n, r) => n + r.needUs, 0) === 1 ? "person" : "people"} to {leg === "arrival" ? "meet" : "take"}
        </p>
        <span className="tv-runs-tools">
          {(hidden > 0 || !onlyOurs) && (
            <label className="tv-switch">
              <input type="checkbox" checked={onlyOurs} onChange={(e) => setOnlyOurs(e.target.checked)} />
              Only flights we&apos;re meeting{hidden > 0 && ` (${hidden} hidden)`}
            </label>
          )}
          {runs.length > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAllOpen(!(allOpen ?? false))}>
              <ChevronsUpDown size={15} /> {allOpen ? "Collapse all" : "Show everyone"}
            </button>
          )}
        </span>
      </div>

      {[...days.entries()].map(([day, list]) => (
        <section key={day || "none"} className="tv-day">
          <h3>
            {day ? fmtDay(day, { weekday: "long", day: "numeric", month: "long" }) : "Date not given"}
            <small>
              {list.reduce((n, r) => n + r.people.length, 0)} {leg === "arrival" ? "arriving" : "leaving"}
            </small>
          </h3>
          <ul className="tv-run-list">
            {list.map((r) => (
              <RunCard key={`${r.key}-${allOpen}`} run={r} icon={<Icon size={16} />} need={need} startOpen={allOpen ?? r.people.length <= 3} onOpen={onOpen} fresh={fresh} />
            ))}
          </ul>
        </section>
      ))}

      {unknown.length > 0 && (
        <section className="tv-day tv-unknown">
          <h3>
            {leg === "arrival" ? "No arrival details yet" : "Drop-off needed, flight not known yet"}
            <small>{unknown.length}</small>
          </h3>
          <p className="muted-note">
            {leg === "departure"
              ? "The AeK can fill these in on their AeK link, or open a name to add it here."
              : "Open a name to add their arrival."}
          </p>
          <ul className="tv-names">
            {unknown.map((t) => (
              <li key={t.id} className={fresh.has(t.id) ? "is-fresh" : ""}>
                <button type="button" className="tv-name" onClick={() => onOpen(t)}>
                  {t.ref != null && <span className="tv-ref">{t.ref}</span>}
                  {t.full_name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RunCard({
  run: r,
  icon,
  need,
  startOpen,
  onOpen,
  fresh,
}: {
  run: TravelRun;
  icon: React.ReactNode;
  need: string;
  startOpen: boolean;
  onOpen: (t: Traveller) => void;
  fresh: Set<string>;
}) {
  const [copied, setCopied] = useState(false);
  const arriving = r.leg === "arrival";
  const needs = (t: Traveller) => (arriving ? t.needs_pickup : t.needs_dropoff);

  const copy = async () => {
    const head = [
      r.date ? shortDay(r.date) : null,
      runTime(r),
      r.flight ?? "Flight not given",
      r.place,
    ]
      .filter(Boolean)
      .join(" · ");
    const lines = r.people
      .filter(needs)
      .map((t, i) => `${i + 1}. ${t.full_name}${t.phone ? ` (${t.phone})` : ""}`);
    try {
      await navigator.clipboard.writeText(`${arriving ? "Pickup" : "Drop-off"}: ${head}\n${lines.join("\n")}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <li className={`tv-run glass ${r.people.some((t) => fresh.has(t.id)) ? "is-fresh" : ""}`}>
      <details open={startOpen}>
        <summary>
          <span className="tv-time">{runTime(r)}</span>
          <span className="tv-what">
            <strong>
              {icon} {r.flight ?? "Flight not given"}
            </strong>
            <small>{r.place ?? "Airport not given"}</small>
          </span>
          <span className="tv-count">
            <span>
              <b>{r.people.length}</b> {r.people.length === 1 ? "person" : "people"}
            </span>
            <small className={r.needUs ? "" : "is-none"}>
              {r.needUs ? `${r.needUs} ${need}${r.needUs === 1 ? "" : "s"}` : `no ${need}s`}
            </small>
            {r.needUs > 0 && <small className="tv-veh-tag">{vehicleText(recommendVehicles(r.needUs))}</small>}
          </span>
        </summary>
        <ul className="tv-people">
          {r.people.map((t) => (
            <li key={t.id} className={`${needs(t) ? "" : "is-self"} ${fresh.has(t.id) ? "is-fresh" : ""}`}>
              <button type="button" className="tv-name" onClick={() => onOpen(t)}>
                {t.ref != null && <span className="tv-ref">{t.ref}</span>}
                {t.full_name}
              </button>
              {t.phone && (
                <a className="tv-phone" href={telHref(t.phone)}>
                  {t.phone}
                </a>
              )}
              <span className="tv-flags">
                {!needs(t) && <span className="tv-flag is-muted">No {need}</span>}
                {r.from !== r.to && hhmm(arriving ? t.arrival_time : t.departure_time) && (
                  <span className="tv-flag is-muted">{hhmm(arriving ? t.arrival_time : t.departure_time)}</span>
                )}
              </span>
              {t.notes && <small className="tv-note">{t.notes}</small>}
            </li>
          ))}
        </ul>
        {r.needUs > 0 && (
          <div className="tv-run-foot">
            <button type="button" className="btn btn-sm" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : `Copy ${need} list`}
            </button>
          </div>
        )}
      </details>
    </li>
  );
}

// ---------- Everyone ----------

function EveryoneTable({ travellers, onOpen, fresh }: { travellers: Traveller[]; onOpen: (t: Traveller) => void; fresh: Set<string> }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = [...travellers]
    .filter((t) => !s || [t.full_name, t.phone, t.arrival_flight, t.departure_flight, t.notes, t.ref].join(" ").toLowerCase().includes(s))
    .sort((a, b) => (a.ref ?? 9999) - (b.ref ?? 9999) || a.full_name.localeCompare(b.full_name));
  const journey = (date: string | null, time: string | null, flight: string | null, place: string | null) =>
    date || time || flight || place ? (
      <>
        {[date ? shortDay(date) : null, hhmm(time)].filter(Boolean).join(", ") || "Date not given"}
        <small className="st-sub">{[flight, place].filter(Boolean).join(" · ")}</small>
      </>
    ) : (
      <span className="muted">Not known</span>
    );

  return (
    <>
      <label className="search tv-search">
        <Search size={16} />
        <span className="sr-only">Search travellers</span>
        <input className="input" type="search" placeholder="Name, phone, flight" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="table-wrap">
        <table className="records cards-mobile tv-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Arrives</th>
              <th>Leaves</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr
                key={t.id}
                className={fresh.has(t.id) ? "is-fresh" : undefined}
                tabIndex={0}
                onClick={() => onOpen(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(t);
                  }
                }}
              >
                <td data-label="No.">{t.ref ?? "—"}</td>
                <td data-label="Name">
                  <strong>{t.full_name}</strong>
                  {t.notes && <small className="st-sub tv-note-clip">{t.notes}</small>}
                </td>
                <td data-label="Phone">{t.phone ?? <span className="muted">—</span>}</td>
                <td data-label="Arrives">{journey(t.arrival_date, t.arrival_time, t.arrival_flight, t.arrival_place)}</td>
                <td data-label="Leaves">{journey(t.departure_date, t.departure_time, t.departure_flight, t.departure_place)}</td>
                <td data-label="Needs">
                  <span className="tv-flags">
                    {t.needs_pickup && <span className="tv-flag">Pickup</span>}
                    {t.needs_dropoff && <span className="tv-flag">Drop-off</span>}
                    {t.needs_accommodation && <span className="tv-flag is-muted">Room</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p className="muted-note">No one matches.</p>}
    </>
  );
}

// ---------- Add / edit ----------

function TravellerDialog({ delegationId, t, canManage, onClose }: { delegationId: string; t: Traveller | null; canManage: boolean; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const leg = (prefix: "arrival" | "departure", label: string) => (
    <fieldset className="tv-leg wide">
      <legend>
        {prefix === "arrival" ? <PlaneLanding size={15} /> : <PlaneTakeoff size={15} />} {label}
      </legend>
      <div className="tv-leg-grid">
        <div className="field">
          <label htmlFor={`tv-${prefix}-date`}>Date</label>
          <input id={`tv-${prefix}-date`} name={`${prefix}_date`} type="date" className="input" defaultValue={t?.[`${prefix}_date`] ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`tv-${prefix}-time`}>Time (UK)</label>
          <input id={`tv-${prefix}-time`} name={`${prefix}_time`} type="time" className="input" defaultValue={hhmm(t?.[`${prefix}_time`] ?? null) ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`tv-${prefix}-flight`}>Flight</label>
          <input id={`tv-${prefix}-flight`} name={`${prefix}_flight`} className="input" maxLength={40} defaultValue={t?.[`${prefix}_flight`] ?? ""} placeholder="e.g. AC858" />
        </div>
        <div className="field">
          <label htmlFor={`tv-${prefix}-place`}>{prefix === "arrival" ? "Arriving at" : "Leaving from"}</label>
          <input id={`tv-${prefix}-place`} name={`${prefix}_place`} className="input" maxLength={80} list="tv-airports" defaultValue={t?.[`${prefix}_place`] ?? ""} placeholder="e.g. Heathrow T2" />
        </div>
      </div>
    </fieldset>
  );

  return (
    <Sheet title={t ? `Edit ${t.full_name}` : "Add a person"} subtitle={t?.ref != null ? `Number ${t.ref} on the group's list` : "Their travel, and what they need from us."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveTraveller(delegationId, t?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="tv-name">
              Name<span className="req">*</span>
            </label>
            <input id="tv-name" name="full_name" className="input" required maxLength={120} defaultValue={t?.full_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="tv-phone">Phone</label>
            <input id="tv-phone" name="phone" type="tel" className="input" maxLength={40} defaultValue={t?.phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="tv-ref">Number on their list</label>
            <input id="tv-ref" name="ref" type="number" min={0} inputMode="numeric" className="input" defaultValue={t?.ref ?? ""} />
          </div>
          {leg("arrival", "Arrival")}
          {leg("departure", "Return journey")}
          <div className="tv-checks wide">
            {(
              [
                ["needs_pickup", "Airport pickup", t ? t.needs_pickup : true],
                ["needs_dropoff", "Airport drop-off", t ? t.needs_dropoff : true],
                ["needs_accommodation", "Accommodation", t ? t.needs_accommodation ?? true : true],
              ] as const
            ).map(([name, label, on]) => (
              <label key={name} className="check">
                <input type="checkbox" name={name} defaultChecked={on} />
                <span>
                  <strong>{label}</strong>
                </span>
              </label>
            ))}
          </div>
          <div className="field wide">
            <label htmlFor="tv-notes">Notes</label>
            <textarea id="tv-notes" name="notes" className="textarea" maxLength={1000} rows={3} defaultValue={t?.notes ?? ""} placeholder="Anything else to know" />
          </div>
          <datalist id="tv-airports">
            {AIRPORTS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {t && canManage && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              disabled={pending}
              onClick={() => window.confirm(`Remove ${t.full_name} from the list?`) && run(() => deleteTraveller(delegationId, t.id), onClose)}
            >
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : t ? "Save" : "Add person"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

