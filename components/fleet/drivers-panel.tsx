"use client";

import { useState } from "react";
import { KeyRound, Pencil, Phone, Plus, Undo2, UserMinus } from "lucide-react";
import { daysUntil, type Driver, type KeyLog } from "@/lib/fleet";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { addDriver, removeDriver, setKeyHolder, updateDriver } from "@/app/(portal)/fleet/actions";
import { Pill } from "./bits";
import { FormError, Sheet, useRun } from "./ui";

export function DriversPanel({
  vehicleId,
  registration,
  drivers,
  pool,
  keyHolderId,
  keyLog,
  canManage,
}: {
  vehicleId: string;
  registration: string;
  drivers: Driver[];
  pool: Driver[];
  keyHolderId: string | null;
  keyLog: KeyLog[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<{ driver: Driver | null } | null>(null);
  const { pending, error, run } = useRun();
  const holder = drivers.find((d) => d.id === keyHolderId);
  const available = pool.filter((p) => !drivers.some((d) => d.id === p.id));

  return (
    <div className="split">
      <section className="panel glass">
        <div className="panel-head">
          <h2>Eligible drivers</h2>
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ driver: null })}>
              <Plus size={18} />
              Add driver
            </button>
          )}
        </div>

        {drivers.length === 0 ? (
          <div className="empty">
            <strong>No drivers yet</strong>
            Add the people allowed to drive {registration}. You can then hand the keys to one of them.
          </div>
        ) : (
          <ul className="driver-list">
            {drivers.map((d) => {
              const hasKeys = d.id === keyHolderId;
              const licence = d.licence_expiry ? daysUntil(d.licence_expiry) : null;
              return (
                <li key={d.id} className={`driver ${hasKeys ? "has-keys" : ""}`}>
                  <span className="avatar">{initials(d.full_name)}</span>
                  <div className="driver-info">
                    <strong>
                      {d.full_name}
                      {hasKeys && (
                        <span className="key-badge">
                          <KeyRound size={13} /> Has the keys
                        </span>
                      )}
                    </strong>
                    <small>
                      {d.phone && (
                        <a href={`tel:${d.phone.replace(/\s+/g, "")}`}>
                          <Phone size={12} /> {d.phone}
                        </a>
                      )}
                      {d.licence_expiry && (
                        <>
                          {" "}
                          <Pill
                            value={licence! < 0 ? "Expired" : licence! <= 30 ? "Expiring soon" : "Valid"}
                            label={`Licence ${licence! < 0 ? "expired" : "to"} ${formatDate(d.licence_expiry)}`}
                          />
                        </>
                      )}
                    </small>
                    {d.notes && <p className="driver-notes">{d.notes}</p>}
                  </div>
                  {canManage && (
                    <div className="driver-actions">
                      {!hasKeys && (
                        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => setKeyHolder(vehicleId, d.id))}>
                          <KeyRound size={15} /> Give keys
                        </button>
                      )}
                      <button type="button" className="icon-link" title="Edit driver" onClick={() => setDialog({ driver: d })}>
                        <Pencil size={16} />
                        <span className="sr-only">Edit {d.full_name}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-link danger"
                        title="Remove from this vehicle"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Remove ${d.full_name} from ${registration}?${hasKeys ? " The keys will be marked as back in the office." : ""}`)) {
                            run(() => removeDriver(vehicleId, d.id));
                          }
                        }}
                      >
                        <UserMinus size={16} />
                        <span className="sr-only">Remove {d.full_name}</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <FormError error={error} />
      </section>

      <div className="stack">
        <section className={`panel glass keys-card ${holder ? "out" : "in"}`}>
          <span className="keys-icon">
            <KeyRound size={26} />
          </span>
          <span className="eyebrow">Keys</span>
          <h2>{holder ? holder.full_name : "In the office"}</h2>
          <p>{holder ? `has the keys to ${registration}` : "Nobody has signed the keys out"}</p>
          {holder && canManage && (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => setKeyHolder(vehicleId, null))}>
              <Undo2 size={16} /> Keys returned
            </button>
          )}
        </section>

        <section className="panel glass">
          <div className="panel-head">
            <h2>Key history</h2>
          </div>
          {keyLog.length === 0 ? (
            <p className="muted-note">No handovers recorded yet.</p>
          ) : (
            <ul className="feed">
              {keyLog.map((k) => (
                <li key={k.id}>
                  <span className="avatar">{k.holder_name === "Office / key safe" ? <KeyRound size={14} /> : initials(k.holder_name)}</span>
                  <div>
                    <p>
                      {k.holder_name === "Office / key safe" ? (
                        <>Keys returned to the <b>office</b></>
                      ) : (
                        <>Keys given to <b>{k.holder_name}</b></>
                      )}
                      {k.changer?.full_name && <> by {k.changer.full_name}</>}
                    </p>
                    <time dateTime={k.changed_at}>{formatDateTime(k.changed_at)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dialog && (
        <DriverDialog vehicleId={vehicleId} driver={dialog.driver} available={available} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function DriverDialog({
  vehicleId,
  driver,
  available,
  onClose,
}: {
  vehicleId: string;
  driver: Driver | null;
  available: Driver[];
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [existing, setExisting] = useState("");
  const isNew = !driver && !existing;

  return (
    <Sheet
      title={driver ? `Edit ${driver.full_name}` : "Add a driver"}
      subtitle={driver ? "Changes apply to every vehicle they can drive." : undefined}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => (driver ? updateDriver(vehicleId, driver.id, fd) : addDriver(vehicleId, fd)), onClose);
        }}
      >
        <div className="sheet-body">
          {!driver && available.length > 0 && (
            <div className="field wide">
              <label htmlFor="d-existing">Someone who already drives another vehicle</label>
              <select id="d-existing" name="driver_id" className="select" value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">No, add someone new</option>
                {available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(driver || isNew) && (
            <>
              <div className="field">
                <label htmlFor="d-name">
                  Full name<span className="req">*</span>
                </label>
                <input id="d-name" name="full_name" className="input" required defaultValue={driver?.full_name} />
              </div>
              <div className="field">
                <label htmlFor="d-phone">Phone</label>
                <input id="d-phone" name="phone" type="tel" className="input" defaultValue={driver?.phone ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="d-licence">Driving licence expiry</label>
                <input id="d-licence" name="licence_expiry" type="date" className="input" defaultValue={driver?.licence_expiry ?? ""} />
              </div>
              <div className="field wide">
                <label htmlFor="d-notes">Notes</label>
                <input id="d-notes" name="notes" className="input" defaultValue={driver?.notes ?? ""} placeholder="e.g. Insured as named driver" />
              </div>
            </>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : driver ? "Save changes" : "Add driver"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
