import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDepartment } from "@/lib/departments";
import { getSession, ROLE_LABELS } from "@/lib/session";
import { AUDIT_SELECT, type AuditEntry } from "@/lib/audit";
import { ActivityFeed } from "@/components/activity-feed";
import { RecordsPanel, type RecordRow } from "@/components/records-panel";
import { vars } from "@/lib/css";
import { DelegationsCalendar } from "@/components/delegations-calendar";
import { getCalendarEvents, londonDate, type CalendarResult } from "@/lib/google-calendar";
import { syncDelegations, type SyncResult } from "@/lib/delegation-sync";
import type { StatDelegation, StatMeal, StatStay, StatTransport } from "@/lib/delegation-stats";
import { QuickStats } from "@/components/delegations/quick-stats";
import { headers } from "next/headers";
import { driversReceived, toShareLink, type Driver, type ShareState } from "@/lib/delegations";
import { formatDateTime } from "@/lib/format";
import { EditAccess } from "@/components/edit-access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ dept: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { dept } = await params;
  return { title: getDepartment(dept)?.name ?? "Not found" };
}

export default async function DepartmentPage({ params }: Params) {
  const { dept: slug } = await params;
  const dept = getDepartment(slug);
  if (!dept) notFound();

  const { supabase, canAccess, canEdit, isManager, roleIn, isAdmin, soleDepartment } = await getSession();

  if (!canAccess(slug)) {
    return (
      <section className="notice glass">
        <h1>{dept.name} isn't on your account</h1>
        <p>Ask an admin to add you to this department if you need it.</p>
        <Link href={soleDepartment ? `/${soleDepartment.slug}` : "/"} className="btn">
          {soleDepartment ? `Back to ${soleDepartment.name}` : "Back to overview"}
        </Link>
      </section>
    );
  }

  const showCalendar = slug === "delegations";
  const today = londonDate(new Date());

  // Delegations: read the calendar first and bring the records in step with it,
  // so the table below already shows the result.
  const calendar: CalendarResult | null = showCalendar ? await getCalendarEvents() : null;
  const sync: SyncResult | null =
    // View only users can't write, so only people who can edit bring records in step.
    calendar && !calendar.error && !calendar.notConfigured && calendar.from && canEdit(slug)
      ? await syncDelegations(supabase, calendar.events, calendar.from, today)
      : null;

  // Quick Stats are for Delegations department admins, administrators and View only (oversight) users.
  const showStats = showCalendar && (isManager(slug) || roleIn(slug) === "viewer");
  const none = Promise.resolve({ data: [] as unknown[], error: null });

  const [{ data: rows, error }, { data: activity }, staysRes, transportRes, mealsRes, aekRes, aekLinksRes, regionLinksRes, driversRes] = await Promise.all([
    supabase
      .from(dept.table)
      .select(
        `*, creator:profiles!${dept.table}_created_by_fkey(full_name), editor:profiles!${dept.table}_updated_by_fkey(full_name)`,
      )
      .order(dept.orderBy, { ascending: true, nullsFirst: false })
      .limit(1000),
    supabase
      .from("audit_log")
      .select(AUDIT_SELECT)
      .eq("department", slug)
      .order("changed_at", { ascending: false })
      .limit(10),
    // Missing tables (before migration 0005) just mean empty lists here.
    showStats ? supabase.from("delegation_stays").select("delegation_id, venue, start_date, end_date") : none,
    showStats ? supabase.from("delegation_transport").select("delegation_id, transport_type") : none,
    showStats ? supabase.from("delegation_meals").select("delegation_id, day, catered").eq("catered", true) : none,
    // Which delegations' AeK has sent details (empty before migration 0007).
    showCalendar ? supabase.from("delegation_aek_updates").select("delegation_id, submitted_at") : none,
    // Working share links and drivers, for the AeK / Region buttons on each delegation.
    showCalendar ? supabase.from("delegation_aek_links").select("id, delegation_id, token, created_at").is("revoked_at", null) : none,
    showCalendar ? supabase.from("delegation_region_links").select("id, delegation_id, token, created_at").is("revoked_at", null) : none,
    showCalendar ? supabase.from("delegation_drivers").select("delegation_id, leg") : none,
  ]);
  const aekRows = (aekRes.data ?? []) as { delegation_id: string; submitted_at: string }[];
  const aekIds = aekRows.map((r) => r.delegation_id);

  const records = (rows ?? []) as unknown as RecordRow[];
  const counts = new Map<string, number>();
  records.forEach((r) => {
    const s = String(r[dept.statusField] ?? "");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  const focusCount = dept.focus.statuses.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
  // Quick Stats are worked out in the browser, so the date range can change instantly.
  // Only the fields they need are sent.
  const quickStats = showStats
    ? {
        rows: (records as unknown as StatDelegation[]).map(({ id, name, country, members, venue, arrival_date, departure_date, status }) => ({
          id,
          name,
          country,
          members,
          venue,
          arrival_date,
          departure_date,
          status,
        })),
        stays: ((staysRes.data ?? []) as StatStay[]).map(({ delegation_id, venue, start_date, end_date }) => ({ delegation_id, venue, start_date, end_date })),
        transport: ((transportRes.data ?? []) as StatTransport[]).map(({ delegation_id, transport_type }) => ({ delegation_id, transport_type })),
        meals: ((mealsRes.data ?? []) as StatMeal[]).map(({ delegation_id, day, catered }) => ({ delegation_id, day, catered })),
        today,
      }
    : null;
  // AeK and Region Guidance link state for each delegation.
  let share: Record<string, { aek: ShareState; region: ShareState }> | undefined;
  if (showCalendar) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
    type LinkRow = { id: string; delegation_id: string; token: string; created_at: string };
    const latest = (list: LinkRow[]) => {
      const m = new Map<string, LinkRow>();
      for (const l of list) if (!m.get(l.delegation_id) || m.get(l.delegation_id)!.created_at < l.created_at) m.set(l.delegation_id, l);
      return m;
    };
    const aekLinks = latest((aekLinksRes.data ?? []) as LinkRow[]);
    const regionLinks = latest((regionLinksRes.data ?? []) as LinkRow[]);
    const drivers = (driversRes.data ?? []) as { delegation_id: string; leg: Driver["leg"] }[];
    const aekSent = new Map(aekRows.map((r) => [r.delegation_id, r.submitted_at]));
    share = {};
    for (const r of records) {
      const departure = (r.departure_date as string | null) ?? null;
      const sent = aekSent.get(r.id);
      share[r.id] = {
        aek: {
          ready: !aekLinksRes.error,
          link: toShareLink(aekLinks.get(r.id), "aek", departure, origin),
          received: sent ? `Details received · last sent ${formatDateTime(sent)}` : null,
        },
        region: {
          ready: !regionLinksRes.error,
          link: toShareLink(regionLinks.get(r.id), "region", departure, origin),
          received: driversReceived(drivers.filter((x) => x.delegation_id === r.id)),
        },
      };
    }
  }
  const Icon = dept.icon;

  return (
    <EditAccess canEdit={canEdit(slug)}>
    <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
      <header className="page-head rise">
        <div className="page-title">
          <span className="dept-icon">
            <Icon size={28} />
          </span>
          <div>
            <span className="eyebrow">{isAdmin ? "Administrator" : ROLE_LABELS[roleIn(slug)!]}</span>
            <h1>{dept.name}</h1>
            <p>{dept.description}</p>
          </div>
        </div>
      </header>

      <section className="stats" aria-label="Summary">
        <div className="stat glass spotlight rise" style={vars({ "--i": "1" })}>
          <strong>{records.length}</strong>
          <span>{dept.plural} in total</span>
        </div>
        <div className="stat glass spotlight is-accent rise" style={vars({ "--i": "2" })}>
          <strong>{focusCount}</strong>
          <span>{dept.focus.label}</span>
        </div>
        {dept.statuses
          .filter((s) => !dept.focus.statuses.includes(s))
          .slice(0, 3)
          .map((s, i) => (
            <div className="stat glass spotlight rise" key={s} style={vars({ "--i": String(i + 3) })}>
              <strong>{counts.get(s) ?? 0}</strong>
              <span>{s}</span>
            </div>
          ))}
      </section>

      {error && (
        <p className="form-error" role="alert">
          Couldn't load {dept.plural}: {error.message}. Check the database setup in the README.
        </p>
      )}

      {quickStats && <QuickStats data={quickStats} />}

      {calendar && (
        <DelegationsCalendar
          events={calendar.events}
          today={today}
          error={calendar.error}
          notConfigured={calendar.notConfigured}
        />
      )}

      {sync?.needsMigration && (
        <p className="form-error" role="alert">
          Delegations can't be created from the calendar yet: run supabase/migrations/0004_delegations_calendar.sql in the
          Supabase SQL Editor.
        </p>
      )}
      {sync?.error && (
        <p className="form-error" role="alert">
          Couldn't update delegations from the calendar: {sync.error}
        </p>
      )}

      <div className="split rise" style={vars({ "--i": "4" })}>
        <RecordsPanel slug={slug} rows={records} canDelete={isManager(slug)} aekIds={showCalendar ? aekIds : undefined} share={share} />

        <section className="panel glass">
          <div className="panel-head">
            <h2>Recent changes</h2>
          </div>
          <ActivityFeed entries={(activity ?? []) as unknown as AuditEntry[]} />
        </section>
      </div>
    </div>
    </EditAccess>
  );
}
