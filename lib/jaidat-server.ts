import type { createClient } from "@/lib/supabase/server";
import type {
  CatalogueItem,
  ComplianceItem,
  Contact,
  Contractor,
  Cost,
  Inspection,
  Issue,
  IssueNote,
  JaidatData,
  JaidatFile,
  Policy,
  Property,
  Quote,
  RecordItem,
  WaitingRequest,
} from "@/lib/jaidat";

type Client = Awaited<ReturnType<typeof createClient>>;

const BY = (table: string) => `*, creator:profiles!${table}_created_by_fkey(full_name)`;

/**
 * Loads the Jaidat records the signed-in user can see. With a property id,
 * only that property's records (plus the shared contractor and contact lists).
 * Returns the first error, if any table didn't load (e.g. before migration 0010).
 */
export async function loadJaidat(supabase: Client, propertyId?: string): Promise<{ data: JaidatData; error: string | null }> {
  const scoped = <T>(table: string, select = BY(table)) => {
    const q = supabase.from(table).select(select);
    return (propertyId ? q.eq("property_id", propertyId) : q) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  };

  const [props, records, compliance, catalogue, insurance, issues, contractors, contacts, costs, inspections, files, requests] = await Promise.all([
    (propertyId
      ? supabase.from("jaidat_properties").select("*").eq("id", propertyId)
      : supabase.from("jaidat_properties").select("*").order("reference")) as unknown as PromiseLike<{ data: Property[] | null; error: { message: string } | null }>,
    scoped<RecordItem>("jaidat_records", "*"),
    scoped<ComplianceItem>("jaidat_compliance", "*"),
    supabase.from("jaidat_compliance_catalogue").select("key, title, legislation, guidance, interval_months").order("position"),
    scoped<Policy>("jaidat_insurance", "*"),
    scoped<Issue>("jaidat_issues"),
    supabase.from("jaidat_contractors").select("*").order("name"),
    supabase.from("jaidat_contacts").select("*").order("position").order("full_name"),
    scoped<Cost>("jaidat_costs"),
    scoped<Inspection>("jaidat_inspections"),
    scoped<JaidatFile>("jaidat_files"),
    propertyId
      ? Promise.resolve({ data: [] as WaitingRequest[], error: null })
      : supabase.from("jaidat_requests").select("*").order("sent_on", { ascending: false, nullsFirst: false }),
  ]);

  const issueRows = (issues.data ?? []) as Issue[];
  const ids = issueRows.map((i) => i.id);
  const [notes, quotes] = ids.length
    ? await Promise.all([
        supabase.from("jaidat_issue_notes").select(BY("jaidat_issue_notes")).in("issue_id", ids).order("created_at"),
        supabase.from("jaidat_quotes").select("*").in("issue_id", ids).order("amount"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const all = [props, records, compliance, catalogue, insurance, issues, contractors, contacts, costs, inspections, files, requests, notes, quotes];
  const error = all.find((r) => r.error)?.error?.message ?? null;

  const data: JaidatData = {
    properties: (props.data ?? []) as Property[],
    records: ((records.data ?? []) as RecordItem[]).sort((a, b) => a.position - b.position),
    compliance: ((compliance.data ?? []) as ComplianceItem[]).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    catalogue: (catalogue.data ?? []) as CatalogueItem[],
    insurance: (insurance.data ?? []) as Policy[],
    issues: issueRows.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    notes: (notes.data ?? []) as unknown as IssueNote[],
    quotes: (quotes.data ?? []) as unknown as Quote[],
    contractors: (contractors.data ?? []) as Contractor[],
    contacts: (contacts.data ?? []) as Contact[],
    costs: ((costs.data ?? []) as Cost[]).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    inspections: ((inspections.data ?? []) as Inspection[]).sort((a, b) => b.inspected_on.localeCompare(a.inspected_on)),
    files: await signFiles(supabase, ((files.data ?? []) as JaidatFile[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    requests: (requests.data ?? []) as WaitingRequest[],
  };
  return { data, error };
}

/** Adds short-lived view and download links to files in the private "jaidat" bucket. */
async function signFiles(supabase: Client, files: JaidatFile[], seconds = 3600): Promise<JaidatFile[]> {
  const paths = files.map((f) => f.file_path).filter((p): p is string => Boolean(p));
  if (!paths.length) return files;
  const bucket = supabase.storage.from("jaidat");
  const [view, download] = await Promise.all([
    bucket.createSignedUrls(paths, seconds),
    bucket.createSignedUrls(paths, seconds, { download: true }),
  ]);
  const viewBy = new Map((view.data ?? []).map((s) => [s.path, s.signedUrl]));
  const downloadBy = new Map((download.data ?? []).map((s) => [s.path, s.signedUrl]));
  return files.map((f) =>
    f.file_path ? { ...f, viewUrl: viewBy.get(f.file_path) ?? undefined, downloadUrl: downloadBy.get(f.file_path) ?? undefined } : f,
  );
}
