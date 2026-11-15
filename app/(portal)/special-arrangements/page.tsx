import type { Metadata } from "next";
import Link from "next/link";
import { getDepartment } from "@/lib/departments";
import { getSession, ROLE_LABELS } from "@/lib/session";
import { AUDIT_SELECT, type AuditEntry } from "@/lib/audit";
import { SPECIAL_STATUSES, type SpecialItem } from "@/lib/special";
import { vars } from "@/lib/css";
import { ActivityFeed } from "@/components/activity-feed";
import { EditAccess } from "@/components/edit-access";
import { SpecialInventory } from "@/components/special/inventory";

export const metadata: Metadata = { title: "MKA Special Arrangements" };
export const dynamic = "force-dynamic";

const SLUG = "special-arrangements";

export default async function SpecialArrangementsPage() {
  const dept = getDepartment(SLUG)!;
  const { supabase, canAccess, canEdit, isManager, isAdmin, roleIn, soleDepartment } = await getSession();

  if (!canAccess(SLUG)) {
    return (
      <section className="notice glass">
        <h1>{dept.name} isn&apos;t on your account</h1>
        <p>Ask an admin to add you to this department if you need it.</p>
        <Link href={soleDepartment ? `/${soleDepartment.slug}` : "/"} className="btn">
          {soleDepartment ? `Back to ${soleDepartment.name}` : "Back to overview"}
        </Link>
      </section>
    );
  }

  const [itemsRes, activityRes] = await Promise.all([
    supabase
      .from("special_items")
      .select("*, creator:profiles!special_items_created_by_fkey(full_name), editor:profiles!special_items_updated_by_fkey(full_name)")
      .order("item_name")
      .limit(2000),
    supabase.from("audit_log").select(AUDIT_SELECT).eq("department", SLUG).order("changed_at", { ascending: false }).limit(10),
  ]);

  const items = (itemsRes.data ?? []) as SpecialItem[];
  const missingTable = itemsRes.error && ["42P01", "PGRST205", "PGRST200"].includes(itemsRes.error.code ?? "");
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const Icon = dept.icon;

  return (
    <EditAccess canEdit={canEdit(SLUG)}>
      <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
        <header className="page-head rise">
          <div className="page-title">
            <span className="dept-icon">
              <Icon size={28} />
            </span>
            <div>
              <span className="eyebrow">{isAdmin ? "Administrator" : ROLE_LABELS[roleIn(SLUG) ?? "member"]}</span>
              <h1>{dept.name}</h1>
              <p>{dept.description}</p>
            </div>
          </div>
        </header>

        <section className="stats" aria-label="Summary">
          <div className="stat glass spotlight is-accent rise" style={vars({ "--i": "1" })}>
            <strong>{items.length}</strong>
            <span>item{items.length === 1 ? "" : "s"} stored</span>
          </div>
          {SPECIAL_STATUSES.map((s, n) => (
            <div className="stat glass spotlight rise" key={s} style={vars({ "--i": String(n + 2) })}>
              <strong style={{ color: s !== "Available" && count(s) ? (s === "Damaged" ? "var(--danger)" : "#9a6600") : undefined }}>{count(s)}</strong>
              <span>{s.toLowerCase()}</span>
            </div>
          ))}
        </section>

        {itemsRes.error && (
          <p className="form-error" role="alert">
            {missingTable
              ? "The inventory isn't set up yet: run supabase/migrations/0016_special_items.sql in the Supabase SQL Editor."
              : `The inventory didn't load: ${itemsRes.error.message}`}
          </p>
        )}

        <div className="split rise" style={vars({ "--i": "4" })}>
          <SpecialInventory items={items} canRemove={isManager(SLUG)} />
          <section className="panel glass">
            <div className="panel-head">
              <h2>Recent changes</h2>
            </div>
            <ActivityFeed entries={(activityRes.data ?? []) as unknown as AuditEntry[]} />
          </section>
        </div>
      </div>
    </EditAccess>
  );
}
