import Link from "next/link";
import { LogOut } from "lucide-react";
import { getSession } from "@/lib/session";
import { initials } from "@/lib/format";
import { Crumbs, Nav } from "@/components/nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const slugs = session.departments.map((d) => d.slug);
  const roleLabel = session.isAdmin
    ? "Administrator"
    : `${slugs.length} department${slugs.length === 1 ? "" : "s"}`;

  return (
    <div className="shell">
      <aside className="sidebar glass">
        <Link href="/" className="brand">
          <span className="brand-mark">MKA</span>
          <span className="brand-name">
            Delegations
            <small>Operations portal</small>
          </span>
        </Link>
        <Nav slugs={slugs} variant="sidebar" />
        <p className="sidebar-foot">Signed in as {session.user.email}</p>
      </aside>

      <div className="main">
        <header className="topbar glass glass-strong">
          <Link href="/" className="brand mobile-brand">
            <span className="brand-mark">MKA</span>
          </Link>
          <Crumbs slugs={slugs} />

          <div className="user">
            <div className="salam">
              <strong>Salam {session.fullName}</strong>
              <span>{roleLabel}</span>
            </div>
            <span className="avatar" aria-hidden>
              {initials(session.fullName)}
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost btn-icon" title="Sign out">
                <LogOut size={18} />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </header>

        <Nav slugs={slugs} variant="mobile" />

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
