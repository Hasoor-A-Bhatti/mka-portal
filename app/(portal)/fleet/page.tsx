import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";
import { getSession } from "@/lib/session";
import { getDepartment } from "@/lib/departments";
import {
  DOC_KINDS,
  addDays,
  daysUntil,
  docState,
  formatPlate,
  latestDocs,
  miles,
  milesThisYear,
  money,
  num,
  taskStatus,
  todayISO,
  vehicleAge,
  type DocState,
  type FleetFile,
  type Incident,
  type MileageLog,
  type Task,
  type Vehicle,
} from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";
import { Plate } from "@/components/fleet/bits";
import { VehicleButton } from "@/components/fleet/vehicle-dialog";
import { VehicleGrid, type VehicleCard } from "@/components/fleet/vehicle-grid";

export const metadata: Metadata = { title: "MKA Fleet" };
export const dynamic = "force-dynamic";

type Alert = { level: "bad" | "warn"; reg: string; href: string; text: string; sort: string };

export default async function FleetPage() {
  const dept = getDepartment("fleet")!;
  const Icon = dept.icon;
  const { supabase, canAccess, isManager, isAdmin, roleIn } = await getSession();

  if (!canAccess("fleet")) {
    return (
      <section className="notice glass">
        <h1>MKA Fleet isn't on your account</h1>
        <p>Ask an admin to add you to this department if you need it.</p>
      </section>
    );
  }
  const canManage = isManager("fleet");
  const today = todayISO();
  const year = today.slice(0, 4);

  const [vehiclesRes, filesRes, tasksRes, incidentsRes, logsRes] = await Promise.all([
    supabase
      .from("fleet_vehicles")
      .select("*, key_holder:fleet_drivers!fleet_vehicles_key_holder_id_fkey(full_name)")
      .order("registration"),
    supabase.from("fleet_files").select("vehicle_id, kind, expires_on, created_at").in("kind", ["insurance", "mot", "road_tax"]),
    supabase.from("fleet_maintenance").select("id, vehicle_id, description, due_date, status, cost, completed_on"),
    supabase
      .from("fleet_incidents")
      .select("id, vehicle_id, incident_type, severity, status, occurred_at, not_drivable")
      .neq("status", "Resolved"),
    supabase.from("fleet_mileage_logs").select("vehicle_id, reading, recorded_on, created_at"),
  ]);

  const loadError = [vehiclesRes, filesRes, tasksRes, incidentsRes, logsRes].find((r) => r.error)?.error;
  const vehicles = (vehiclesRes.data ?? []) as unknown as Vehicle[];
  const files = (filesRes.data ?? []) as unknown as FleetFile[];
  const tasks = (tasksRes.data ?? []) as unknown as Task[];
  const incidents = (incidentsRes.data ?? []) as unknown as Incident[];
  const logs = (logsRes.data ?? []) as unknown as MileageLog[];

  const alerts: Alert[] = [];
  let fleetMiles = 0;
  let docProblems = 0;

  const cards: VehicleCard[] = vehicles.map((v) => {
    const reg = formatPlate(v.registration);
    const href = `/fleet/${v.id}`;
    const inUse = v.status !== "Sold";
    let count = 0;
    const push = (a: Omit<Alert, "reg">) => {
      if (!inUse) return;
      alerts.push({ ...a, reg });
      count++;
    };

    const vLogs = logs.filter((l) => l.vehicle_id === v.id);
    const yearMiles = milesThisYear(vLogs);
    fleetMiles += yearMiles;

    const docs = latestDocs(files.filter((f) => f.vehicle_id === v.id));
    const docStates: Record<string, DocState> = {};
    for (const { kind, label } of DOC_KINDS) {
      const f = docs.get(kind);
      const s = docState(f, today);
      docStates[kind] = s;
      if (!inUse) continue;
      if (s === "Expired") {
        docProblems++;
        push({ level: "bad", href: `${href}?tab=documents`, text: `${label} expired ${formatDate(f!.expires_on)}`, sort: f!.expires_on! });
      } else if (s === "Expiring soon") {
        docProblems++;
        const d = daysUntil(f!.expires_on!, today);
        push({ level: "warn", href: `${href}?tab=documents`, text: `${label} expires in ${d} day${d === 1 ? "" : "s"}`, sort: f!.expires_on! });
      } else if (s === "Missing" && v.status === "Active") {
        docProblems++;
        push({ level: "warn", href: `${href}?tab=documents`, text: `No ${label === "MOT" ? "MOT" : label.toLowerCase()} document on file`, sort: "9998" });
      }
    }

    if (v.status === "Damaged") push({ level: "bad", href, text: "Marked as damaged", sort: "0000" });

    for (const t of tasks.filter((t) => t.vehicle_id === v.id)) {
      const s = taskStatus(t, today);
      if (s === "Overdue") {
        push({ level: "bad", href: `${href}?tab=maintenance`, text: `Overdue: ${t.description}`, sort: t.due_date ?? "0000" });
      } else if (s === "Pending" && t.due_date && t.due_date <= addDays(today, 14)) {
        const d = daysUntil(t.due_date, today);
        push({ level: "warn", href: `${href}?tab=maintenance`, text: `${t.description}, due ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}`, sort: t.due_date });
      }
    }

    for (const i of incidents.filter((i) => i.vehicle_id === v.id)) {
      push({
        level: i.severity === "Major" || i.not_drivable ? "bad" : "warn",
        href: `${href}?tab=incidents`,
        text: `${i.status === "Open" ? "Open" : "Under review"}: ${i.incident_type.toLowerCase()}${i.not_drivable ? ", not drivable" : ""}`,
        sort: i.occurred_at.slice(0, 10),
      });
    }

    return {
      id: v.id,
      registration: v.registration,
      name: v.make_model ?? "Unnamed vehicle",
      subtitle: [v.vehicle_type, v.year ? `${vehicleAge(v.year)} old` : null].filter(Boolean).join(" · "),
      status: v.status,
      mileage: v.mileage,
      yearMiles,
      keyHolder: v.key_holder?.full_name ?? null,
      docs: docStates,
      alerts: count,
    };
  });

  alerts.sort((a, b) => (a.level === b.level ? a.sort.localeCompare(b.sort) : a.level === "bad" ? -1 : 1));

  const active = vehicles.filter((v) => v.status === "Active").length;
  const inFleet = vehicles.filter((v) => v.status !== "Sold").length;
  const spent = tasks
    .filter((t) => t.status === "Completed" && (t.completed_on ?? t.due_date ?? "").startsWith(year))
    .reduce((n, t) => n + num(t.cost), 0);
  const overdue = tasks.filter((t) => taskStatus(t, today) === "Overdue").length;
  const keysOut = vehicles.filter((v) => v.status !== "Sold" && v.key_holder);

  return (
    <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
      <header className="page-head rise">
        <div className="page-title">
          <span className="dept-icon">
            <Icon size={28} />
          </span>
          <div>
            <span className="eyebrow">{isAdmin ? "Administrator" : roleIn("fleet") === "manager" ? "Department admin" : "Member"}</span>
            <h1>{dept.name}</h1>
            <p>{dept.description}</p>
          </div>
        </div>
        {canManage && <VehicleButton />}
      </header>

      {loadError && (
        <p className="form-error" role="alert">
          Some fleet data didn't load: {loadError.message}. Has the 0003_fleet.sql migration been run in Supabase?
        </p>
      )}

      <section className="stats" aria-label="Fleet summary">
        <div className="stat glass spotlight is-accent rise" style={vars({ "--i": "1" })}>
          <strong>
            {active}
            <small> / {inFleet}</small>
          </strong>
          <span>vehicles active</span>
        </div>
        <div className="stat glass spotlight rise" style={vars({ "--i": "2" })}>
          <strong>{miles(fleetMiles)}</strong>
          <span>miles driven in {year}</span>
        </div>
        <div className="stat glass spotlight rise" style={vars({ "--i": "3" })}>
          <strong>{money(spent)}</strong>
          <span>maintenance spend {year}</span>
        </div>
        <div className="stat glass spotlight rise" style={vars({ "--i": "4" })}>
          <strong style={{ color: overdue ? "var(--danger)" : undefined }}>{overdue}</strong>
          <span>maintenance overdue</span>
        </div>
        <div className="stat glass spotlight rise" style={vars({ "--i": "5" })}>
          <strong style={{ color: docProblems ? "#9a6600" : undefined }}>{docProblems}</strong>
          <span>documents need action</span>
        </div>
        <div className="stat glass spotlight rise" style={vars({ "--i": "6" })}>
          <strong style={{ color: incidents.length ? "var(--danger)" : undefined }}>{incidents.length}</strong>
          <span>open incidents</span>
        </div>
      </section>

      <div className="split rise" style={vars({ "--i": "4" })}>
        <VehicleGrid vehicles={cards} />

        <div className="stack">
          <section className="panel glass">
            <div className="panel-head">
              <h2>
                Needs attention {alerts.length > 0 && <span className="count-badge">{alerts.length}</span>}
              </h2>
            </div>
            {alerts.length === 0 ? (
              <div className="all-clear">
                <CheckCircle2 size={22} />
                <div>
                  <strong>All clear</strong>
                  <span>Documents, maintenance and incidents are all up to date.</span>
                </div>
              </div>
            ) : (
              <ul className="alert-list">
                {alerts.slice(0, 12).map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className={`alert-item ${a.level}`}>
                      <span className="alert-dot" aria-hidden />
                      <span className="alert-text">
                        <b>{a.reg}</b> {a.text}
                      </span>
                    </Link>
                  </li>
                ))}
                {alerts.length > 12 && <li className="muted-note">and {alerts.length - 12} more</li>}
              </ul>
            )}
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>Who has the keys</h2>
            </div>
            {keysOut.length === 0 ? (
              <p className="muted-note">All keys are in the office.</p>
            ) : (
              <ul className="glance">
                {keysOut.map((v) => (
                  <li key={v.id}>
                    <Link href={`/fleet/${v.id}?tab=users`} className="glance-link">
                      <Plate reg={v.registration} size="sm" />
                      <span className="glance-right">
                        <KeyRound size={14} /> {v.key_holder!.full_name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {keysOut.length > 0 && keysOut.length < inFleet && (
              <p className="muted-note" style={{ marginTop: 10 }}>
                {inFleet - keysOut.length} other vehicle{inFleet - keysOut.length === 1 ? "'s" : "s'"} keys are in the office.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
