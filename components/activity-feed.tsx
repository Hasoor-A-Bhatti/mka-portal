import { describe, type AuditEntry } from "@/lib/audit";
import { formatDateTime, initials, timeAgo } from "@/lib/format";
import { vars } from "@/lib/css";

export function ActivityFeed({
  entries,
  showDepartment = false,
}: {
  entries: AuditEntry[];
  showDepartment?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="empty">
        <strong>Nothing logged yet</strong>
        Every add, edit and removal will show here with who made it.
      </div>
    );
  }

  return (
    <ul className="feed">
      {entries.map((e) => {
        const d = describe(e);
        return (
          <li key={e.id}>
            <span className="avatar" aria-hidden>
              {initials(d.who)}
            </span>
            <div>
              <p>
                <b>{d.who}</b> {d.verb} {d.noun} {d.title && <b>{d.title}</b>}
                {d.detail && <>, {d.detail}</>}
                {showDepartment && d.dept && (
                  <span className="tag" style={vars({ "--tone": d.dept.accent })}>
                    {d.dept.short}
                  </span>
                )}
              </p>
              <time dateTime={e.changed_at} title={formatDateTime(e.changed_at)}>
                {timeAgo(e.changed_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
