"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Lightbulb, Search } from "lucide-react";
import { DOC_CATEGORIES, shortName, todayISO, type Issue, type JaidatFile, type Property } from "@/lib/jaidat";
import { ARTICLES } from "@/lib/jaidat-guide";
import { formatDate } from "@/lib/format";
import { Empty } from "./bits";
import { AddDocument, DocList } from "./files";

/** Every document, by category, plus SOP drafts from closed tickets and general guidance. */
export function DocumentsPanel({
  files,
  properties,
  issues,
  propertyId,
  canManage,
}: {
  files: JaidatFile[];
  properties: Property[];
  issues: Issue[];
  propertyId?: string;
  canManage: boolean;
}) {
  const today = todayISO();
  const [category, setCategory] = useState<string | null>(null);
  const [place, setPlace] = useState("");
  const [query, setQuery] = useState("");
  const name = (pid: string | null) => (pid ? shortName(properties.find((p) => p.id === pid)) : "General");

  const q = query.trim().toLowerCase();
  const visible = files.filter(
    (f) =>
      (!category || (category === "Expiring" ? f.expires_on && f.expires_on <= addMonths(today, 2) : f.category === category)) &&
      (!place || (place === "general" ? !f.property_id : f.property_id === place)) &&
      (!q || [f.title, f.file_name, f.notes, f.category].join(" ").toLowerCase().includes(q)),
  );
  const counts = new Map<string, number>();
  files.forEach((f) => counts.set(f.category, (counts.get(f.category) ?? 0) + 1));
  const expiring = files.filter((f) => f.expires_on && f.expires_on <= addMonths(today, 2)).length;
  const lessons = issues.filter((i) => i.lesson?.trim() && (!propertyId || i.property_id === propertyId));

  return (
    <>
      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Documents</h2>
            <p className="muted-note">
              Files are stored privately and only open for people with Jaidat access. Google Drive links work too: use restricted links.
            </p>
          </div>
          <div className="toolbar">
            {!propertyId && (
              <select className="select jd-filter" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Property">
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {shortName(p)}
                  </option>
                ))}
                <option value="general">General</option>
              </select>
            )}
            <label className="search">
              <Search size={16} />
              <span className="sr-only">Search documents</span>
              <input className="input" type="search" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <AddDocument propertyId={propertyId ?? null} />
          </div>
        </div>
        <div className="chips" role="group" aria-label="Category">
          <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
            All <em>{files.length}</em>
          </button>
          {expiring > 0 && (
            <button type="button" className="chip" aria-pressed={category === "Expiring"} onClick={() => setCategory(category === "Expiring" ? null : "Expiring")}>
              Expiring or expired <em>{expiring}</em>
            </button>
          )}
          {DOC_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c} <em>{counts.get(c)}</em>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <Empty title={files.length ? "No matches" : "No documents yet"}>
            {files.length
              ? "Try another category or search."
              : "Upload title deeds, leases, plans, certificates, policies and invoices. Documents attached to checklist items, checks and tickets also appear here."}
          </Empty>
        ) : (
          <DocList files={visible} canDelete={canManage} showProperty={propertyId ? undefined : name} />
        )}
      </section>

      <div className="split jd-split-even">
        <section className="panel glass">
          <div className="panel-head">
            <h2>
              <Lightbulb size={18} /> SOP drafts from closed tickets
            </h2>
          </div>
          {lessons.length === 0 ? (
            <p className="muted-note">When a ticket is completed, its lesson for next time appears here, ready to turn into a standard operating procedure.</p>
          ) : (
            <ul className="jd-lessons">
              {lessons.map((i) => (
                <li key={i.id}>
                  <Link href={`${i.property_id ? `/jaidat/${i.property_id}` : "/jaidat"}?tab=tickets&open=${i.id}`}>
                    <strong>{i.title}</strong>
                  </Link>
                  <p>{i.lesson}</p>
                  <small>
                    {i.ref} · {name(i.property_id)}
                    {i.completed_on ? ` · ${formatDate(i.completed_on)}` : ""} · draft until approved
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel glass">
          <div className="panel-head">
            <h2>
              <BookOpen size={18} /> Guidance
            </h2>
          </div>
          <div className="jd-kb">
            {ARTICLES.filter((a) => a.topic !== "Reporting").map((a) => (
              <details key={a.title}>
                <summary>
                  {a.title} <span className="muted-note">· {a.topic}</span>
                </summary>
                <ul>
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <p className="muted-note" style={{ marginTop: 10 }}>
            General guidance only. Check gov.uk or hse.gov.uk before relying on it.
          </p>
        </section>
      </div>
    </>
  );
}

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
