"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { miles, money } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";
import { Sheet } from "./ui";
import { Plate } from "./bits";

export type MilesRow = { id: string; registration: string; name: string; miles: number; odometer: number; sold: boolean };
export type SpendJob = { description: string; date: string | null; cost: number };
export type SpendRow = { id: string; registration: string; name: string; total: number; jobs: SpendJob[] };

/** "Miles driven this year" card: opens a breakdown by vehicle. */
export function MilesStat({ total, year, rows, i }: { total: number; year: string; rows: MilesRow[]; i: string }) {
  const [open, setOpen] = useState(false);
  const driven = rows.filter((r) => r.miles > 0).sort((a, b) => b.miles - a.miles);
  const idle = rows.filter((r) => r.miles === 0 && !r.sold);
  const top = driven[0]?.miles ?? 0;

  return (
    <>
      <button type="button" className="stat glass spotlight rise st-stat-link fl-stat-btn" style={vars({ "--i": i })} onClick={() => setOpen(true)}>
        <strong>{miles(total)}</strong>
        <span>miles driven in {year}</span>
      </button>
      {open && (
        <Sheet title={`Miles driven in ${year}`} subtitle={`${miles(total)} miles across the fleet, counted from each vehicle's mileage readings.`} onClose={() => setOpen(false)}>
          <div className="sheet-body fl-breakdown">
            {driven.length === 0 ? (
              <p className="muted-note wide">No miles logged yet this year. Add readings on each vehicle&apos;s Mileage tab.</p>
            ) : (
              <ol className="fl-rows wide">
                {driven.map((r) => (
                  <li key={r.id}>
                    <Link href={`/fleet/${r.id}?tab=mileage`} className="fl-row">
                      <Plate reg={r.registration} size="sm" />
                      <span className="fl-row-main">
                        <strong>{r.name}</strong>
                        <span className="fl-bar" aria-hidden>
                          <span style={{ width: `${Math.max((r.miles / top) * 100, 2)}%` }} />
                        </span>
                      </span>
                      <span className="fl-row-figure">
                        <b>{miles(r.miles)}</b>
                        <small>{total ? Math.round((r.miles / total) * 100) : 0}% · odometer {miles(r.odometer)}</small>
                      </span>
                      <ChevronRight size={16} className="fl-row-go" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {idle.length > 0 && (
              <p className="muted-note wide">
                No miles this year: {idle.map((r) => r.registration).join(", ")}.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** "Maintenance spend this year" card: opens which vehicles had work done, and what. */
export function SpendStat({ total, year, rows, i }: { total: number; year: string; rows: SpendRow[]; i: string }) {
  const [open, setOpen] = useState(false);
  const list = [...rows].sort((a, b) => b.total - a.total);
  const jobs = list.reduce((n, r) => n + r.jobs.length, 0);

  return (
    <>
      <button type="button" className="stat glass spotlight rise st-stat-link fl-stat-btn" style={vars({ "--i": i })} onClick={() => setOpen(true)}>
        <strong>{money(total)}</strong>
        <span>maintenance spend {year}</span>
      </button>
      {open && (
        <Sheet
          title={`Maintenance spend in ${year}`}
          subtitle={`${money(total)} on ${jobs} completed job${jobs === 1 ? "" : "s"} across ${list.length} vehicle${list.length === 1 ? "" : "s"}.`}
          onClose={() => setOpen(false)}
        >
          <div className="sheet-body fl-breakdown">
            {list.length === 0 ? (
              <p className="muted-note wide">No completed maintenance this year yet.</p>
            ) : (
              <ol className="fl-rows wide">
                {list.map((r) => (
                  <li key={r.id} className="fl-spend">
                    <Link href={`/fleet/${r.id}?tab=maintenance`} className="fl-row">
                      <Plate reg={r.registration} size="sm" />
                      <span className="fl-row-main">
                        <strong>{r.name}</strong>
                        <small>
                          {r.jobs.length} job{r.jobs.length === 1 ? "" : "s"}
                        </small>
                      </span>
                      <span className="fl-row-figure">
                        <b>{money(r.total)}</b>
                        <small>{total ? Math.round((r.total / total) * 100) : 0}% of spend</small>
                      </span>
                      <ChevronRight size={16} className="fl-row-go" />
                    </Link>
                    <ul className="fl-jobs">
                      {[...r.jobs]
                        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
                        .map((j, n) => (
                          <li key={n}>
                            <span>{j.description}</span>
                            <small>{j.date ? formatDate(j.date) : "Date not set"}</small>
                            <b>{money(j.cost)}</b>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
