"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarClock, Paperclip, Plus, ShieldCheck, UserRound } from "lucide-react";
import {
  APPLICABILITY,
  EVIDENCE_STATUSES,
  complianceState,
  intervalLabel,
  nextDueFrom,
  relDays,
  shortName,
  todayISO,
  type CatalogueItem,
  type ComplianceItem,
  type ComplianceState,
  type JaidatFile,
  type Property,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteCompliance, saveCompliance, setApplicability } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill } from "./bits";
import { AddDocument, DocList } from "./files";

const STATES: ComplianceState[] = ["Overdue", "Due soon", "Awaiting evidence", "To decide", "Compliant", "Not applicable"];
const ORDER = Object.fromEntries(STATES.map((s, i) => [s, i])) as Record<ComplianceState, number>;

/** The compliance register for one property. */
export function CompliancePanel({
  property,
  items,
  catalogue,
  files,
  canManage,
  openId,
}: {
  property: Property;
  items: ComplianceItem[];
  catalogue: CatalogueItem[];
  files: JaidatFile[];
  canManage: boolean;
  openId?: string;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [filter, setFilter] = useState<ComplianceState | null>(null);
  const [editing, setEditing] = useState<{ item: ComplianceItem | null } | null>(
    openId && items.some((i) => i.id === openId) ? { item: items.find((i) => i.id === openId)! } : null,
  );
  const { pending, error, run } = useRun();

  const withState = items.map((c) => ({ ...c, state: complianceState(c, today) }));
  const counts = new Map<ComplianceState, number>();
  withState.forEach((c) => counts.set(c.state, (counts.get(c.state) ?? 0) + 1));
  const visible = withState
    .filter((c) => !filter || c.state === filter)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.next_due ?? "9").localeCompare(b.next_due ?? "9") || a.position - b.position);
  const applicable = withState.filter((c) => c.state !== "Not applicable" && c.state !== "To decide").length;

  return (
    <>
      <section className="stats" aria-label="Compliance summary">
        <div className="stat glass is-accent">
          <strong>
            {counts.get("Compliant") ?? 0}
            <small> / {applicable}</small>
          </strong>
          <span>applicable checks verified</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: counts.get("Overdue") ? "var(--danger)" : undefined }}>{counts.get("Overdue") ?? 0}</strong>
          <span>overdue</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: counts.get("Due soon") ? "#9a6600" : undefined }}>{counts.get("Due soon") ?? 0}</strong>
          <span>due in 60 days</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: counts.get("To decide") ? "#9a6600" : undefined }}>{counts.get("To decide") ?? 0}</strong>
          <span>still to decide</span>
        </div>
      </section>

      {property.considerations && (
        <p className="jd-callout">
          <ShieldCheck size={18} />
          <span>
            <strong>{property.name}:</strong> {property.considerations}
          </span>
        </p>
      )}

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Compliance register</h2>
            <p className="muted-note">
              Nothing is assumed. Decide whether each duty applies to this building, then record the last check, the next due date and the evidence.
            </p>
          </div>
          {canEdit && (
            <button type="button" className="btn" onClick={() => setEditing({ item: null })}>
              <Plus size={17} /> Add a check
            </button>
          )}
        </div>

        <div className="chips" role="group" aria-label="Show">
          <button type="button" className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
            All <em>{items.length}</em>
          </button>
          {STATES.filter((s) => counts.get(s)).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={filter === s} onClick={() => setFilter(filter === s ? null : s)}>
              {s} <em>{counts.get(s)}</em>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty title="Nothing here" />
        ) : (
          <ul className="jd-comp-list">
            {visible.map((c) => (
              <li key={c.id} className={`jd-comp is-${c.state.toLowerCase().replace(/\s+/g, "-")}`}>
                <button type="button" className="jd-comp-main" onClick={() => setEditing({ item: c })}>
                  <strong>{c.title}</strong>
                  <small>
                    {c.legislation ?? "Custom check"} · {intervalLabel(c.interval_months)}
                  </small>
                  <span className="task-meta">
                    {c.next_due && (
                      <span className={c.state === "Overdue" ? "jd-late" : ""}>
                        <CalendarClock size={14} /> Next due {formatDate(c.next_due)} ({relDays(c.next_due, today)})
                      </span>
                    )}
                    {c.last_done && <span>Last done {formatDate(c.last_done)}</span>}
                    {c.officer && (
                      <span>
                        <UserRound size={14} /> {c.officer}
                      </span>
                    )}
                    {files.some((f) => f.compliance_id === c.id) && (
                      <span>
                        <Paperclip size={14} /> {files.filter((f) => f.compliance_id === c.id).length} attached
                      </span>
                    )}
                  </span>
                </button>
                <div className="jd-comp-side">
                  {canEdit ? (
                    <div className="jd-applies" role="group" aria-label={`Does ${c.title} apply?`}>
                      {(["Applicable", "Not applicable", "To be confirmed"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={c.applicability === a}
                          disabled={pending}
                          onClick={() => c.applicability !== a && run(() => setApplicability(c.id, a))}
                        >
                          {a === "Applicable" ? "Applies" : a === "Not applicable" ? "N/A" : "?"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Pill value={c.state} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <FormError error={error} />
        <p className="muted-note" style={{ marginTop: 14 }}>
          General guidance only. Check current requirements on gov.uk or hse.gov.uk before relying on them.
        </p>
      </section>

      {editing && (
        <ComplianceDialog
          propertyId={property.id}
          item={editing.item}
          guidance={catalogue.find((k) => k.key === editing.item?.item_key)?.guidance ?? null}
          files={editing.item ? files.filter((f) => f.compliance_id === editing.item!.id) : []}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ComplianceDialog({
  propertyId,
  item,
  guidance,
  files,
  canManage,
  onClose,
}: {
  propertyId: string;
  item: ComplianceItem | null;
  guidance: string | null;
  files: JaidatFile[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const custom = !item || item.item_key.startsWith("custom-");
  const [applies, setApplies] = useState(item?.applicability ?? "To be confirmed");
  const [last, setLast] = useState(item?.last_done ?? "");
  const [every, setEvery] = useState(item?.interval_months ? String(item.interval_months) : "");
  const suggested = nextDueFrom(last || null, Number(every) || item?.interval_months || null);

  return (
    <Sheet title={item ? item.title : "Add a compliance check"} subtitle={item?.legislation ?? "A check or duty that isn't on the standard list."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveCompliance(item?.id ?? null, propertyId, fd), onClose);
        }}
      >
        <div className="sheet-body">
          {guidance && (
            <p className="jd-guidance wide">
              <BookOpen size={16} /> {guidance}
            </p>
          )}
          {custom && (
            <>
              <div className="field wide">
                <label htmlFor="c-title">
                  Check<span className="req">*</span>
                </label>
                <input id="c-title" name="title" className="input" required defaultValue={item?.title ?? ""} placeholder="e.g. Lift inspection (LOLER)" />
              </div>
              <div className="field">
                <label htmlFor="c-law">Legislation</label>
                <input id="c-law" name="legislation" className="input" defaultValue={item?.legislation ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="c-int">How often (months)</label>
                <input id="c-int" name="interval_months" className="input tnum" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} placeholder="e.g. 12" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="c-app">Does it apply?</label>
            <select id="c-app" name="applicability" className="select" value={applies} onChange={(e) => setApplies(e.target.value)}>
              {APPLICABILITY.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-status">Evidence</label>
            <select id="c-status" name="status" className="select" defaultValue={item?.status ?? "Awaiting information"}>
              {EVIDENCE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="c-reason">Reason for the decision</label>
            <input id="c-reason" name="reason" className="input" defaultValue={item?.reason ?? ""} placeholder={applies === "Not applicable" ? "e.g. No gas supply to the building" : "Why it does or doesn't apply"} />
          </div>
          {applies !== "Not applicable" && (
            <>
              <div className="field">
                <label htmlFor="c-last">Last done</label>
                <input id="c-last" name="last_done" type="date" className="input" max={todayISO()} value={last} onChange={(e) => setLast(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="c-next">Next due</label>
                <input id="c-next" name="next_due" type="date" className="input" defaultValue={item?.next_due ?? ""} />
                {suggested && <small className="muted-note">Left blank, it becomes {formatDate(suggested)} ({intervalLabel(Number(every) || item?.interval_months || null).toLowerCase()}).</small>}
              </div>
              <div className="field">
                <label htmlFor="c-off">Responsible officer</label>
                <input id="c-off" name="officer" className="input" list="jaidat-people" defaultValue={item?.officer ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="c-con">Contractor or assessor</label>
                <input id="c-con" name="contractor" className="input" defaultValue={item?.contractor ?? ""} placeholder="Who carried it out" />
              </div>
              <div className="field wide">
                <label htmlFor="c-ev">Certificate or evidence reference</label>
                <input id="c-ev" name="evidence_ref" className="input" defaultValue={item?.evidence_ref ?? ""} placeholder="e.g. Gas Safe record 123456" />
              </div>
            </>
          )}
          <div className="field wide">
            <label htmlFor="c-notes">Defects, remedial actions and notes</label>
            <textarea id="c-notes" name="notes" className="textarea" defaultValue={item?.notes ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {item && canManage && custom && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove ${item.title}?`) && run(() => deleteCompliance(item.id), onClose)}>
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
      {item && (
        <div className="jd-sheet-extra">
          <section className="jd-sub">
            <div className="jd-sub-head">
              <h3>Certificates and evidence</h3>
              <AddDocument propertyId={propertyId} links={{ compliance_id: item.id }} category="Compliance" label="Attach" small title={item.title} />
            </div>
            <DocList files={files} canDelete={canManage} empty="No certificate attached yet." compact />
          </section>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Across all properties ----------

const SHORT: Record<ComplianceState, string> = {
  Compliant: "✓",
  "Due soon": "Soon",
  Overdue: "Late",
  "Awaiting evidence": "Ev.",
  "To decide": "?",
  "Not applicable": "–",
};

/** Every property's compliance at a glance: one row per check, one column per property. */
export function ComplianceMatrix({ properties, items, catalogue }: { properties: Property[]; items: ComplianceItem[]; catalogue: CatalogueItem[] }) {
  const today = todayISO();
  const live = properties.filter((p) => p.status !== "Disposed");
  const rows = catalogue.map((k) => ({ key: k.key, title: k.title }));
  const customs = items.filter((c) => c.item_key.startsWith("custom-"));
  const totals = live.map((p) => {
    const states = items.filter((c) => c.property_id === p.id).map((c) => complianceState(c, today));
    return {
      id: p.id,
      overdue: states.filter((s) => s === "Overdue").length,
      undecided: states.filter((s) => s === "To decide").length,
      ok: states.filter((s) => s === "Compliant").length,
      applicable: states.filter((s) => s !== "To decide" && s !== "Not applicable").length,
    };
  });

  return (
    <section className="panel glass">
      <div className="panel-head">
        <div>
          <h2>Compliance across properties</h2>
          <p className="muted-note">Click a cell to open that check. Each property&apos;s full register is on its own page.</p>
        </div>
        <div className="jd-legend">
          {(["Compliant", "Due soon", "Overdue", "Awaiting evidence", "To decide", "Not applicable"] as ComplianceState[]).map((s) => (
            <span key={s} className={`jd-cell is-${s.toLowerCase().replace(/\s+/g, "-")}`}>
              {SHORT[s]} <i>{s}</i>
            </span>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="records static jd-matrix">
          <thead>
            <tr>
              <th>Check</th>
              {live.map((p) => (
                <th key={p.id}>
                  <Link href={`/jaidat/${p.id}?tab=compliance`}>{shortName(p)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.title}</td>
                {live.map((p) => {
                  const c = items.find((x) => x.property_id === p.id && x.item_key === r.key);
                  if (!c) return <td key={p.id} />;
                  const s = complianceState(c, today);
                  return (
                    <td key={p.id}>
                      <Link
                        href={`/jaidat/${p.id}?tab=compliance&open=${c.id}`}
                        className={`jd-cell is-${s.toLowerCase().replace(/\s+/g, "-")}`}
                        title={`${p.name}: ${c.title} · ${s}${c.next_due ? ` · due ${formatDate(c.next_due)}` : ""}`}
                      >
                        {SHORT[s]}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
            {customs.length > 0 && (
              <tr>
                <td>Other checks</td>
                {live.map((p) => {
                  const mine = customs.filter((c) => c.property_id === p.id);
                  return (
                    <td key={p.id}>
                      {mine.length ? (
                        <Link href={`/jaidat/${p.id}?tab=compliance`} className="jd-cell">
                          {mine.length}
                        </Link>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Verified / applicable</td>
              {totals.map((t) => (
                <td key={t.id} className="tnum">
                  <b>
                    {t.ok}/{t.applicable}
                  </b>
                  {t.overdue > 0 && <small className="jd-late"> · {t.overdue} late</small>}
                  {t.undecided > 0 && <small> · {t.undecided} ?</small>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
