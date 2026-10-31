import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Phone, UserRound, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { getDepartment, statusTone } from "@/lib/departments";
import {
  MEALS,
  dayRange,
  daysLabel,
  fromCalendar,
  shortDay,
  stayDays,
  hhmm,
  type Delegation,
  type DelegationFile,
  type Meal,
  type Mulaqat,
  type Stay,
  type TeamMember,
  type Transport,
} from "@/lib/delegations";
import { londonDate } from "@/lib/google-calendar";
import { vars } from "@/lib/css";
import { InfoPanel, type PlanSummary } from "@/components/delegations/info-panel";
import { StaysPanel } from "@/components/delegations/stays-panel";
import { TransportPanel } from "@/components/delegations/transport-panel";
import { MealsPanel } from "@/components/delegations/meals-panel";
import { MulaqatPanel } from "@/components/delegations/mulaqat-panel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "info", label: "Info" },
  { key: "accommodation", label: "Accommodation" },
  { key: "transport", label: "Transport" },
  { key: "food", label: "Food" },
  { key: "mulaqat", label: "Mulaqat" },
] as const;

type Tab = (typeof TABS)[number]["key"];

type Props = {
  params: Promise<{ dept: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dept, id } = await params;
  if (dept !== "delegations" || !UUID.test(id)) return { title: "Delegation" };
  const { supabase } = await getSession();
  const { data } = await supabase.from("delegations").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Delegation" };
}

