import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { daysUntil, type Alert, type DueItem } from "@/lib/jaidat";

export function NeedsAttention({ alerts, limit = 12, emptyText }: { alerts: Alert[]; limit?: number; emptyText?: string }) {
  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Needs attention {alerts.length > 0 && <span className="count-badge">{alerts.length}</span>}</h2>
      </div>
      {alerts.length === 0 ? (
        <div className="all-clear">
          <CheckCircle2 size={22} />
          <div>
            <strong>All clear</strong>
            <span>{emptyText ?? "No emergencies, overdue checks, expired insurance or late tickets."}</span>
          </div>
        </div>
      ) : (
        <ul className="alert-list">
          {alerts.slice(0, limit).map((a, i) => (
            <li key={i}>
              <Link href={a.href} className={`alert-item ${a.level}`}>
                <span className="alert-dot" aria-hidden />
                <span className="alert-text">
                  <b>{a.who}</b> {a.text}
                </span>
              </Link>
            </li>
          ))}
          {alerts.length > limit && <li className="muted-note">and {alerts.length - limit} more</li>}
        </ul>
      )}
    </section>
  );
}

/** Dated things in the next few weeks, grouped by week. */
export function ComingUp({ items, today, days = 60, limit = 10 }: { items: DueItem[]; today: string; days?: number; limit?: number }) {
  const upcoming = items.filter((i) => i.date >= today && daysUntil(i.date, today) <= days);
  const soon = upcoming.slice(0, limit);
  const groups = new Map<string, DueItem[]>();
  for (const it of soon) {
    const n = daysUntil(it.date, today);
    const key = n <= 7 ? "This week" : n <= 14 ? "Next week" : n <= 31 ? "This month" : `Within ${days} days`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Coming up</h2>
        <a href="/jaidat/renewals.ics" className="btn btn-ghost btn-sm" download title="Add renewals and due dates to your calendar">
          Add to calendar
        </a>
      </div>
      {soon.length === 0 ? (
        <p className="muted-note">Nothing due in the next {days} days. Dates appear here once they&apos;re entered on checks, policies, tickets and payments.</p>
      ) : (
        <div className="jd-due">
          {[...groups].map(([label, list]) => (
            <div key={label}>
              <p className="label">{label}</p>
              <ul>
                {list.map((it, i) => (
                  <li key={i}>
                    <Link href={it.href}>
                      <time>{day(it.date)}</time>
                      <span>
                        <b>{it.title}</b>
                        <small>
                          {it.who} · {it.kind}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {upcoming.length > soon.length && (
            <p className="muted-note">
              and {upcoming.length - soon.length} more in the next {days} days. Add them all to your calendar with the button above.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
