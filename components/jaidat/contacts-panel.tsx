"use client";

import { useState } from "react";
import { BadgeCheck, Mail, Pencil, Phone, Plus, Search, Star } from "lucide-react";
import { CONTRACTOR_STATUSES, TRADES, isOpen, todayISO, type Contact, type Contractor, type Issue } from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteContact, deleteContractor, saveContact, saveContractor } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill } from "./bits";

export function ContactsPanel({
  contacts,
  contractors,
  issues,
  canManage,
}: {
  contacts: Contact[];
  contractors: Contractor[];
  issues: Issue[];
  canManage: boolean;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [person, setPerson] = useState<{ c: Contact | null } | null>(null);
  const [firm, setFirm] = useState<{ k: Contractor | null } | null>(null);
  const [trade, setTrade] = useState("");
  const [query, setQuery] = useState("");

  const team = contacts.filter((c) => c.in_team);
  const helpers = contacts.filter((c) => !c.in_team);
  const q = query.trim().toLowerCase();
  const firms = contractors.filter(
    (k) => (!trade || k.trade === trade) && (!q || [k.name, k.company, k.trade, k.areas].join(" ").toLowerCase().includes(q)),
  );

  const card = (c: Contact) => {
    const open = issues.filter((i) => isOpen(i) && i.officer === c.full_name).length;
    return (
      <li key={c.id} className="driver jd-person">
        <span className="avatar" aria-hidden>
          {c.full_name
            .replace(/^Dr\s+/, "")
            .replace(/[^\p{L}\s]/gu, "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="driver-info">
          <strong>
            {c.full_name}
            {open > 0 && <span className="tab-badge">{open} open ticket{open === 1 ? "" : "s"}</span>}
          </strong>
          <small>{[c.role, c.department].filter(Boolean).join(" · ")}</small>
          <small>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={13} /> {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`}>
                <Mail size={13} /> {c.email}
              </a>
            )}
          </small>
          {c.responsibilities && <p className="driver-notes">{c.responsibilities}</p>}
        </div>
        <div className="driver-actions">
          <button type="button" className="icon-link" title="Edit" onClick={() => setPerson({ c })}>
            <Pencil size={15} />
            <span className="sr-only">Edit {c.full_name}</span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="split jd-split-even">
        <section className="panel glass">
          <div className="panel-head">
            <h2>Jaidad team</h2>
            {canEdit && (
              <button type="button" className="btn" onClick={() => setPerson({ c: null })}>
                <Plus size={17} /> Add person
              </button>
            )}
          </div>
          {team.length ? <ul className="driver-list">{team.map(card)}</ul> : <p className="muted-note">No team members listed.</p>}
          <h3 className="jd-group-title" style={{ marginTop: 22 }}>
            Helping from other departments
          </h3>
          <p className="muted-note" style={{ marginBottom: 10 }}>
            They work in their own departments and support Jaidad. Requests to them go through the Jaidad team.
          </p>
          {helpers.length ? <ul className="driver-list">{helpers.map(card)}</ul> : <p className="muted-note">Nobody listed.</p>}
        </section>

        <section className="panel glass">
          <div className="panel-head">
            <h2>Contractors and suppliers</h2>
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setFirm({ k: null })}>
                <Plus size={17} /> Add contractor
              </button>
            )}
          </div>
          <div className="jd-filterbar">
            <select className="select jd-filter" value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade">
              <option value="">All trades</option>
              {TRADES.filter((t) => contractors.some((k) => k.trade === t)).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search contractors</span>
              <input className="input" type="search" placeholder="Name, trade, area" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <p className="muted-note" style={{ margin: "8px 0 12px" }}>
            Contractors don&apos;t get a login: the team contacts them directly. Only approved contractors should be given work.
          </p>
          {firms.length === 0 ? (
            <Empty title={contractors.length ? "No matches" : "No contractors yet"}>
              {contractors.length ? "Try another trade or search." : "Add the plumbers, electricians and engineers you use, with their insurance and certificates."}
            </Empty>
          ) : (
            <ul className="driver-list">
              {firms.map((k) => {
                const jobs = issues.filter((i) => i.contractor_id === k.id);
                const insuranceGone = k.insurance_expiry && k.insurance_expiry < today;
                return (
                  <li key={k.id} className={`driver ${k.approved ? "jd-approved" : ""}`}>
                    <span className="doc-icon">{k.approved ? <BadgeCheck size={20} /> : <Star size={18} />}</span>
                    <div className="driver-info">
                      <strong>
                        {k.name}
                        {k.company && <span className="muted"> · {k.company}</span>}
                        {k.approved ? <Pill value="Approved" /> : <Pill value="Not verified" label="Not approved" />}
                        {k.status === "Suspended" && <Pill value="Suspended" />}
                      </strong>
                      <small>
                        {k.trade}
                        {k.areas && ` · ${k.areas}`}
                        {k.rating && ` · ${"★".repeat(k.rating)}${"☆".repeat(5 - k.rating)}`}
                        {` · ${jobs.filter((j) => !isOpen(j)).length} job${jobs.filter((j) => !isOpen(j)).length === 1 ? "" : "s"} done`}
                      </small>
                      <small>
                        {k.phone && (
                          <a href={`tel:${k.phone.replace(/[^+\d]/g, "")}`}>
                            <Phone size={13} /> {k.phone}
                          </a>
                        )}
                        {k.email && (
                          <a href={`mailto:${k.email}`}>
                            <Mail size={13} /> {k.email}
                          </a>
                        )}
                        {k.insurance_expiry && (
                          <span className={insuranceGone ? "jd-late" : ""}>
                            Insurance {insuranceGone ? "expired" : "to"} {formatDate(k.insurance_expiry)}
                          </span>
                        )}
                      </small>
                      {k.approved_by && (
                        <p className="driver-notes">
                          Approved by {k.approved_by}
                          {k.approved_on ? ` on ${formatDate(k.approved_on)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="driver-actions">
                      <button type="button" className="icon-link" title="Edit" onClick={() => setFirm({ k })}>
                        <Pencil size={15} />
                        <span className="sr-only">Edit {k.name}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {person && <ContactDialog contact={person.c} canManage={canManage} onClose={() => setPerson(null)} />}
      {firm && <ContractorDialog contractor={firm.k} canManage={canManage} onClose={() => setFirm(null)} />}
    </>
  );
}

function ContactDialog({ contact: c, canManage, onClose }: { contact: Contact | null; canManage: boolean; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={c ? `Edit ${c.full_name}` : "Add a person"} subtitle="Names here are offered in the Responsible and Officer fields." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveContact(c?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="ct-name">
              Name<span className="req">*</span>
            </label>
            <input id="ct-name" name="full_name" className="input" required defaultValue={c?.full_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ct-role">Role</label>
            <input id="ct-role" name="role" className="input" defaultValue={c?.role ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ct-dept">Department</label>
            <input id="ct-dept" name="department" className="input" defaultValue={c?.department ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ct-phone">Phone</label>
            <input id="ct-phone" name="phone" type="tel" className="input" defaultValue={c?.phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ct-email">Email</label>
            <input id="ct-email" name="email" type="email" className="input" defaultValue={c?.email ?? ""} />
          </div>
          <label className="check wide">
            <input type="checkbox" name="in_team" defaultChecked={c?.in_team ?? true} />
            <span>
              <strong>Part of the Jaidad team</strong>
              <small>Untick for people in other departments who help.</small>
            </span>
          </label>
          <div className="field wide">
            <label htmlFor="ct-resp">Responsibilities</label>
            <textarea id="ct-resp" name="responsibilities" className="textarea" defaultValue={c?.responsibilities ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {c && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove ${c.full_name}?`) && run(() => deleteContact(c.id), onClose)}>
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

function ContractorDialog({ contractor: k, canManage, onClose }: { contractor: Contractor | null; canManage: boolean; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={k ? `Edit ${k.name}` : "Add a contractor"} subtitle="Check their insurance and certificates before giving them work." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveContractor(k?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="ko-name">
              Name<span className="req">*</span>
            </label>
            <input id="ko-name" name="name" className="input" required defaultValue={k?.name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ko-co">Company</label>
            <input id="ko-co" name="company" className="input" defaultValue={k?.company ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ko-trade">Trade</label>
            <select id="ko-trade" name="trade" className="select" defaultValue={k?.trade ?? "Plumber"}>
              {TRADES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ko-areas">Areas covered</label>
            <input id="ko-areas" name="areas" className="input" defaultValue={k?.areas ?? ""} placeholder="e.g. Farnham and Guildford" />
          </div>
          <div className="field">
            <label htmlFor="ko-phone">Phone</label>
            <input id="ko-phone" name="phone" type="tel" className="input" defaultValue={k?.phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ko-email">Email</label>
            <input id="ko-email" name="email" type="email" className="input" defaultValue={k?.email ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ko-ins">Public liability insurance expires</label>
            <input id="ko-ins" name="insurance_expiry" type="date" className="input" defaultValue={k?.insurance_expiry ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ko-rate">Rating</label>
            <select id="ko-rate" name="rating" className="select" defaultValue={k?.rating ? String(k.rating) : ""}>
              <option value="">Not rated</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)} ({n})
                </option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="ko-cert">Certificates (type and number)</label>
            <input id="ko-cert" name="certifications" className="input" defaultValue={k?.certifications ?? ""} placeholder="e.g. Gas Safe 123456, NICEIC" />
          </div>
          <div className="field">
            <label htmlFor="ko-status">Checks</label>
            <select id="ko-status" name="status" className="select" defaultValue={k?.status ?? "Not verified"}>
              {CONTRACTOR_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {canManage ? (
            <label className="check">
              <input type="checkbox" name="approved" defaultChecked={k?.approved ?? false} />
              <span>
                <strong>Approved to take work</strong>
                <small>Department admin only</small>
              </span>
            </label>
          ) : (
            <p className="muted-note" style={{ alignSelf: "end" }}>
              {k?.approved ? "Approved to take work." : "Only the department admin can approve a contractor."}
            </p>
          )}
          <div className="field wide">
            <label htmlFor="ko-notes">Notes</label>
            <textarea id="ko-notes" name="notes" className="textarea" defaultValue={k?.notes ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {k && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove ${k.name}? Their tickets and quotes are kept.`) && run(() => deleteContractor(k.id), onClose)}>
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