export default async function DelegationPage({ params, searchParams }: Props) {
  const { dept: slug, id } = await params;
  // Only delegations have detail pages so far.
  if (slug !== "delegations" || !UUID.test(id)) notFound();
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === rawTab) ? (rawTab as Tab) : "info";
  const dept = getDepartment("delegations")!;
  const Icon = dept.icon;

  const { supabase, canAccess, isManager } = await getSession();
  if (!canAccess("delegations")) {
    return (
      <section className="notice glass">
        <h1>Delegations isn't on your account</h1>
        <p>Ask an admin to add you to MKA Delegations if you need it.</p>
      </section>
    );
  }
  const canManage = isManager("delegations");

  const { data: row } = await supabase.from("delegations").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const d = row as unknown as Delegation;

  const [filesRes, staysRes, transportRes, mealsRes, mulaqatRes, teamRes] = await Promise.all([
    supabase
      .from("delegation_files")
      .select("*, creator:profiles!delegation_files_created_by_fkey(full_name)")
      .eq("delegation_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("delegation_stays").select("*").eq("delegation_id", id).order("start_date"),
    supabase.from("delegation_transport").select("*").eq("delegation_id", id).order("start_date"),
    supabase.from("delegation_meals").select("*").eq("delegation_id", id),
    supabase.from("delegation_mulaqats").select("*").eq("delegation_id", id).order("mulaqat_date"),
    supabase.rpc("delegations_team"),
  ]);

  const loadError = [filesRes, staysRes, transportRes, mealsRes, mulaqatRes].find((r) => r.error)?.error;
  const files = await signFiles(supabase, (filesRes.data ?? []) as unknown as DelegationFile[]);
  const stays = (staysRes.data ?? []) as unknown as Stay[];
  const transport = (transportRes.data ?? []) as unknown as Transport[];
  const meals = (mealsRes.data ?? []) as unknown as Meal[];
  const mulaqats = (mulaqatRes.data ?? []) as unknown as Mulaqat[];
  const team = (teamRes.data ?? []) as unknown as TeamMember[];

  const today = londonDate(new Date());
  const days = stayDays(d);
  const inStay = (day: string) => days.length > 0 && day >= days[0] && day <= days[days.length - 1];

  // Progress for the tab badges and the Info summary.
  const coveredDays = days.filter((day) => stays.some((s) => day >= s.start_date && day <= s.end_date)).length;
  const mealsDone = meals.filter((m) => m.catered && inStay(m.day)).length;
  const next = mulaqats.find((m) => m.mulaqat_date >= today);
  const summary: PlanSummary = {
    totalDays: days.length,
    stayDays: coveredDays,
    transport: transport.length,
    meals: mealsDone,
    mealsTotal: days.length * MEALS.length,
    mulaqats: mulaqats.length,
    nextMulaqat: next ? `${shortDay(next.mulaqat_date)}${next.mulaqat_time ? `, ${hhmm(next.mulaqat_time)}` : ""}` : null,
  };

  const badges: Partial<Record<Tab, { text: string; alert?: boolean }>> = days.length
    ? {
        accommodation: coveredDays < days.length ? { text: String(days.length - coveredDays), alert: true } : undefined,
        transport: transport.length ? { text: String(transport.length) } : undefined,
        food: { text: `${mealsDone}/${summary.mealsTotal}` },
        mulaqat: mulaqats.length ? { text: String(mulaqats.length) } : undefined,
      }
    : {};

  const dayNumber = days.indexOf(today) + 1;

  return (
    <div style={vars({ "--accent": dept.accent }, { display: "contents" })}>
      <Link href="/delegations" className="back-link rise">
        <ArrowLeft size={16} /> All delegations
      </Link>

      <header className="dl-hero glass rise" style={vars({ "--i": "1" })}>
        <div className="dl-hero-main">
          <span className="dept-icon">
            <Icon size={28} />
          </span>
          <div>
            <span className="eyebrow">{d.country ?? "Delegation"}</span>
            <h1>{d.name}</h1>
            <p className="dl-hero-meta">
              {d.members !== null && (
                <span>
                  <Users size={15} /> {d.members} member{d.members === 1 ? "" : "s"}
                </span>
              )}
              {d.venue && (
                <span>
                  <MapPin size={15} /> {d.venue}
                </span>
              )}
              {d.head_of_delegation && (
                <span>
                  <UserRound size={15} /> {d.head_of_delegation}
                </span>
              )}
              {d.head_contact && (
                <a href={`tel:${d.head_contact.replace(/[^+\d]/g, "")}`}>
                  <Phone size={15} /> {d.head_contact}
                </a>
              )}
            </p>
          </div>
        </div>
        <div className="dl-hero-side">
          <span className="status" style={vars({ "--tone": statusTone(d.status) })}>
            {d.status}
          </span>
          {d.arrival_date && d.departure_date ? (
            <div className="dl-dates">
              <strong>{dayRange(d.arrival_date, d.departure_date)}</strong>
              <small>
                {daysLabel(days.length)}
                {dayNumber > 0 && ` · day ${dayNumber} today`}
              </small>
            </div>
          ) : (
            <div className="dl-dates">
              <strong>Dates not set</strong>
            </div>
          )}
          {fromCalendar(d) && (
            <span className="dl-sync" title="Name and dates follow the Google Calendar">
              <CalendarDays size={14} /> Google Calendar
            </span>
          )}
        </div>
      </header>

      <nav className="tabs rise" aria-label="Delegation sections" style={vars({ "--i": "2" })}>
        {TABS.map((t) => {
          const b = badges[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === "info" ? `/delegations/${id}` : `/delegations/${id}?tab=${t.key}`}
              className="tab"
              aria-current={tab === t.key ? "page" : undefined}
              scroll={false}
            >
              {t.label}
              {b && <span className={`tab-badge ${b.alert ? "alert" : ""}`}>{b.text}</span>}
            </Link>
          );
        })}
      </nav>

      {loadError && (
        <p className="form-error" role="alert">
          Some planning data didn't load: {loadError.message}. Has supabase/migrations/0005_delegation_planning.sql been run in
          Supabase?
        </p>
      )}

      <div className="tab-body rise" style={vars({ "--i": "3" })} key={tab}>
        {tab === "info" && <InfoPanel delegation={d} files={files} summary={summary} canManage={canManage} />}

        {tab !== "info" && days.length === 0 && (
          <section className="notice glass">
            <h1>Set the dates first</h1>
            <p>Add an arrival and departure date on the Info tab, and the planner will cover each day of the stay.</p>
            <Link href={`/delegations/${id}`} className="btn">
              Go to Info
            </Link>
          </section>
        )}

        {days.length > 0 && tab === "accommodation" && (
          <StaysPanel
            delegationId={id}
            days={days}
            today={today}
            stays={stays}
            suggestions={(d.venue ?? "").split(/\s*[·/]\s*/)}
            canManage={canManage}
          />
        )}
        {days.length > 0 && tab === "transport" && (
          <TransportPanel delegationId={id} days={days} today={today} bookings={transport} canManage={canManage} />
        )}
        {days.length > 0 && tab === "food" && <MealsPanel delegationId={id} days={days} today={today} meals={meals} />}
        {days.length > 0 && tab === "mulaqat" && (
          <MulaqatPanel delegationId={id} days={days} today={today} mulaqats={mulaqats} team={team} canManage={canManage} />
        )}
      </div>
    </div>
  );
}

type Client = Awaited<ReturnType<typeof getSession>>["supabase"];

/** Adds short-lived view and download links to files in the private "delegations" bucket. */
async function signFiles(supabase: Client, files: DelegationFile[]): Promise<DelegationFile[]> {
  if (!files.length) return files;
  const paths = files.map((f) => f.file_path);
  const bucket = supabase.storage.from("delegations");
  const [view, download] = await Promise.all([
    bucket.createSignedUrls(paths, 3600),
    bucket.createSignedUrls(paths, 3600, { download: true }),
  ]);
  const viewBy = new Map((view.data ?? []).map((s) => [s.path, s.signedUrl]));
  const downloadBy = new Map((download.data ?? []).map((s) => [s.path, s.signedUrl]));
  return files.map((f) => ({ ...f, viewUrl: viewBy.get(f.file_path) ?? undefined, downloadUrl: downloadBy.get(f.file_path) ?? undefined }));
}
