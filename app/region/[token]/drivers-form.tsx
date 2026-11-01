"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PlaneLanding, PlaneTakeoff, Plus, Trash2 } from "lucide-react";
import type { Driver } from "@/lib/delegations";
import { saveDrivers, type DriverInput } from "./actions";

const blank = (): DriverInput => ({ full_name: "", aims: "", phone: "" });
const toInput = (d: Driver): DriverInput => ({ full_name: d.full_name ?? "", aims: d.aims ?? "", phone: d.phone ?? "" });
const MAX = 20;

/** Pickup drivers (and optionally drop-off drivers). Nothing is required. */
export function DriversForm({
  token,
  pickup,
  dropoff,
  savedAt,
}: {
  token: string;
  pickup: Driver[];
  dropoff: Driver[];
  savedAt: string | null;
}) {
  const router = useRouter();
  const [up, setUp] = useState<DriverInput[]>(pickup.length ? pickup.map(toInput) : [blank()]);
  const [down, setDown] = useState<DriverInput[]>(dropoff.map(toInput));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (set: typeof setUp) => (fn: (list: DriverInput[]) => DriverInput[]) => {
    set(fn);
    setDirty(true);
    setSaved(false);
  };
  const changeUp = change(setUp);
  const changeDown = change(setDown);

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveDrivers(token, up, down);
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        setDirty(false);
        router.refresh();
      }
    });
  };

  return (
    <form
      className="visit-card glass glass-strong visit-form drivers-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <h2>Drivers</h2>
        <p className="visit-lead">
          Add whoever you have so far. Every box is optional and you can come back to add or change drivers at any time.
        </p>
      </div>

      <DriverGroup
        icon={<PlaneLanding size={18} />}
        title="Airport pickup"
        prefix="up"
        list={up}
        onChange={changeUp}
        addLabel="Add another pickup driver"
      />

      <DriverGroup
        icon={<PlaneTakeoff size={18} />}
        title="Airport drop-off"
        optional
        prefix="down"
        list={down}
        onChange={changeDown}
        addLabel={down.length ? "Add another drop-off driver" : "Add a drop-off driver"}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="visit-submit">
        {saved && !dirty && (
          <span className="visit-saved" role="status">
            <CheckCircle2 size={17} /> Saved. The MKA Delegations team can see it now.
          </span>
        )}
        {!saved && !dirty && savedAt && (
          <span className="muted-note">
            Last saved{" "}
            {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(
              new Date(savedAt),
            )}{" "}
            (UK time)
          </span>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save drivers"}
        </button>
      </div>
    </form>
  );
}

function DriverGroup({
  icon,
  title,
  optional,
  prefix,
  list,
  onChange,
  addLabel,
}: {
  icon: React.ReactNode;
  title: string;
  optional?: boolean;
  prefix: string;
  list: DriverInput[];
  onChange: (fn: (list: DriverInput[]) => DriverInput[]) => void;
  addLabel: string;
}) {
  const set = (i: number, key: keyof DriverInput, value: string) =>
    onChange((l) => l.map((row, k) => (k === i ? { ...row, [key]: value } : row)));

  return (
    <fieldset className="visit-group">
      <legend>
        {icon} {title}
        {optional && <span className="optional-tag">Optional</span>}
      </legend>

      {list.length > 0 && (
        <ol className="driver-rows">
          {list.map((row, i) => (
            <li key={i} className="driver-row">
              <span className="driver-num" aria-hidden>
                {i + 1}
              </span>
              <div className="driver-fields">
                <div className="field">
                  <label htmlFor={`${prefix}-${i}-name`}>Full name</label>
                  <input
                    id={`${prefix}-${i}-name`}
                    className="input"
                    maxLength={120}
                    autoComplete="off"
                    value={row.full_name}
                    onChange={(e) => set(i, "full_name", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${prefix}-${i}-aims`}>AIMS number</label>
                  <input
                    id={`${prefix}-${i}-aims`}
                    className="input tnum"
                    inputMode="numeric"
                    maxLength={40}
                    autoComplete="off"
                    value={row.aims}
                    onChange={(e) => set(i, "aims", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${prefix}-${i}-phone`}>Mobile number</label>
                  <input
                    id={`${prefix}-${i}-phone`}
                    className="input"
                    type="tel"
                    inputMode="tel"
                    maxLength={40}
                    autoComplete="off"
                    placeholder="07700 900123"
                    value={row.phone}
                    onChange={(e) => set(i, "phone", e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="icon-link danger driver-remove"
                title="Remove this driver"
                onClick={() => onChange((l) => l.filter((_, k) => k !== i))}
              >
                <Trash2 size={16} />
                <span className="sr-only">Remove driver {i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {list.length < MAX && (
        <button type="button" className="btn btn-sm driver-add" onClick={() => onChange((l) => [...l, blank()])}>
          <Plus size={15} /> {addLabel}
        </button>
      )}
    </fieldset>
  );
}
