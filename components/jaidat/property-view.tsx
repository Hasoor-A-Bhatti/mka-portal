import Link from "next/link";
import { ArrowLeft, Building2, KeyRound, MapPin, Navigation, Phone, UserRound } from "lucide-react";
import { getDepartment } from "@/lib/departments";
import {
  buildAlerts,
  complianceState,
  currentPolicies,
  dueItems,
  expectedCovers,
  healthScore,
  inspectionState,
  isOpen,
  issueOverdue,
  money,
  num,
  peopleNames,
  policyState,
  recordProgress,
  todayISO,
  type JaidatData,
  type Property,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";
import { EditAccess } from "@/components/edit-access";
import { HealthRing, Meter, PeopleList, Pill } from "@/components/jaidat/bits";
import { PropertyButton } from "@/components/jaidat/property-dialog";
import { ComingUp, NeedsAttention } from "@/components/jaidat/overview";
import { TicketsPanel } from "@/components/jaidat/tickets-panel";
import { CompliancePanel } from "@/components/jaidat/compliance-panel";
import { InsurancePanel } from "@/components/jaidat/insurance-panel";
import { RecordsPanel } from "@/components/jaidat/records-panel";
import { InspectionsPanel } from "@/components/jaidat/inspections-panel";
import { FinancePanel } from "@/components/jaidat/finance-panel";
import { DocumentsPanel } from "@/components/jaidat/documents-panel";

export const PROPERTY_TABS = [
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "compliance", label: "Compliance" },
  { key: "insurance", label: "Insurance" },
  { key: "records", label: "Records" },
  { key: "inspections", label: "Inspections" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
] as const;
export type PropertyTab = (typeof PROPERTY_TABS)[number]["key"];
type Tab = PropertyTab;
const TABS = PROPERTY_TABS;

/** One property's page: its details and its tabs. */
export function PropertyView({
  property: p,
  data,
  properties,
  error,
  origin,
  tab,
  openId,
  canEdit,
  canManage,
  today = todayISO(),
}: {
  property: Property;
  data: JaidatData;
  properties: Property[];
  error: string | null;
  origin: string;
  tab: Tab;
  openId?: string;
  canEdit: boolean;
  canManage: boolean;
  today?: string;
}) {
  const dept = getDepartment("jaidat")!;
  const id = p.id;
  const health = healthScore(p, data, today);
  const open = data.issues.filter(isOpen);
  const late = open.filter((i) => issueOverdue(i, today)).length;
  const states = data.compliance.map((c) => complianceState(c, today));
  const overdueChecks = states.filter((s) => s === "Overdue").length;
  const undecided = states.filter((s) => s === "To decide").length;
  const policies = currentPolicies(data.insurance);
  const coverIssues = expectedCovers(p.property_type).filter((c) => policyState(policies.get(c), today) !== "Covered").length;
  const rec = recordProgress(data.records);
  const inspection = inspectionState(data.inspections, today);

  const badges: Partial<Record<Tab, { n: number | string; alert?: boolean }>> = {
    tickets: open.length ? { n: open.length, alert: late > 0 || open.some((i) => i.priority === "P1") } : undefined,
    compliance: overdueChecks ? { n: overdueChecks, alert: true } : undefined,
    insurance: coverIssues ? { n: coverIssues, alert: [...policies.values()].some((x) => policyState(x, today) === "Expired") } : undefined,
    records: { n: `${rec.pct}%` },
    inspections: inspection === "Overdue" ? { n: "!", alert: true } : undefined,
  };

  return (
    <EditAccess canEdit={canEdit}>
      <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
        <PeopleList names={peopleNames(data.contacts)} />
        <Link href="/jaidat" className="back-link rise">
          <ArrowLeft size={16} /> All properties
        </Link>

        <header className="dl-hero glass rise jd-hero" style={vars({ "--i": "1" })}>
          <div className="dl-hero-main">
            <span className="dept-icon">
              <Building2 size={28} />
            </span>
            <div>
              <span className="eyebrow">
                {p.reference} · {p.property_type ?? "Property"}
                {p.initial_scope ? " · Phase 1" : ""}
              </span>
              <h1>{p.name}</h1>
              <p className="dl-hero-meta">
                {p.use_description && <span>{p.use_description}</span>}
                {p.location && (
                  <span>
                    <MapPin size={15} /> {p.location}
                  </span>
                )}
                {p.caretaker && (
                  <span>
                    <KeyRound size={15} /> {p.caretaker}
                  </span>
                )}
                {p.caretaker_phone && (
                  <a href={`tel:${p.caretaker_phone.replace(/[^+\d]/g, "")}`}>
                    <Phone size={15} /> {p.caretaker_phone}
                  </a>
                )}
              </p>
            </div>
          </div>
          <div className="dl-hero-side">
            <Pill value={p.status} />
            <div className="jd-hero-health">
              <HealthRing score={health.score} size={64} />
              <div>
                <strong>{health.rating}</strong>
                <small>Building health</small>
              </div>
            </div>
            <PropertyButton property={p} canDelete={canManage} />
          </div>
        </header>

        <nav className="tabs rise" aria-label="Property sections" style={vars({ "--i": "2" })}>
          {TABS.map((t) => {
            const b = badges[t.key];
            return (
              <Link key={t.key} href={t.key === "overview" ? `/jaidat/${id}` : `/jaidat/${id}?tab=${t.key}`} className="tab" aria-current={tab === t.key ? "page" : undefined} scroll={false}>
                {t.label}
                {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.n}</span>}
              </Link>
            );
          })}
        </nav>

        {error && (
          <p className="form-error" role="alert">
            Some Jaidat data didn&apos;t load: {error}. Has supabase/migrations/0010_jaidat.sql been run in Supabase?
          </p>
        )}

        <div className="tab-body rise" style={vars({ "--i": "3" })} key={tab}>
          {tab === "overview" && (
            <div className="split">
              <div className="stack">
                <section className="panel glass">
                  <div className="panel-head">
                    <h2>Property details</h2>
                  </div>
                  <dl className="kv">
                    <dt>Reference</dt>
                    <dd>{p.reference}</dd>
                    <dt>Type</dt>
                    <dd>{p.property_type ?? "Not set"}</dd>
                    <dt>Used as</dt>
                    <dd>{p.use_description ?? "Not set"}</dd>
                    <dt>Ownership</dt>
                    <dd>{p.ownership ?? <span className="muted">Awaiting information</span>}</dd>
                    <dt>Address</dt>
                    <dd>
                      {p.address ?? <span className="muted">Awaiting information</span>}
                      {p.address && (
                        <small>
                          {" "}
                          · {p.address_verified ? "verified" : "awaiting confirmation"}
                        </small>
                      )}
                      {p.address && p.address_verified && (
                        <a className="jd-directions" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer">
                          <Navigation size={14} /> Directions
                        </a>
                      )}
                    </dd>
                    {p.capacity != null && (
                      <>
                        <dt>Capacity</dt>
                        <dd>{p.capacity} people</dd>
                      </>
                    )}
                    <dt>Caretaker</dt>
                    <dd>
                      {p.caretaker ?? "Not set"}
                      {p.caretaker_phone && <small> · {p.caretaker_phone}</small>}
                    </dd>
                    {(p.lease_party || p.lease_start || p.lease_end || p.rent_monthly != null) && (
                      <>
                        <dt>{p.property_type === "MKA-owned, rented out" ? "Tenancy" : "Lease"}</dt>
                        <dd>
                          {p.lease_party ?? "—"}
                          <small>
                            {p.lease_start || p.lease_end ? ` · ${p.lease_start ? formatDate(p.lease_start) : "?"} to ${p.lease_end ? formatDate(p.lease_end) : "?"}` : ""}
                            {p.rent_monthly != null ? ` · ${money(num(p.rent_monthly))} a month` : ""}
                          </small>
                        </dd>
                      </>
                    )}
                    <dt>Rooms</dt>
                    <dd>{p.rooms?.length ? p.rooms.join(", ") : <span className="muted">None listed yet (add them on Inspections)</span>}</dd>
                    {p.notes && (
                      <>
                        <dt>Notes</dt>
                        <dd className="pre">{p.notes}</dd>
                      </>
                    )}
                  </dl>
                  <p className="muted-note" style={{ marginTop: 12 }}>
                    <UserRound size={13} /> Occupiers&apos; personal details aren&apos;t kept here.
                  </p>
                </section>

                <section className="panel glass">
                  <div className="panel-head">
                    <h2>Where things stand</h2>
                  </div>
                  <div className="jd-standing">
                    <Meter value={states.filter((s) => s === "Compliant").length} total={states.filter((s) => s !== "Not applicable" && s !== "To decide").length} label="Applicable checks verified" tone="#15805a" />
                    <Meter value={rec.verified} total={rec.total} label="Records verified" />
                    <Meter value={expectedCovers(p.property_type).length - coverIssues} total={expectedCovers(p.property_type).length} label="Insurance covers in place" tone="#3f51c9" />
                  </div>
                  <ul className="glance" style={{ marginTop: 10 }}>
                    <li>
                      <Link href={`/jaidat/${id}?tab=tickets`} className="glance-link">
                        <span>Open tickets</span>
                        <span className="glance-right">
                          {open.length}
                          {late > 0 && <Pill value="Overdue" label={`${late} past target`} />}
                        </span>
                      </Link>
                    </li>
                    <li>
                      <Link href={`/jaidat/${id}?tab=compliance`} className="glance-link">
                        <span>Compliance items to decide</span>
                        <span className="glance-right">{undecided}</span>
                      </Link>
                    </li>
                    <li>
                      <Link href={`/jaidat/${id}?tab=inspections`} className="glance-link">
                        <span>Inspections</span>
                        <span className="glance-right">
                          <Pill value={inspection === "Up to date" ? "Compliant" : inspection === "Due soon" ? "Due soon" : inspection === "Overdue" ? "Overdue" : "Missing"} label={inspection} />
                        </span>
                      </Link>
                    </li>
                  </ul>
                  {health.reasons.length > 0 && (
                    <details className="jd-reasons">
                      <summary>Why the health score is {health.score}</summary>
                      <ul>
                        {health.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              </div>
              <div className="stack">
                <NeedsAttention alerts={buildAlerts(data, today, id)} limit={10} emptyText="Nothing overdue or urgent for this property." />
                <ComingUp items={dueItems(data, id)} today={today} days={90} />
              </div>
            </div>
          )}

          {tab === "tickets" && (
            <TicketsPanel
              issues={data.issues}
              notes={data.notes}
              quotes={data.quotes}
              files={data.files}
              contractors={data.contractors}
              contacts={data.contacts}
              properties={properties}
              propertyId={id}
              canManage={canManage}
              openId={openId}
            />
          )}
          {tab === "compliance" && (
            <CompliancePanel property={p} items={data.compliance} catalogue={data.catalogue} files={data.files} canManage={canManage} openId={openId} />
          )}
          {tab === "insurance" && <InsurancePanel property={p} policies={data.insurance} files={data.files} canManage={canManage} />}
          {tab === "records" && <RecordsPanel properties={[p]} records={data.records} files={data.files} contacts={data.contacts} propertyId={id} canManage={canManage} />}
          {tab === "inspections" && <InspectionsPanel property={p} inspections={data.inspections} files={data.files} canManage={canManage} origin={origin} />}
          {tab === "finance" && <FinancePanel costs={data.costs} properties={properties} issues={data.issues} files={data.files} propertyId={id} canManage={canManage} />}
          {tab === "documents" && <DocumentsPanel files={data.files} properties={properties} issues={data.issues} propertyId={id} canManage={canManage} />}
        </div>
      </div>
    </EditAccess>
  );
}
