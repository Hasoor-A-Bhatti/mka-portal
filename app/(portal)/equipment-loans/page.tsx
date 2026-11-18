import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import type { Loan, Message, SearchResult } from "@/lib/storage";
import { friendly } from "@/lib/storage-actions";
import { LOAN_TABS, LoansView, type LoanTab } from "@/components/storage/loans-view";

export const metadata: Metadata = { title: "Equipment Loans" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; loan?: string }> };

const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function EquipmentLoansPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab: LoanTab = LOAN_TABS.some((t) => t.key === params.tab) ? (params.tab as LoanTab) : "find";
  const { supabase, user, canAccess, canEdit, firstName } = await getSession();

  if (!canAccess("equipment-loans")) {
    return (
      <section className="notice glass">
        <h1>Equipment Loans isn&apos;t on your account</h1>
        <p>Ask MKA Storage to add you to the borrowers list.</p>
      </section>
    );
  }

  // A search has been made once the form has been sent (even with nothing typed, which browses everything).
  const searched = tab === "find" && params.q !== undefined;
  const q = (params.q ?? "").slice(0, 100);
  let from = isDate(params.from);
  let to = isDate(params.to);
  if (!from && to) from = to;
  if (from && to && to < from) to = from;

  // The department this person heads on the borrowers list (null before migration 0020).
  const { data: deptData } = await supabase.rpc("storage_my_department");
  const department = typeof deptData === "string" && deptData ? deptData : null;

  const [loansRes, ownedRes, messagesRes, searchRes] = await Promise.all([
    // Only this person's own requests, even for Storage staff who can see everyone's.
    supabase.from("storage_loans").select("*").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(500),
    // Borrowing requests: other people asking for this department's items.
    department
      ? supabase.from("storage_loans").select("*").ilike("owner_department", department).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("storage_loan_messages").select("*").order("created_at").limit(2000),
    searched ? supabase.rpc("storage_loan_search", { p_q: q, p_from: from || null, p_to: to || from || null }) : Promise.resolve({ data: [], error: null }),
  ]);

  const loans = (loansRes.data ?? []) as Loan[];
  const owned = (ownedRes.data ?? []) as Loan[];
  const ownIds = new Set(loans.map((l) => l.id));
  // Requests for my department's items made by someone else (my own are under My loans).
  const lendIds = new Set(owned.filter((l) => !ownIds.has(l.id)).map((l) => l.id));
  const messages = ((messagesRes.data ?? []) as Message[]).filter((m) => ownIds.has(m.loan_id) || lendIds.has(m.loan_id));
  const isBorrowerMsg = (m: Message) => (m.author_role ?? (m.from_storage ? "store" : "borrower")) === "borrower";
  const unreadOwn = messages.filter((m) => ownIds.has(m.loan_id) && !isBorrowerMsg(m) && !m.read_at).length;
  const unreadLend = messages.filter((m) => lendIds.has(m.loan_id) && isBorrowerMsg(m) && !m.read_at).length;
  const unreadBefore = unreadOwn + unreadLend;
  if (tab === "messages" && unreadOwn) await supabase.rpc("storage_messages_read", { p_side: "borrower" });
  if (tab === "messages" && unreadLend) await supabase.rpc("storage_messages_read", { p_side: "owner" });

  return (
    <LoansView
      tab={tab}
      loans={loans}
      messages={messages}
      unreadBefore={unreadBefore}
      search={{
        searched,
        q,
        from,
        to,
        results: (searchRes.data ?? []) as SearchResult[],
        error: searchRes.error ? friendly(searchRes.error) : null,
      }}
      loanId={params.loan}
      meId={user.id}
      lending={{ department, loans: owned }}
      canEdit={canEdit("equipment-loans")}
      firstName={firstName}
      error={loansRes.error ? friendly(loansRes.error) : null}
    />
  );
}
