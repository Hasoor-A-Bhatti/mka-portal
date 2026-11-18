"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PlaneTakeoff, Users } from "lucide-react";
import { hhmm, shortDay, type Traveller } from "@/lib/delegations";
import { submitReturnJourneys, type ReturnJourney } from "./actions";

const AIRPORTS = ["Heathrow T2", "Heathrow T3", "Heathrow T4", "Heathrow T5", "Gatwick North", "Gatwick South", "Manchester"];

const toRow = (t: Traveller): ReturnJourney => ({
  id: t.id,
  departure_date: t.departure_date ?? "",
  departure_time: hhmm(t.departure_time) ?? "",
  departure_flight: t.departure_flight ?? "",
  departure_place: t.departure_place ?? "",
  needs_dropoff: t.needs_dropoff,
});

const hasReturn = (r: ReturnJourney) => Boolean(r.departure_date || r.departure_time || r.departure_flight || r.departure_place);

/**
 * The group's list, for delegations whose members travel separately.
 * The AeK fills in each person's return journey, one at a time or several at once.
 */
export function GroupForm({ token, travellers, departure }: { token: string; travellers: Traveller[]; departure: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<ReturnJourney[]>(() => travellers.map(toRow));
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ departure_date: departure ?? "", departure_time: "", departure_flight: "", departure_place: "" });
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const by = new Map(travellers.map((t) => [t.id, t]));
  const done = rows.filter(hasReturn).length;
  const set = (id: string, patch: Partial<ReturnJourney>) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  };
  const tick = (id: string, on: boolean) =>
    setTicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const apply = () => {
    const patch = Object.fromEntries(Object.entries(bulk).filter(([, v]) => v.trim())) as Partial<ReturnJourney>;
    setRows((list) => list.map((r) => (ticked.has(r.id) ? { ...r, ...patch } : r)));
    setTicked(new Set());
    setSaved(false);
  };

  return (
    <form
      className="visit-card glass glass-strong visit-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startSave(async () => {
          const res = await submitReturnJourneys(token, rows);
          if (res.error) setError(res.error);
          else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <fieldset className="visit-group">
        <legend>
          <Users size={18} /> Your group&apos;s return journeys
        </legend>
        <p className="visit-help">
          We have {travellers.length} people on your group&apos;s list, with their arrival flights. Please add how each person is
          leaving the UK, so we can arrange airport drop-offs. Tick several people to fill them in at once.
        </p>
        <p className="muted-note">
          {done} of {rows.length} filled in
        </p>

        <div className="grp-bulk">
          <strong>
            <PlaneTakeoff size={16} /> Fill in for the people ticked below
          </strong>
          <div className="grp-bulk-grid">
            <input type="date" className="input" aria-label="Date for the ticked people" value={bulk.departure_date} onChange={(e) => setBulk({ ...bulk, departure_date: e.target.value })} />
            <input type="time" className="input" aria-label="Time for the ticked people" value={bulk.departure_time} onChange={(e) => setBulk({ ...bulk, departure_time: e.target.value })} />
            <input className="input" maxLength={40} placeholder="Flight, e.g. AC859" aria-label="Flight for the ticked people" value={bulk.departure_flight} onChange={(e) => setBulk({ ...bulk, departure_flight: e.target.value })} />
            <input className="input" maxLength={80} list="grp-airports" placeholder="Airport, e.g. Heathrow T2" aria-label="Airport for the ticked people" value={bulk.departure_place} onChange={(e) => setBulk({ ...bulk, departure_place: e.target.value })} />
          </div>
          <div className="grp-bulk-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTicked(new Set(rows.filter((r) => !hasReturn(r)).map((r) => r.id)))}>
              Tick everyone not filled in
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

        <ol className="grp-list">
          {rows.map((r) => {
            const t = by.get(r.id)!;
            const arrives = [t.arrival_date ? shortDay(t.arrival_date) : null, hhmm(t.arrival_time), t.arrival_flight, t.arrival_place].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className={`grp-row ${ticked.has(r.id) ? "is-ticked" : ""}`}>
                <label className="grp-who">
                  <input type="checkbox" checked={ticked.has(r.id)} onChange={(e) => tick(r.id, e.target.checked)} />
                  <span>
                    <strong>
                      {t.ref != null && <span className="grp-ref">{t.ref}</span>}
                      {t.full_name}
                    </strong>
                    <small>Arrives {arrives || "(not given)"}</small>
                  </span>
                </label>
                <div className="grp-fields">
                  <input type="date" className="input" aria-label={`${t.full_name}: departure date`} value={r.departure_date} onChange={(e) => set(r.id, { departure_date: e.target.value })} />
                  <input type="time" className="input" aria-label={`${t.full_name}: departure time`} value={r.departure_time} onChange={(e) => set(r.id, { departure_time: e.target.value })} />
                  <input className="input" maxLength={40} placeholder="Flight" aria-label={`${t.full_name}: flight`} value={r.departure_flight} onChange={(e) => set(r.id, { departure_flight: e.target.value })} />
                  <input className="input" maxLength={80} list="grp-airports" placeholder="Airport" aria-label={`${t.full_name}: airport`} value={r.departure_place} onChange={(e) => set(r.id, { departure_place: e.target.value })} />
                  <label className="grp-drop">
                    <input type="checkbox" checked={r.needs_dropoff} onChange={(e) => set(r.id, { needs_dropoff: e.target.checked })} />
                    Drop-off needed
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        <datalist id="grp-airports">
          {AIRPORTS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="visit-submit">
        {saved && (
          <span className="visit-saved" role="status">
            <CheckCircle2 size={17} /> Sent to the MKA Delegations team. JazakAllah.
          </span>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Sending…" : "Save return journeys"}
        </button>
      </div>
    </form>
  );
}
