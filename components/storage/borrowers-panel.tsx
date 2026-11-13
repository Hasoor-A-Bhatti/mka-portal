"use client";

import { useRef } from "react";
import { CheckCircle2, Clock, Trash2, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Borrower } from "@/lib/storage";
import { addBorrower, removeBorrower } from "@/app/(portal)/storage/actions";
import { FormError, useRun } from "@/components/fleet/ui";

export function BorrowersPanel({ borrowers, canManage, error: loadError }: { borrowers: Borrower[]; canManage: boolean; error?: string | null }) {
  const { pending, error, run } = useRun();
  const form = useRef<HTMLFormElement>(null);

  return (
    <div className="split st-split">
      <section className="panel glass">
        <div className="panel-head">
          <h2>
            Borrowers {borrowers.length > 0 && <span className="count-badge">{borrowers.length}</span>}
          </h2>
        </div>
        <p className="muted-note" style={{ marginBottom: 14 }}>
          Department leads who can sign in to Equipment Loans with their Google account. They only see Equipment Loans: they can search the catalogue and ask to
          borrow, but can&apos;t see or change the inventory.
        </p>
        {loadError && <p className="form-error">{loadError}</p>}
        {borrowers.length === 0 ? (
          <div className="empty">
            <strong>Nobody on the list yet</strong>
            {canManage ? "Add a department lead's email to give them access." : "The Storage department admin adds borrowers."}
          </div>
        ) : (
          <ul className="driver-list">
            {borrowers.map((b) => (
              <li key={b.email} className="driver">
                <span className="avatar" aria-hidden>
                  {(b.full_name ?? b.email)
                    .replace(/[^\p{L}\s]/gu, " ")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("")}
                </span>
                <div className="driver-info">
                  <strong>{b.full_name ?? b.email}</strong>
                  <small>{[b.department, b.full_name ? b.email : null].filter(Boolean).join(" · ")}</small>
                  <small>
                    {b.signed_in ? (
                      <span className="st-ok">
                        <CheckCircle2 size={13} /> Has signed in
                      </span>
                    ) : (
                      <span className="muted">
                        <Clock size={13} /> Not signed in yet
                      </span>
                    )}
                    {` · ${b.requests} request${Number(b.requests) === 1 ? "" : "s"} · added ${formatDate(b.added_at)}`}
                  </small>
                </div>
                {canManage && (
                  <div className="driver-actions">
                    <button
                      type="button"
                      className="icon-link danger"
                      title="Remove"
                      disabled={pending}
                      onClick={() => window.confirm(`Remove ${b.full_name ?? b.email}? They won't be able to open Equipment Loans any more. Their past requests stay.`) && run(() => removeBorrower(b.email))}
                    >
                      <Trash2 size={15} />
                      <span className="sr-only">Remove {b.email}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!canManage && <FormError error={error} />}
      </section>

      {canManage && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>Add a borrower</h2>
          </div>
          <form
            ref={form}
            className="st-add-borrower"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addBorrower(new FormData(e.currentTarget)), () => form.current?.reset());
            }}
          >
            <div className="field">
              <label htmlFor="br-email">
                Google account email<span className="req">*</span>
              </label>
              <input id="br-email" name="email" type="email" className="input" required placeholder="name@khuddam.co.uk" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="br-name">Name</label>
              <input id="br-name" name="full_name" className="input" maxLength={120} placeholder="Taken from their Google account if blank" />
            </div>
            <div className="field">
              <label htmlFor="br-dept">Department</label>
              <input id="br-dept" name="department" className="input" maxLength={120} placeholder="e.g. Ishaat" />
            </div>
            <FormError error={error} />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              <UserPlus size={17} /> {pending ? "Adding…" : "Add borrower"}
            </button>
            <p className="muted-note">They get access the next time they sign in to the portal (or straight away if they&apos;re already signed in).</p>
          </form>
        </section>
      )}
    </div>
  );
}
