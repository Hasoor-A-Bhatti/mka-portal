"use client";

import { useState } from "react";
import { PlaneLanding, PlaneTakeoff, Plus, Trash2, Users } from "lucide-react";
import { hhmm, type Traveller } from "@/lib/delegations";
import type { GroupPerson } from "./actions";

const AIRPORTS = ["Heathrow T2", "Heathrow T3", "Heathrow T4", "Heathrow T5", "Gatwick North", "Gatwick South", "Manchester"];

/** A person as edited on the page. `key` keeps rows steady while new people have no id yet. */
export type GroupRow = GroupPerson & { key: string; fromTeam: boolean; ref: number | null };

export const toGroupRow = (t: Traveller): GroupRow => ({
  key: t.id,
  id: t.id,
  ref: t.ref,
  fromTeam: t.source !== "aek",
  full_name: t.full_name,
  arrival_date: t.arrival_date ?? "",
  arrival_time: hhmm(t.arrival_time) ?? "",
  arrival_flight: t.arrival_flight ?? "",
  arrival_place: t.arrival_place ?? "",
  departure_date: t.departure_date ?? "",
  departure_time: hhmm(t.departure_time) ?? "",
  departure_flight: t.departure_flight ?? "",
  departure_place: t.departure_place ?? "",
  needs_pickup: t.needs_pickup,
  needs_dropoff: t.needs_dropoff,
  needs_accommodation: t.needs_accommodation ?? true,
});

let added = 0;
const blank = (): GroupRow => ({
  key: `new-${++added}-${Date.now()}`,
  ref: null,
  fromTeam: false,
  full_name: "",
  arrival_date: "",
  arrival_time: "",
  arrival_flight: "",
  arrival_place: "",
  departure_date: "",
  departure_time: "",
  departure_flight: "",
  departure_place: "",
  needs_pickup: true,
  needs_dropoff: true,
  needs_accommodation: true,
});

type Leg = "arrival" | "departure";
const LEG_FIELDS = (leg: Leg) => [`${leg}_date`, `${leg}_time`, `${leg}_flight`, `${leg}_place`] as const;

/**
 * Everyone in the group, edited on the AeK link. Each person entered here goes
 * onto the delegation's Travellers list when the form is sent.
 */
