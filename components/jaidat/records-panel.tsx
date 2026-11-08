"use client";

import { useState } from "react";
import { CalendarClock, Mail, Paperclip, Pencil, Plus, Search } from "lucide-react";
import {
  RECORD_STATUSES,
  WORKSTREAMS,
  mailto,
  recordOverdue,
  recordProgress,
  relDays,
  shortName,
  todayISO,
  type Contact,
  type JaidatFile,
  type Property,
  type RecordItem,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteRecord, saveRecord, setRecordStatus } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Meter, Pill, tonePill } from "./bits";
import { AddDocument, DocList } from "./files";

type View = "property" | "person";

/**
 * The records checklist: every document and piece of information to collect
 * for each property, who's responsible, and where it's got to.
 */
export function RecordsPanel({
  properties,
  records,
  files,
  contacts,
  propertyId,
  canManage,
}: {
  properties: Property[];
  records: RecordItem[];
  files: JaidatFile[];
  contacts: Contact[];
  propertyId?: string;
  canManage: boolean;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [view, setView] = useState<View>("property");
  const [status, setStatus] = useState<string | null>(null);
  const [person, setPerson] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: RecordItem | null } | null>(null);
  const { pending, error, run } = useRun();

  const props = properties.filter((p) => !propertyId || p.id === propertyId);
  const people = [...new Set(records.flatMap((r) => [r.owner_name, r.support_name]).filter((x): x is string => Boolean(x)))].sort();
  const q = query.trim().toLowerCase();
  const visible = records.filter(
    (r) =>
      (!status || (status === "Follow-up due" ? recordOverdue(r, today) : r.status === status)) &&
      (!person || r.owner_name === person || r.support_name === person) &&
      (!q || [r.title, r.owner_name, r.support_name, r.notes].join(" ").toLowerCase().includes(q)),
  );
  const counts = new Map<string, number>();
  records.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
  const followUps = records.filter((r) => recordOverdue(r, today)).length;
  const overall = recordProgress(records);

  const row = (r: RecordItem, showProperty: boolean) => {
    const attached = files.filter((f) => f.record_id === r.id).length;
    const late = recordOverdue(r, today);
    return (
      <tr key={r.id} className={late ? "jd-row-late" : ""}>
        <td>
          <button type="button" className="jd-linkish" onClick={() => setEditing({ item: r })}>
            {r.title}
          </button>
          {showProperty && <small className="jd-cell-sub">{shortName(properties.find((p) => p.id === r.property_id))}</small>}
          {r.notes && <small className="jd-cell-sub">{r.notes}</small>}
        </td>
        <td className="wrap">
          <span className="who">
            {r.owner_name ?? "Not assigned"}
            {r.support_name && <small>Help from {r.support_name}</small>}
          </span>
        </td>
        <td>
          {canEdit ? (
            <select
              className="select jd-status-select"
              value={r.status}
              disabled={pending}
              onChange={(e) => run(() => setRecordStatus(r.id, e.target.value))}
              aria-label={`Status of ${r.title}`}
              style={tonePill(r.status)}
            >
              {RECORD_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          ) : (
            <Pill value={r.status} />
          )}
        </td>
        <td className="jd-dates">
          {r.requested_on && <small>Asked {formatDate(r.requested_on)}</small>}
          {r.received_on && <small>Got {formatDate(r.received_on)}</small>}
          {r.follow_up_on && r.status !== "Verified" && (
            <small className={late ? "jd-late" : ""}>
              <CalendarClock size={12} /> Chase {relDays(r.follow_up_on, today)}
            </small>
          )}
        </td>
        <td className="jd-actions-cell">
          {attached > 0 && (
            <span className="jd-attached" title={`${attached} document${attached === 1 ? "" : "s"}`}>
              <Paperclip size={13} /> {attached}
            </span>
          )}
          <button type="button" className="icon-link" title="Open" onClick={() => setEditing({ item: r })}>
            <Pencil size={15} />
            <span className="sr-only">Open {r.title}</span>
          </button>
        </td>
      </tr>
    );
  };

  const table = (list: RecordItem[], showProperty: boolean) => (
    <div className="table-wrap">
      <table className="records static jd-rec-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Responsible</th>
            <th>Status</th>
            <th>Dates</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>{list.map((r) => row(r, showProperty))}</tbody>
      </table>
    </div>
  );

  return (
    <>
      {!propertyId && (
        <section className="jd-progress-grid">
          {properties
            .filter((p) => p.status !== "Disposed")
            .map((p) => {
              const pr = recordProgress(records.filter((r) => r.property_id === p.id));
              return (
                <div key={p.id} className="stat glass">
                  <span className="jd-ref">{p.reference}</span>
                  <strong className="jd-progress-name">{shortName(p)}</strong>
                  <Meter value={pr.verified} total={pr.total} label="Verified" />
                  <small className="muted-note">{pr.received} received or better</small>
                </div>
              );
            })}
        </section>
      )}

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Records checklist</h2>
            <p className="muted-note">
              {overall.verified} of {overall.total} verified · {overall.received} received · {followUps} follow-up{followUps === 1 ? "" : "s"} due. Requested and
              received dates fill themselves in when the status changes.
            </p>
          </div>
          <div className="toolbar">
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search the checklist</span>
              <input className="input" type="search" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {canEdit && (
              <button type="button" className="btn" onClick={() => setEditing({ item: null })}>
                <Plus size={17} /> Add item
              </button>
            )}
          </div>
        </div>

        <div className="jd-filterbar">
          <div className="jd-seg" role="group" aria-label="Group by">
            <button type="button" className="chip" aria-pressed={view === "property"} onClick={() => setView("property")}>
              By {propertyId ? "area" : "property"}
            </button>
            <button type="button" className="chip" aria-pressed={view === "person"} onClick={() => setView("person")}>
              By person
            </button>
          </div>
          <select className="select jd-filter" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="">Everyone</option>
            {people.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="chips" role="group" aria-label="Status">
          <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
            All <em>{records.length}</em>
          </button>
          {RECORD_STATUSES.filter((s) => counts.get(s)).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
              {s} <em>{counts.get(s)}</em>
            </button>
          ))}
          {followUps > 0 && (
            <button type="button" className="chip" aria-pressed={status === "Follow-up due"} onClick={() => setStatus(status === "Follow-up due" ? null : "Follow-up due")}>
              Follow-up due <em>{followUps}</em>
            </button>
          )}
        </div>
        <FormError error={error} />

        {visible.length === 0 ? (
          <Empty title="Nothing here">Try another filter.</Empty>
        ) : view === "property" ? (
          <div className="jd-groups">
            {props.map((p) => {
              const mine = visible.filter((r) => r.property_id === p.id);
              if (!mine.length) return null;
              return (
                <div key={p.id} className="jd-group">
                  {!propertyId && (
                    <h3 className="jd-group-title">
                      {p.name} <span className="jd-ref">{p.reference}</span>
                    </h3>
                  )}
                  {WORKSTREAMS.map((w) => {
                    const list = mine.filter((r) => r.workstream === w.key);
                    if (!list.length) return null;
                    const pr = recordProgress(list);
                    return (
                      <details key={w.key} className="jd-ws" open={Boolean(propertyId) || Boolean(status || person || q)}>
                        <summary>
                          <span>{w.label}</span>
                          <Meter value={pr.verified} total={pr.total} label="Verified" />
                        </summary>
                        {table(list, false)}
                      </details>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="jd-groups">
            {(person ? [person] : people).map((name) => {
              const mine = visible.filter((r) => r.owner_name === name || r.support_name === name);
              if (!mine.length) return null;
              const left = mine.filter((r) => r.status !== "Verified");
              const contact = contacts.find((c) => c.full_name === name);
              const body = `Assalamo Alaikum ${name.split(" ")[0]},\n\nA reminder of the Jaidad records still outstanding:\n\n${left
                .map((r) => `- ${shortName(properties.find((p) => p.id === r.property_id))}: ${r.title} (${r.status})`)
                .join("\n")}\n\nPlease send what you can to jaidad@khuddam.co.uk. JazakAllah.`;
              return (
                <div key={name} className="jd-group">
                  <h3 className="jd-group-title">
                    {name}
                    <span className="muted-note"> · {left.length} outstanding</span>
                    {left.length > 0 && (
                      <a className="btn btn-ghost btn-sm" href={mailto(contact?.email, "Jaidad records still outstanding", body)}>
                        <Mail size={14} /> Email a reminder
                      </a>
                    )}
                  </h3>
                  {table(mine, !propertyId)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <RecordDialog
          item={editing.item}
          properties={props}
          defaultProperty={propertyId ?? props[0]?.id}
          files={editing.item ? files.filter((f) => f.record_id === editing.item!.id) : []}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RecordDialog({
  item,
  properties,
  defaultProperty,
  files,
  canManage,
  onClose,
}: {
  item: RecordItem | null;
  properties: Property[];
  defaultProperty?: string;
  files: JaidatFile[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [propertyId, setPropertyId] = useState(item?.property_id ?? defaultProperty ?? "");
  const prop = properties.find((p) => p.id === (item?.property_id ?? propertyId));
  return (
    <Sheet title={item ? item.title : "Add a checklist item"} subtitle={prop ? prop.name : undefined} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (!propertyId) return;
          run(() => saveRecord(item?.id ?? null, propertyId, fd), onClose);
        }}
      >
        <div className="sheet-body">
          {!item && properties.length > 1 && (
            <div className="field wide">
              <label htmlFor="r-prop">Property</label>
              <select id="r-prop" className="select" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field wide">
            <label htmlFor="r-title">
              Item<span className="req">*</span>
            </label>
            <input id="r-title" name="title" className="input" required defaultValue={item?.title ?? ""} placeholder="e.g. Boundary plan" />
          </div>
          <div className="field">
            <label htmlFor="r-ws">Area</label>
            <select id="r-ws" name="workstream" className="select" defaultValue={item?.workstream ?? "records"}>
              {WORKSTREAMS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-status">Status</label>
            <select id="r-status" name="status" className="select" defaultValue={item?.status ?? "Not started"}>
              {RECORD_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="r-owner">Responsible (Jaidad)</label>
            <input id="r-owner" name="owner_name" className="input" list="jaidat-people" defaultValue={item?.owner_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="r-help">Help from (other department)</label>
            <input id="r-help" name="support_name" className="input" list="jaidat-people" defaultValue={item?.support_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="r-req">Requested on</label>
            <input id="r-req" name="requested_on" type="date" className="input" defaultValue={item?.requested_on ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="r-rec">Received on</label>
            <input id="r-rec" name="received_on" type="date" className="input" defaultValue={item?.received_on ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="r-fu">Follow up on</label>
            <input id="r-fu" name="follow_up_on" type="date" className="input" defaultValue={item?.follow_up_on ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="r-notes">Notes</label>
            <textarea id="r-notes" name="notes" className="textarea" defaultValue={item?.notes ?? ""} placeholder="Where it's kept, what's missing, who to ask" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {item && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Remove "${item.title}" from the checklist?`) && run(() => deleteRecord(item.id), onClose)}>
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
              <h3>Documents</h3>
              <AddDocument propertyId={item.property_id} links={{ record_id: item.id }} category={docCategory(item)} label="Attach" small title={item.title} />
            </div>
            <DocList files={files} canDelete={canManage} empty="Nothing attached yet." compact />
          </section>
        </div>
      )}
    </Sheet>
  );
}

function docCategory(r: RecordItem) {
  if (r.workstream === "compliance") return "Compliance";
  if (r.workstream === "insurance") return "Insurance";
  if (r.workstream === "finance") return "Finance";
  if (r.workstream === "maintenance") return "Maintenance";
  if (/lease|agreement/i.test(r.title)) return "Leases and agreements";
  if (/planning/i.test(r.title)) return "Planning";
  if (/plan|blueprint/i.test(r.title)) return "Plans and drawings";
  if (/occup/i.test(r.title)) return "Occupancy";
  return "Ownership";
}
