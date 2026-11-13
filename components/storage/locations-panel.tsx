"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Pencil, Plus } from "lucide-react";
import { bySite, type Item, type Location } from "@/lib/storage";
import { deleteLocation, saveLocation } from "@/app/(portal)/storage/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";

export function LocationsPanel({ locations, items, canManage }: { locations: Location[]; items: Item[]; canManage: boolean }) {
  const [editing, setEditing] = useState<{ loc: Location | null } | null>(null);
  const unplaced = items.filter((i) => !i.location_id);

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Locations</h2>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ loc: null })}>
            <Plus size={17} /> Add location
          </button>
        )}
      </div>
      <p className="muted-note" style={{ marginBottom: 14 }}>
        Every store and what&apos;s in it. Open one to see its inventory.
      </p>

      {bySite(locations).map(([site, list]) => (
        <div key={site} className="st-site">
          <h3 className="jd-group-title">{site}</h3>
          <ul className="st-locations">
            {list.map((l) => {
              const here = items.filter((i) => i.location_id === l.id);
              const units = here.reduce((n, i) => n + i.quantity, 0);
              const missing = here.reduce((n, i) => n + i.missing_qty, 0);
              const low = here.filter((i) => i.status === "Low stock" || i.status === "Out of stock").length;
              return (
                <li key={l.id} className={`st-location glass ${l.active ? "" : "is-closed"}`}>
                  <Link href={`/storage?location=${l.id}`} className="st-location-link">
                    <span className="doc-icon">
                      <MapPin size={18} />
                    </span>
                    <span className="st-location-text">
                      <strong>{l.name}</strong>
                      <small>
                        {here.length} item{here.length === 1 ? "" : "s"} · {units.toLocaleString("en-GB")} unit{units === 1 ? "" : "s"}
                        {!l.active && " · not in use"}
                      </small>
                      {(missing > 0 || low > 0) && (
                        <small className="st-location-flags">
                          {missing > 0 && <span className="st-missing">{missing} missing</span>}
                          {low > 0 && <span className="st-low">{low} low or out</span>}
                        </small>
                      )}
                      {l.notes && <small className="muted">{l.notes}</small>}
                    </span>
                  </Link>
                  {canManage && (
                    <button type="button" className="icon-link" title="Edit" onClick={() => setEditing({ loc: l })}>
                      <Pencil size={15} />
                      <span className="sr-only">Edit {l.name}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {unplaced.length > 0 && (
        <p className="muted-note" style={{ marginTop: 14 }}>
          <Link href="/storage?location=none">
            {unplaced.length} item{unplaced.length === 1 ? " has" : "s have"} no location set
          </Link>
          .
        </p>
      )}

      {editing && <LocationDialog loc={editing.loc} sites={[...new Set(locations.map((l) => l.site).filter((s): s is string => Boolean(s)))]} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LocationDialog({ loc: l, sites, onClose }: { loc: Location | null; sites: string[]; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={l ? `Edit ${l.name}` : "Add a location"} subtitle="Locations are grouped by site." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveLocation(l?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="lc-name">
              Name<span className="req">*</span>
            </label>
            <input id="lc-name" name="name" className="input" required maxLength={120} defaultValue={l?.name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="lc-site">Site</label>
            <input id="lc-site" name="site" className="input" list="st-sites" maxLength={120} defaultValue={l?.site ?? ""} placeholder="e.g. Baitul Futuh" />
            <datalist id="st-sites">
              {sites.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="lc-pos">Order</label>
            <input id="lc-pos" name="position" className="input" type="number" min={0} defaultValue={l?.position ?? 200} />
          </div>
          <div className="field wide">
            <label htmlFor="lc-notes">Notes</label>
            <textarea id="lc-notes" name="notes" className="textarea" maxLength={1000} defaultValue={l?.notes ?? ""} placeholder="Access, who holds the key…" />
          </div>
          {l && (
            <label className="check wide">
              <input type="checkbox" name="closed" defaultChecked={!l.active} />
              <span>
                <strong>No longer in use</strong>
                <small>Hidden when choosing where an item is kept.</small>
              </span>
            </label>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {l && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove ${l.name}?`) && run(() => deleteLocation(l.id), onClose)}>
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
