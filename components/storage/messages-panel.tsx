"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { todayISO, type Loan, type Message } from "@/lib/storage";
import { staffMessage } from "@/app/(portal)/storage/actions";
import { borrowerMessage } from "@/app/(portal)/equipment-loans/actions";
import { FormError, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { LoanPill } from "./bits";

/**
 * Conversations about loan requests, newest first. Storage and the borrower
 * see the same thread; each side's unread messages are highlighted.
 */
export function MessagesPanel({
  loans,
  messages,
  side,
  focusId,
}: {
  loans: Loan[];
  messages: Message[];
  side: "storage" | "borrower";
  focusId?: string;
}) {
  const today = todayISO();
  const [query, setQuery] = useState("");
  const byLoan = new Map<string, Message[]>();
  for (const m of messages) byLoan.set(m.loan_id, [...(byLoan.get(m.loan_id) ?? []), m]);
  const last = (l: Loan) => byLoan.get(l.id)?.at(-1)?.created_at ?? "";
  const q = query.trim().toLowerCase();
  const threads = loans
    .filter((l) => byLoan.has(l.id) || l.id === focusId)
    .filter((l) => !q || [l.item_name, l.ref, l.requester_name, l.borrower_department].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : last(b).localeCompare(last(a))));

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Messages</h2>
        {side === "storage" && (
          <label className="search">
            <span className="sr-only">Search messages</span>
            <input className="input" type="search" placeholder="Item, LN number, person" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
      </div>
      <p className="muted-note" style={{ marginBottom: 14 }}>
        {side === "storage"
          ? "Messages to and from borrowers, one conversation per request. Messages sent with an approval or rejection appear here too."
          : "Messages between you and MKA Storage about your requests. To start one, press Message on a request."}
      </p>
      {threads.length === 0 ? (
        <div className="empty">
          <strong>No messages yet</strong>
          {side === "storage" ? "Use Message on any request to write to the borrower." : "When MKA Storage writes to you, it'll appear here."}
        </div>
      ) : (
        <ul className="ln-threads">
          {threads.map((l) => (
            <Thread key={l.id} loan={l} messages={byLoan.get(l.id) ?? []} side={side} focus={l.id === focusId} today={today} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Thread({ loan: l, messages, side, focus, today }: { loan: Loan; messages: Message[]; side: "storage" | "borrower"; focus: boolean; today: string }) {
  const canEdit = useCanEdit();
  const [body, setBody] = useState("");
  const { pending, error, run } = useRun();
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);
  const mine = (m: Message) => (side === "storage" ? m.from_storage : !m.from_storage);
  const unread = messages.filter((m) => !mine(m) && !m.read_at).length;

  return (
    <li ref={ref} className={`ln-thread ${unread ? "is-unread" : ""} ${focus ? "is-focus" : ""}`}>
      <div className="ln-thread-head">
        <strong>{l.item_name}</strong>
        <LoanPill loan={l} today={today} />
        <span className="ln-ref">{l.ref}</span>
        {side === "storage" && <small>{[l.requester_name, l.borrower_department].filter(Boolean).join(" · ")}</small>}
        {unread > 0 && <span className="tab-badge alert">{unread} new</span>}
      </div>
      <ol className="ln-bubbles">
        {messages.map((m) => (
          <li key={m.id} className={`ln-bubble ${mine(m) ? "is-mine" : ""} ${!mine(m) && !m.read_at ? "is-new" : ""}`}>
            <p>{m.body}</p>
            <small>
              {m.from_storage ? `${m.author_name ?? "MKA Storage"} · MKA Storage` : (m.author_name ?? l.requester_name ?? "Borrower")} · {formatDateTime(m.created_at)}
            </small>
          </li>
        ))}
        {messages.length === 0 && <li className="muted-note">No messages on this request yet.</li>}
      </ol>
      {canEdit && (
        <form
          className="ln-reply"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (side === "storage" ? staffMessage(l.id, body) : borrowerMessage(l.id, body)), () => setBody(""));
          }}
        >
          <label className="sr-only" htmlFor={`reply-${l.id}`}>
            Message
          </label>
          <textarea
            id={`reply-${l.id}`}
            className="textarea"
            rows={2}
            maxLength={2000}
            placeholder={side === "storage" ? "Write to the borrower…" : "Write to MKA Storage…"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus={focus && messages.length === 0}
          />
          <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
            <Send size={16} /> {pending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
      <FormError error={error} />
    </li>
  );
}