export function GroupEditor({
  rows,
  onChange,
  onRemove,
}: {
  rows: GroupRow[];
  onChange: (rows: GroupRow[]) => void;
  onRemove: (row: GroupRow) => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [bulkLeg, setBulkLeg] = useState<Leg>("departure");
  const [bulk, setBulk] = useState({ date: "", time: "", flight: "", place: "" });

  const set = (key: string, patch: Partial<GroupRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const tick = (key: string, on: boolean) =>
    setTicked((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  const apply = () => {
    const [d, t, f, p] = LEG_FIELDS(bulkLeg);
    const patch: Partial<GroupRow> = {};
    if (bulk.date) patch[d] = bulk.date;
    if (bulk.time) patch[t] = bulk.time;
    if (bulk.flight.trim()) patch[f] = bulk.flight.trim();
    if (bulk.place.trim()) patch[p] = bulk.place.trim();
    onChange(rows.map((r) => (ticked.has(r.key) ? { ...r, ...patch } : r)));
    setTicked(new Set());
  };
  const named = rows.filter((r) => r.full_name.trim()).length;

  return (
    <fieldset className="visit-group">
      <legend>
        <Users size={18} /> Your group
      </legend>
      <p className="visit-help">
        Everyone travelling, with their arrival and return flights, so we can meet each flight and take everyone back to the
        airport. Tick several people to fill in the same flight for all of them at once.
      </p>
      {named > 0 && <p className="muted-note">{named} {named === 1 ? "person" : "people"} on the list</p>}

      {rows.length > 1 && (
        <div className="grp-bulk">
          <div className="grp-bulk-head">
            <strong>Fill in for the people ticked below</strong>
            <span className="grp-leg-pick" role="group" aria-label="Which journey">
              <button type="button" aria-pressed={bulkLeg === "arrival"} onClick={() => setBulkLeg("arrival")}>
                <PlaneLanding size={14} /> Arrival
              </button>
              <button type="button" aria-pressed={bulkLeg === "departure"} onClick={() => setBulkLeg("departure")}>
                <PlaneTakeoff size={14} /> Return
              </button>
            </span>
          </div>
          <div className="grp-leg-grid">
            <input type="date" className="input" aria-label="Date for the ticked people" value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} />
            <input type="time" className="input" aria-label="Time for the ticked people" value={bulk.time} onChange={(e) => setBulk({ ...bulk, time: e.target.value })} />
            <input className="input" maxLength={40} placeholder="Flight, e.g. AC859" aria-label="Flight for the ticked people" value={bulk.flight} onChange={(e) => setBulk({ ...bulk, flight: e.target.value })} />
            <input className="input" maxLength={80} list="grp-airports" placeholder="Airport and terminal" aria-label="Airport for the ticked people" value={bulk.place} onChange={(e) => setBulk({ ...bulk, place: e.target.value })} />
          </div>
          <div className="grp-bulk-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTicked(new Set(rows.map((r) => r.key)))}>
              Tick everyone
            </button>
            {ticked.size > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTicked(new Set())}>
                Untick all
              </button>
            )}
            <button type="button" className="btn btn-sm" disabled={!ticked.size || !Object.values(bulk).some((v) => v.trim())} onClick={apply}>
              Apply to {ticked.size} ticked
            </button>
          </div>
        </div>
      )}

      <ol className="grp-list">
        {rows.map((r, i) => (
          <li key={r.key} className={`grp-row ${ticked.has(r.key) ? "is-ticked" : ""}`}>
            <div className="grp-row-head">
              <input type="checkbox" className="grp-tick" checked={ticked.has(r.key)} onChange={(e) => tick(r.key, e.target.checked)} aria-label={`Tick ${r.full_name || `person ${i + 1}`}`} />
              <span className="grp-ref">{r.ref ?? i + 1}</span>
              <input
                className="input grp-name"
                maxLength={120}
                autoComplete="off"
                placeholder="Full name"
                aria-label={`Person ${i + 1}: full name`}
                value={r.full_name}
                onChange={(e) => set(r.key, { full_name: e.target.value })}
              />
              {!r.fromTeam && (
                <button type="button" className="icon-link danger" title="Remove" onClick={() => onRemove(r)}>
                  <Trash2 size={16} />
                  <span className="sr-only">Remove {r.full_name || `person ${i + 1}`}</span>
                </button>
              )}
            </div>
            {(["arrival", "departure"] as const).map((leg) => {
              const [d, t, f, p] = LEG_FIELDS(leg);
              const who = r.full_name || `person ${i + 1}`;
              return (
                <div key={leg} className="grp-leg">
                  <span className="grp-leg-label">
                    {leg === "arrival" ? <PlaneLanding size={14} /> : <PlaneTakeoff size={14} />} {leg === "arrival" ? "Arrives" : "Returns"}
                  </span>
                  <div className="grp-leg-grid">
                    <input type="date" className="input" aria-label={`${who}: ${leg} date`} value={r[d]} onChange={(e) => set(r.key, { [d]: e.target.value })} />
                    <input type="time" className="input" aria-label={`${who}: ${leg} time`} value={r[t]} onChange={(e) => set(r.key, { [t]: e.target.value })} />
                    <input className="input" maxLength={40} placeholder="Flight" aria-label={`${who}: ${leg} flight`} value={r[f]} onChange={(e) => set(r.key, { [f]: e.target.value })} />
                    <input className="input" maxLength={80} list="grp-airports" placeholder="Airport and terminal" aria-label={`${who}: ${leg} airport`} value={r[p]} onChange={(e) => set(r.key, { [p]: e.target.value })} />
                  </div>
                </div>
              );
            })}
            <div className="grp-needs">
              {(
                [
                  ["needs_pickup", "Airport pickup"],
                  ["needs_dropoff", "Airport drop-off"],
                  ["needs_accommodation", "Accommodation"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="grp-drop">
                  <input type="checkbox" checked={r[k]} onChange={(e) => set(r.key, { [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="khadim-actions">
        {rows.length < 1000 && (
          <button type="button" className="btn btn-sm driver-add" onClick={() => onChange([...rows, blank()])}>
            <Plus size={15} /> Add a person
          </button>
        )}
      </div>
      <datalist id="grp-airports">
        {AIRPORTS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </fieldset>
  );
}

export const emptyGroupRow = blank;
