import Link from "next/link";
import { LogOut } from "lucide-react";
import { getSession } from "@/lib/session";
import { initials } from "@/lib/format";
import { Crumbs, Nav } from "@/components/nav";
import { SiteFooter, Watermark } from "@/components/brand";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const slugs = session.departments.map((d) => d.slug);
  const home = session.soleDepartment ? `/${session.soleDepartment.slug}` : "/";

  return (
    <div className="shell">
      <aside className="sidebar glass">
        <Link href={home} className="brand-lockup" aria-label="Majlis Khuddamul Ahmadiyya UK, MKA Portal home">
          <span className="seal" aria-hidden>
            <span className="seal-art" />
          </span>
          <span className="brand-org" aria-hidden>
            <b>Majlis</b>
            <b>Khuddamul Ahmadiyya</b>
            <small>United Kingdom</small>
          </span>
        </Link>
        <div className="brand-app">
          <span>MKA Portal</span>
          <small>{session.soleDepartment?.name ?? "Operations"}</small>
        </div>
        <Nav slugs={slugs} variant="sidebar" />
        <p className="sidebar-foot">Signed in as {session.user.email}</p>
      </aside>

      <div className="main">
        <header className="topbar glass glass-strong">
          <Link href={home} className="mobile-brand" aria-label="Majlis Khuddamul Ahmadiyya UK, MKA Portal home">
            <span className="seal is-small" aria-hidden>
              <span className="seal-art" />
            </span>
            <span className="brand-org is-compact" aria-hidden>
              <b>Majlis Khuddamul</b>
              <b>Ahmadiyya UK</b>
            </span>
          </Link>
          <Crumbs slugs={slugs} />

          <div className="user">
            <div className="salam">
              <strong>Salam {session.fullName}</strong>
              <span>{session.roleLabel}</span>
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

        <SiteFooter />
      </div>

      <Watermark />
    </div>
  );
}
