"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { PROPERTY_STATUSES, PROPERTY_TYPES, num, type Property } from "@/lib/jaidat";
import { deleteProperty, saveProperty } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

export function PropertyButton({ property, canDelete = false }: { property?: Property; canDelete?: boolean }) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  if (!canEdit && !property) return null;
  return (
    <>
      <button type="button" className={`btn ${property ? "" : "btn-primary"}`} onClick={() => setOpen(true)}>
        {property ? <Pencil size={16} /> : <Plus size={18} />}
        {property ? (canEdit ? "Edit property" : "Property details") : "Add property"}
      </button>
      {open && <PropertyDialog property={property} canDelete={canDelete} onClose={() => setOpen(false)} />}
    </>
  );
}

function PropertyDialog({ property: p, canDelete, onClose }: { property?: Property; canDelete: boolean; onClose: () => void }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [type, setType] = useState(p?.property_type ?? "Office");
  const rented = type === "MKA-owned, rented out" || type === "Privately rented" || type === "Managed accommodation";
  const types = p?.property_type && !(PROPERTY_TYPES as readonly string[]).includes(p.property_type) ? [p.property_type, ...PROPERTY_TYPES] : PROPERTY_TYPES;

  const remove = () => {
    if (!p) return;
    if (
      !window.confirm(
        `Remove ${p.name} and everything recorded for it (checklist, compliance, insurance, inspections, documents)? ` +
          `Tickets and costs are kept without a property. If it's no longer used, set its status to Disposed instead.`,
      )
    )
      return;
    run(() => deleteProperty(p.id), () => router.push("/jaidat"));
  };

  return (
    <Sheet title={p ? `Edit ${p.name}` : "Add a property"} subtitle={p ? p.reference : "It gets a JP reference, a records checklist and a compliance register."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(
            () => saveProperty(p?.id ?? null, fd),
            () => onClose(),
          );
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="p-name">
              Name<span className="req">*</span>
            </label>
            <input id="p-name" name="name" className="input" required defaultValue={p?.name} placeholder="e.g. Sarai Masroor" />
          </div>
          <div className="field">
            <label htmlFor="p-short">Short name</label>
            <input id="p-short" name="short_name" className="input" defaultValue={p?.short_name ?? ""} placeholder="e.g. SeM" />
          </div>
          <div className="field">
            <label htmlFor="p-status">Status</label>
            <select id="p-status" name="status" className="select" defaultValue={p?.status ?? "Active"}>
              {PROPERTY_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-type">Type</label>
            <select id="p-type" name="property_type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-use">Used as</label>
            <input id="p-use" name="use_description" className="input" defaultValue={p?.use_description ?? ""} placeholder="e.g. Khuddam office" />
          </div>
          <div className="field wide">
            <label htmlFor="p-addr">Full address</label>
            <input id="p-addr" name="address" className="input" defaultValue={p?.address ?? ""} placeholder="Street, town, postcode" />
          </div>
          <label className="check wide">
            <input type="checkbox" name="address_verified" defaultChecked={p?.address_verified ?? false} />
            <span>
              <strong>Address verified</strong>
              <small>Directions show once the address has been checked against the title or lease.</small>
            </span>
          </label>
          <div className="field">
            <label htmlFor="p-loc">Area</label>
            <input id="p-loc" name="location" className="input" defaultValue={p?.location ?? ""} placeholder="e.g. Farnham" />
          </div>
          <div className="field">
            <label htmlFor="p-own">Ownership</label>
            <input id="p-own" name="ownership" className="input" defaultValue={p?.ownership ?? ""} placeholder="e.g. MKA UK (freehold)" />
          </div>
          <div className="field">
            <label htmlFor="p-care">Caretaker or key holder</label>
            <input id="p-care" name="caretaker" className="input" list="jaidat-people" defaultValue={p?.caretaker ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="p-carep">Their phone</label>
            <input id="p-carep" name="caretaker_phone" className="input" type="tel" defaultValue={p?.caretaker_phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="p-cap">Capacity (people)</label>
            <input id="p-cap" name="capacity" className="input tnum" inputMode="numeric" defaultValue={p?.capacity ?? ""} />
          </div>
          <label className="check">
            <input type="checkbox" name="initial_scope" defaultChecked={p?.initial_scope ?? false} />
            <span>
              <strong>First phase</strong>
              <small>Records collected first</small>
            </span>
          </label>

          {(rented || p?.lease_party || p?.lease_end) && (
            <>
              <p className="label wide jd-form-sep">Lease or tenancy</p>
              <div className="field wide">
                <label htmlFor="p-party">{type === "MKA-owned, rented out" ? "Tenant" : "Landlord or agent"}</label>
                <input id="p-party" name="lease_party" className="input" defaultValue={p?.lease_party ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="p-ls">Starts</label>
                <input id="p-ls" name="lease_start" type="date" className="input" defaultValue={p?.lease_start ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="p-le">Ends</label>
                <input id="p-le" name="lease_end" type="date" className="input" defaultValue={p?.lease_end ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="p-rent">Rent per month (£)</label>
                <input id="p-rent" name="rent_monthly" className="input tnum" inputMode="decimal" defaultValue={p?.rent_monthly != null ? num(p.rent_monthly) : ""} />
              </div>
            </>
          )}

          <div className="field wide">
            <label htmlFor="p-cons">What to keep in mind</label>
            <textarea
              id="p-cons"
              name="considerations"
              className="textarea"
              defaultValue={p?.considerations ?? ""}
              placeholder="The duties that matter for how this building is used"
            />
          </div>
          <div className="field wide">
            <label htmlFor="p-notes">Notes</label>
            <textarea id="p-notes" name="notes" className="textarea" defaultValue={p?.notes ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {p && canDelete && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={pending}>
              Remove property
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : p ? "Save changes" : "Add property"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
