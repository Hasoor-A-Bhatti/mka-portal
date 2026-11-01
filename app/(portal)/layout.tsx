import Link from "next/link";
import { LogOut } from "lucide-react";
import { getSession } from "@/lib/session";
import { initials } from "@/lib/format";
import { Crumbs, Nav } from "@/components/nav";

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

        <footer className="site-foot">
          <span className="seal is-tiny" aria-hidden>
            <span className="seal-art" />
          </span>
          <p>
            <strong>Majlis Khuddamul Ahmadiyya UK</strong>
            <span>MKA Portal · For internal use only</span>
          </p>
          <small>© {new Date().getFullYear()} Majlis Khuddamul Ahmadiyya UK</small>
        </footer>
      </div>

      {/* Faint emblem and name behind every dashboard */}
      <div className="watermark" aria-hidden>
        <span className="watermark-seal" />
        <span className="watermark-text">
          Majlis Khuddamul Ahmadiyya
          <small>United Kingdom</small>
        </span>
      </div>
    </div>
  );
}
