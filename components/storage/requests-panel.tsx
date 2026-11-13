"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, MessageSquareText, PackageCheck, Undo2, X, CalendarClock } from "lucide-react";
import { bookedFor, collectionLate, loanOverdue, todayISO, type Item, type Loan, type Message } from "@/lib/storage";
import { changeLoanDates, decideLoan, setLoanStatus } from "@/app/(portal)/storage/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { LoanCard, Section } from "./bits";

type Step = { loan: Loan; action: "Approved" | "Rejected" | "Collected" | "Returned" | "Cancelled" | "dates" };

export function RequestsPanel({ loans, items, messages, canManage }: { loans: Loan[]; items: Item[]; messages: Message[]; canManage: boolean }) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [step, setStep] = useState<Step | null>(null);
  const [showAll, setShowAll] = useState(false);

  const unread = (id: string) => messages.filter((m) => m.loan_id === id && !m.from_storage && !m.read_at).length;
  const pending = loans.filter((l) => l.status === "Pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const approved = loans.filter((l) => l.status === "Approved").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const out = loans
    .filter((l) => l.status === "Collected")
    .sort((a, b) => Number(loanOverdue(b, today)) - Number(loanOverdue(a, today)) || a.end_date.localeCompare(b.end_date));
  const done = loans.filter((l) => ["Returned", "Rejected", "Cancelled"].includes(l.status)).sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));

  const message = (l: Loan) => (
    <Link href={`/storage?tab=messages&loan=${l.id}`} className="btn btn-sm btn-ghost">
      <MessageSquareText size={15} /> Message
    </Link>
  );

  return (
    <div className="stack">
      <Section
        title="Waiting for approval"
        count={pending.length}
        note={canManage ? "Approve or reject each request. You can add a message, which the borrower sees straight away." : "Only the Storage department admin can approve or reject requests."}
      >
        {pending.length === 0 ? (
          <p className="muted-note">No requests waiting.</p>
        ) : (
          <ul className="ln-list">
            {pending.map((l) => {
              const item = items.find((i) => i.id === l.item_id);
              const free = item ? item.quantity - bookedFor(loans, item.id, l.start_date, l.end_date, l.id) : 0;
              return (
                <LoanCard key={l.id} loan={l} staff today={today} unread={unread(l.id)}>
                  <small className={`ln-avail ${free < l.quantity ? "is-short" : ""}`}>
                    {item ? `${Math.max(free, 0)} of ${item.quantity} free for these dates` : "No longer in the catalogue"}
                  </small>
                  {canManage && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep({ loan: l, action: "Approved" })} disabled={!item}>
                        <Check size={15} /> Approve
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setStep({ loan: l, action: "Rejected" })}>
                        <X size={15} /> Reject
                      </button>
                    </>
                  )}
                  {canEdit && message(l)}
                </LoanCard>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Approved: to be collected" count={approved.length} note="Mark each one collected when the borrower picks it up.">
        {approved.length === 0 ? (
          <p className="muted-note">Nothing waiting to be collected.</p>
        ) : (
          <ul className="ln-list">
            {approved.map((l) => (
              <LoanCard key={l.id} loan={l} staff today={today} unread={unread(l.id)}>
                {collectionLate(l, today) && <small className="ln-avail is-short">Collection date has passed</small>}
                {canEdit && (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep({ loan: l, action: "Collected" })}>
                      <PackageCheck size={15} /> Collected
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep({ loan: l, action: "dates" })}>
                      <CalendarClock size={15} /> Dates
                    </button>
                    {canManage && (
                      <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setStep({ loan: l, action: "Cancelled" })}>
                        Cancel
                      </button>
                    )}
                    {message(l)}
                  </>
                )}
              </LoanCard>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Out on loan" count={out.length} note="Mark each one returned when it's back in the store.">
        {out.length === 0 ? (
          <p className="muted-note">Nothing is out on loan.</p>
        ) : (
          <ul className="ln-list">
            {out.map((l) => (
              <LoanCard key={l.id} loan={l} staff today={today} unread={unread(l.id)}>
                {canEdit && (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep({ loan: l, action: "Returned" })}>
                      <Undo2 size={15} /> Returned
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep({ loan: l, action: "dates" })}>
                      <CalendarClock size={15} /> Extend
                    </button>
                    {message(l)}
                  </>
                )}
              </LoanCard>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History" count={done.length}>
        {done.length === 0 ? (
          <p className="muted-note">Returned, rejected and cancelled requests appear here.</p>
        ) : (
          <>
            <ul className="ln-list">
              {(showAll ? done : done.slice(0, 8)).map((l) => (
                <LoanCard key={l.id} loan={l} staff today={today} unread={unread(l.id)}>
                  {canEdit && message(l)}
                </LoanCard>
              ))}
            </ul>
            {done.length > 8 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(!showAll)} style={{ marginTop: 10 }}>
                {showAll ? "Show fewer" : `Show all ${done.length}`}
              </button>
            )}
          </>
        )}
      </Section>

      {step && (step.action === "dates" ? <DatesDialog loan={step.loan} onClose={() => setStep(null)} /> : <StepDialog step={step} items={items} loans={loans} onClose={() => setStep(null)} />)}
    </div>
  );
}

const STEP_TEXT = {
  Approved: { title: "Approve", button: "Approve", label: "Message to the borrower (optional)", hint: "e.g. collection time, who to ask for, what to bring back" },
  Rejected: { title: "Reject", button: "Reject", label: "Reason (optional, sent to the borrower)", hint: "e.g. already booked for those dates" },
  Collected: { title: "Mark collected", button: "Collected", label: null, hint: "" },
  Returned: { title: "Mark returned", button: "Returned", label: "Note on return (optional)", hint: "e.g. all back in good condition" },
  Cancelled: { title: "Cancel", button: "Cancel request", label: "Message to the borrower (optional)", hint: "Why it's been cancelled" },
} as const;

function StepDialog({ step, items, loans, onClose }: { step: Step; items: Item[]; loans: Loan[]; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [note, setNote] = useState("");
  const l = step.loan;
  const a = step.action as keyof typeof STEP_TEXT;
  const t = STEP_TEXT[a];
  const item = items.find((i) => i.id === l.item_id);
  const free = item ? item.quantity - bookedFor(loans, item.id, l.start_date, l.end_date, l.id) : 0;

  return (
    <Sheet title={`${t.title}: ${l.item_name}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`} subtitle={`${l.ref} · ${l.requester_name ?? l.requester_email ?? "Borrower"}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => (a === "Approved" || a === "Rejected" ? decideLoan(l.id, a, note) : setLoanStatus(l.id, a, note)), onClose);
        }}
      >
        <div className="sheet-body">
          {a === "Approved" && item && free < l.quantity && (
            <p className="form-error wide" role="alert">
              Only {Math.max(free, 0)} free for these dates. Change the dates or quantity with the borrower first.
            </p>
          )}
          {a === "Returned" && (
            <p className="muted-note wide">If anything didn&apos;t come back, mark it as missing on the Inventory tab afterwards.</p>
          )}
          {a === "Collected" && <p className="muted-note wide">Confirm {l.requester_name ?? "the borrower"} has picked up {l.quantity > 1 ? `all ${l.quantity}` : "the item"}.</p>}
          {t.label && (
            <div className="field wide">
              <label htmlFor="st-note">{t.label}</label>
              <textarea id="st-note" className="textarea" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.hint} autoFocus />
            </div>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Back
            </button>
            <button type="submit" className={`btn ${a === "Rejected" || a === "Cancelled" ? "btn-danger" : "btn-primary"}`} disabled={pending}>
              {pending ? "Saving…" : t.button}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function DatesDialog({ loan: l, onClose }: { loan: Loan; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title={`Change dates: ${l.item_name}`} subtitle={`${l.ref} · let the borrower know with a message.`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => changeLoanDates(l.id, new FormData(e.currentTarget)), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="dt-from">From</label>
            <input id="dt-from" name="start_date" type="date" className="input" required defaultValue={l.start_date} readOnly={l.status === "Collected"} />
          </div>
          <div className="field">
            <label htmlFor="dt-to">Return by</label>
            <input id="dt-to" name="end_date" type="date" className="input" required defaultValue={l.end_date} min={l.start_date} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
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
