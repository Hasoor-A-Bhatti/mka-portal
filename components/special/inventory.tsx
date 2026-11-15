"use client";

import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { statusTone } from "@/lib/departments";
import { SPECIAL_LOCATION_SUGGESTIONS, SPECIAL_STATUSES, type SpecialItem } from "@/lib/special";
import { options } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/format";
import { vars } from "@/lib/css";
import { deleteSpecialItem, saveSpecialItem, setSpecialStatus } from "@/app/(portal)/special-arrangements/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

export function SpecialInventory({ items, canRemove }: { items: SpecialItem[]; canRemove: boolean }) {
  const canEdit = useCanEdit();
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: SpecialItem | null } | null>(null);

  const locations = options(items.map((i) => i.location));
  const q = query.trim().toLowerCase();
  const inScope = items.filter(
    (i) =>
      (!location || (location === "none" ? !i.location : i.location === location)) &&
      (!q || [i.item_name, i.location, i.notes].join(" ").toLowerCase().includes(q)),
  );
  const visible = inScope.filter((i) => !status || i.status === status);
  const units = visible.reduce((n, i) => n + i.quantity, 0);
  const add = () => setEditing({ item: null });

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Inventory</h2>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={add}>
            <Plus size={17} /> Add item
          </button>
        )}
      </div>

      <div className="jd-filterbar st-filterbar">
        <select className="select jd-filter" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l}>{l}</option>
          ))}
          {items.some((i) => !i.location) && <option value="none">No location set</option>}
        </select>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search items</span>
          <input className="input" type="search" placeholder="Item, location, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
          All <em>{inScope.length}</em>
        </button>
        {SPECIAL_STATUSES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {s} <em>{inScope.filter((i) => i.status === s).length}</em>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <strong>No special items yet</strong>
          {canEdit ? "Add each item with how many there are and where it's kept." : "Nothing has been added yet."}
          {canEdit && (
            <div>
              <button type="button" className="btn btn-primary" onClick={add}>
                <Plus size={17} /> Add item
              </button>
            </div>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <strong>No matches</strong>
          Try another location, status or search.
        </div>
      ) : (
        <>
          <p className="muted-note st-total">
            {visible.length} item{visible.length === 1 ? "" : "s"} · {units.toLocaleString("en-GB")} unit{units === 1 ? "" : "s"}
          </p>
          <div className="table-wrap">
            <table className="records cards-mobile st-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th className="num">Quantity</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Item">
                      <button type="button" className="st-item-link" onClick={() => setEditing({ item: i })}>
                        <strong>{i.item_name}</strong>
                      </button>
                      {i.notes && <small className="st-sub sp-notes">{i.notes}</small>}
                    </td>
                    <td data-label="Location">{i.location ?? <span className="muted">Not set</span>}</td>
                    <td data-label="Quantity" className="num">
                      <b className="st-qty">{i.quantity.toLocaleString("en-GB")}</b>
                    </td>
                    <td data-label="Status">
                      <StatusControl key={i.status} item={i} canEdit={canEdit} />
                    </td>
                    <td className="st-actions">
                      <button type="button" className="icon-link" title={canEdit ? "Edit" : "Details"} onClick={() => setEditing({ item: i })}>
                        <Pencil size={15} />
                        <span className="sr-only">
                          {canEdit ? "Edit" : "Details for"} {i.item_name}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <datalist id="sp-locations">
        {options(items.map((i) => i.location), SPECIAL_LOCATION_SUGGESTIONS).map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {editing && <ItemDialog item={editing.item} canRemove={canRemove} defaultLocation={location !== "none" ? location : ""} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** The status, changed straight from the table. */
function StatusControl({ item, canEdit }: { item: SpecialItem; canEdit: boolean }) {
  const { pending, error, run } = useRun();
  const [value, setValue] = useState(item.status);
  const since = <small className="st-sub">since {formatDate(item.status_changed_at)}</small>;

  if (!canEdit) {
    return (
      <>
        <span className="status" style={vars({ "--tone": statusTone(item.status) })}>
          {item.status}
        </span>
        {since}
      </>
    );
  }

  return (
    <>
      <select
        className="select sp-status"
        style={vars({ "--tone": statusTone(value) })}
        value={value}
        disabled={pending}
        aria-label={`Status of ${item.item_name}`}
        onChange={(e) => {
          const next = e.target.value as SpecialItem["status"];
          const before = value;
          setValue(next);
          run(async () => {
            const r = await setSpecialStatus(item.id, next);
            if (r.error) setValue(before);
            return r;
          });
        }}
      >
        {SPECIAL_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {error ? <small className="st-sub st-missing">{error}</small> : since}
    </>
  );
}

function ItemDialog({ item: i, canRemove, defaultLocation, onClose }: { item: SpecialItem | null; canRemove: boolean; defaultLocation: string; onClose: () => void }) {
  const { pending, error, run } = useRun();

  return (
    <Sheet
      title={i ? `Edit ${i.item_name}` : "Add a special item"}
      subtitle={
        i
          ? `Added by ${i.creator?.full_name ?? "unknown"} on ${formatDate(i.created_at)}${
              i.updated_at !== i.created_at ? `. Last changed by ${i.editor?.full_name ?? "unknown"}, ${formatDateTime(i.updated_at)}` : ""
            }.`
          : "What it is, how many, and where it's kept."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSpecialItem(i?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="sp-name">
              Item<span className="req">*</span>
            </label>
            <input id="sp-name" name="item_name" className="input" required maxLength={160} defaultValue={i?.item_name ?? ""} placeholder="e.g. Stage backdrop" />
          </div>
          <div className="field">
            <label htmlFor="sp-qty">
              Quantity<span className="req">*</span>
            </label>
            <input id="sp-qty" name="quantity" className="input" type="number" inputMode="numeric" min={0} max={1000000} required defaultValue={i?.quantity ?? 1} />
          </div>
          <div className="field">
            <label htmlFor="sp-status">Status</label>
            <select id="sp-status" name="status" className="select" defaultValue={i?.status ?? "Available"}>
              {SPECIAL_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="sp-loc">Location</label>
            <input id="sp-loc" name="location" className="input" list="sp-locations" maxLength={160} defaultValue={i?.location ?? defaultLocation} placeholder="Where it's kept" />
          </div>
          <div className="field wide">
            <label htmlFor="sp-notes">Notes</label>
            <textarea id="sp-notes" name="notes" className="textarea" maxLength={2000} defaultValue={i?.notes ?? ""} placeholder="Condition, size, what's damaged…" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {i && canRemove && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              disabled={pending}
              onClick={() => window.confirm(`Remove ${i.item_name}? It stays in the activity log.`) && run(() => deleteSpecialItem(i.id), onClose)}
            >
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : i ? "Save" : "Add item"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
