"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { VEHICLE_STATUSES, VEHICLE_TYPES, todayISO, type Vehicle } from "@/lib/fleet";
import { deleteVehicle, saveVehicle } from "@/app/(portal)/fleet/actions";
import { FormError, Sheet, useRun } from "./ui";

export function VehicleButton({ vehicle }: { vehicle?: Vehicle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${vehicle ? "" : "btn-primary"}`} onClick={() => setOpen(true)}>
        {vehicle ? <Pencil size={16} /> : <Plus size={18} />}
        {vehicle ? "Edit vehicle" : "Add vehicle"}
      </button>
      {open && <VehicleDialog vehicle={vehicle} onClose={() => setOpen(false)} />}
    </>
  );
}

function VehicleDialog({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const thisYear = Number(todayISO().slice(0, 4));

  const remove = () => {
    if (!vehicle) return;
    if (
      !window.confirm(
        `Remove ${vehicle.registration} and everything recorded for it (documents, mileage, maintenance, incidents)? ` +
          `If it's been sold, set its status to Sold instead to keep its history.`,
      )
    )
      return;
    run(() => deleteVehicle(vehicle.id), () => router.push("/fleet"));
  };

  return (
    <Sheet title={vehicle ? `Edit ${vehicle.registration}` : "Add a vehicle"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveVehicle(vehicle?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="v-reg">
              Registration<span className="req">*</span>
            </label>
            <input id="v-reg" name="registration" className="input" required defaultValue={vehicle?.registration} placeholder="AB12 CDE" style={{ textTransform: "uppercase" }} />
          </div>
          <div className="field">
            <label htmlFor="v-status">Status</label>
            <select id="v-status" name="status" className="select" defaultValue={vehicle?.status ?? "Active"}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="v-name">
              Name (make and model)<span className="req">*</span>
            </label>
            <input id="v-name" name="make_model" className="input" required defaultValue={vehicle?.make_model ?? ""} placeholder="e.g. Toyota Prius T Spirit" />
          </div>
          <div className="field">
            <label htmlFor="v-type">Type</label>
            <select id="v-type" name="vehicle_type" className="select" defaultValue={vehicle?.vehicle_type ?? "Car"}>
              {VEHICLE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="v-year">Year first registered</label>
            <input id="v-year" name="year" type="number" min={1900} max={thisYear} className="input" defaultValue={vehicle?.year ?? ""} placeholder={String(thisYear - 5)} />
          </div>
          <div className="field wide">
            <label htmlFor="v-notes">Notes</label>
            <textarea id="v-notes" name="notes" className="textarea" defaultValue={vehicle?.notes ?? ""} />
          </div>
          {!vehicle && (
            <p className="muted-note wide">
              Mileage starts at 000000. Log the first odometer reading from the vehicle's Mileage tab.
            </p>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {vehicle && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={pending}>
              Remove vehicle
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : vehicle ? "Save changes" : "Add vehicle"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
