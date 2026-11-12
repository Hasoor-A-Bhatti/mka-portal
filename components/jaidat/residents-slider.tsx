"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { setResidents } from "@/app/(portal)/jaidat/actions";
import { FormError, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";

/**
 * How many people live at the property now. Drag the slider (or use − / +),
 * then Save. The number stays as saved until someone changes it.
 */
export function ResidentsSlider({
  propertyId,
  residents,
  updatedAt,
  capacity,
}: {
  propertyId: string;
  residents: number | null;
  updatedAt: string | null;
  capacity: number | null;
}) {
  const canEdit = useCanEdit();
  const saved = residents ?? 0;
  const [value, setValue] = useState(saved);
  const { pending, error, run } = useRun();

  // Pick up a fresh value after saving (or someone else's change).
  useEffect(() => setValue(saved), [saved]);

  // The scale runs to the capacity if known, otherwise 30, and grows if needed.
  const max = Math.min(500, Math.max(capacity && capacity > 0 ? capacity : 30, saved, value));
  const changed = value !== saved;
  const full = capacity != null && capacity > 0 && value > capacity;
  const pct = max ? (value / max) * 100 : 0;

  const set = (n: number) => setValue(Math.max(0, Math.min(500, n)));
  const save = () => run(() => setResidents(propertyId, value));

  return (
    <div className="jd-residents">
      <div className="jd-residents-head">
        <span className="jd-residents-label">
          <Users size={15} /> Current residents
        </span>
        <strong aria-live="polite">
          {value}
          {capacity != null && capacity > 0 && <small> / {capacity}</small>}
        </strong>
      </div>

      {canEdit ? (
        <>
          <div className="jd-residents-control">
            <button type="button" className="icon-link" onClick={() => set(value - 1)} disabled={pending || value <= 0} aria-label="One fewer">
              <Minus size={16} />
            </button>
            <input
              type="range"
              className="jd-range"
              min={0}
              max={max}
              step={1}
              value={value}
              onChange={(e) => set(Number(e.target.value))}
              disabled={pending}
              aria-label="Current number of residents"
              style={vars({ "--fill": `${pct}%` })}
            />
            <button type="button" className="icon-link" onClick={() => set(value + 1)} disabled={pending || value >= 500} aria-label="One more">
              <Plus size={16} />
            </button>
          </div>
          {changed && (
            <div className="jd-residents-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setValue(saved)} disabled={pending}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="jd-residents-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}

      <small className="jd-residents-note">
        {full && "More than the stated capacity · "}
        {residents == null ? "Not set yet" : updatedAt ? `Last updated ${formatDate(updatedAt)}` : "Saved"}
      </small>
      <FormError error={error} />
    </div>
  );
}
