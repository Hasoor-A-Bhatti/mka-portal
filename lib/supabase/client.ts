import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser: file uploads and live updates. Row-level security still applies. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
