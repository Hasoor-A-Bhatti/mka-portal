import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DOMAIN = "@khuddam.co.uk";

/** Google sends people back here. Swap the one-time code for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const raw = url.searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  // Google or Supabase refused (e.g. an account outside Khuddam, or the person cancelled).
  if (url.searchParams.get("error")) {
    const desc = url.searchParams.get("error_description") ?? "";
    return fail(/database error|khuddam/i.test(desc) ? "domain" : url.searchParams.get("error") === "access_denied" ? "cancelled" : "google");
  }
  if (!code) return fail("google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail("google");

  // Belt and braces: Google accounts must be Khuddam ones.
  const provider = data.user.app_metadata?.provider;
  if (provider === "google" && !data.user.email?.toLowerCase().endsWith(DOMAIN)) {
    await supabase.auth.signOut();
    return fail("domain");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
