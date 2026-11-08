"use client";

import { useMemo, useState } from "react";
import {
  AlertOctagon,
  CalendarClock,
  Check,
  ClipboardCheck,
  Globe,
  HardHat,
  Mail,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  PRIORITIES,
  isOpen,
  issueOverdue,
  mailto,
  money,
  num,
  priorityLabel,
  quoteFlag,
  relDays,
  shortName,
  todayISO,
  type Contact,
  type Contractor,
  type Issue,
  type IssueNote,
  type JaidatFile,
  type Property,
  type Quote,
} from "@/lib/jaidat";
import { formatDate, formatDateTime } from "@/lib/format";
import { acceptQuote, addNote, deleteIssue, deleteNote, deleteQuote, saveIssue, saveQuote, setIssueStatus } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill } from "./bits";
import { AddDocument, DocList } from "./files";

type Filter = "open" | "unassigned" | "urgent" | "overdue" | "done" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "urgent", label: "P1 emergency" },
  { key: "overdue", label: "Past target" },
  { key: "done", label: "Resolved" },
  { key: "all", label: "All" },
];

const RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function TicketsPanel({
  issues,
  notes,
  quotes,
  files,
  contractors,
  contacts,
  properties,
  propertyId,
  canManage,
  openId,
}: {
  issues: Issue[];
  notes: IssueNote[];
  quotes: Quote[];
  files: JaidatFile[];
  contractors: Contractor[];
  contacts: Contact[];
  properties: Property[];
  propertyId?: string;
  canManage: boolean;
  openId?: string;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [selected, setSelected] = useState<string | null>(openId && issues.some((i) => i.id === openId) ? openId : null);
  const [adding, setAdding] = useState(false);
  const props = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const match = (i: Issue, f: Filter) => {
    switch (f) {
      case "open":
        return isOpen(i);
      case "unassigned":
        return isOpen(i) && !i.officer;
      case "urgent":
        return isOpen(i) && i.priority === "P1";
      case "overdue":
        return issueOverdue(i, today);
      case "done":
        return !isOpen(i);
      default:
        return true;
    }
  };

  const q = query.trim().toLowerCase();
  const visible = issues
    .filter((i) => match(i, filter))
    .filter((i) => !place || i.property_id === place)
    .filter((i) => !q || [i.ref, i.title, i.description, i.location, i.officer, i.reported_by].join(" ").toLowerCase().includes(q))
    .sort((a, b) =>
      isOpen(a) && isOpen(b)
        ? RANK[a.priority]! - RANK[b.priority]! || (a.target_date ?? "9").localeCompare(b.target_date ?? "9")
        : b.created_at.localeCompare(a.created_at),
    );

  const current = selected ? issues.find((i) => i.id === selected) ?? null : null;
  const open = issues.filter(isOpen);

  return (
    <>
      <section className="stats" aria-label="Ticket summary">
        {PRIORITIES.map((p) => {
          const n = open.filter((i) => i.priority === p.key).length;
          return (
            <button
              key={p.key}
              type="button"
              className={`stat glass jd-pri is-${p.key.toLowerCase()} ${p.key === "P1" && n ? "is-hot" : ""}`}
              onClick={() => setFilter(p.key === "P1" ? "urgent" : "open")}
              title={p.note}
            >
              <strong>{n}</strong>
              <span>{p.label} open</span>
            </button>
          );
        })}
        <div className="stat glass">
          <strong style={{ color: open.some((i) => issueOverdue(i, today)) ? "var(--danger)" : undefined }}>
            {open.filter((i) => issueOverdue(i, today)).length}
          </strong>
          <span>past target date</span>
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <h2>
            Tickets <span className="count-badge">{open.length} open</span>
          </h2>
          <div className="toolbar">
            {!propertyId && properties.length > 1 && (
              <select className="select jd-filter" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Property">
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {shortName(p)}
                  </option>
                ))}
              </select>
            )}
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search tickets</span>
              <input className="input" type="search" placeholder="Reference, problem, person" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus size={18} /> New ticket
              </button>
            )}
          </div>
        </div>

        <div className="chips" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <em>{issues.filter((i) => match(i, f.key) && (!place || i.property_id === place)).length}</em>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty title={issues.length ? "Nothing here" : "No tickets yet"}>
            {issues.length
              ? filter === "open"
                ? "Every ticket is resolved."
                : "Try another filter or search."
              : "Report repairs, defects and safety concerns here. The public can also report through the Report an issue page."}
          </Empty>
        ) : (
          <ul className="task-list">
            {visible.map((i) => {
              const late = issueOverdue(i, today);
              const prop = i.property_id ? props.get(i.property_id) : null;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`task jd-ticket pri-${i.priority.toLowerCase()} ${isOpen(i) ? "" : "is-completed"} ${late ? "is-overdue" : ""}`}
                    onClick={() => setSelected(i.id)}
                  >
                    <div className="task-main">
                      <div className="task-title">
                        <span className="jd-ref">{i.ref}</span>
                        <strong>{i.title}</strong>
                      </div>
                      <div className="task-meta">
                        {!propertyId && <span>{prop ? shortName(prop) : "No property"}</span>}
                        {i.location && (
                          <span>
                            <MapPin size={14} /> {i.location}
                          </span>
                        )}
                        <span>
                          <UserRound size={14} /> {i.officer ?? "Not assigned"}
                        </span>
                        {isOpen(i) && i.target_date && (
                          <span className={late ? "jd-late" : ""}>
                            <CalendarClock size={14} /> Target {formatDate(i.target_date)} ({relDays(i.target_date, today)})
                          </span>
                        )}
                        {!isOpen(i) && i.completed_on && (
                          <span>
                            <Check size={14} /> {i.status} {formatDate(i.completed_on)}
                          </span>
                        )}
                        {i.source === "public" && (
                          <span className="jd-src">
                            <Globe size={13} /> Public report
                          </span>
                        )}
                        {i.source === "inspection" && (
                          <span className="jd-src">
                            <ClipboardCheck size={13} /> From inspection
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="jd-ticket-pills">
                      <Pill value={i.priority} label={i.priority} title={priorityLabel(i.priority)} />
                      <Pill value={i.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {adding && (
        <IssueDialog
          issue={null}
          properties={properties}
          contractors={contractors}
          contacts={contacts}
          defaultProperty={propertyId}
          onClose={() => setAdding(false)}
        />
      )}
      {current && (
        <IssueDialog
          issue={current}
          properties={properties}
          contractors={contractors}
          contacts={contacts}
          notes={notes.filter((n) => n.issue_id === current.id)}
          quotes={quotes.filter((x) => x.issue_id === current.id)}
          files={files.filter((f) => f.issue_id === current.id)}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function IssueDialog({
  issue,
  properties,
  contractors,
  contacts,
  notes = [],
  quotes = [],
  files = [],
  defaultProperty,
  canManage = false,
  onClose,
}: {
  issue: Issue | null;
  properties: Property[];
  contractors: Contractor[];
  contacts: Contact[];
  notes?: IssueNote[];
  quotes?: Quote[];
  files?: JaidatFile[];
  defaultProperty?: string;
  canManage?: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(issue?.status ?? "New");
  const [priority, setPriority] = useState(issue?.priority ?? "P3");
  const [propertyId, setPropertyId] = useState(issue?.property_id ?? defaultProperty ?? "");
  const rooms = properties.find((p) => p.id === propertyId)?.rooms ?? [];
  const prop = properties.find((p) => p.id === issue?.property_id);
  const officer = contacts.find((c) => c.full_name === issue?.officer);
  const contractor = contractors.find((k) => k.id === issue?.contractor_id);

  const subtitle = issue
    ? `${priorityLabel(issue.priority)} · opened ${formatDateTime(issue.created_at)}${issue.creator?.full_name ? ` by ${issue.creator.full_name}` : issue.reported_by ? ` by ${issue.reported_by}` : ""}`
    : "Give it a priority: the target date follows from it.";

  return (
    <Sheet title={issue ? `${issue.ref} · ${issue.title}` : "New ticket"} subtitle={subtitle} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setSaved(false);
          run(() => saveIssue(issue?.id ?? null, fd), issue ? () => setSaved(true) : onClose);
        }}
        onChange={() => setSaved(false)}
      >
        <div className="sheet-body">
          {priority === "P1" && (
            <p className="jd-p1 wide">
              <AlertOctagon size={16} /> P1 emergencies need a phone call straight away. If anyone is in danger, call 999. Gas smell: 0800 111 999.
            </p>
          )}
          <div className="field wide">
            <label htmlFor="i-title">
              What&apos;s wrong<span className="req">*</span>
            </label>
            <input id="i-title" name="title" className="input" required defaultValue={issue?.title} placeholder="e.g. Shower leaking in the ground floor bathroom" />
          </div>
          <div className="field">
            <label htmlFor="i-prop">Property</label>
            <select id="i-prop" name="property_id" className="select" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Not sure / general</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-loc">Where in the building</label>
            <input id="i-loc" name="location" className="input" list="jd-rooms" defaultValue={issue?.location ?? ""} placeholder="e.g. Gym" />
            <datalist id="jd-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="i-pri">Priority</label>
            <select id="i-pri" name="priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Issue["priority"])}>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.note.split(".")[0].toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-cat">Category</label>
            <select id="i-cat" name="category" className="select" defaultValue={issue?.category ?? "Repair"}>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-status">Status</label>
            <select id="i-status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {ISSUE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-officer">Officer</label>
            <input id="i-officer" name="officer" className="input" list="jaidat-people" defaultValue={issue?.officer ?? ""} placeholder="Who looks after it" />
          </div>
          <div className="field">
            <label htmlFor="i-con">Contractor</label>
            <select id="i-con" name="contractor_id" className="select" defaultValue={issue?.contractor_id ?? ""}>
              <option value="">None yet</option>
              {contractors
                .filter((k) => k.status !== "Suspended" || k.id === issue?.contractor_id)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} · {k.trade}
                    {k.approved ? "" : " (not approved)"}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-cost">Cost (£)</label>
            <input id="i-cost" name="cost" className="input tnum" inputMode="decimal" defaultValue={issue?.cost != null ? num(issue.cost) : ""} placeholder="0.00" />
          </div>
          <div className="field wide">
            <label htmlFor="i-desc">Details</label>
            <textarea id="i-desc" name="description" className="textarea" defaultValue={issue?.description ?? ""} placeholder="What you saw, when, and anything already done" />
          </div>
          <div className="field">
            <label htmlFor="i-rep">Reported by</label>
            <input id="i-rep" name="reported_by" className="input" list="jaidat-people" defaultValue={issue?.reported_by ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-repc">Their email or phone</label>
            <input id="i-repc" name="reporter_contact" className="input" defaultValue={issue?.reporter_contact ?? ""} />
          </div>
          {(status === "Completed" || status === "Closed" || issue?.lesson) && (
            <div className="field wide">
              <label htmlFor="i-lesson">Lesson for next time</label>
              <textarea
                id="i-lesson"
                name="lesson"
                className="textarea"
                defaultValue={issue?.lesson ?? ""}
                placeholder="What should the next person know or do? Lessons feed the SOP drafts on the Documents tab."
              />
            </div>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {issue && canManage && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              disabled={pending}
              onClick={() => window.confirm(`Remove ${issue.ref} with its notes, quotes and attachments?`) && run(() => deleteIssue(issue.id), onClose)}
            >
              Remove
            </button>
          )}
          <div className="right">
            {saved && <span className="jd-saved">Saved</span>}
            <button type="button" className="btn" onClick={onClose}>
              {issue ? "Close" : "Cancel"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : issue ? "Save changes" : "Create ticket"}
            </button>
          </div>
        </div>
      </form>

      {issue && (
        <div className="jd-sheet-extra">
          <QuickActions issue={issue} />
          <ContactLinks issue={issue} officerEmail={officer?.email ?? null} contractor={contractor} propertyName={prop?.name ?? "the property"} />
          <Notes issueId={issue.id} notes={notes} canManage={canManage} />
          <Quotes issueId={issue.id} quotes={quotes} contractors={contractors} canManage={canManage} />
          <section className="jd-sub">
            <div className="jd-sub-head">
              <h3>Photos and documents</h3>
              <AddDocument propertyId={issue.property_id} links={{ issue_id: issue.id }} category="Maintenance" label="Attach" small />
            </div>
            <DocList files={files} canDelete={canManage} empty="Nothing attached yet." compact />
          </section>
        </div>
      )}
    </Sheet>
  );
}

function QuickActions({ issue }: { issue: Issue }) {
  const canEdit = useCanEdit();
  const { pending, error, run } = useRun();
  if (!canEdit || !isOpen(issue)) return null;
  const next: string[] =
    issue.status === "New"
      ? ["Assigned", "In progress"]
      : issue.status === "Awaiting quote"
        ? ["Awaiting approval", "In progress"]
        : issue.status === "Awaiting approval"
          ? ["In progress"]
          : issue.status === "In progress"
            ? ["On hold"]
            : ["In progress"];
  return (
    <section className="jd-quick">
      <span className="label">Move to</span>
      {next.map((s) => (
        <button key={s} type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => setIssueStatus(issue.id, s))}>
          {s}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-sm jd-done-btn"
        disabled={pending}
        onClick={() => {
          const lesson = window.prompt("Mark as completed. Any lesson for next time? (optional)", issue.lesson ?? "");
          if (lesson === null) return;
          run(() => setIssueStatus(issue.id, "Completed", lesson));
        }}
      >
        <Check size={15} /> Completed
      </button>
      <FormError error={error} />
    </section>
  );
}

function ContactLinks({
  issue,
  officerEmail,
  contractor,
  propertyName,
}: {
  issue: Issue;
  officerEmail: string | null;
  contractor?: Contractor;
  propertyName: string;
}) {
  const reporterEmail = issue.reporter_contact && issue.reporter_contact.includes("@") ? issue.reporter_contact : null;
  const summary = [
    `Reference: ${issue.ref}`,
    `Property: ${propertyName}`,
    `Location: ${issue.location ?? "To be confirmed"}`,
    `Problem: ${issue.title}`,
    `Priority: ${priorityLabel(issue.priority)}`,
    issue.target_date ? `Target date: ${formatDate(issue.target_date)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const toReporter = mailto(
    reporterEmail,
    `Your report ${issue.ref} - Jaidad UK`,
    `Assalamo Alaikum ${issue.reported_by ?? ""},\n\nThank you for contacting Jaidad UK. Your report has been registered under ${issue.ref}.\n\n${summary}\nStatus: ${issue.status}\n\nPlease quote ${issue.ref} in any follow-up. If anyone is in danger, call 999.\n\nJazakAllah,\nMKA Jaidad Team UK\njaidad@khuddam.co.uk`,
  );
  const toOfficer = mailto(officerEmail, `${issue.ref} assigned to you - ${propertyName}`, `Assalamo Alaikum ${issue.officer ?? ""},\n\nYou have been assigned ${issue.ref}.\n\n${summary}\n\n${issue.description ?? ""}`);
  const toContractor = contractor?.email
    ? mailto(contractor.email, `Work request ${issue.ref} - ${propertyName}`, `Dear ${contractor.name},\n\nPlease could you quote for / attend the following:\n\n${summary}\n\n${issue.description ?? ""}\n\nKind regards,\nMKA Jaidad Team UK\njaidad@khuddam.co.uk`)
    : null;

  if (!reporterEmail && !issue.officer && !toContractor) return null;
  return (
    <section className="jd-quick">
      <span className="label">
        <Mail size={13} /> Email
      </span>
      {reporterEmail && (
        <a className="btn btn-sm" href={toReporter}>
          Confirmation to {issue.reported_by ?? "reporter"}
        </a>
      )}
      {issue.officer && (
        <a className="btn btn-sm" href={toOfficer}>
          {issue.officer}
        </a>
      )}
      {toContractor && (
        <a className="btn btn-sm" href={toContractor}>
          <HardHat size={14} /> {contractor!.name}
        </a>
      )}
      <small className="muted-note">Opens your email app with the message ready. Nothing is sent until you press send.</small>
    </section>
  );
}

function Notes({ issueId, notes, canManage }: { issueId: string; notes: IssueNote[]; canManage: boolean }) {
  const canEdit = useCanEdit();
  const [body, setBody] = useState("");
  const { pending, error, run } = useRun();
  return (
    <section className="jd-sub">
      <div className="jd-sub-head">
        <h3>
          <MessageSquare size={16} /> Work notes
        </h3>
      </div>
      {notes.length === 0 ? (
        <p className="muted-note">No notes yet. Log calls, visits and decisions here.</p>
      ) : (
        <ul className="jd-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <p>{n.body}</p>
              <small>
                {n.creator?.full_name ?? "Someone"} · {formatDateTime(n.created_at)}
                {canManage && (
                  <button type="button" className="icon-link danger" title="Remove note" onClick={() => window.confirm("Remove this note?") && run(() => deleteNote(n.id))}>
                    <Trash2 size={13} />
                    <span className="sr-only">Remove note</span>
                  </button>
                )}
              </small>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="jd-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addNote(issueId, body), () => setBody(""));
          }}
        >
          <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a work note" aria-label="Add a work note" maxLength={2000} />
          <button type="submit" className="btn" disabled={pending || !body.trim()}>
            Add note
          </button>
        </form>
      )}
      <FormError error={error} />
    </section>
  );
}

function Quotes({ issueId, quotes, contractors, canManage }: { issueId: string; quotes: Quote[]; contractors: Contractor[]; canManage: boolean }) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const { pending, error, run } = useRun();
  const amounts = quotes.map((q) => num(q.amount));
  const name = (q: Quote) => contractors.find((k) => k.id === q.contractor_id)?.name ?? q.supplier ?? "Unknown";

  return (
    <section className="jd-sub">
      <div className="jd-sub-head">
        <h3>Quotes</h3>
        {canEdit && !adding && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add quote
          </button>
        )}
      </div>
      {quotes.length === 0 && !adding && <p className="muted-note">No quotes yet. Get two or three for bigger jobs and compare them here.</p>}
      {quotes.length > 0 && (
        <ul className="jd-quotes">
          {quotes.map((q) => {
            const flag = quoteFlag(num(q.amount), amounts);
            const k = contractors.find((x) => x.id === q.contractor_id);
            return (
              <li key={q.id} className={q.accepted ? "is-accepted" : ""}>
                <div>
                  <strong>{name(q)}</strong>
                  <small>
                    {[q.received_on ? `Received ${formatDate(q.received_on)}` : null, k && !k.approved ? "Contractor not approved" : null, q.notes].filter(Boolean).join(" · ")}
                  </small>
                </div>
                <b className="tnum">{money(num(q.amount))}</b>
                <span className={`jd-flag ${flag.startsWith("Over") ? "is-high" : flag === "Lowest" ? "is-low" : ""}`}>{flag}</span>
                <span className="jd-quote-actions">
                  {q.accepted ? (
                    <Pill value="Approved" label="Accepted" />
                  ) : (
                    canManage && (
                      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => acceptQuote(issueId, q.id))}>
                        Accept
                      </button>
                    )
                  )}
                  {canManage && q.accepted && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => acceptQuote(issueId, null))}>
                      Undo
                    </button>
                  )}
                  {canManage && (
                    <button type="button" className="icon-link danger" title="Remove quote" onClick={() => window.confirm("Remove this quote?") && run(() => deleteQuote(q.id))}>
                      <Trash2 size={14} />
                      <span className="sr-only">Remove quote</span>
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {quotes.length > 0 && !canManage && <p className="muted-note">Only the Jaidad department admin can accept a quote.</p>}
      {adding && (
        <form
          className="jd-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => saveQuote(issueId, null, fd), () => setAdding(false));
          }}
        >
          <select name="contractor_id" className="select" defaultValue="" aria-label="Contractor">
            <option value="">Other supplier (type below)</option>
            {contractors
              .filter((k) => k.status !== "Suspended")
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
          </select>
          <input name="supplier" className="input" placeholder="Supplier name" aria-label="Supplier" />
          <input name="amount" className="input tnum" inputMode="decimal" placeholder="Amount £" aria-label="Amount" required />
          <input name="received_on" type="date" className="input" aria-label="Received on" />
          <input name="notes" className="input jd-span" placeholder="Notes (what's included)" aria-label="Notes" />
          <div className="toolbar jd-span">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              Save quote
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <FormError error={error} />
    </section>
  );
}
