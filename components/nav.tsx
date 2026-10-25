"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutGrid } from "lucide-react";
import { getDepartment } from "@/lib/departments";
import { vars } from "@/lib/css";

type Props = {
  /** Slugs of departments this user can open. */
  slugs: string[];
  variant: "sidebar" | "mobile";
};

export function Nav({ slugs, variant }: Props) {
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const departments = slugs.map(getDepartment).filter((d) => d !== undefined);
  // One department: no overview and nothing to switch between.
  const single = departments.length === 1;

  const links = (
    <>
      {!single && (
        <Link href="/" className="nav-link" aria-current={isCurrent("/") ? "page" : undefined}>
          <span className="nav-dot">
            <LayoutGrid size={16} />
          </span>
          Overview
        </Link>
      )}

      {variant === "sidebar" && departments.length > 0 && (
        <div className="nav-group">{single ? "Your department" : "Departments"}</div>
      )}

      {departments.map((d) => {
        const href = `/${d.slug}`;
        const Icon = d.icon;
        return (
          <Link
            key={d.slug}
            href={href}
            className="nav-link"
            aria-current={isCurrent(href) ? "page" : undefined}
            style={vars({ "--dot": d.accent })}
          >
            <span className="nav-dot">
              <Icon size={16} />
            </span>
            {variant === "sidebar" ? d.name : d.short}
          </Link>
        );
      })}

      {departments.length > 0 && (
        <>
          {variant === "sidebar" && <div className="nav-group">Records</div>}
          <Link
            href="/activity"
            className="nav-link"
            aria-current={isCurrent("/activity") ? "page" : undefined}
          >
            <span className="nav-dot">
              <History size={16} />
            </span>
            Activity log
          </Link>
        </>
      )}
    </>
  );

  if (variant === "mobile") {
    return (
      <nav className="mobile-nav" aria-label="Main">
        {links}
      </nav>
    );
  }

  return (
    <nav className="nav" aria-label="Main">
      {links}
    </nav>
  );
}

export function Crumbs({ slugs }: { slugs: string[] }) {
  const pathname = usePathname();
  const first = pathname.split("/")[1] ?? "";
  const dept = slugs.includes(first) ? getDepartment(first) : undefined;

  let current = "Overview";
  if (dept) current = dept.name;
  else if (first === "activity") current = "Activity log";

  return (
    <div className="crumbs">
      <span>MKA Portal</span>
      <span aria-hidden>/</span>
      <strong>{current}</strong>
    </div>
  );
}
