"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Umbrella } from "lucide-react";
import {
  COVER_TYPES,
  EVIDENCE_STATUSES,
  currentPolicies,
  expectedCovers,
  money,
  num,
  policyState,
  relDays,
  shortName,
  todayISO,
  type JaidatFile,
  type Policy,
  type Property,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deletePolicy, savePolicy } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Pill } from "./bits";
import { AddDocument, DocList } from "./files";

/** Insurance for one property: the covers it should have, and every policy on record. */
export function InsurancePanel({ property, policies, files, canManage }: { property: Property; policies: Policy[]; files: JaidatFile[]; canManage: boolean }) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [editing, setEditing] = useState<{ policy: Policy | null; cover?: string } | null>(null);
  const current = currentPolicies(policies);
  const expected = expectedCovers(property.property_type);
  const extra = [...current.keys()].filter((k) => !expected.includes(k));
  const covers = [...expected, ...extra];
  const premiums = [...current.values()].reduce((n, p) => n + num(p.premium), 0);

  return (
    <>
      <p className="jd-callout">
        <Umbrella size={18} />
        <span>
          Don&apos;t assume a policy exists until the schedule has been seen. Suggested covers for a <strong>{(property.property_type ?? "property").toLowerCase()}</strong>{" "}
          are shown below. Landlord cover only applies where the property is let.
        </span>
      </p>

      <div className="doc-grid">
        {covers.map((cover) => {
          const p = current.get(cover);
          const s = policyState(p, today);
          return (
            <section key={cover} className={`panel glass doc-card jd-cover is-${s.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="doc-head">
                <span className="doc-icon">
                  <Umbrella size={20} />
                </span>
                <div>
                  <h2>{cover}</h2>
                  <p className="doc-sub">{expected.includes(cover) ? "Suggested for this property" : "Also held"}</p>
                </div>
                <Pill value={s} />
              </div>
              {p ? (
                <>
                  <dl className="kv compact">
                    <dt>Insurer</dt>
                    <dd>{p.insurer ?? "Not recorded"}</dd>
                    <dt>Policy number</dt>
                    <dd>{p.policy_number ?? "Not recorded"}</dd>
                    <dt>Renewal</dt>
                    <dd>
                      {p.expires_on ? (
                        <>
                          {formatDate(p.expires_on)} <small>({relDays(p.expires_on, today)})</small>
                        </>
                      ) : (
                        "No date"
                      )}
                    </dd>
                    {p.cover_amount && (
                      <>
                        <dt>Cover</dt>
                        <dd>{p.cover_amount}</dd>
                      </>
                    )}
                    {p.premium != null && (
                      <>
                        <dt>Premium</dt>
                        <dd className="tnum">{money(num(p.premium))}</dd>
                      </>
                    )}
                  </dl>
                  <DocList files={files.filter((f) => f.insurance_id === p.id)} canDelete={canManage} compact />
                  <div className="doc-actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing({ policy: p })}>
                      <Pencil size={14} /> {canEdit ? "Edit policy" : "Details"}
                    </button>
                    <AddDocument propertyId={property.id} links={{ insurance_id: p.id }} category="Insurance" label="Attach schedule" small title={`${cover} insurance schedule`} />
                    {canEdit && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ policy: null, cover })}>
                        <Plus size={14} /> Renewal
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="doc-actions">
                  <p className="muted-note">No policy on record.</p>
                  {canEdit && (
                    <button type="button" className="btn btn-sm" onClick={() => setEditing({ policy: null, cover })}>
                      <Plus size={14} /> Add policy
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="panel glass">
        <div className="panel-head">
          <h2>All policies</h2>
          <div className="toolbar">
            {premiums > 0 && <span className="muted-note">Current premiums: {money(premiums)}</span>}
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ policy: null })}>
                <Plus size={18} /> Add policy
              </button>
            )}
          </div>
        </div>
        {policies.length === 0 ? (
          <p className="muted-note">No policies recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Cover</th>
                  <th>Insurer</th>
                  <th>Policy</th>
                  <th>Runs</th>
                  <th>Evidence</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {[...policies]
                  .sort((a, b) => (b.expires_on ?? "").localeCompare(a.expires_on ?? ""))
                  .map((p) => (
                    <tr key={p.id} onClick={() => setEditing({ policy: p })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing({ policy: p })}>
                      <td>{p.cover_type}</td>
                      <td>{p.insurer ?? "—"}</td>
                      <td>{p.policy_number ?? "—"}</td>
                      <td>
                        {p.starts_on ? formatDate(p.starts_on) : "?"} – {p.expires_on ? formatDate(p.expires_on) : "?"}
                      </td>
                      <td>
                        <Pill value={p.status} />
                      </td>
                      <td>
                        <Pill value={current.get(p.cover_type)?.id === p.id ? policyState(p, today) : "Closed"} label={current.get(p.cover_type)?.id === p.id ? undefined : "Superseded"} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <PolicyDialog propertyId={property.id} policy={editing.policy} cover={editing.cover} canManage={canManage} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function PolicyDialog({ propertyId, policy: p, cover, canManage, onClose }: { propertyId: string; policy: Policy | null; cover?: string; canManage: boolean; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={p ? `Edit ${p.cover_type.toLowerCase()} policy` : "Add a policy"} subtitle={p ? undefined : "For a renewal, add the new policy: the old one is kept as history."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => savePolicy(p?.id ?? null, propertyId, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="y-cover">Cover</label>
            <select id="y-cover" name="cover_type" className="select" defaultValue={p?.cover_type ?? cover ?? "Buildings"}>
              {COVER_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="y-status">Evidence</label>
            <select id="y-status" name="status" className="select" defaultValue={p?.status ?? "Awaiting information"}>
              {EVIDENCE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="y-ins">Insurer</label>
            <input id="y-ins" name="insurer" className="input" defaultValue={p?.insurer ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="y-num">Policy number</label>
            <input id="y-num" name="policy_number" className="input" defaultValue={p?.policy_number ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="y-holder">Policyholder</label>
            <input id="y-holder" name="policyholder" className="input" defaultValue={p?.policyholder ?? ""} placeholder="e.g. Majlis Khuddamul Ahmadiyya UK" />
          </div>
          <div className="field">
            <label htmlFor="y-cov">Cover amount and limits</label>
            <input id="y-cov" name="cover_amount" className="input" defaultValue={p?.cover_amount ?? ""} placeholder="e.g. £5m public liability" />
          </div>
          <div className="field">
            <label htmlFor="y-start">Starts</label>
            <input id="y-start" name="starts_on" type="date" className="input" defaultValue={p?.starts_on ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="y-end">Renewal date</label>
            <input id="y-end" name="expires_on" type="date" className="input" defaultValue={p?.expires_on ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="y-prem">Premium (£ a year)</label>
            <input id="y-prem" name="premium" className="input tnum" inputMode="decimal" defaultValue={p?.premium != null ? num(p.premium) : ""} />
          </div>
          <div className="field">
            <label htmlFor="y-contact">Broker or contact</label>
            <input id="y-contact" name="contact" className="input" defaultValue={p?.contact ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="y-exc">Exclusions and conditions</label>
            <textarea id="y-exc" name="exclusions" className="textarea" defaultValue={p?.exclusions ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="y-notes">Notes</label>
            <textarea id="y-notes" name="notes" className="textarea" defaultValue={p?.notes ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {p && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm("Remove this policy?") && run(() => deletePolicy(p.id), onClose)}>
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save policy"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

/** Insurance across every property, for the Compliance tab. */
export function InsuranceOverview({ properties, policies }: { properties: Property[]; policies: Policy[] }) {
  const today = todayISO();
  const live = properties.filter((p) => p.status !== "Disposed");
  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Insurance</h2>
      </div>
      <ul className="glance">
        {live.map((p) => {
          const current = currentPolicies(policies.filter((x) => x.property_id === p.id));
          return (
            <li key={p.id}>
              <Link href={`/jaidat/${p.id}?tab=insurance`} className="glance-link">
                <span>{shortName(p)}</span>
                <span className="glance-right jd-cover-dots">
                  {expectedCovers(p.property_type).map((cover) => {
                    const s = policyState(current.get(cover), today);
                    const cls = s === "Covered" ? "ok" : s === "Missing" ? "none" : s === "Unverified" ? "warn" : s === "Expired" ? "bad" : "warn";
                    return (
                      <span key={cover} className={`doc-dot ${cls}`} title={`${cover}: ${s}`}>
                        {cover === "Public liability" ? "PL" : cover === "Employers liability" ? "EL" : cover}
                      </span>
                    );
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
