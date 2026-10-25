import { getDepartment, getDepartmentByTable } from "@/lib/departments";

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

/** Turns an audit row into a readable line: who, did what, to which record. */
export function describe(entry: AuditEntry) {
  const dept = getDepartmentByTable(entry.table_name) ?? getDepartment(entry.department);
  const data = entry.new_data ?? entry.old_data ?? {};
  const noun = dept?.noun ?? "record";
  const title = dept ? String(data[dept.titleField] ?? "") : "";
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
