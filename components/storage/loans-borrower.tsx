"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, MessageSquareText, Pencil, Search, Tag, PackagePlus, PackageCheck } from "lucide-react";
import { addDays, dateRange, loanOverdue, todayISO, type Loan, type Message, type SearchResult } from "@/lib/storage";
import { cancelRequest, requestItem, updateRequest } from "@/app/(portal)/equipment-loans/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { LoanCard, Pill, Section } from "./bits";

// ---------- Find equipment ----------

export function FindPanel({
  results,
  searched,
  q,
  from,
  to,
  lastDepartment,
  lastPhone,
  error,
}: {
  results: SearchResult[];
  searched: boolean;
  q: string;
  from: string;
  to: string;
  lastDepartment: string;
  lastPhone: string;
  error: string | null;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [asking, setAsking] = useState<SearchResult | null>(null);
  const [start, setStart] = useState(from);
  const dated = Boolean(from);

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Find equipment</h2>
      </div>
      <form className="ln-search" action="/equipment-loans" method="get">
        <label className="search ln-search-q">
          <Search size={18} />
          <span className="sr-only">What do you need?</span>
          <input className="input" type="search" name="q" defaultValue={q} placeholder="What do you need? e.g. gazebo, projector, tables" autoFocus={!searched} />
        </label>
        <div className="field ln-search-date">
          <label htmlFor="sf-from">From</label>
          <input id="sf-from" className="input" type="date" name="from" min={today} defaultValue={from} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field ln-search-date">
          <label htmlFor="sf-to">To</label>
          <input id="sf-to" className="input" type="date" name="to" min={start || today} defaultValue={to} />
        </div>
        <button type="submit" className="btn btn-primary ln-search-go">
          <Search size={17} /> Search
        </button>
      </form>
      <p className="muted-note ln-search-hint">Add your dates to see how many are free for them. Search with nothing typed to browse everything.</p>

      {error && <p className="form-error">{error}</p>}

      {!searched ? (
        <div className="empty">
          <strong>Search the MKA Storage catalogue</strong>
          Results show where each item is kept and which department it belongs to. Press Request item to ask to borrow it.
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <strong>Nothing found{q ? ` for “${q}”` : ""}</strong>
          Try a shorter or different word, or message MKA Storage about what you need.
        </div>
      ) : (
        <>
          <p className="muted-note" style={{ margin: "4px 0 12px" }}>
            {results.length} result{results.length === 1 ? "" : "s"}
            {dated ? ` · availability for ${dateRange(from, to || from)}` : " · availability today"}
          </p>
          <ul className="ln-results">
            {results.map((r) => (
              <li key={r.id} className="ln-result glass">
                <div className="ln-result-main">
                  <strong>{r.item_name}</strong>
                  {r.category && <small className="muted">{r.category}</small>}
                  <small>
                    <MapPin size={14} /> {r.location_name ?? "Location to be confirmed"}
                    {r.site && r.location_name && !r.location_name.startsWith(r.site) && <span className="muted"> · {r.site}</span>}
                  </small>
                  <small>
                    <Tag size={13} /> Owned by {r.owned_by ?? "MKA Storage"}
                  </small>
                </div>
                <div className="ln-result-side">
                  {r.quantity === 0 ? (
                    <Pill value="Out of stock" label="None in store" />
                  ) : r.available === 0 ? (
                    <Pill value="Missing" label={dated ? "None free then" : "None free now"} />
                  ) : (
                    <Pill value="In stock" label={`${r.available} of ${r.quantity} free`} />
                  )}
                  {canEdit && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsking(r)} disabled={r.quantity === 0}>
                      <PackagePlus size={15} /> Request item
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {asking && (
        <RequestDialog
          item={asking}
          from={from}
          to={to}
          department={lastDepartment}
          phone={lastPhone}
          onClose={() => setAsking(null)}
        />
      )}
    </section>
  );
}

function RequestFields({ max, from, to, quantity, department, phone, purpose }: { max: number; from: string; to: string; quantity: number; department: string; phone: string; purpose: string }) {
  const today = todayISO();
  const [start, setStart] = useState(from);
  return (
    <>
      <div className="field">
        <label htmlFor="rq-from">
          From<span className="req">*</span>
        </label>
        <input id="rq-from" name="start_date" type="date" className="input" required min={today} defaultValue={from} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rq-to">
          Return by<span className="req">*</span>
        </label>
        <input id="rq-to" name="end_date" type="date" className="input" required min={start || today} defaultValue={to} />
      </div>
      <div className="field">
        <label htmlFor="rq-qty">
          How many<span className="req">*</span>
        </label>
        <input id="rq-qty" name="quantity" type="number" inputMode="numeric" className="input" required min={1} max={Math.max(max, 1)} defaultValue={quantity} />
      </div>
      <div className="field">
        <label htmlFor="rq-dept">
          Your department<span className="req">*</span>
        </label>
        <input id="rq-dept" name="borrower_department" className="input" required maxLength={120} defaultValue={department} placeholder="e.g. Ishaat" />
      </div>
      <div className="field">
        <label htmlFor="rq-phone">Phone</label>
        <input id="rq-phone" name="phone" type="tel" className="input" maxLength={40} defaultValue={phone} placeholder="For collection" />
      </div>
      <div className="field wide">
        <label htmlFor="rq-why">
          What it&apos;s for<span className="req">*</span>
        </label>
        <textarea id="rq-why" name="purpose" className="textarea" required maxLength={1000} defaultValue={purpose} placeholder="Event, venue and anything Storage should know" />
      </div>
    </>
  );
}

function RequestDialog({ item, from, to, department, phone, onClose }: { item: SearchResult; from: string; to: string; department: string; phone: string; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const today = todayISO();
  const start = from || today;
  return (
    <Sheet title={`Request ${item.item_name}`} subtitle={`${item.location_name ?? "MKA Storage"} · owned by ${item.owned_by ?? "MKA Storage"}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => requestItem(item.id, new FormData(e.currentTarget)), () => {
            onClose();
            window.location.assign("/equipment-loans?tab=pending");
          });
        }}
      >
        <div className="sheet-body">
          <RequestFields max={item.quantity} from={start} to={to || (from ? from : addDays(today, 1))} quantity={1} department={department} phone={phone} purpose="" />
          <p className="muted-note wide">MKA Storage will approve or reject it. You&apos;ll see the answer on your Pending and My loans tabs, with any message.</p>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Pending and My loans ----------

const unreadFor = (messages: Message[], id: string) => messages.filter((m) => m.loan_id === id && m.from_storage && !m.read_at).length;

function MessageLink({ loan }: { loan: Loan }) {
  return (
    <Link href={`/equipment-loans?tab=messages&loan=${loan.id}`} className="btn btn-sm btn-ghost">
      <MessageSquareText size={15} /> Message
    </Link>
  );
}

export function PendingPanel({ loans, messages }: { loans: Loan[]; messages: Message[] }) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [editing, setEditing] = useState<Loan | null>(null);
  const { pending, error, run } = useRun();
  const list = loans.filter((l) => l.status === "Pending");

  return (
    <Section title="Waiting for approval" count={list.length} note="Requests MKA Storage hasn't answered yet. You can change or cancel them until they do.">
      {list.length === 0 ? (
        <div className="empty">
          <strong>Nothing waiting</strong>
          <span>
            <Link href="/equipment-loans">Find equipment</Link> to make a request.
          </span>
        </div>
      ) : (
        <ul className="ln-list">
          {list.map((l) => (
            <LoanCard key={l.id} loan={l} staff={false} today={today} unread={unreadFor(messages, l.id)}>
              {canEdit && (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(l)}>
                    <Pencil size={14} /> Change
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`Cancel your request for ${l.item_name}?`) && run(() => cancelRequest(l.id))}>
                    Cancel
                  </button>
                  <MessageLink loan={l} />
                </>
              )}
            </LoanCard>
          ))}
        </ul>
      )}
      <FormError error={error} />
      {editing && <EditRequestDialog loan={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function EditRequestDialog({ loan: l, onClose }: { loan: Loan; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={`Change request: ${l.item_name}`} subtitle={l.ref} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateRequest(l.id, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <RequestFields max={100000} from={l.start_date} to={l.end_date} quantity={l.quantity} department={l.borrower_department ?? ""} phone={l.phone ?? ""} purpose={l.purpose ?? ""} />
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

export function MyLoansPanel({ loans, messages }: { loans: Loan[]; messages: Message[] }) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const { pending, error, run } = useRun();
  const [showAll, setShowAll] = useState(false);
  const ready = loans.filter((l) => l.status === "Approved").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const out = loans.filter((l) => l.status === "Collected").sort((a, b) => a.end_date.localeCompare(b.end_date));
  const past = loans.filter((l) => ["Returned", "Rejected", "Cancelled"].includes(l.status));

  return (
    <div className="stack">
      <Section title="Approved: ready to collect" count={ready.length} note="Collect from the location shown. Check MKA Storage's message for any instructions.">
        {ready.length === 0 ? (
          <p className="muted-note">Nothing approved and waiting to be collected.</p>
        ) : (
          <ul className="ln-list">
            {ready.map((l) => (
              <LoanCard key={l.id} loan={l} staff={false} today={today} unread={unreadFor(messages, l.id)}>
                <small className="ln-collect">
                  <PackageCheck size={15} /> Collect from {l.location_name ?? "MKA Storage"}
                </small>
                {canEdit && (
                  <>
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm(`You no longer need ${l.item_name}? MKA Storage will be told.`) && run(() => cancelRequest(l.id))}>
                      No longer needed
                    </button>
                    <MessageLink loan={l} />
                  </>
                )}
              </LoanCard>
            ))}
          </ul>
        )}
        <FormError error={error} />
      </Section>

      <Section title="On loan to you" count={out.length} note="Please return each item by its date. Need it longer? Send MKA Storage a message.">
        {out.length === 0 ? (
          <p className="muted-note">You don&apos;t have anything on loan.</p>
        ) : (
          <ul className="ln-list">
            {out.map((l) => (
              <LoanCard key={l.id} loan={l} staff={false} today={today} unread={unreadFor(messages, l.id)}>
                <small className={`ln-collect ${loanOverdue(l, today) ? "is-late" : ""}`}>Return to {l.location_name ?? "MKA Storage"}</small>
                {canEdit && <MessageLink loan={l} />}
              </LoanCard>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Past requests" count={past.length}>
        {past.length === 0 ? (
          <p className="muted-note">Returned, rejected and cancelled requests appear here.</p>
        ) : (
          <>
            <ul className="ln-list">
              {(showAll ? past : past.slice(0, 8)).map((l) => (
                <LoanCard key={l.id} loan={l} staff={false} today={today} unread={unreadFor(messages, l.id)}>
                  {canEdit && <MessageLink loan={l} />}
                </LoanCard>
              ))}
            </ul>
            {past.length > 8 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(!showAll)} style={{ marginTop: 10 }}>
                {showAll ? "Show fewer" : `Show all ${past.length}`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
