import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getSession } from "@/lib/session";
import { getDepartment } from "@/lib/departments";
import {
  DOC_KINDS,
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
  type Driver,
  type FleetFile,
  type Incident,
  type KeyLog,
  type MileageLog,
  type Task,
  type Vehicle,
} from "@/lib/fleet";
import { signFiles } from "@/lib/fleet-server";
import { formatDate, formatDateTime } from "@/lib/format";
import { vars } from "@/lib/css";
import { Odometer, Pill, Plate } from "@/components/fleet/bits";
import { VehicleButton } from "@/components/fleet/vehicle-dialog";
import { DocumentsPanel } from "@/components/fleet/documents-panel";
import { MileagePanel } from "@/components/fleet/mileage-panel";
import { MaintenancePanel } from "@/components/fleet/maintenance-panel";
import { IncidentsPanel } from "@/components/fleet/incidents-panel";
import { DriversPanel } from "@/components/fleet/drivers-panel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "mileage", label: "Mileage" },
  { key: "maintenance", label: "Maintenance" },
  { key: "incidents", label: "Incidents" },
  { key: "users", label: "Users" },
] as const;

type Tab = (typeof TABS)[number]["key"];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Vehicle" };
  const { supabase } = await getSession();
  const { data } = await supabase.from("fleet_vehicles").select("registration").eq("id", id).maybeSingle();
  return { title: data ? formatPlate(data.registration) : "Vehicle" };
}

