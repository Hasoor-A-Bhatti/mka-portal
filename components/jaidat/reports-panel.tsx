"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Printer } from "lucide-react";
import {
  PRIORITIES,
  complianceState,
  dataChecks,
  healthScore,
  isOpen,
  issueOverdue,
  money,
  num,
  recordProgress,
  shortName,
  todayISO,
  type JaidatData,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { Pill } from "./bits";

export function ReportsPanel({ data }: { data: JaidatData }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const checks = dataChecks(data, today);
  const areas = [...new Set(checks.map((c) => c.area))];

  const inMonth = (d: string | null | undefined) => Boolean(d) && d!.startsWith(month);
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const live = data.properties.filter((p) => p.status !== "Disposed");
  const open = data.issues.filter(isOpen);
  const opened = data.issues.filter((i) => inMonth(i.created_at.slice(0, 10)));
  const closed = data.issues.filter((i) => inMonth(i.completed_on));
  const checksDone = data.compliance.filter((c) => inMonth(c.last_done));
  const overdue = data.compliance.filter((c) => complianceState(c, today) === "Overdue");
  const dueSoon = data.compliance.filter((c) => complianceState(c, today) === "Due soon");
  const recs = recordProgress(data.records);
  const received = data.records.filter((r) => inMonth(r.received_on)).length;
  const paid = data.costs.filter((c) => c.category !== "Budget" && c.status === "Paid" && inMonth(c.paid_on));
  const approved = data.costs.filter((c) => c.category !== "Budget" && c.approved_on && inMonth(c.approved_on) && c.status !== "Rejected");
  const waiting = data.costs.filter((c) => c.status === "Proposed");
  const inspections = data.inspections.filter((i) => inMonth(i.inspected_on));
  const replies = data.requests.filter((r) => r.status !== "Replied");
  const name = (pid: string | null) => (pid ? shortName(data.properties.find((p) => p.id === pid)) : "General");

  const print = () => {
    document.body.classList.add("jd-printing");
    const done = () => {
      document.body.classList.remove("jd-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <>
      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Monthly report</h2>
            <p className="muted-note">A one-page summary for the Sadr and the Amila. Choose the month, then print or save it as a PDF.</p>
          </div>
          <div className="toolbar">
            <label className="mini-field">
              Month
              <input type="month" className="input" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} />
            </label>
            <button type="button" className="btn btn-primary" onClick={print}>
              <Printer size={17} /> Print or save as PDF
            </button>
            <a className="btn" href="/jaidat/renewals.ics" download>
              <Download size={17} /> Renewals calendar
            </a>
          </div>
        </div>

        <article className="jd-print jd-report">
          <header>
            <span className="eyebrow">MKA Jaidad Team UK</span>
            <h2>Monthly report · {label}</h2>
            <p className="muted-note">Prepared {formatDate(today)} from the MKA Portal.</p>
          </header>

          <div className="jd-report-grid">
            <div>
              <h3>Tickets</h3>
              <p>
                <b>{opened.length}</b> opened and <b>{closed.length}</b> resolved in {label}. <b>{open.length}</b> open now (
                {PRIORITIES.map((p) => `${open.filter((i) => i.priority === p.key).length} ${p.key}`).join(", ")}), {open.filter((i) => issueOverdue(i, today)).length} past
                target.
              </p>
            </div>
            <div>
              <h3>Compliance</h3>
              <p>
                <b>{checksDone.length}</b> check{checksDone.length === 1 ? "" : "s"} carried out. <b>{overdue.length}</b> overdue and <b>{dueSoon.length}</b> due in the
                next 60 days.
              </p>
            </div>
            <div>
              <h3>Records</h3>
              <p>
                <b>
                  {recs.verified} of {recs.total}
                </b>{" "}
                checklist items verified ({recs.pct}%). <b>{received}</b> received in {label}.
              </p>
            </div>
            <div>
              <h3>Finance</h3>
              <p>
                <b>{money(paid.reduce((n, c) => n + num(c.paid), 0))}</b> paid and <b>{money(approved.reduce((n, c) => n + num(c.approved), 0))}</b> approved in {label}.{" "}
                {waiting.length} cost{waiting.length === 1 ? "" : "s"} ({money(waiting.reduce((n, c) => n + num(c.proposed), 0))}) waiting for approval.
              </p>
            </div>
            <div>
              <h3>Inspections</h3>
              <p>
                <b>{inspections.length}</b> carried out
                {inspections.length ? `: ${inspections.map((i) => `${name(i.property_id)} (${i.outcome.toLowerCase()})`).join(", ")}` : ""}.
              </p>
            </div>
            <div>
              <h3>Awaiting replies</h3>
              <p>
                <b>{replies.length}</b> request{replies.length === 1 ? "" : "s"} to other departments still waiting{replies.length ? `: ${replies.map((r) => r.person).join(", ")}` : ""}.
              </p>
            </div>
          </div>

          <h3>Building health</h3>
          <table className="records static">
            <thead>
              <tr>
                <th>Property</th>
                <th>Score</th>
                <th>Open tickets</th>
                <th>Compliance verified</th>
                <th>Main points</th>
              </tr>
            </thead>
            <tbody>
              {live.map((p) => {
                const h = healthScore(p, data, today);
                const comp = data.compliance.filter((c) => c.property_id === p.id).map((c) => complianceState(c, today));
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <Pill value={h.rating} label={`${h.score} · ${h.rating}`} />
                    </td>
                    <td className="tnum">{open.filter((i) => i.property_id === p.id).length}</td>
                    <td className="tnum">
                      {comp.filter((s) => s === "Compliant").length}/{comp.filter((s) => s !== "Not applicable" && s !== "To decide").length}
                    </td>
                    <td className="wrap">{h.reasons.slice(0, 3).join("; ") || "Nothing flagged"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(overdue.length > 0 || dueSoon.length > 0) && (
            <>
              <h3>Checks overdue or due soon</h3>
              <ul className="jd-report-list">
                {[...overdue, ...dueSoon].map((c) => (
                  <li key={c.id}>
                    {name(c.property_id)}: {c.title}, due {formatDate(c.next_due)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted-note">The building health score starts at 100 and loses points for overdue checks, insurance gaps, open tickets and overdue inspections. It is a prompt, not an official rating.</p>
        </article>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>
              Data checks <span className="count-badge">{checks.length}</span>
            </h2>
            <p className="muted-note">Gaps in the records worth fixing before the month end. The list updates as things are completed.</p>
          </div>
        </div>
        {checks.length === 0 ? (
          <div className="all-clear">
            <CheckCircle2 size={22} />
            <div>
              <strong>Nothing to fix</strong>
              <span>Every record is complete.</span>
            </div>
          </div>
        ) : (
          <div className="jd-groups">
            {areas.map((a) => {
              const list = checks.filter((c) => c.area === a);
              return (
                <details key={a} className="jd-ws">
                  <summary>
                    <span>{a}</span>
                    <span className="count-badge">{list.length}</span>
                  </summary>
                  <ul className="jd-checks">
                    {list.slice(0, 200).map((c, i) => (
                      <li key={i}>
                        <Link href={c.href}>
                          <span>{c.item}</span>
                          <small>{c.problem}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
