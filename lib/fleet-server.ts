import type { createClient } from "@/lib/supabase/server";
import type { FleetFile } from "@/lib/fleet";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Adds short-lived view and download links to files in the private "fleet" bucket. */
export async function signFiles(supabase: Client, files: FleetFile[], seconds = 3600): Promise<FleetFile[]> {
  if (!files.length) return files;
  const paths = files.map((f) => f.file_path);
  const bucket = supabase.storage.from("fleet");
  const [view, download] = await Promise.all([
    bucket.createSignedUrls(paths, seconds),
    bucket.createSignedUrls(paths, seconds, { download: true }),
  ]);
  const viewBy = new Map((view.data ?? []).map((s) => [s.path, s.signedUrl]));
  const downloadBy = new Map((download.data ?? []).map((s) => [s.path, s.signedUrl]));
  return files.map((f) => ({
    ...f,
    viewUrl: viewBy.get(f.file_path) ?? undefined,
    downloadUrl: downloadBy.get(f.file_path) ?? undefined,
  }));
}