export default async function VehiclePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "overview";
  const fleetDept = getDepartment("fleet")!;

  const { supabase, canAccess, isManager } = await getSession();
  if (!canAccess("fleet")) {
    return (
      <section className="notice glass">
        <h1>Fleet isn't on your account</h1>
        <p>Ask an admin to add you to MKA Fleet if you need it.</p>
      </section>
    );
  }
  if (!UUID.test(id)) notFound();
  const canManage = isManager("fleet");

  const { data: vehicleRow } = await supabase
    .from("fleet_vehicles")
    .select("*, key_holder:fleet_drivers!fleet_vehicles_key_holder_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!vehicleRow) notFound();
  const vehicle = vehicleRow as unknown as Vehicle;

  const [filesRes, logsRes, tasksRes, incidentsRes, linksRes, poolRes, keyRes] = await Promise.all([
    supabase
      .from("fleet_files")
      .select("*, creator:profiles!fleet_files_created_by_fkey(full_name)")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("fleet_mileage_logs")
      .select("*, creator:profiles!fleet_mileage_logs_created_by_fkey(full_name)")
      .eq("vehicle_id", id)
      .order("recorded_on", { ascending: false }),
    supabase.from("fleet_maintenance").select("*").eq("vehicle_id", id).order("due_date", { ascending: true }),
    supabase
      .from("fleet_incidents")
      .select("*, creator:profiles!fleet_incidents_created_by_fkey(full_name)")
      .eq("vehicle_id", id)
      .order("occurred_at", { ascending: false }),
    supabase.from("fleet_vehicle_drivers").select("driver:fleet_drivers(*)").eq("vehicle_id", id),
    canManage ? supabase.from("fleet_drivers").select("*").order("full_name") : Promise.resolve({ data: [] }),
    supabase
      .from("fleet_key_log")
      .select("id, holder_name, changed_at, changer:profiles!fleet_key_log_changed_by_fkey(full_name)")
      .eq("vehicle_id", id)
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  const loadError = [filesRes, logsRes, tasksRes, incidentsRes, linksRes, keyRes].find((r) => "error" in r && r.error);
  const files = await signFiles(supabase, (filesRes.data ?? []) as unknown as FleetFile[]);
  const logs = (logsRes.data ?? []) as unknown as MileageLog[];
  const tasks = (tasksRes.data ?? []) as unknown as Task[];
  const incidents = (incidentsRes.data ?? []) as unknown as Incident[];
  const drivers = ((linksRes.data ?? []) as unknown as { driver: Driver | null }[])
    .map((l) => l.driver)
    .filter((d): d is Driver => Boolean(d))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const pool = (poolRes.data ?? []) as unknown as Driver[];
  const keyLog = (keyRes.data ?? []) as unknown as KeyLog[];

  // Badges on the tabs
  const docs = latestDocs(files);
  const docIssues = DOC_KINDS.filter(({ kind }) => docState(docs.get(kind)) !== "Valid" && docState(docs.get(kind)) !== "On file").length;
  const overdue = tasks.filter((t) => taskStatus(t) === "Overdue").length;
  const openIncidents = incidents.filter((i) => i.status !== "Resolved").length;
  const badges: Partial<Record<Tab, { n: number; alert?: boolean }>> = {
    documents: docIssues ? { n: docIssues, alert: true } : undefined,
    maintenance: overdue ? { n: overdue, alert: true } : undefined,
    incidents: openIncidents ? { n: openIncidents, alert: true } : undefined,
    users: drivers.length ? { n: drivers.length } : undefined,
  };

  const yearMiles = milesThisYear(logs);

  return (
    <div style={vars({ "--accent": fleetDept.accent }, { display: "contents" })}>
      <Link href="/fleet" className="back-link rise">
        <ArrowLeft size={16} /> All vehicles
      </Link>

      <header className="vehicle-hero glass rise" style={vars({ "--i": "1" })}>
        <div className="vehicle-hero-main">
          <Plate reg={vehicle.registration} size="lg" />
          <div>
            <h1>{vehicle.make_model ?? "Unnamed vehicle"}</h1>
            <p>
              {[vehicle.vehicle_type, vehicle.year ? `${vehicle.year} · ${vehicleAge(vehicle.year)} old` : "Age unknown"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="vehicle-hero-side">
          <Pill value={vehicle.status} />
          <div className="hero-odo">
            <Odometer value={vehicle.mileage} />
            <small>{miles(yearMiles)} miles this year</small>
          </div>
          <span className="keys-inline">
            <KeyRound size={15} /> {vehicle.key_holder?.full_name ?? "Keys in the office"}
          </span>
          {canManage && <VehicleButton vehicle={vehicle} />}
        </div>
      </header>

      <nav className="tabs rise" aria-label="Vehicle sections" style={vars({ "--i": "2" })}>
        {TABS.map((t) => {
          const b = badges[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === "overview" ? `/fleet/${id}` : `/fleet/${id}?tab=${t.key}`}
              className="tab"
              aria-current={tab === t.key ? "page" : undefined}
              scroll={false}
            >
              {t.label}
              {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.n}</span>}
            </Link>
          );
        })}
      </nav>

      {loadError && "error" in loadError && loadError.error && (
        <p className="form-error" role="alert">
          Some fleet data didn't load: {loadError.error.message}. Has the 0003_fleet.sql migration been run in Supabase?
        </p>
      )}

      <div className="tab-body rise" style={vars({ "--i": "3" })} key={tab}>
        {tab === "overview" && (
          <Overview
            vehicle={vehicle}
            docs={docs}
            tasks={tasks}
            incidents={incidents}
            logs={logs}
            yearMiles={yearMiles}
            id={id}
          />
        )}
        {tab === "documents" && (
          <DocumentsPanel vehicleId={id} files={files.filter((f) => f.kind === "insurance" || f.kind === "mot" || f.kind === "road_tax")} canManage={canManage} />
        )}
        {tab === "mileage" && <MileagePanel vehicleId={id} current={vehicle.mileage} logs={logs} canManage={canManage} />}
        {tab === "maintenance" && (
          <MaintenancePanel vehicleId={id} tasks={tasks} receipts={files.filter((f) => f.kind === "receipt")} canManage={canManage} />
        )}
        {tab === "incidents" && (
          <IncidentsPanel
            vehicleId={id}
            registration={formatPlate(vehicle.registration)}
            incidents={incidents}
            photos={files.filter((f) => f.kind === "incident")}
            driverNames={drivers.map((d) => d.full_name)}
            canManage={canManage}
          />
        )}
        {tab === "users" && (
          <DriversPanel
            vehicleId={id}
            registration={formatPlate(vehicle.registration)}
            drivers={drivers}
            pool={pool}
            keyHolderId={vehicle.key_holder_id}
            keyLog={keyLog}
            canManage={canManage}
          />
        )}
      </div>
    </div>
  );
}

function Overview({
  vehicle,
  docs,
  tasks,
  incidents,
  logs,
  yearMiles,
  id,
}: {
  vehicle: Vehicle;
  docs: Map<string, FleetFile>;
  tasks: Task[];
  incidents: Incident[];
  logs: MileageLog[];
  yearMiles: number;
  id: string;
}) {
  const open = tasks
    .filter((t) => t.status !== "Completed")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const next = open[0];
  const lastIncident = incidents[0];
  const lastReading = logs[0];
  const year = Number(todayISO().slice(0, 4));
  const spent = tasks
    .filter((t) => t.status === "Completed" && (t.completed_on ?? t.due_date ?? "").startsWith(String(year)))
    .reduce((n, t) => n + num(t.cost), 0);

  return (
    <div className="split">
      <section className="panel glass">
        <div className="panel-head">
          <h2>Vehicle details</h2>
        </div>
        <dl className="kv">
          <dt>Name</dt>
          <dd>{vehicle.make_model ?? "—"}</dd>
          <dt>Registration</dt>
          <dd>{formatPlate(vehicle.registration)}</dd>
          <dt>Type</dt>
          <dd>{vehicle.vehicle_type ?? "—"}</dd>
          <dt>First registered</dt>
          <dd>{vehicle.year ?? "Not set"}</dd>
          <dt>Age</dt>
          <dd>{vehicleAge(vehicle.year)}</dd>
          <dt>Status</dt>
          <dd>
            <Pill value={vehicle.status} />
          </dd>
          <dt>Mileage</dt>
          <dd className="tnum">
            {miles(vehicle.mileage)} mi
            {lastReading && <small> · last logged {formatDate(lastReading.recorded_on)}</small>}
          </dd>
          <dt>Miles this year</dt>
          <dd className="tnum">{miles(yearMiles)} mi</dd>
          <dt>Maintenance spend {year}</dt>
          <dd className="tnum">{money(spent)}</dd>
          <dt>Keys</dt>
          <dd>{vehicle.key_holder?.full_name ?? "In the office"}</dd>
          {vehicle.notes && (
            <>
              <dt>Notes</dt>
              <dd className="pre">{vehicle.notes}</dd>
            </>
          )}
        </dl>
      </section>

      <div className="stack">
        <section className="panel glass">
          <div className="panel-head">
            <h2>Documents</h2>
            <Link href={`/fleet/${id}?tab=documents`} className="btn btn-ghost btn-sm" scroll={false}>
              Open
            </Link>
          </div>
          <ul className="glance">
            {DOC_KINDS.map(({ kind, label }) => {
              const f = docs.get(kind);
              return (
                <li key={kind}>
                  <span>{label}</span>
                  <span className="glance-right">
                    {f?.expires_on && <small>{formatDate(f.expires_on)}</small>}
                    <Pill value={docState(f)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel glass">
          <div className="panel-head">
            <h2>Next maintenance</h2>
            <Link href={`/fleet/${id}?tab=maintenance`} className="btn btn-ghost btn-sm" scroll={false}>
              Open
            </Link>
          </div>
          {next ? (
            <div className="glance-item">
              <strong>{next.description}</strong>
              <span>
                {next.due_date ? `Due ${formatDate(next.due_date)}` : "No date set"}
                {next.cost !== null && ` · ${money(num(next.cost))}`}
              </span>
              <Pill value={taskStatus(next)} />
              {open.length > 1 && <small>and {open.length - 1} more to do</small>}
            </div>
          ) : (
            <p className="muted-note">Nothing scheduled.</p>
          )}
        </section>

        <section className="panel glass">
          <div className="panel-head">
            <h2>Latest incident</h2>
            <Link href={`/fleet/${id}?tab=incidents`} className="btn btn-ghost btn-sm" scroll={false}>
              Open
            </Link>
          </div>
          {lastIncident ? (
            <div className="glance-item">
              <strong>
                {lastIncident.incident_type} · {lastIncident.severity}
              </strong>
              <span>{formatDateTime(lastIncident.occurred_at)}</span>
              <Pill value={lastIncident.status} />
            </div>
          ) : (
            <p className="muted-note">None reported.</p>
          )}
        </section>
      </div>
    </div>
  );
}
