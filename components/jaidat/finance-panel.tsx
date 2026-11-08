"use client";

import { useState } from "react";
import { Check, Paperclip, Plus, Search, X } from "lucide-react";
import {
  COST_CATEGORIES,
  COST_STATUSES,
  money,
  num,
  shortName,
  todayISO,
  type Cost,
  type Issue,
  type JaidatFile,
  type Property,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { decideCost, deleteCost, saveCost } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill } from "./bits";
import { AddDocument, DocList } from "./files";

/** The MKA year runs from 1 November. */
function yearStart(today: string) {
  const y = Number(today.slice(0, 4)) - (today.slice(5) >= "11-01" ? 0 : 1);
  return `${y}-11-01`;
}

const amount = (c: Cost) => num(c.status === "Paid" ? (c.paid ?? c.approved ?? c.proposed) : c.status === "Approved" ? (c.approved ?? c.proposed) : c.proposed);

export function FinancePanel({
  costs,
  properties,
  issues,
  files,
  propertyId,
  canManage,
}: {
  costs: Cost[];
  properties: Property[];
  issues: Issue[];
  files: JaidatFile[];
  propertyId?: string;
  canManage: boolean;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const from = yearStart(today);
  const [status, setStatus] = useState<string | null>(null);
  const [place, setPlace] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ cost: Cost | null } | null>(null);
  const { pending, error, run } = useRun();

  const name = (pid: string | null) => (pid ? shortName(properties.find((p) => p.id === pid)) : "General");
  const proposed = costs.filter((c) => c.status === "Proposed");
  // Budgets are allowances, not spending: they're left out of the money totals.
  const spending = costs.filter((c) => c.category !== "Budget");
  const approvedUnpaid = spending.filter((c) => c.status === "Approved");
  const paidYear = spending.filter((c) => c.status === "Paid" && (c.paid_on ?? c.approved_on ?? c.created_at.slice(0, 10)) >= from);
  const sum = (list: Cost[]) => list.reduce((n, c) => n + amount(c), 0);

  const q = query.trim().toLowerCase();
  const visible = costs.filter(
    (c) =>
      (!status || c.status === status) &&
      (!place || (place === "general" ? !c.property_id : c.property_id === place)) &&
      (!q || [c.description, c.supplier, c.invoice_number, c.category].join(" ").toLowerCase().includes(q)),
  );

  const byProperty = properties
    .filter((p) => !propertyId || p.id === propertyId)
    .map((p) => {
      const mine = costs.filter((c) => c.property_id === p.id && (c.created_at.slice(0, 10) >= from || c.status !== "Paid"));
      const budget = mine.filter((c) => c.category === "Budget").reduce((n, c) => n + num(c.approved ?? c.proposed), 0);
      const spend = mine.filter((c) => c.category !== "Budget");
      return {
        p,
        budget,
        proposed: sum(spend.filter((c) => c.status === "Proposed")),
        approved: sum(spend.filter((c) => c.status === "Approved")),
        paid: sum(spend.filter((c) => c.status === "Paid")),
      };
    });

  return (
    <>
      <section className="stats" aria-label="Finance summary">
        <div className="stat glass is-accent">
          <strong>{money(sum(proposed.filter((c) => c.category !== "Budget")))}</strong>
          <span>
            {proposed.length} waiting for approval
          </span>
        </div>
        <div className="stat glass">
          <strong>{money(sum(approvedUnpaid))}</strong>
          <span>approved, not yet paid</span>
        </div>
        <div className="stat glass">
          <strong>{money(sum(paidYear))}</strong>
          <span>paid since {formatDate(from)}</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: costs.some((c) => c.status !== "Paid" && c.status !== "Rejected" && c.due_date && c.due_date < today) ? "var(--danger)" : undefined }}>
            {costs.filter((c) => c.status !== "Paid" && c.status !== "Rejected" && c.due_date && c.due_date < today).length}
          </strong>
          <span>payments past due</span>
        </div>
      </section>

      <p className="jd-callout">
        <Check size={18} />
        <span>
          Only the appointed Jaidad department admin can approve, reject or mark costs as paid. Proposed, approved and paid amounts are kept separately.
        </span>
      </p>

      {proposed.length > 0 && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>
              Waiting for approval <span className="count-badge">{proposed.length}</span>
            </h2>
          </div>
          <ul className="jd-approvals">
            {proposed.map((c) => (
              <li key={c.id}>
                <button type="button" className="jd-linkish" onClick={() => setEditing({ cost: c })}>
                  <strong>{c.description}</strong>
                  <small>
                    {[name(c.property_id), c.category, c.supplier, c.due_date ? `due ${formatDate(c.due_date)}` : null, c.creator?.full_name ? `by ${c.creator.full_name}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
                <b className="tnum">{c.proposed != null ? money(num(c.proposed)) : "No amount"}</b>
                {canManage ? (
                  <span className="toolbar">
                    <button type="button" className="btn btn-sm jd-done-btn" disabled={pending} onClick={() => run(() => decideCost(c.id, "Approved"))}>
                      <Check size={15} /> Approve
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => window.confirm(`Reject "${c.description}"?`) && run(() => decideCost(c.id, "Rejected"))}>
                      <X size={15} /> Reject
                    </button>
                  </span>
                ) : (
                  <Pill value="Proposed" />
                )}
              </li>
            ))}
          </ul>
          <FormError error={error} />
        </section>
      )}

      <section className="panel glass">
        <div className="panel-head">
          <h2>Costs and invoices</h2>
          <div className="toolbar">
            {!propertyId && (
              <select className="select jd-filter" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Property">
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {shortName(p)}
                  </option>
                ))}
                <option value="general">General</option>
              </select>
            )}
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search costs</span>
              <input className="input" type="search" placeholder="Description, supplier, invoice" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ cost: null })}>
                <Plus size={18} /> Add cost
              </button>
            )}
          </div>
        </div>
        <div className="chips" role="group" aria-label="Status">
          <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
            All <em>{costs.length}</em>
          </button>
          {COST_STATUSES.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
              {s} <em>{costs.filter((c) => c.status === s).length}</em>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty title={costs.length ? "Nothing here" : "No costs yet"}>
            {costs.length ? "Try another filter." : "Record budgets, bills, invoices and repair costs. Keep invoices as attachments, never bank details."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Description</th>
                  {!propertyId && <th>Property</th>}
                  <th>Category</th>
                  <th>Proposed</th>
                  <th>Approved</th>
                  <th>Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const attached = files.filter((f) => f.cost_id === c.id).length;
                  const late = c.status !== "Paid" && c.status !== "Rejected" && c.due_date && c.due_date < today;
                  return (
                    <tr key={c.id} onClick={() => setEditing({ cost: c })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing({ cost: c })}>
                      <td>
                        {c.description}
                        <small className="jd-cell-sub">
                          {[c.supplier, c.invoice_number ? `Invoice ${c.invoice_number}` : null, c.due_date ? `${late ? "Overdue · " : ""}due ${formatDate(c.due_date)}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                          {attached > 0 && (
                            <>
                              {" "}
                              <Paperclip size={11} /> {attached}
                            </>
                          )}
                        </small>
                      </td>
                      {!propertyId && <td>{name(c.property_id)}</td>}
                      <td>{c.category}</td>
                      <td className="tnum">{c.proposed != null ? money(num(c.proposed)) : "—"}</td>
                      <td className="tnum">{c.approved != null ? money(num(c.approved)) : "—"}</td>
                      <td className="tnum">{c.paid != null ? money(num(c.paid)) : "—"}</td>
                      <td>
                        <Pill value={c.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {byProperty.length > 0 && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>Budget against spend since {formatDate(from)}</h2>
          </div>
          <div className="table-wrap">
            <table className="records static">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Budget</th>
                  <th>Proposed</th>
                  <th>Approved</th>
                  <th>Paid</th>
                  <th>Left in budget</th>
                </tr>
              </thead>
              <tbody>
                {byProperty.map((r) => (
                  <tr key={r.p.id}>
                    <td>{shortName(r.p)}</td>
                    <td className="tnum">{r.budget ? money(r.budget) : "—"}</td>
                    <td className="tnum">{money(r.proposed)}</td>
                    <td className="tnum">{money(r.approved)}</td>
                    <td className="tnum">{money(r.paid)}</td>
                    <td className={`tnum ${r.budget && r.budget - r.paid - r.approved < 0 ? "jd-late" : ""}`}>{r.budget ? money(r.budget - r.paid - r.approved) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted-note" style={{ marginTop: 10 }}>
            Add a cost with the category Budget to set a property&apos;s budget for the year.
          </p>
        </section>
      )}

      {editing && (
        <CostDialog
          cost={editing.cost}
          properties={properties}
          issues={issues}
          defaultProperty={propertyId}
          files={editing.cost ? files.filter((f) => f.cost_id === editing.cost!.id) : []}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CostDialog({
  cost: c,
  properties,
  issues,
  defaultProperty,
  files,
  canManage,
  onClose,
}: {
  cost: Cost | null;
  properties: Property[];
  issues: Issue[];
  defaultProperty?: string;
  files: JaidatFile[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [status, setStatus] = useState(c?.status ?? "Proposed");
  const [propertyId, setPropertyId] = useState(c?.property_id ?? defaultProperty ?? "");
  const tickets = issues.filter((i) => !propertyId || i.property_id === propertyId || i.id === c?.issue_id);

  return (
    <Sheet
      title={c ? c.description : "Add a cost"}
      subtitle={
        c?.approved_by
          ? `${c.status === "Rejected" ? "Rejected" : "Approved"} by ${c.approved_by}${c.approved_on ? ` on ${formatDate(c.approved_on)}` : ""}`
          : "Budgets, bills, invoices and repair costs. Don't record bank or account numbers."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveCost(c?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="k-desc">
              Description<span className="req">*</span>
            </label>
            <input id="k-desc" name="description" className="input" required defaultValue={c?.description ?? ""} placeholder="e.g. Boiler service, October" />
          </div>
          <div className="field">
            <label htmlFor="k-prop">Property</label>
            <select id="k-prop" name="property_id" className="select" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">General (no single property)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="k-cat">Category</label>
            <select id="k-cat" name="category" className="select" defaultValue={c?.category ?? "Maintenance"}>
              {COST_CATEGORIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="k-sup">Supplier</label>
            <input id="k-sup" name="supplier" className="input" defaultValue={c?.supplier ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="k-inv">Invoice number</label>
            <input id="k-inv" name="invoice_number" className="input" defaultValue={c?.invoice_number ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="k-idate">Invoice date</label>
            <input id="k-idate" name="invoice_date" type="date" className="input" defaultValue={c?.invoice_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="k-due">Payment due</label>
            <input id="k-due" name="due_date" type="date" className="input" defaultValue={c?.due_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="k-prop-amt">Amount proposed (£)</label>
            <input id="k-prop-amt" name="proposed" className="input tnum" inputMode="decimal" defaultValue={c?.proposed != null ? num(c.proposed) : ""} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="k-ticket">Ticket</label>
            <select id="k-ticket" name="issue_id" className="select" defaultValue={c?.issue_id ?? ""}>
              <option value="">None</option>
              {tickets.slice(0, 200).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} · {i.title}
                </option>
              ))}
            </select>
          </div>

          {canManage ? (
            <>
              <p className="label wide jd-form-sep">Decision (department admin)</p>
              <div className="field">
                <label htmlFor="k-status">Status</label>
                <select id="k-status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {COST_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="k-appr">Amount approved (£)</label>
                <input id="k-appr" name="approved" className="input tnum" inputMode="decimal" defaultValue={c?.approved != null ? num(c.approved) : ""} placeholder="Same as proposed" />
              </div>
              {status === "Paid" && (
                <>
                  <div className="field">
                    <label htmlFor="k-paid">Amount paid (£)</label>
                    <input id="k-paid" name="paid" className="input tnum" inputMode="decimal" defaultValue={c?.paid != null ? num(c.paid) : ""} placeholder="Same as approved" />
                  </div>
                  <div className="field">
                    <label htmlFor="k-paidon">Paid on</label>
                    <input id="k-paidon" name="paid_on" type="date" className="input" defaultValue={c?.paid_on ?? todayISO()} />
                  </div>
                </>
              )}
            </>
          ) : (
            c && (
              <p className="muted-note wide">
                Status: <Pill value={c.status} /> {c.status === "Proposed" && "· waiting for the department admin."}
              </p>
            )
          )}
          <div className="field wide">
            <label htmlFor="k-notes">Notes</label>
            <textarea id="k-notes" name="notes" className="textarea" defaultValue={c?.notes ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {c && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove "${c.description}"?`) && run(() => deleteCost(c.id), onClose)}>
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : c ? "Save changes" : "Add cost"}
            </button>
          </div>
        </div>
      </form>
      {c && (
        <div className="jd-sheet-extra">
          <section className="jd-sub">
            <div className="jd-sub-head">
              <h3>Invoice and receipts</h3>
              <AddDocument propertyId={c.property_id} links={{ cost_id: c.id }} category="Finance" label="Attach" small title={c.invoice_number ? `Invoice ${c.invoice_number}` : c.description} />
            </div>
            <DocList files={files} canDelete={canManage} empty="No invoice attached yet." compact />
          </section>
        </div>
      )}
    </Sheet>
  );
}
