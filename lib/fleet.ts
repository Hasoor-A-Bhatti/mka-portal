/** Shared types, labels and calculations for the Fleet department. */

export const VEHICLE_STATUSES = ["Active", "Damaged", "Off road", "Sold"] as const;
export const VEHICLE_TYPES = ["Car", "Light commercial", "MPV", "Minibus", "Van", "Other"] as const;
export const TASK_STATUSES = ["Pending", "Completed", "Overdue"] as const;
export const INCIDENT_TYPES = ["Accident", "Damage", "Breakdown", "Theft or break-in", "Fine or PCN", "Other"] as const;
export const SEVERITIES = ["Minor", "Moderate", "Major"] as const;
export const INCIDENT_STATUSES = ["Open", "Under review", "Resolved"] as const;

export const DOC_KINDS = [
  { kind: "insurance", label: "Insurance" },
  { kind: "mot", label: "MOT" },
  { kind: "road_tax", label: "Road tax" },
] as const;

export type DocKind = (typeof DOC_KINDS)[number]["kind"];
export type FileKind = DocKind | "receipt" | "incident";

export const ACCEPTED_FILES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const GREEN = "#15805a";
const BLUE = "#3f51c9";
const AMBER = "#9a6600";
const RED = "#c43a3a";
const GREY = "#6b6383";

export const TONE: Record<string, string> = {
  Active: GREEN,
  Damaged: RED,
  "Off road": AMBER,
  Sold: GREY,
  Pending: BLUE,
  Completed: GREEN,
  Overdue: RED,
  Open: RED,
  "Under review": AMBER,
  Resolved: GREEN,
  Minor: GREY,
  Moderate: AMBER,
  Major: RED,
  Valid: GREEN,
  "On file": GREEN,
  "Expiring soon": AMBER,
  Expired: RED,
  Missing: GREY,
};

export const tone = (s: string) => TONE[s] ?? GREY;

// ---------- Row types ----------

export type Vehicle = {
  id: string;
  registration: string;
  make_model: string | null;
  vehicle_type: string | null;
  year: number | null;
  status: string;
  mileage: number;
  key_holder_id: string | null;
  notes: string | null;
  key_holder?: { full_name: string } | null;
};

export type FleetFile = {
  id: string;
  vehicle_id: string;
  kind: FileKind;
  maintenance_id: string | null;
  incident_id: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  expires_on: string | null;
  created_at: string;
  creator?: { full_name: string | null } | null;
  /** Signed links, added on the server before rendering. */
  viewUrl?: string;
  downloadUrl?: string;
};

export type MileageLog = {
  id: string;
  vehicle_id: string;
  reading: number;
  recorded_on: string;
  note: string | null;
  created_at: string;
  creator?: { full_name: string | null } | null;
};

export type Task = {
  id: string;
  vehicle_id: string;
  description: string;
  due_date: string | null;
  status: string;
  cost: number | string | null;
  completed_on: string | null;
  notes: string | null;
};

export type Incident = {
  id: string;
  vehicle_id: string;
  occurred_at: string;
  incident_type: string;
  severity: string;
  location: string | null;
  driver_name: string | null;
  description: string;
  not_drivable: boolean;
  third_party: boolean;
  third_party_details: string | null;
  police_reference: string | null;
  claim_reference: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  creator?: { full_name: string | null } | null;
};

export type Driver = {
  id: string;
  full_name: string;
  phone: string | null;
  licence_expiry: string | null;
  notes: string | null;
};

export type KeyLog = {
  id: number;
  holder_name: string;
  changed_at: string;
  changer?: { full_name: string | null } | null;
};

// ---------- Dates ----------

/** Today's date in London as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

/** A date and time typed in UK time ("2026-10-28", "14:30") as an ISO timestamp. */
export function londonToISO(day: string, time: string): string {
  const asUtc = new Date(`${day}T${time}:00Z`);
  const shown = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(asUtc);
  const offset = Date.parse(`${shown.replace(" ", "T")}:00Z`) - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}

/** An ISO timestamp as UK date and time parts, for form inputs. */
export function londonParts(iso: string): { day: string; time: string } {
  const shown = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
  const [day, time] = shown.split(" ");
  return { day: day!, time: time! };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(iso: string, today = todayISO()): number {
  return Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

// ---------- Vehicles ----------

/** "YE64ZXS" → "YE64 ZXS". Leaves other formats as written. */
export function formatPlate(reg: string): string {
  const r = reg.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(r)) return `${r.slice(0, 4)} ${r.slice(4)}`;
  return reg.toUpperCase().trim();
}

export function vehicleAge(year: number | null): string {
  if (!year) return "Unknown";
  const age = Number(todayISO().slice(0, 4)) - year;
  if (age <= 0) return "Under 1 year";
  return `${age} year${age === 1 ? "" : "s"}`;
}

/** Six-digit odometer style: 4521 → "004521". */
export function odometer(miles: number): string {
  return String(Math.max(0, Math.trunc(miles))).padStart(6, "0");
}

export const miles = (n: number) => new Intl.NumberFormat("en-GB").format(n);

export const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

// ---------- Mileage ----------

/**
 * Miles driven this calendar year: latest reading minus the last reading
 * before 1 January (or the first reading this year, if there isn't one).
 */
export function milesThisYear(logs: Pick<MileageLog, "reading" | "recorded_on" | "created_at">[]): number {
  if (logs.length < 2) return 0;
  const year = todayISO().slice(0, 4);
  const sorted = [...logs].sort(
    (a, b) => a.recorded_on.localeCompare(b.recorded_on) || a.created_at.localeCompare(b.created_at),
  );
  const latest = sorted[sorted.length - 1]!;
  if (!latest.recorded_on.startsWith(year)) return 0;
  const before = sorted.filter((l) => l.recorded_on < `${year}-01-01`);
  const baseline = before.length ? before[before.length - 1]! : sorted.find((l) => l.recorded_on.startsWith(year))!;
  return Math.max(0, latest.reading - baseline.reading);
}

// ---------- Documents ----------

export type DocState = "Valid" | "On file" | "Expiring soon" | "Expired" | "Missing";

/** The status of a vehicle's latest document of one kind. Expiring = within 30 days. */
export function docState(file: Pick<FleetFile, "expires_on"> | undefined, today = todayISO()): DocState {
  if (!file) return "Missing";
  if (!file.expires_on) return "On file";
  const d = daysUntil(file.expires_on, today);
  if (d < 0) return "Expired";
  if (d <= 30) return "Expiring soon";
  return "Valid";
}

/** Latest file of each document kind, newest first in the input or not. */
export function latestDocs<T extends Pick<FleetFile, "kind" | "created_at">>(files: T[]) {
  const out = new Map<DocKind, T>();
  for (const f of files) {
    if (f.kind !== "insurance" && f.kind !== "mot" && f.kind !== "road_tax") continue;
    const cur = out.get(f.kind);
    if (!cur || f.created_at > cur.created_at) out.set(f.kind, f);
  }
  return out;
}

// ---------- Maintenance ----------

/** Pending tasks past their date count as overdue without anyone changing them. */
export function taskStatus(t: Pick<Task, "status" | "due_date">, today = todayISO()): string {
  if (t.status === "Pending" && t.due_date && t.due_date < today) return "Overdue";
  return t.status;
}

export const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
