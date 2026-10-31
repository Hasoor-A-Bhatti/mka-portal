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

  const { supabase, canAccess, isManager, roleIn, isAdmin, soleDepartment } = await getSession();

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
    calendar && !calendar.error && !calendar.notConfigured && calendar.from
      ? await syncDelegations(supabase, calendar.events, calendar.from, today)
      : null;

  const [{ data: rows, error }, { data: activity }] = await Promise.all([
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
  ]);

  const records = (rows ?? []) as unknown as RecordRow[];
  const counts = new Map<string, number>();
  records.forEach((r) => {
    const s = String(r[dept.statusField] ?? "");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  const focusCount = dept.focus.statuses.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
  const Icon = dept.icon;

  return (
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
        <RecordsPanel slug={slug} rows={records} canDelete={isManager(slug)} />

        <section className="panel glass">
          <div className="panel-head">
            <h2>Recent changes</h2>
          </div>
          <ActivityFeed entries={(activity ?? []) as unknown as AuditEntry[]} />
        </section>
      </div>
    </div>
  );
}
