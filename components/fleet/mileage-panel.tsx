"use client";

import { useRef } from "react";
import { Flag, Trash2 } from "lucide-react";
import { countedReadings, miles, milesThisYear, sortReadings, todayISO, type MileageLog } from "@/lib/fleet";
import { formatDate, formatDateTime } from "@/lib/format";
import { addMileage, deleteMileage, setMileageStart } from "@/app/(portal)/fleet/actions";
import { Odometer } from "./bits";
import { FormError, useRun } from "./ui";
import { useCanEdit } from "@/components/edit-access";

export function MileagePanel({
  vehicleId,
  current,
  logs,
  canManage,
}: {
  vehicleId: string;
  current: number;
  logs: MileageLog[];
  canManage: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, error, run } = useRun();
  const remove = useRun();
  const canEdit = useCanEdit();
  const year = todayISO().slice(0, 4);

  // Oldest first, to work out miles since the previous reading.
  // Starting points (and the first ever reading) aren't miles driven.
  const ordered = sortReadings(logs);
  const counted = countedReadings(logs);
  const startId = counted[0]?.id;
  const rows = ordered
    .map((l, i) => ({
      ...l,
      start: i === 0 || Boolean(l.is_start),
      current: l.id === startId,
      driven: i === 0 || l.is_start ? null : l.reading - ordered[i - 1]!.reading,
    }))
    .reverse();
  const toggle = useRun();

  return (
    <div className="split">
      <section className="panel glass">
        <div className="panel-head">
          <h2>Mileage history</h2>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            <strong>No readings yet</strong>
            Log the odometer reading and every update will be listed here.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="records static">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reading</th>
                  <th>Since previous</th>
                  <th>Logged by</th>
                  <th>Note</th>
                  {canManage && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.recorded_on)}</td>
                    <td className="tnum">{miles(r.reading)} mi</td>
                    <td className="tnum">
                      {r.start ? (
                        <span className={`mileage-start ${r.current ? "is-current" : ""}`} title="The odometer when tracking began. Not counted as miles driven.">
                          <Flag size={13} /> Starting point
                        </span>
                      ) : (
                        `+${miles(r.driven!)} mi`
                      )}
                    </td>
                    <td className="who">
                      {r.creator?.full_name ?? "Unknown"}
                      <small>{formatDateTime(r.created_at)}</small>
                    </td>
                    <td className="wrap">{r.note ?? <span className="muted">—</span>}</td>
                    {canManage && (
                      <td className="mileage-actions">
                        {r.id !== ordered[0]?.id && (
                          <button
                            type="button"
                            className={`icon-link ${r.is_start ? "is-on" : ""}`}
                            title={r.is_start ? "Count miles up to this reading again" : "Make this the starting point: miles before it won't count"}
                            disabled={toggle.pending}
                            onClick={() => toggle.run(() => setMileageStart(vehicleId, r.id, !r.is_start))}
                          >
                            <Flag size={16} />
                            <span className="sr-only">{r.is_start ? "Remove starting point" : "Make starting point"}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-link danger"
                          title="Remove reading"
                          disabled={remove.pending}
                          onClick={() => {
                            if (window.confirm(`Remove the ${miles(r.reading)} mile reading from ${formatDate(r.recorded_on)}?`)) {
                              remove.run(() => deleteMileage(vehicleId, r.id));
                            }
                          }}
                        >
                          <Trash2 size={16} />
                          <span className="sr-only">Remove reading</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <FormError error={remove.error ?? toggle.error} />
        {rows.length > 0 && (
          <p className="muted-note" style={{ marginTop: 10 }}>
            Miles driven are counted from the latest starting point. The first reading is always a starting point.
          </p>
        )}
      </section>

      <div className="stack">
        <section className="panel glass mileage-hero">
          <span className="eyebrow">Current mileage</span>
          <Odometer value={current} />
          <div className="mileage-figures">
            <div>
              <strong className="tnum">{miles(milesThisYear(logs))}</strong>
              <span>miles driven in {year}</span>
              {counted.length > 0 && <small className="muted">since {miles(counted[0]!.reading)} mi starting point</small>}
            </div>
            <div>
              <strong className="tnum">{logs.length}</strong>
              <span>reading{logs.length === 1 ? "" : "s"} logged</span>
            </div>
          </div>
        </section>

        {canEdit && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>Log a reading</h2>
          </div>
          <form
            ref={form}
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => addMileage(vehicleId, fd), () => form.current?.reset());
            }}
          >
            <div className="field">
              <label htmlFor="m-reading">
                Odometer reading (miles)<span className="req">*</span>
              </label>
              <input id="m-reading" name="reading" className="input tnum" inputMode="numeric" required placeholder={current ? String(current) : "e.g. 84210"} />
            </div>
            <div className="field">
              <label htmlFor="m-date">Date</label>
              <input id="m-date" name="recorded_on" type="date" className="input" defaultValue={todayISO()} max={todayISO()} required />
            </div>
            {canManage && (
              <label className="check">
                <input type="checkbox" name="is_start" />
                <span>
                  <strong>Starting reading</strong>
                  <small>The odometer as it is now, to count from. It won&apos;t be counted as miles driven.</small>
                </span>
              </label>
            )}
            <div className="field">
              <label htmlFor="m-note">Note</label>
              <input id="m-note" name="note" className="input" placeholder="Optional, e.g. after Jalsa trip" />
            </div>
            <FormError error={error} />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save reading"}
            </button>
          </form>
        </section>
        )}
      </div>
    </div>
  );
}
