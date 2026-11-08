import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSession, ROLE_LABELS } from "@/lib/session";
import { AUDIT_SELECT, type AuditEntry } from "@/lib/audit";
import { loadJaidat } from "@/lib/jaidat-server";
import { JAIDAT_TABS, JaidatDashboard, type JaidatTab } from "@/components/jaidat/dashboard-view";

export const metadata: Metadata = { title: "MKA Jaidat" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string; open?: string }> };

export default async function JaidatPage({ searchParams }: Props) {
  const { tab: rawTab, open: openId } = await searchParams;
  const tab: JaidatTab = JAIDAT_TABS.some((t) => t.key === rawTab) ? (rawTab as JaidatTab) : "overview";
  const { supabase, canAccess, canEdit, isManager, isAdmin, roleIn } = await getSession();

  if (!canAccess("jaidat")) {
    return (
      <section className="notice glass">
        <h1>MKA Jaidat isn&apos;t on your account</h1>
        <p>Ask an admin to add you to this department if you need it.</p>
      </section>
    );
  }

  const [{ data, error }, { data: activity }] = await Promise.all([
    loadJaidat(supabase),
    tab === "overview"
      ? supabase.from("audit_log").select(AUDIT_SELECT).eq("department", "jaidat").order("changed_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;

  return (
    <JaidatDashboard
      data={data}
      error={error}
      activity={(activity ?? []) as unknown as AuditEntry[]}
      origin={origin}
      tab={tab}
      openId={openId}
      canEdit={canEdit("jaidat")}
      canManage={isManager("jaidat")}
      roleLabel={isAdmin ? "Administrator" : ROLE_LABELS[roleIn("jaidat") ?? "member"]}
    />
  );
}
