"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPin, Search, Wrench } from "lucide-react";
import { PROPERTY_STATUSES } from "@/lib/jaidat";
import { vars } from "@/lib/css";
import { HealthRing, Meter, Pill } from "./bits";

export type PropertyCard = {
  id: string;
  reference: string;
  name: string;
  short: string;
  type: string;
  use: string;
  location: string;
  status: string;
  initial: boolean;
  health: number;
  rating: string;
  openTickets: number;
  urgent: number;
  compliant: number;
  applicable: number;
  undecided: number;
  overdue: number;
  recordsDone: number;
  recordsTotal: number;
};

export function PropertyGrid({ properties }: { properties: PropertyCard[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    properties.forEach((p) => m.set(p.status, (m.get(p.status) ?? 0) + 1));
    return m;
  }, [properties]);

  const q = query.trim().toLowerCase();
  const visible = properties.filter(
    (p) =>
      (!status || p.status === status) &&
      (!q || [p.name, p.short, p.reference, p.type, p.use, p.location].join(" ").toLowerCase().includes(q)),
  );

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Properties</h2>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search properties</span>
          <input className="input" type="search" placeholder="Name, reference, area" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
          All <em>{properties.length}</em>
        </button>
        {PROPERTY_STATUSES.filter((s) => counts.get(s)).map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {s} <em>{counts.get(s)}</em>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <strong>{properties.length ? "No matches" : "No properties yet"}</strong>
          {properties.length ? "Try a different search or status." : "Add the first property to get started."}
        </div>
      ) : (
        <div className="jd-grid">
          {visible.map((p, i) => (
            <Link key={p.id} href={`/jaidat/${p.id}`} className="jd-card spotlight rise" style={vars({ "--i": String(Math.min(i, 8)) })}>
              <div className="jd-card-top">
                <div className="jd-card-id">
                  <span className="jd-ref">{p.reference}</span>
                  {p.initial && <span className="jd-phase">Phase 1</span>}
                </div>
                <Pill value={p.status} />
              </div>
              <div className="jd-card-main">
                <HealthRing score={p.health} size={58} />
                <div>
                  <h3>{p.name}</h3>
                  <p className="vc-sub">{p.use || p.type}</p>
                  {p.location && (
                    <p className="jd-card-loc">
                      <MapPin size={13} /> {p.location}
                    </p>
                  )}
                </div>
              </div>
              <div className="jd-card-meters">
                <Meter value={p.compliant} total={p.applicable} label="Compliance verified" tone="#15805a" />
                <Meter value={p.recordsDone} total={p.recordsTotal} label="Records verified" />
              </div>
              <div className="vc-foot">
                <span className="vc-keys">
                  <Wrench size={14} /> {p.openTickets ? `${p.openTickets} open ticket${p.openTickets === 1 ? "" : "s"}` : "No open tickets"}
                </span>
                <span className="jd-card-flags">
                  {p.undecided > 0 && <span className="doc-dot warn" title="Compliance items still to decide">{p.undecided} to decide</span>}
                  {p.overdue > 0 && <span className="doc-dot bad">{p.overdue} overdue</span>}
                </span>
              </div>
              {p.urgent > 0 && (
                <span className="vc-alert" title="Urgent tickets (P1 or past target)">
                  <AlertTriangle size={13} /> {p.urgent}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
