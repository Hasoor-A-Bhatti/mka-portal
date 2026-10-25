import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/departments";

/** Database values. "manager" is shown in the app as "Department admin". */
export type Role = "member" | "manager";

export const ROLE_LABELS: Record<Role, string> = {
  member: "Member",
  manager: "Department admin",
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
};

/**
 * The signed-in user, their profile and which departments they can open.
 * Cached per request, so layouts and pages can all call it for free.
 * Redirects to /login when there's no session.
 *
 * This only shapes what the app shows. The real lock is row-level security
 * in Supabase, which refuses other departments' data whatever the app asks for.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("user_departments").select("department, role").eq("user_id", user.id),
  ]);

  const p = (profile ?? null) as Profile | null;
  const isAdmin = Boolean(p?.is_admin);

  const roles = new Map<string, Role>();
  if (isAdmin) {
    DEPARTMENTS.forEach((d) => roles.set(d.slug, "manager"));
  } else {
    (memberships ?? []).forEach((m: { department: string; role: Role }) =>
      roles.set(m.department, m.role),
    );
  }

  const departments = DEPARTMENTS.filter((d) => roles.has(d.slug));

  const fullName =
    p?.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "there";

  // Shown under "Salam [name]" in the top bar.
  let roleLabel: string;
  if (isAdmin) roleLabel = "Administrator";
  else if (departments.length === 1) roleLabel = `${departments[0].short} · ${ROLE_LABELS[roles.get(departments[0].slug)!]}`;
  else if (departments.length === 0) roleLabel = "No departments yet";
  else roleLabel = `${departments.length} departments`;

  return {
    supabase,
    user,
    profile: p,
    isAdmin,
    fullName,
    firstName: fullName.split(/\s+/)[0],
    roleLabel,
    departments,
    /** The only department this user has, when they have exactly one. */
    soleDepartment: !isAdmin && departments.length === 1 ? departments[0] : undefined,
    canAccess: (slug: string) => roles.has(slug),
    isManager: (slug: string) => roles.get(slug) === "manager",
    roleIn: (slug: string) => roles.get(slug),
  };
});
