import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser. Used only for file uploads; row-level security still applies. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
