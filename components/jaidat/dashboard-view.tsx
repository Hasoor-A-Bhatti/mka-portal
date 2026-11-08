import Link from "next/link";
import { getDepartment } from "@/lib/departments";
import type { AuditEntry } from "@/lib/audit";
import {
  buildAlerts,
  complianceState,
  dueItems,
  healthScore,
  isOpen,
  issueOverdue,
  money,
  num,
  peopleNames,
  recordProgress,
  shortName,
  todayISO,
  SOON_DAYS,
  daysUntil,
  type JaidatData,
} from "@/lib/jaidat";
import { vars } from "@/lib/css";
import { EditAccess } from "@/components/edit-access";
import { ActivityFeed } from "@/components/activity-feed";
import { PeopleList } from "@/components/jaidat/bits";
import { PropertyButton } from "@/components/jaidat/property-dialog";
import { PropertyGrid, type PropertyCard } from "@/components/jaidat/property-grid";
import { ComingUp, NeedsAttention } from "@/components/jaidat/overview";
import { ReportLink } from "@/components/jaidat/report-link";
import { TicketsPanel } from "@/components/jaidat/tickets-panel";
import { ComplianceMatrix } from "@/components/jaidat/compliance-panel";
import { InsuranceOverview } from "@/components/jaidat/insurance-panel";
import { RecordsPanel } from "@/components/jaidat/records-panel";
import { FinancePanel } from "@/components/jaidat/finance-panel";
import { ContactsPanel } from "@/components/jaidat/contacts-panel";
import { DocumentsPanel } from "@/components/jaidat/documents-panel";
import { RequestsPanel } from "@/components/jaidat/requests-panel";
import { ReportsPanel } from "@/components/jaidat/reports-panel";

export const JAIDAT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "compliance", label: "Compliance" },
  { key: "records", label: "Records" },
  { key: "finance", label: "Finance" },
  { key: "contacts", label: "Contacts" },
  { key: "documents", label: "Documents" },
  { key: "requests", label: "Awaiting replies" },
  { key: "reports", label: "Reports" },
] as const;
export type JaidatTab = (typeof JAIDAT_TABS)[number]["key"];
type Tab = JaidatTab;
const TABS = JAIDAT_TABS;

