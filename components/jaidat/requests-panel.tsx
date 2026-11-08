"use client";

import { useState } from "react";
import { Mail, Pencil, Plus } from "lucide-react";
import { REQUEST_STATUSES, mailto, shortName, todayISO, type Contact, type Property, type WaitingRequest } from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteRequest, saveRequest, setRequestStatus } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill, tonePill } from "./bits";

/** Requests sent by email to other departments that are waiting for a reply. */
export function RequestsPanel({
  requests,
  properties,
  contacts,
  canManage,
}: {
  requests: WaitingRequest[];
  properties: Property[];
  contacts: Contact[];
  canManage: boolean;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [show, setShow] = useState<"waiting" | "all">("waiting");
  const [editing, setEditing] = useState<{ r: WaitingRequest | null } | null>(null);
  const { pending, error, run } = useRun();
  const late = (r: WaitingRequest) => r.status !== "Replied" && Boolean(r.due_on) && r.due_on! < today;
  const visible = requests
    .filter((r) => show === "all" || r.status !== "Replied")
    .sort((a, b) => Number(late(b)) - Number(late(a)) || (a.due_on ?? "9").localeCompare(b.due_on ?? "9"));

  return (
    <>
      <section className="stats" aria-label="Replies summary">
        {REQUEST_STATUSES.map((s) => (
          <div key={s} className="stat glass">
            <strong>{requests.filter((r) => r.status === s).length}</strong>
            <span>{s.toLowerCase()}</span>
          </div>
        ))}
        <div className="stat glass">
          <strong style={{ color: requests.some(late) ? "var(--danger)" : undefined }}>{requests.filter(late).length}</strong>
          <span>past the reply date</span>
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Awaiting replies</h2>
            <p className="muted-note">Requests sent to other departments by email. Mark each one replied when the documents arrive.</p>
          </div>
          <div className="toolbar">
            <div className="jd-seg" role="group" aria-label="Show">
              <button type="button" className="chip" aria-pressed={show === "waiting"} onClick={() => setShow("waiting")}>
                Waiting
              </button>
              <button type="button" className="chip" aria-pressed={show === "all"} onClick={() => setShow("all")}>
                All
              </button>
            </div>
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ r: null })}>
                <Plus size={18} /> Add request
              </button>
            )}
          </div>
        </div>
        {visible.length === 0 ? (
          <Empty title={requests.length ? "Nothing waiting" : "No requests yet"}>
            {requests.length ? "Every request has had a reply." : "Log requests to other departments so nothing is forgotten."}
          </Empty>
        ) : (
          <ul className="task-list">
            {visible.map((r) => {
              const email = contacts.find((c) => c.full_name === r.person)?.email;
              return (
                <li key={r.id} className={`task ${late(r) ? "is-overdue" : r.status === "Replied" ? "is-completed" : ""}`}>
                  <div className="task-main">
                    <div className="task-title">
                      <strong>{r.person}</strong>
                      {late(r) && <Pill value="Overdue" />}
                      {r.role && <span className="muted-note">{r.role}</span>}
                    </div>
                    <p className="jd-request">{r.request}</p>
                    <div className="task-meta">
                      {r.property_id && <span>{shortName(properties.find((p) => p.id === r.property_id))}</span>}
                      <span>Sent {r.sent_on ? formatDate(r.sent_on) : "—"}</span>
                      <span className={late(r) ? "jd-late" : ""}>Reply due {r.due_on ? formatDate(r.due_on) : r.due_note ?? "not set"}</span>
                    </div>
                    {r.notes && <p className="task-notes">{r.notes}</p>}
                    {r.reply && <p className="incident-outcome">{r.reply}</p>}
                  </div>
                  <div className="task-actions jd-req-actions">
                    {canEdit ? (
                      <select
                        className="select jd-status-select"
                        value={r.status}
                        style={tonePill(r.status)}
                        disabled={pending}
                        onChange={(e) => run(() => setRequestStatus(r.id, e.target.value))}
                        aria-label={`Status of request to ${r.person}`}
                      >
                        {REQUEST_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <Pill value={r.status} />
                    )}
                    {r.status !== "Replied" && (
                      <a
                        className="icon-link"
                        title="Email a reminder"
                        href={mailto(email, "Reminder: Jaidad request", `Assalamo Alaikum ${r.person.split(" ")[0]},\n\nA gentle reminder about our request${r.sent_on ? ` of ${formatDate(r.sent_on)}` : ""}:\n\n${r.request}\n\nJazakAllah,\nMKA Jaidad Team UK`)}
                      >
                        <Mail size={15} />
                        <span className="sr-only">Email a reminder to {r.person}</span>
                      </a>
                    )}
                    <button type="button" className="icon-link" title="Edit" onClick={() => setEditing({ r })}>
                      <Pencil size={15} />
                      <span className="sr-only">Edit</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <FormError error={error} />
      </section>

      {editing && <RequestDialog request={editing.r} properties={properties} canManage={canManage} onClose={() => setEditing(null)} />}
    </>
  );
}

function RequestDialog({ request: r, properties, canManage, onClose }: { request: WaitingRequest | null; properties: Property[]; canManage: boolean; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={r ? `Request to ${r.person}` : "Add a request"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveRequest(r?.id ?? null, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="rq-person">
              Person<span className="req">*</span>
            </label>
            <input id="rq-person" name="person" className="input" list="jaidat-people" required defaultValue={r?.person ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="rq-role">Role or department</label>
            <input id="rq-role" name="role" className="input" defaultValue={r?.role ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="rq-req">
              What was asked<span className="req">*</span>
            </label>
            <textarea id="rq-req" name="request" className="textarea" required defaultValue={r?.request ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="rq-prop">Property</label>
            <select id="rq-prop" name="property_id" className="select" defaultValue={r?.property_id ?? ""}>
              <option value="">Several or none</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rq-status">Status</label>
            <select id="rq-status" name="status" className="select" defaultValue={r?.status ?? "Awaiting reply"}>
              {REQUEST_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rq-sent">Sent on</label>
            <input id="rq-sent" name="sent_on" type="date" className="input" defaultValue={r?.sent_on ?? todayISO()} />
          </div>
          <div className="field">
            <label htmlFor="rq-due">Reply due</label>
            <input id="rq-due" name="due_on" type="date" className="input" defaultValue={r?.due_on ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="rq-dn">Or when, in words</label>
            <input id="rq-dn" name="due_note" className="input" defaultValue={r?.due_note ?? ""} placeholder="e.g. At the meeting in the week of 9 November" />
          </div>
          <div className="field wide">
            <label htmlFor="rq-reply">Reply received</label>
            <textarea id="rq-reply" name="reply" className="textarea" defaultValue={r?.reply ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="rq-notes">Notes</label>
            <input id="rq-notes" name="notes" className="input" defaultValue={r?.notes ?? ""} placeholder="e.g. Copied to Yahya Ahmad" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {r && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm("Remove this request?") && run(() => deleteRequest(r.id), onClose)}>
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
