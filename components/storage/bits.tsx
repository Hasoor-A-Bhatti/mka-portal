import type { ReactNode } from "react";
import { CalendarRange, MapPin, Phone, Tag, UserRound, MessageSquareText } from "lucide-react";
import { dateRange, loanOverdue, collectionLate, loanTone, todayISO, type Loan } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";

export function Pill({ value, label }: { value: string; label?: string }) {
  return (
    <span className="status" style={vars({ "--tone": loanTone(value) })}>
      {label ?? value}
    </span>
  );
}

export function LoanPill({ loan, today = todayISO() }: { loan: Loan; today?: string }) {
  if (loanOverdue(loan, today)) return <Pill value="Overdue" label="Overdue" />;
  if (collectionLate(loan, today)) return <Pill value="Pending" label="Not collected yet" />;
  const labels: Record<string, string> = { Collected: "On loan", Rejected: "Not approved" };
  return <Pill value={loan.status} label={labels[loan.status]} />;
}

/** One loan request, as both Storage and the borrower see it. */
export function LoanCard({
  loan: l,
  staff,
  today = todayISO(),
  unread = 0,
  children,
}: {
  loan: Loan;
  staff: boolean;
  today?: string;
  unread?: number;
  children?: ReactNode;
}) {
  const late = loanOverdue(l, today);
  return (
    <li className={`ln-card ${late ? "is-late" : ""}`}>
      <div className="ln-card-main">
        <div className="ln-card-top">
          <strong>{l.item_name}</strong>
          {l.quantity > 1 && <span className="ln-qty">×{l.quantity}</span>}
          <LoanPill loan={l} today={today} />
          {unread > 0 && (
            <span className="tab-badge alert" title="Unread messages">
              <MessageSquareText size={11} /> {unread}
            </span>
          )}
          <span className="ln-ref">{l.ref}</span>
        </div>
        <small>
          <CalendarRange size={14} /> {dateRange(l.start_date, l.end_date)}
          {late && <b className="ln-late"> · due back {formatDate(l.end_date)}</b>}
        </small>
        <small>
          <MapPin size={14} /> {l.location_name ?? "Location to be confirmed"}
          {l.owned_by && (
            <>
              {" "}
              <Tag size={13} /> Owned by {l.owned_by}
            </>
          )}
        </small>
        {staff && (
          <small>
            <UserRound size={14} /> {l.requester_name ?? l.requester_email ?? "Unknown"}
            {l.borrower_department && ` · ${l.borrower_department}`}
            {l.phone && (
              <a href={`tel:${l.phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={13} /> {l.phone}
              </a>
            )}
            {l.requester_email && <a href={`mailto:${l.requester_email}`}>{l.requester_email}</a>}
          </small>
        )}
        {l.purpose && <p className="ln-purpose">{l.purpose}</p>}
        {l.decision_note && (
          <p className={`ln-note ${l.status === "Rejected" ? "is-no" : ""}`}>
            <b>{l.decided_by_name ?? "MKA Storage"}:</b> {l.decision_note}
          </p>
        )}
        {l.return_note && (
          <p className="ln-note">
            <b>On return:</b> {l.return_note}
          </p>
        )}
        <small className="ln-when">
          Requested {formatDate(l.created_at)}
          {l.decided_at && ` · ${l.status === "Rejected" ? "not approved" : "approved"} ${formatDate(l.decided_at)}`}
          {l.collected_at && ` · collected ${formatDate(l.collected_at)}`}
          {l.returned_at && ` · returned ${formatDate(l.returned_at)}`}
        </small>
      </div>
      {children && <div className="ln-card-actions">{children}</div>}
    </li>
  );
}

export function Section({ title, count, children, note }: { title: string; count?: number; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel glass ln-section">
      <div className="panel-head">
        <h2>
          {title} {count != null && count > 0 && <span className="count-badge">{count}</span>}
        </h2>
      </div>
      {note && <p className="muted-note" style={{ marginBottom: 12 }}>{note}</p>}
      {children}
    </section>
  );
}
