import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DEPARTMENTS } from "@/lib/departments";
import { getSession } from "@/lib/session";
import { AUDIT_SELECT, type AuditEntry } from "@/lib/audit";
import { ActivityFeed } from "@/components/activity-feed";
import { vars } from "@/lib/css";

export const dynamic = "force-dynamic";

function today() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(new Date());
}

export default async function OverviewPage() {
  const { supabase, canAccess, firstName } = await getSession();

  const accessible = DEPARTMENTS.filter((d) => canAccess(d.slug));

  const [figures, { data: activity }] = await Promise.all([
    Promise.all(
      accessible.map(async (d) => {
        const quoted = d.focus.statuses.map((s) => `"${s}"`).join(",");
        const [total, focus] = await Promise.all([
          supabase.from(d.table).select("id", { count: "exact", head: true }),
          supabase
            .from(d.table)
            .select("id", { count: "exact", head: true })
            .filter(d.statusField, "in", `(${quoted})`),
        ]);
        return [d.slug, { total: total.count ?? 0, focus: focus.count ?? 0 }] as const;
      }),
    ),
    supabase.from("audit_log").select(AUDIT_SELECT).order("changed_at", { ascending: false }).limit(8),
  ]);

  const bySlug = new Map(figures);
  const totalRecords = figures.reduce((n, [, f]) => n + f.total, 0);

  return (
    <>
      <section className="hero rise">
        <div>
          <span className="eyebrow">Salam, {firstName}</span>
          <h1>{today()}</h1>
          <p>Here's where things stand across your departments.</p>
        </div>
        {accessible.length > 0 && (
          <div className="hero-stats">
            <div>
              <strong>{totalRecords}</strong>
              <span>records in total</span>
            </div>
            <div>
              <strong>{accessible.length}</strong>
              <span>department{accessible.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        )}
      </section>

      {accessible.length === 0 ? (
        <section className="notice glass rise" style={vars({ "--i": "1" })}>
          <h1>No departments yet</h1>
          <p>
            Your account works, but it hasn't been given access to a department. Ask an admin to add
            you to the ones you work in.
          </p>
        </section>
      ) : (
        <section className="dept-grid" aria-label="Departments">
          {accessible.map((d, i) => {
            const Icon = d.icon;
            const f = bySlug.get(d.slug) ?? { total: 0, focus: 0 };
            const size = accessible.length >= 5 ? (i === 0 ? "lead" : i === 1 ? "second" : "") : "";
            return (
              <Link
                key={d.slug}
                href={`/${d.slug}`}
                className={`dept-tile glass spotlight rise ${size}`}
                style={vars({ "--accent": d.accent, "--i": String(i + 1) })}
              >
                <div className="dept-top">
                  <span className="dept-icon">
                    <Icon size={24} />
                  </span>
                  <span className="dept-go" aria-hidden>
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <div>
                  <h2>
                    <span>MKA</span>
                    {d.short}
                  </h2>
                </div>
                <p>{d.description}</p>
                <div className="dept-figures">
                  <div className="figure">
                    <strong>{f.total}</strong>
                    <span>{d.plural}</span>
                  </div>
                  <div className="figure">
                    <strong style={{ color: d.accent }}>{f.focus}</strong>
                    <span>{d.focus.label}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {accessible.length > 0 && (
        <section className="panel glass rise" style={vars({ "--i": String(accessible.length + 1) })}>
          <div className="panel-head">
            <h2>Latest changes</h2>
            <Link href="/activity" className="btn btn-ghost">
              Open activity log
            </Link>
          </div>
          <ActivityFeed entries={(activity ?? []) as unknown as AuditEntry[]} showDepartment />
        </section>
      )}
    </>
  );
}
