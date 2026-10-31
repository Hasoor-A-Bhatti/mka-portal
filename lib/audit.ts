import { getDepartment, getDepartmentByTable } from "@/lib/departments";
import { formatDate } from "@/lib/format";

export type AuditEntry = {
  id: number;
  department: string;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor: { full_name: string | null } | null;
};

export const AUDIT_SELECT =
  "id, department, table_name, record_id, action, changed_at, old_data, new_data, actor:profiles!audit_log_changed_by_fkey(full_name)";

const SYSTEM_COLUMNS = new Set(["id", "created_at", "created_by", "updated_at", "updated_by"]);

/** Tables that belong to a department but aren't its main records. */
const SUB_TABLES: Record<string, { noun: string; title: (d: Record<string, unknown>) => string }> = {
  fleet_mileage_logs: { noun: "a mileage reading", title: (d) => (d.reading != null ? `${Number(d.reading).toLocaleString("en-GB")} mi` : "") },
  fleet_maintenance: { noun: "maintenance task", title: (d) => String(d.description ?? "") },
  fleet_incidents: { noun: "an incident", title: (d) => String(d.incident_type ?? "") },
  fleet_drivers: { noun: "driver", title: (d) => String(d.full_name ?? "") },
  fleet_vehicle_drivers: { noun: "a driver's access to a vehicle", title: () => "" },
  fleet_files: { noun: "a document", title: (d) => String(d.file_name ?? "") },
  delegation_files: { noun: "an itinerary", title: (d) => String(d.file_name ?? "") },
  delegation_stays: { noun: "accommodation", title: (d) => String(d.venue ?? "") },
  delegation_transport: { noun: "transport", title: (d) => [d.transport_type, d.vehicle].filter(Boolean).join(", ") },
  delegation_meals: {
    noun: "a meal",
    title: (d) => (d.day ? `${String(d.meal ?? "")} on ${formatDate(d.day)}`.trim() : ""),
  },
  delegation_mulaqats: { noun: "a mulaqat", title: (d) => (d.mulaqat_date ? formatDate(d.mulaqat_date) : "") },
};

/** Turns an audit row into a readable line: who, did what, to which record. */
export function describe(entry: AuditEntry) {
  const sub = SUB_TABLES[entry.table_name];
  const dept = getDepartmentByTable(entry.table_name) ?? getDepartment(entry.department);
  const data = entry.new_data ?? entry.old_data ?? {};
  const noun = sub?.noun ?? dept?.noun ?? "record";
  const title = sub ? sub.title(data) : dept ? String(data[dept.titleField] ?? "") : "";
  const who = entry.actor?.full_name ?? "Someone";

  const verb =
    entry.action === "insert" ? "added" : entry.action === "delete" ? "removed" : "updated";

  let detail = "";
  if (entry.action === "update" && entry.old_data && entry.new_data) {
    const oldD = entry.old_data;
    const newD = entry.new_data;
    const changed = Object.keys(newD).filter(
      (k) => !SYSTEM_COLUMNS.has(k) && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]),
    );
    const status = dept?.statusField;
    if (status && changed.includes(status)) {
      detail = `${oldD[status] ?? "none"} to ${newD[status]}`;
    } else if (changed.length) {
      const labels = changed.map(
        (k) => dept?.fields.find((f) => f.name === k)?.label.toLowerCase() ?? k.replace(/_/g, " "),
      );
      detail = `changed ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ` and ${labels.length - 3} more` : ""}`;
    }
  }

  return { who, verb, noun, title, detail, dept };
}
