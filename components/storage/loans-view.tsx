import Link from "next/link";
import { getDepartment } from "@/lib/departments";
import { loanOverdue, todayISO, type Loan, type Message, type SearchResult } from "@/lib/storage";
import { vars } from "@/lib/css";
import { EditAccess } from "@/components/edit-access";
import { MessagesPanel } from "./messages-panel";
import { FindPanel, MyLoansPanel, PendingPanel } from "./loans-borrower";
import { RequestsPanel } from "./requests-panel";
import { LiveRefresh } from "@/components/live-refresh";

export const LOAN_TABS = [
  { key: "find", label: "Find equipment" },
  { key: "pending", label: "Pending" },
  { key: "loans", label: "My loans" },
  { key: "lending", label: "Borrowing requests" },
  { key: "messages", label: "Messages" },
] as const;
export type LoanTab = (typeof LOAN_TABS)[number]["key"];

/** The borrower's Equipment Loans page. */
export function LoansView({
  tab,
  loans,
  messages,
  unreadBefore,
  search,
  loanId,
  meId,
  lending,
  canEdit,
  firstName,
  error,
  today = todayISO(),
}: {
  tab: LoanTab;
  loans: Loan[];
  messages: Message[];
  unreadBefore: number;
  search: { searched: boolean; q: string; from: string; to: string; results: SearchResult[]; error: string | null };
  loanId?: string;
  meId: string;
  /** Requests for items owned by the department this person heads. */
  lending: { department: string | null; loans: Loan[] };
  canEdit: boolean;
  firstName: string;
  error: string | null;
  today?: string;
}) {
  const dept = getDepartment("equipment-loans")!;
  const Icon = dept.icon;
  const pending = loans.filter((l) => l.status === "Pending").length;
  const ready = loans.filter((l) => l.status === "Approved").length;
  const out = loans.filter((l) => l.status === "Collected");
  const overdue = out.filter((l) => loanOverdue(l, today)).length;
  const last = loans.find((l) => l.borrower_department);
  // Borrowing requests: shown to department heads (anyone on the borrowers list with a department).
  const lendLoans = lending.loans;
  const lendPending = lendLoans.filter((l) => l.status === "Pending").length;
  const tabs = LOAN_TABS.filter((t) => t.key !== "lending" || lending.department || lendLoans.length);
  const lendIds = new Set(lendLoans.map((l) => l.id));
  const lendMessages = messages.filter((m) => lendIds.has(m.loan_id));
  // Messages tab: my own requests and my department's, without repeats.
  const threadLoans = [...loans, ...lendLoans.filter((l) => !loans.some((x) => x.id === l.id))];

  const badges: Partial<Record<LoanTab, { n: number; alert?: boolean }>> = {
    pending: pending ? { n: pending } : undefined,
    loans: ready || overdue ? { n: ready + overdue, alert: overdue > 0 } : undefined,
    lending: lendPending ? { n: lendPending, alert: true } : undefined,
    messages: unreadBefore && tab !== "messages" ? { n: unreadBefore, alert: true } : undefined,
  };

  return (
    <EditAccess canEdit={canEdit}>
      <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
        <LiveRefresh channel="loans" tables={["storage_loans", "storage_loan_messages"]} />
        <header className="page-head rise">
          <div className="page-title">
            <span className="dept-icon">
              <Icon size={28} />
            </span>
            <div>
              <span className="eyebrow">Salam, {firstName}</span>
              <h1>{dept.name}</h1>
              <p>
                Borrow equipment held by MKA Storage. Search for what you need, choose your dates and send a request: the department that
                owns the item (or MKA Store) approves it.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <p className="form-error" role="alert">
            Equipment Loans didn&apos;t load: {error}. Please let MKA Storage know.
          </p>
        )}

        <section className="stats ln-stats" aria-label="Your loans">
          <Link href="/equipment-loans?tab=pending" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "1" })}>
            <strong style={{ color: pending ? "#9a6600" : undefined }}>{pending}</strong>
            <span>awaiting approval</span>
          </Link>
          <Link href="/equipment-loans?tab=loans" className="stat glass spotlight is-accent rise st-stat-link" style={vars({ "--i": "2" })}>
            <strong>{ready}</strong>
            <span>ready to collect</span>
          </Link>
          <Link href="/equipment-loans?tab=loans" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "3" })}>
            <strong style={{ color: overdue ? "var(--danger)" : undefined }}>{out.length}</strong>
            <span>on loan{overdue ? ` · ${overdue} overdue` : ""}</span>
          </Link>
          <Link href="/equipment-loans?tab=messages" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "4" })}>
            <strong style={{ color: unreadBefore ? "var(--danger)" : undefined }}>{unreadBefore}</strong>
            <span>new message{unreadBefore === 1 ? "" : "s"}</span>
          </Link>
          {tabs.some((t) => t.key === "lending") && (
            <Link href="/equipment-loans?tab=lending" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "5" })}>
              <strong style={{ color: lendPending ? "var(--danger)" : undefined }}>{lendPending}</strong>
              <span>borrowing request{lendPending === 1 ? "" : "s"} to answer</span>
            </Link>
          )}
        </section>

        <nav className="tabs rise" aria-label="Equipment Loans sections" style={vars({ "--i": "2" })}>
          {tabs.map((t) => {
            const b = badges[t.key];
            return (
              <Link key={t.key} href={t.key === "find" ? "/equipment-loans" : `/equipment-loans?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined} scroll={false}>
                {t.label}
                {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.n}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="tab-body rise" style={vars({ "--i": "3" })} key={tab}>
          {tab === "find" && (
            <FindPanel
              results={search.results}
              searched={search.searched}
              q={search.q}
              from={search.from}
              to={search.to}
              error={search.error}
              lastDepartment={last?.borrower_department ?? ""}
              lastPhone={loans.find((l) => l.phone)?.phone ?? ""}
            />
          )}
          {tab === "pending" && <PendingPanel loans={loans} messages={messages} />}
          {tab === "loans" && <MyLoansPanel loans={loans} messages={messages} />}
          {tab === "lending" && (
            <RequestsPanel loans={lendLoans} messages={lendMessages} canManage={canEdit} side="owner" department={lending.department} />
          )}
          {tab === "messages" && <MessagesPanel loans={threadLoans} messages={messages} side="borrower" focusId={loanId} meId={meId} />}
        </div>
      </div>
    </EditAccess>
  );
}