/** The Jaidat dashboard: the department overview and its tabs. */
export function JaidatDashboard({
  data,
  error,
  activity,
  origin,
  tab,
  openId,
  canEdit,
  canManage,
  roleLabel,
  today = todayISO(),
}: {
  data: JaidatData;
  error: string | null;
  activity: AuditEntry[];
  origin: string;
  tab: Tab;
  openId?: string;
  canEdit: boolean;
  canManage: boolean;
  roleLabel: string;
  today?: string;
}) {
  const dept = getDepartment("jaidat")!;
  const Icon = dept.icon;
  // Summary figures
  const live = data.properties.filter((p) => p.status !== "Disposed");
  const open = data.issues.filter(isOpen);
  const p1 = open.filter((i) => i.priority === "P1").length;
  const late = open.filter((i) => issueOverdue(i, today)).length;
  const states = data.compliance.filter((c) => live.some((p) => p.id === c.property_id)).map((c) => complianceState(c, today));
  const applicable = states.filter((s) => s !== "Not applicable" && s !== "To decide").length;
  const compliant = states.filter((s) => s === "Compliant").length;
  const overdueChecks = states.filter((s) => s === "Overdue").length;
  const records = recordProgress(data.records.filter((r) => live.some((p) => p.id === r.property_id)));
  const due = dueItems(data);
  const dueSoon = due.filter((d) => d.date >= today && daysUntil(d.date, today) <= SOON_DAYS).length;
  const waiting = data.costs.filter((c) => c.status === "Proposed");

  const badges: Partial<Record<Tab, { n: number; alert?: boolean }>> = {
    tickets: open.length ? { n: open.length, alert: p1 > 0 || late > 0 } : undefined,
    compliance: overdueChecks ? { n: overdueChecks, alert: true } : undefined,
    finance: waiting.length ? { n: waiting.length } : undefined,
    requests: data.requests.filter((r) => r.status !== "Replied").length ? { n: data.requests.filter((r) => r.status !== "Replied").length } : undefined,
  };

  const cards: PropertyCard[] = data.properties.map((p) => {
    const health = healthScore(p, data, today);
    const st = data.compliance.filter((c) => c.property_id === p.id).map((c) => complianceState(c, today));
    const rec = recordProgress(data.records.filter((r) => r.property_id === p.id));
    const mine = open.filter((i) => i.property_id === p.id);
    return {
      id: p.id,
      reference: p.reference,
      name: p.name,
      short: shortName(p),
      type: p.property_type ?? "",
      use: p.use_description ?? "",
      location: p.location ?? "",
      status: p.status,
      initial: p.initial_scope,
      health: health.score,
      rating: health.rating,
      openTickets: mine.length,
      urgent: mine.filter((i) => i.priority === "P1" || issueOverdue(i, today)).length,
      compliant: st.filter((s) => s === "Compliant").length,
      applicable: st.filter((s) => s !== "Not applicable" && s !== "To decide").length,
      undecided: st.filter((s) => s === "To decide").length,
      overdue: st.filter((s) => s === "Overdue").length,
      recordsDone: rec.verified,
      recordsTotal: rec.total,
    };
  });

  return (
    <EditAccess canEdit={canEdit}>
      <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
        <PeopleList names={peopleNames(data.contacts)} />
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
          <PropertyButton />
        </header>

        {error && (
          <p className="form-error" role="alert">
            Some Jaidat data didn&apos;t load: {error}. Has supabase/migrations/0010_jaidat.sql been run in Supabase?
          </p>
        )}

        <nav className="tabs rise" aria-label="Jaidat sections" style={vars({ "--i": "1" })}>
          {TABS.map((t) => {
            const b = badges[t.key];
            return (
              <Link key={t.key} href={t.key === "overview" ? "/jaidat" : `/jaidat?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined} scroll={false}>
                {t.label}
                {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.n}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="tab-body rise" style={vars({ "--i": "2" })} key={tab}>
          {tab === "overview" && (
            <>
              <section className="stats" aria-label="Jaidat summary">
                <Link href="/jaidat?tab=tickets" className="stat glass spotlight is-accent">
                  <strong>
                    {open.length}
                    {p1 > 0 && <small className="jd-late"> · {p1} P1</small>}
                  </strong>
                  <span>open tickets{late ? ` · ${late} past target` : ""}</span>
                </Link>
                <Link href="/jaidat?tab=compliance" className="stat glass spotlight">
                  <strong style={{ color: overdueChecks ? "var(--danger)" : undefined }}>
                    {applicable ? Math.round((compliant / applicable) * 100) : 0}%
                  </strong>
                  <span>
                    compliance verified{overdueChecks ? ` · ${overdueChecks} overdue` : ""}
                  </span>
                </Link>
                <Link href="/jaidat?tab=records" className="stat glass spotlight">
                  <strong>{records.pct}%</strong>
                  <span>
                    records verified ({records.verified}/{records.total})
                  </span>
                </Link>
                <div className="stat glass spotlight">
                  <strong>{dueSoon}</strong>
                  <span>dates due in {SOON_DAYS} days</span>
                </div>
                <Link href="/jaidat?tab=finance" className="stat glass spotlight">
                  <strong>{money(waiting.reduce((n, c) => n + num(c.proposed), 0))}</strong>
                  <span>
                    {waiting.length} cost{waiting.length === 1 ? "" : "s"} awaiting approval
                  </span>
                </Link>
                <div className="stat glass spotlight">
                  <strong>
                    {live.length}
                    <small> / {data.properties.length}</small>
                  </strong>
                  <span>properties in use</span>
                </div>
              </section>

              <div className="split">
                <PropertyGrid properties={cards} />
                <div className="stack">
                  <NeedsAttention alerts={buildAlerts(data, today)} />
                  <ComingUp items={due} today={today} />
                </div>
              </div>

              <div className="split">
                <section className="panel glass">
                  <div className="panel-head">
                    <h2>Recent changes</h2>
                    <Link href="/activity" className="btn btn-ghost btn-sm">
                      Activity log
                    </Link>
                  </div>
                  <ActivityFeed entries={activity} />
                </section>
                <ReportLink url={`${origin}/report`} />
              </div>
            </>
          )}

          {tab === "tickets" && (
            <TicketsPanel
              issues={data.issues}
              notes={data.notes}
              quotes={data.quotes}
              files={data.files}
              contractors={data.contractors}
              contacts={data.contacts}
              properties={data.properties}
              canManage={canManage}
              openId={openId}
            />
          )}

          {tab === "compliance" && (
            <>
              <ComplianceMatrix properties={data.properties} items={data.compliance} catalogue={data.catalogue} />
              <InsuranceOverview properties={data.properties} policies={data.insurance} />
            </>
          )}

          {tab === "records" && (
            <RecordsPanel properties={data.properties} records={data.records} files={data.files} contacts={data.contacts} canManage={canManage} />
          )}

          {tab === "finance" && <FinancePanel costs={data.costs} properties={data.properties} issues={data.issues} files={data.files} canManage={canManage} />}

          {tab === "contacts" && <ContactsPanel contacts={data.contacts} contractors={data.contractors} issues={data.issues} canManage={canManage} />}

          {tab === "documents" && <DocumentsPanel files={data.files} properties={data.properties} issues={data.issues} canManage={canManage} />}

          {tab === "requests" && <RequestsPanel requests={data.requests} properties={data.properties} contacts={data.contacts} canManage={canManage} />}

          {tab === "reports" && <ReportsPanel data={data} />}
        </div>
      </div>
    </EditAccess>
  );
}
