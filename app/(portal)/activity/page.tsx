import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { AUDIT_SELECT, type AuditEntry } from "@/lib/audit";
import { ActivityFeed } from "@/components/activity-feed";
import { vars } from "@/lib/css";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; page?: string }>;
}) {
  const { dept, page } = await searchParams;
  const { supabase, departments } = await getSession();

  const current = departments.find((d) => d.slug === dept);
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  let q = supabase
    .from("audit_log")
    .select(AUDIT_SELECT)
    .order("changed_at", { ascending: false })
    .range(from, from + PAGE_SIZE); // one extra row tells us if there's a next page

  if (current) q = q.eq("department", current.slug);

  const { data, error } = await q;
  const entries = (data ?? []) as unknown as AuditEntry[];
  const hasNext = entries.length > PAGE_SIZE;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (current) params.set("dept", current.slug);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/activity${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <header className="page-head rise">
        <div className="page-title">
          <div>
            <span className="eyebrow">Records</span>
            <h1>Activity log</h1>
            <p>
              Every add, edit and removal {departments.length === 1 ? `in ${departments[0].name}` : "across your departments"}, with who made it.
            </p>
          </div>
        </div>
      </header>

      <section className="panel glass rise" style={vars({ "--i": "1" })}>
        {departments.length > 1 && (
          <div className="chips" aria-label="Filter by department">
            <Link href="/activity" className="chip" aria-current={!current ? "true" : undefined}>
              All departments
            </Link>
            {departments.map((d) => (
              <Link
                key={d.slug}
                href={`/activity?dept=${d.slug}`}
                className="chip"
                aria-current={current?.slug === d.slug ? "true" : undefined}
                style={vars({ "--accent": d.accent })}
              >
                {d.short}
              </Link>
            ))}
          </div>
        )}

        {error ? (
          <p className="form-error" role="alert">
            Couldn't load the activity log: {error.message}
          </p>
        ) : (
          <ActivityFeed entries={entries.slice(0, PAGE_SIZE)} showDepartment={!current && departments.length > 1} />
        )}

        {(pageNo > 1 || hasNext) && (
          <div className="toolbar" style={{ justifyContent: "space-between", marginTop: 16 }}>
            {pageNo > 1 ? (
              <Link href={href(pageNo - 1)} className="btn">
                Newer
              </Link>
            ) : (
              <span />
            )}
            {hasNext && (
              <Link href={href(pageNo + 1)} className="btn">
                Older
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}
