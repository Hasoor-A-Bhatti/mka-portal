"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Search } from "lucide-react";
import { DOC_KINDS, VEHICLE_STATUSES, miles, type DocState } from "@/lib/fleet";
import { vars } from "@/lib/css";
import { Odometer, Pill, Plate } from "./bits";

export type VehicleCard = {
  id: string;
  registration: string;
  name: string;
  subtitle: string;
  status: string;
  mileage: number;
  yearMiles: number;
  keyHolder: string | null;
  docs: Record<string, DocState>;
  alerts: number;
};

const DOT: Record<DocState, string> = {
  Valid: "ok",
  "On file": "ok",
  "Expiring soon": "warn",
  Expired: "bad",
  Missing: "none",
};

export function VehicleGrid({ vehicles }: { vehicles: VehicleCard[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    vehicles.forEach((v) => m.set(v.status, (m.get(v.status) ?? 0) + 1));
    return m;
  }, [vehicles]);

  const visible = vehicles.filter((v) => {
    if (status && v.status !== status) return false;
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return true;
    return (
      v.registration.toLowerCase().replace(/\s+/g, "").includes(q) ||
      v.name.toLowerCase().replace(/\s+/g, "").includes(q) ||
      (v.keyHolder ?? "").toLowerCase().replace(/\s+/g, "").includes(q)
    );
  });

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Vehicles</h2>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search vehicles</span>
          <input
            className="input"
            type="search"
            placeholder="Registration, name or driver"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
          All <em>{vehicles.length}</em>
        </button>
        {VEHICLE_STATUSES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {s} <em>{counts.get(s) ?? 0}</em>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <strong>{vehicles.length ? "No matches" : "No vehicles yet"}</strong>
          {vehicles.length ? "Try a different search or status." : "Add the first vehicle to get started."}
        </div>
      ) : (
        <div className="vehicle-grid">
          {visible.map((v, i) => (
            <Link key={v.id} href={`/fleet/${v.id}`} className="vehicle-card spotlight rise" style={vars({ "--i": String(Math.min(i, 8)) })}>
              <div className="vc-top">
                <Plate reg={v.registration} />
                <Pill value={v.status} />
              </div>
              <div>
                <h3>{v.name}</h3>
                <p className="vc-sub">{v.subtitle}</p>
              </div>
              <div className="vc-odo">
                <Odometer value={v.mileage} />
                <span>{miles(v.yearMiles)} mi this year</span>
              </div>
              <div className="vc-foot">
                <span className="vc-keys">
                  <KeyRound size={14} /> {v.keyHolder ?? "In the office"}
                </span>
                <span className="vc-docs" aria-label="Documents">
                  {DOC_KINDS.map(({ kind, label }) => (
                    <span key={kind} className={`doc-dot ${DOT[v.docs[kind] ?? "Missing"]}`} title={`${label}: ${v.docs[kind] ?? "Missing"}`}>
                      {label === "Road tax" ? "Tax" : label === "Insurance" ? "Ins" : label}
                    </span>
                  ))}
                </span>
              </div>
              {v.alerts > 0 && (
                <span className="vc-alert" title={`${v.alerts} thing${v.alerts === 1 ? "" : "s"} need attention`}>
                  <AlertTriangle size={13} /> {v.alerts}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
