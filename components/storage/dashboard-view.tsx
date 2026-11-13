import Link from "next/link";
import { getDepartment } from "@/lib/departments";
import { collectionLate, loanOverdue, todayISO, type Borrower, type Item, type Loan, type Location, type Message } from "@/lib/storage";
import { vars } from "@/lib/css";
import { EditAccess } from "@/components/edit-access";
import { InventoryPanel } from "./inventory-panel";
import { LocationsPanel } from "./locations-panel";
import { RequestsPanel } from "./requests-panel";
import { MessagesPanel } from "./messages-panel";
import { BorrowersPanel } from "./borrowers-panel";

export const STORAGE_TABS = [
  { key: "inventory", label: "Inventory" },
  { key: "locations", label: "Locations" },
  { key: "requests", label: "Loan requests" },
  { key: "messages", label: "Messages" },
  { key: "borrowers", label: "Borrowers" },
] as const;
export type StorageTab = (typeof STORAGE_TABS)[number]["key"];

export type StorageData = {
  items: Item[];
  locations: Location[];
  loans: Loan[];
  messages: Message[];
  borrowers: Borrower[];
  borrowersError: string | null;
};

export function StorageDashboard({
  data,
  error,
  tab,
  location,
  loanId,
  unreadBefore,
  canEdit,
  canManage,
  roleLabel,
  today = todayISO(),
}: {
  data: StorageData;
  error: string | null;
  tab: StorageTab;
  location?: string;
  loanId?: string;
  /** Unread borrower messages before this page marked them read. */
  unreadBefore: number;
  canEdit: boolean;
  canManage: boolean;
  roleLabel: string;
  today?: string;
}) {
  const dept = getDepartment("storage")!;
  const Icon = dept.icon;
  const { items, locations, loans, messages } = data;

  const units = items.reduce((n, i) => n + i.quantity, 0);
  const lowOrOut = items.filter((i) => i.status === "Low stock" || i.status === "Out of stock").length;
  const missing = items.reduce((n, i) => n + i.missing_qty, 0);
  const pending = loans.filter((l) => l.status === "Pending").length;
  const outLoans = loans.filter((l) => l.status === "Collected");
  const overdue = outLoans.filter((l) => loanOverdue(l, today)).length;
  const toCollect = loans.filter((l) => l.status === "Approved").length;
  const lateCollect = loans.filter((l) => collectionLate(l, today)).length;

  const badges: Partial<Record<StorageTab, { n: number; alert?: boolean }>> = {
    requests: pending || overdue ? { n: pending + overdue, alert: true } : undefined,
    messages: unreadBefore && tab !== "messages" ? { n: unreadBefore, alert: true } : undefined,
  };

  return (
    <EditAccess canEdit={canEdit}>
      <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
        <header className="page-head rise">
          <div className="page-title">
            <span className="dept-icon">
              <Icon size={28} />
            </span>
            <div>
              <span className="eyebrow">{roleLabel}</span>
              <h1>{dept.name}</h1>
              <p>{dept.description}</p>
            </div>
          </div>
        </header>

        {error && (
          <p className="form-error" role="alert">
            Some Storage data didn&apos;t load: {error}. Has supabase/migrations/0014_storage_loans.sql been run in Supabase?
          </p>
        )}

        <section className="stats" aria-label="Storage summary">
          <div className="stat glass spotlight is-accent rise" style={vars({ "--i": "1" })}>
            <strong>{items.length.toLocaleString("en-GB")}</strong>
            <span>
              items · {units.toLocaleString("en-GB")} unit{units === 1 ? "" : "s"}
            </span>
          </div>
          <div className="stat glass spotlight rise" style={vars({ "--i": "2" })}>
            <strong style={{ color: lowOrOut ? "#9a6600" : undefined }}>{lowOrOut}</strong>
            <span>low or out of stock</span>
          </div>
          <div className="stat glass spotlight rise" style={vars({ "--i": "3" })}>
            <strong style={{ color: missing ? "var(--danger)" : undefined }}>{missing.toLocaleString("en-GB")}</strong>
            <span>units missing</span>
          </div>
          <Link href="/storage?tab=requests" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "4" })}>
            <strong style={{ color: pending ? "#9a6600" : undefined }}>{pending}</strong>
            <span>requests to approve</span>
          </Link>
          <Link href="/storage?tab=requests" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "5" })}>
            <strong>{toCollect}</strong>
            <span>to be collected{lateCollect ? ` · ${lateCollect} late` : ""}</span>
          </Link>
          <Link href="/storage?tab=requests" className="stat glass spotlight rise st-stat-link" style={vars({ "--i": "6" })}>
            <strong style={{ color: overdue ? "var(--danger)" : undefined }}>{outLoans.length}</strong>
            <span>out on loan{overdue ? ` · ${overdue} overdue` : ""}</span>
          </Link>
        </section>

        <nav className="tabs rise" aria-label="Storage sections" style={vars({ "--i": "2" })}>
          {STORAGE_TABS.map((t) => {
            const b = badges[t.key];
            return (
              <Link key={t.key} href={t.key === "inventory" ? "/storage" : `/storage?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined} scroll={false}>
                {t.label}
                {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.n}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="tab-body rise" style={vars({ "--i": "3" })} key={tab}>
          {tab === "inventory" && <InventoryPanel items={items} locations={locations} loans={loans} canManage={canManage} initialLocation={location} />}
          {tab === "locations" && <LocationsPanel locations={locations} items={items} canManage={canManage} />}
          {tab === "requests" && <RequestsPanel loans={loans} items={items} messages={messages} canManage={canManage} />}
          {tab === "messages" && <MessagesPanel loans={loans} messages={messages} side="storage" focusId={loanId} />}
          {tab === "borrowers" && <BorrowersPanel borrowers={data.borrowers} canManage={canManage} error={data.borrowersError} />}
        </div>
      </div>
    </EditAccess>
  );
}
