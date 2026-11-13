import type { Metadata } from "next";
import { getSession, ROLE_LABELS } from "@/lib/session";
import type { Borrower, Item, Loan, Location, Message } from "@/lib/storage";
import { STORAGE_TABS, StorageDashboard, type StorageTab } from "@/components/storage/dashboard-view";

export const metadata: Metadata = { title: "MKA Storage" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string; location?: string; loan?: string }> };

export default async function StoragePage({ searchParams }: Props) {
  const { tab: rawTab, location, loan } = await searchParams;
  const tab: StorageTab = STORAGE_TABS.some((t) => t.key === rawTab) ? (rawTab as StorageTab) : "inventory";
  const { supabase, canAccess, canEdit, isManager, isAdmin, roleIn } = await getSession();

  if (!canAccess("storage")) {
    return (
      <section className="notice glass">
        <h1>MKA Storage isn&apos;t on your account</h1>
        <p>Ask an admin to add you to this department if you need it.</p>
      </section>
    );
  }

  const [itemsRes, locationsRes, loansRes, messagesRes, borrowersRes] = await Promise.all([
    supabase.from("storage_items").select("*").order("item_name"),
    supabase.from("storage_locations").select("*").order("position"),
    supabase.from("storage_loans").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("storage_loan_messages").select("*").order("created_at").limit(3000),
    tab === "borrowers" ? supabase.rpc("storage_borrower_list") : Promise.resolve({ data: [], error: null }),
  ]);

  const messages = (messagesRes.data ?? []) as Message[];
  const unreadBefore = messages.filter((m) => !m.from_storage && !m.read_at).length;
  // Opening Messages marks borrowers' messages as read (they stay highlighted on this visit).
  if (tab === "messages" && unreadBefore && canEdit("storage")) await supabase.rpc("storage_messages_read", { p_side: "storage" });

  const error = [itemsRes, locationsRes, loansRes, messagesRes].find((r) => r.error)?.error?.message ?? null;

  return (
    <StorageDashboard
      data={{
        items: (itemsRes.data ?? []) as Item[],
        locations: (locationsRes.data ?? []) as Location[],
        loans: (loansRes.data ?? []) as Loan[],
        messages,
        borrowers: (borrowersRes.data ?? []) as Borrower[],
        borrowersError: borrowersRes.error ? "The borrowers list didn't load. Has 0014_storage_loans.sql been run?" : null,
      }}
      error={error}
      tab={tab}
      location={location}
      loanId={loan}
      unreadBefore={unreadBefore}
      canEdit={canEdit("storage")}
      canManage={isManager("storage")}
      roleLabel={isAdmin ? "Administrator" : ROLE_LABELS[roleIn("storage") ?? "member"]}
    />
  );
}
