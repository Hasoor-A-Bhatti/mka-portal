"use client";

import { useState } from "react";
import { ArrowRight, CalendarRange, Check, MessageSquareText, PackageCheck, Search, Send, Undo2, X } from "lucide-react";
import { STORE_NAME, dateRange, lenderOf, roleOf, todayISO, type Loan, type Message } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { LoanPill } from "./bits";

type Filter = "departments" | "store" | "all";

const VERB: Record<string, string> = {
  Pending: "is asking to borrow",
  Approved: "will borrow",
  Collected: "is borrowing",
  Returned: "borrowed",
  Rejected: "was refused",
  Cancelled: "cancelled a request for",
};

type Event = { at: string; icon: React.ReactNode; who: string; text: string; tone?: "ok" | "no" };

/**
 * Everything happening on loans, for MKA Storage to keep an eye on: who is
 * borrowing what from whom, and every message along the way. Read only:
 * department-owned loans are run by that department.
 */
export function LogPanel({ loans, messages, today = todayISO() }: { loans: Loan[]; messages: Message[]; today?: string }) {
  const [filter, setFilter] = useState<Filter>("departments");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const byLoan = new Map<string, Message[]>();
  for (const m of messages) byLoan.set(m.loan_id, [...(byLoan.get(m.loan_id) ?? []), m]);
  const lastAt = (l: Loan) =>
    [l.updated_at ?? l.created_at, ...(byLoan.get(l.id) ?? []).map((m) => m.created_at)].sort().at(-1) ?? l.created_at;

  const q = query.trim().toLowerCase();
  const counts = {
    departments: loans.filter((l) => l.owner_department).length,
    store: loans.filter((l) => !l.owner_department).length,
    all: loans.length,
  };
  const list = loans
    .filter((l) => (filter === "all" ? true : filter === "store" ? !l.owner_department : Boolean(l.owner_department)))
    .filter(
      (l) =>
        !q ||
        [l.item_name, l.ref, l.requester_name, l.borrower_department, l.owner_department, l.status].join(" ").toLowerCase().includes(q),
    )
    .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));

  return (
    <section className="panel glass">
      <div className="panel-head">
        <div>
          <h2>Loan log</h2>
          <p className="muted-note">
            Who is borrowing what from whom, and every message along the way. Loans of department-owned items are run by that
            department; you can follow them here.
          </p>
        </div>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search the log</span>
          <input className="input" type="search" placeholder="Item, department, person" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Show">
        {(
          [
            ["departments", "Between departments"],
            ["store", `${STORE_NAME}'s items`],
            ["all", "All"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label} <em>{counts[k]}</em>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <strong>Nothing here yet</strong>
          {filter === "departments" ? "When a department asks to borrow another department's items, it'll show here." : "No loans match."}
        </div>
      ) : (
        <ol className="lg-list">
          {list.map((l) => {
            const thread = byLoan.get(l.id) ?? [];
            const isOpen = open === l.id;
            const borrowerName = l.borrower_department || l.requester_name || "Someone";
            return (
              <li key={l.id} className={`lg-entry ${isOpen ? "is-open" : ""}`}>
                <button type="button" className="lg-line" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                  <span className="lg-text">
                    <strong>{borrowerName}</strong>
                    {l.borrower_department && l.requester_name && <small> ({l.requester_name})</small>} {VERB[l.status] ?? "asked for"}{" "}
                    <strong>
                      {l.quantity > 1 ? `${l.quantity} × ` : ""}
                      {l.item_name}
                    </strong>{" "}
                    from <strong className={l.owner_department ? "lg-owner" : ""}>{lenderOf(l)}</strong>
                    <span className="lg-dates">
                      <CalendarRange size={13} /> {dateRange(l.start_date, l.end_date)}
                    </span>
                  </span>
                  <span className="lg-meta">
                    <LoanPill loan={l} today={today} />
                    {thread.length > 0 && (
                      <span className="lg-count" title="Messages">
                        <MessageSquareText size={13} /> {thread.length}
                      </span>
                    )}
                    <small>{formatDateTime(lastAt(l))}</small>
                  </span>
                </button>
                {isOpen && <Timeline loan={l} thread={thread} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Timeline({ loan: l, thread }: { loan: Loan; thread: Message[] }) {
  const events: Event[] = [
    {
      at: l.created_at,
      icon: <Send size={13} />,
      who: [l.requester_name, l.borrower_department].filter(Boolean).join(" · ") || "Borrower",
      text: `Asked for ${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.item_name} (${l.ref}) for ${dateRange(l.start_date, l.end_date)}${l.purpose ? `: ${l.purpose}` : ""}`,
    },
    ...thread.map<Event>((m) => {
      const role = roleOf(m);
      return {
        at: m.created_at,
        icon: <MessageSquareText size={13} />,
        who:
          role === "borrower"
            ? [m.author_name ?? l.requester_name, l.borrower_department].filter(Boolean).join(" · ")
            : role === "owner"
              ? [m.author_name, l.owner_department].filter(Boolean).join(" · ")
              : `${m.author_name ?? STORE_NAME} · ${STORE_NAME}`,
        text: m.body,
      };
    }),
  ];
  if (l.decided_at)
    events.push({
      at: l.decided_at,
      icon: l.status === "Rejected" ? <X size={13} /> : <Check size={13} />,
      who: l.decided_by_name ?? lenderOf(l),
      text: l.status === "Rejected" ? "Rejected the request" : "Approved the request",
      tone: l.status === "Rejected" ? "no" : "ok",
    });
  if (l.collected_at) events.push({ at: l.collected_at, icon: <PackageCheck size={13} />, who: lenderOf(l), text: "Collected", tone: "ok" });
  if (l.returned_at)
    events.push({ at: l.returned_at, icon: <Undo2 size={13} />, who: lenderOf(l), text: `Returned${l.return_note ? `: ${l.return_note}` : ""}`, tone: "ok" });
  if (l.status === "Cancelled") events.push({ at: l.updated_at ?? l.created_at, icon: <X size={13} />, who: "", text: "Cancelled", tone: "no" });
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ol className="lg-timeline">
      {events.map((e, i) => (
        <li key={i} className={e.tone ? `is-${e.tone}` : ""}>
          <span className="lg-dot">{e.icon}</span>
          <div>
            <small>
              {e.who && <b>{e.who}</b>}
              {e.who && " · "}
              {formatDateTime(e.at)}
            </small>
            <p>{e.text}</p>
          </div>
        </li>
      ))}
      <li className="lg-route">
        <span className="lg-dot">
          <ArrowRight size={13} />
        </span>
        <div>
          <small>
            {l.location_name ? `Kept at ${l.location_name}` : "Location not given"} · decided by {lenderOf(l)}
          </small>
        </div>
      </li>
    </ol>
  );
}
