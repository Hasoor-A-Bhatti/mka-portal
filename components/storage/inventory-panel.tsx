"use client";

import { useEffect, useState } from "react";
import { ArrowDownUp, History, Pencil, Plus, Search } from "lucide-react";
import {
  ADJUSTMENTS,
  CATEGORY_SUGGESTIONS,
  ITEM_STATUSES,
  OWNER_SUGGESTIONS,
  bySite,
  options,
  todayISO,
  type AdjustKind,
  type Item,
  type Loan,
  type Location,
  type Movement,
} from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { adjustStock, deleteItem, itemHistory, saveItem } from "@/app/(portal)/storage/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Pill } from "./bits";

export function InventoryPanel({
  items,
  locations,
  loans,
  canManage,
  initialLocation = "",
}: {
  items: Item[];
  locations: Location[];
  loans: Loan[];
  canManage: boolean;
  initialLocation?: string;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [location, setLocation] = useState(initialLocation);
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [adjusting, setAdjusting] = useState<{ item: Item; kind: AdjustKind } | null>(null);

  useEffect(() => setLocation(initialLocation), [initialLocation]);

  const out = new Map<string, number>();
  for (const l of loans) if (l.item_id && l.status === "Collected") out.set(l.item_id, (out.get(l.item_id) ?? 0) + l.quantity);
  const reserved = new Map<string, number>();
  for (const l of loans) if (l.item_id && l.status === "Approved" && l.end_date >= today) reserved.set(l.item_id, (reserved.get(l.item_id) ?? 0) + l.quantity);

  const owners = options(items.map((i) => i.owned_by));
  const q = query.trim().toLowerCase();
  const inScope = items.filter(
    (i) =>
      (!location || (location === "none" ? !i.location_id : i.location_id === location)) &&
      (!owner || i.owned_by === owner) &&
      (!q || [i.item_name, i.category, i.owned_by, i.location, i.notes].join(" ").toLowerCase().includes(q)),
  );
  const visible = inScope.filter((i) => !status || i.status === status || (status === "Missing" && i.missing_qty > 0));
  const count = (s: string) => inScope.filter((i) => i.status === s || (s === "Missing" && i.missing_qty > 0)).length;
  const units = visible.reduce((n, i) => n + i.quantity, 0);

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Inventory</h2>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ item: null })}>
            <Plus size={17} /> Add item
          </button>
        )}
      </div>

      <div className="jd-filterbar st-filterbar">
        <select className="select jd-filter" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {bySite(locations).map(([site, list]) => (
            <optgroup key={site} label={site}>
              {list.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          ))}
          {items.some((i) => !i.location_id) && <option value="none">No location set</option>}
        </select>
        <select className="select jd-filter" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owned by">
          <option value="">Every owner</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search items</span>
          <input className="input" type="search" placeholder="Item, category, owner" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
          All <em>{inScope.length}</em>
        </button>
        {ITEM_STATUSES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {s === "Missing" ? "Has missing" : s} <em>{count(s)}</em>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <strong>No items yet</strong>
          {canEdit ? "Add each item with where it's kept and which department owns it." : "Nothing has been added yet."}
          {canEdit && (
            <div>
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ item: null })}>
                <Plus size={17} /> Add item
              </button>
            </div>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <strong>No matches</strong>
          Try another location, owner or search.
        </div>
      ) : (
        <>
          <p className="muted-note st-total">
            {visible.length} item{visible.length === 1 ? "" : "s"} · {units.toLocaleString("en-GB")} unit{units === 1 ? "" : "s"} held
          </p>
          <div className="table-wrap">
            <table className="records cards-mobile st-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Owned by</th>
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
                      <small className="st-sub">
                        {[i.category, i.loanable ? null : "Not for loan"].filter(Boolean).join(" · ")}
                      </small>
                    </td>
                    <td data-label="Location">{i.location ?? <span className="muted">Not set</span>}</td>
                    <td data-label="Owned by">{i.owned_by ?? <span className="muted">Not set</span>}</td>
                    <td data-label="Quantity" className="num">
                      <b className="st-qty">{i.quantity.toLocaleString("en-GB")}</b>
                      {i.missing_qty > 0 && <small className="st-missing">{i.missing_qty} missing</small>}
                      {(out.get(i.id) ?? 0) > 0 && <small className="st-out">{out.get(i.id)} on loan</small>}
                      {(reserved.get(i.id) ?? 0) > 0 && <small className="st-out">{reserved.get(i.id)} reserved</small>}
                    </td>
                    <td data-label="Status">
                      <Pill value={i.status} />
                    </td>
                    <td className="st-actions">
                      {canEdit && (
                        <button type="button" className="btn btn-sm" onClick={() => setAdjusting({ item: i, kind: "Added" })} title="Change stock">
                          <ArrowDownUp size={15} /> Stock
                        </button>
                      )}
                      <button type="button" className="icon-link" title={canEdit ? "Edit" : "Details"} onClick={() => setEditing({ item: i })}>
                        {canEdit ? <Pencil size={15} /> : <History size={15} />}
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

      <datalist id="st-categories">
        {options(items.map((i) => i.category), CATEGORY_SUGGESTIONS).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="st-owners">
        {options(items.map((i) => i.owned_by), OWNER_SUGGESTIONS).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {editing && (
        <ItemDialog
          item={editing.item}
          locations={locations}
          canManage={canManage}
          defaultLocation={location && location !== "none" ? location : ""}
          onAdjust={(kind) => editing.item && (setAdjusting({ item: editing.item, kind }), setEditing(null))}
          onClose={() => setEditing(null)}
        />
      )}
      {adjusting && <AdjustDialog item={adjusting.item} initial={adjusting.kind} onClose={() => setAdjusting(null)} />}
    </section>
  );
}

function ItemDialog({
  item: i,
  locations,
  canManage,
  defaultLocation,
  onAdjust,
  onClose,
}: {
  item: Item | null;
  locations: Location[];
  canManage: boolean;
  defaultLocation: string;
  onAdjust: (kind: AdjustKind) => void;
  onClose: () => void;
}) {
  const canEdit = useCanEdit();
  const { pending, error, run } = useRun();
  const [history, setHistory] = useState<Movement[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!i) return;
    itemHistory(i.id).then((r) => (r.error ? setHistoryError(r.error) : setHistory(r.rows ?? [])));
  }, [i]);

  return (
    <Sheet title={i ? `Edit ${i.item_name}` : "Add an item"} subtitle={i ? `${i.quantity} held${i.missing_qty ? ` · ${i.missing_qty} missing` : ""}` : "Where it's kept and who it belongs to."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveItem(i?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="it-name">
              Item<span className="req">*</span>
            </label>
            <input id="it-name" name="item_name" className="input" required maxLength={160} defaultValue={i?.item_name ?? ""} placeholder="e.g. 3×3m gazebo" />
          </div>
          <div className="field">
            <label htmlFor="it-loc">Location</label>
            <select id="it-loc" name="location_id" className="select" defaultValue={i?.location_id ?? defaultLocation}>
              <option value="">Not set</option>
              {bySite(locations).map(([site, list]) => (
                <optgroup key={site} label={site}>
                  {list
                    .filter((l) => l.active || l.id === i?.location_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="it-owner">Owned by</label>
            <input id="it-owner" name="owned_by" className="input" list="st-owners" maxLength={120} defaultValue={i?.owned_by ?? ""} placeholder="Department it belongs to" />
          </div>
          <div className="field">
            <label htmlFor="it-cat">Category</label>
            <input id="it-cat" name="category" className="input" list="st-categories" maxLength={80} defaultValue={i?.category ?? ""} />
          </div>
          {i ? (
            <div className="field">
              <span className="label">Quantity</span>
              <div className="st-qty-row">
                <b>{i.quantity}</b>
                {canEdit && (
                  <button type="button" className="btn btn-sm" onClick={() => onAdjust("Added")}>
                    <ArrowDownUp size={14} /> Change stock
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="it-qty">
                Quantity<span className="req">*</span>
              </label>
              <input id="it-qty" name="quantity" className="input" type="number" inputMode="numeric" min={0} max={1000000} required defaultValue={1} />
            </div>
          )}
          <div className="field">
            <label htmlFor="it-min">Low stock at</label>
            <input id="it-min" name="min_qty" className="input" type="number" inputMode="numeric" min={0} defaultValue={i?.min_qty ?? ""} placeholder="Optional" />
          </div>
          <label className="check wide">
            <input type="checkbox" name="loanable" defaultChecked={i?.loanable ?? true} />
            <span>
              <strong>Can be borrowed</strong>
              <small>Shows in Equipment Loans so department leads can ask to borrow it.</small>
            </span>
          </label>
          <div className="field wide">
            <label htmlFor="it-notes">Notes</label>
            <textarea id="it-notes" name="notes" className="textarea" maxLength={2000} defaultValue={i?.notes ?? ""} placeholder="Condition, size, which shelf…" />
          </div>
          <FormError error={error} />

          {i && (
            <div className="wide st-history">
              <h3>
                <History size={15} /> Stock history
              </h3>
              {historyError ? (
                <p className="form-error">{historyError}</p>
              ) : !history ? (
                <p className="muted-note">Loading…</p>
              ) : history.length === 0 ? (
                <p className="muted-note">No changes recorded yet.</p>
              ) : (
                <ul>
                  {history.map((m) => (
                    <li key={m.id}>
                      <span className={`st-change ${m.change > 0 ? "up" : m.change < 0 ? "down" : ""}`}>
                        {m.kind === "Moved" ? "Moved" : m.change > 0 ? `+${m.change}` : m.change < 0 ? m.change : "·"}
                      </span>
                      <div>
                        <strong>{m.kind === "Created" ? "Added to the catalogue" : m.kind}</strong>
                        {m.note && <span> · {m.note}</span>}
                        <small>
                          {m.actor_name ?? "Someone"} · {formatDateTime(m.created_at)}
                          {m.quantity_after != null && ` · ${m.quantity_after} held`}
                          {m.missing_after ? `, ${m.missing_after} missing` : ""}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="sheet-foot">
          {i && canManage && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              disabled={pending}
              onClick={() => window.confirm(`Remove ${i.item_name} from the catalogue? Its history goes too. Past loan requests keep its name.`) && run(() => deleteItem(i.id), onClose)}
            >
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

function AdjustDialog({ item: i, initial, onClose }: { item: Item; initial: AdjustKind; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [kind, setKind] = useState<AdjustKind>(initial);
  const [amount, setAmount] = useState(kind === "Stock take" ? i.quantity : 1);
  const [note, setNote] = useState("");
  const offered = ADJUSTMENTS.filter((a) => !["Found", "Written off"].includes(a.kind) || i.missing_qty > 0);
  const max = kind === "Removed" || kind === "Missing" ? i.quantity : kind === "Found" || kind === "Written off" ? i.missing_qty : 1_000_000;

  let after = i.quantity;
  let missingAfter = i.missing_qty;
  if (kind === "Added") after += amount;
  if (kind === "Removed") after -= amount;
  if (kind === "Missing") (after -= amount), (missingAfter += amount);
  if (kind === "Found") (after += amount), (missingAfter -= amount);
  if (kind === "Written off") missingAfter -= amount;
  if (kind === "Stock take") after = amount;

  return (
    <Sheet title={`Change stock: ${i.item_name}`} subtitle={`${i.quantity} held${i.missing_qty ? ` · ${i.missing_qty} missing` : ""}${i.location ? ` · ${i.location}` : ""}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => adjustStock(i.id, kind, amount, note), onClose);
        }}
      >
        <div className="sheet-body">
          <fieldset className="wide st-kinds">
            <legend className="label">What&apos;s changed?</legend>
            {offered.map((a) => (
              <label key={a.kind} className={`st-kind ${kind === a.kind ? "is-on" : ""}`}>
                <input
                  type="radio"
                  name="kind"
                  value={a.kind}
                  checked={kind === a.kind}
                  onChange={() => {
                    setKind(a.kind);
                    setAmount(a.kind === "Stock take" ? i.quantity : a.kind === "Found" || a.kind === "Written off" ? Math.min(1, i.missing_qty) : 1);
                  }}
                />
                <span>
                  <strong>{a.label}</strong>
                  <small>{a.help}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="adj-n">{kind === "Stock take" ? "Counted" : "How many"}</label>
            <input
              id="adj-n"
              className="input"
              type="number"
              inputMode="numeric"
              min={kind === "Stock take" ? 0 : 1}
              max={max}
              required
              value={Number.isNaN(amount) ? "" : amount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
            />
          </div>
          <div className="field st-after">
            <span className="label">After this</span>
            <p>
              <b>{Math.max(after, 0)}</b> held
              {missingAfter > 0 && (
                <>
                  {" "}
                  · <b>{missingAfter}</b> missing
                </>
              )}
            </p>
          </div>
          <div className="field wide">
            <label htmlFor="adj-note">Note</label>
            <input
              id="adj-note"
              className="input"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "Missing" ? "Where it was last seen" : kind === "Added" ? "Bought, donated, moved in…" : "Optional"}
            />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || amount > max || (kind !== "Stock take" && amount < 1)}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
