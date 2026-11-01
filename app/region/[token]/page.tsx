import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BedDouble,
  Bus,
  CalendarDays,
  Clock4,
  Info,
  MapPin,
  Phone,
  PlaneLanding,
  PlaneTakeoff,
  UserRound,
  Users,
  Utensils,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MEALS, dayRange, daysLabel, fmtDay, hhmm, spanDays, stayDays, telHref, type Driver, type MealKey } from "@/lib/delegations";
import { SiteFooter, Watermark } from "@/components/brand";
import { DriversForm } from "./drivers-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Region Guidance",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type RegionView = {
  delegation: {
    name: string;
    country: string | null;
    members: number | null;
    venue: string | null;
    status: string;
    head_of_delegation: string | null;
    head_contact: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  };
  aek: {
    arrival_date: string | null;
    arrival_time: string | null;
    arrival_travel: string | null;
    arrival_place: string | null;
    departure_date: string | null;
    departure_time: string | null;
    departure_travel: string | null;
    departure_place: string | null;
    head_name: string | null;
    head_contact: string | null;
    members: number | null;
    notes: string | null;
    submitted_at: string;
  } | null;
  stays: { venue: string; start_date: string; end_date: string; rooms: string | null; notes: string | null }[];
  transport: {
    transport_type: string;
    vehicle: string | null;
    start_date: string;
    end_date: string;
    pickup_time: string | null;
    pickup: string | null;
    dropoff: string | null;
    driver: string | null;
    notes: string | null;
  }[];
  meals: { day: string; meal: MealKey; location: string | null; menu: string | null }[];
  drivers: Driver[];
  drivers_saved_at: string | null;
};

type Props = { params: Promise<{ token: string }> };

const longDay = (d: string) => fmtDay(d, { weekday: "long", day: "numeric", month: "long" });
const shortDay = (d: string) => fmtDay(d, { weekday: "short", day: "numeric", month: "short" });
const ukTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(
    new Date(iso),
  );

export default async function RegionPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = token.length >= 32 ? await supabase.rpc("region_view", { tok: token }) : { data: null };
  const view = (data ?? null) as RegionView | null;

  return (
    <main className="visit region">
      <header className="visit-brand">
        <span className="seal" aria-hidden>
          <span className="seal-art" />
        </span>
        <span className="brand-org">
          <b>Majlis</b>
          <b>Khuddamul Ahmadiyya</b>
          <small>United Kingdom</small>
        </span>
      </header>

      {!view ? (
        <section className="visit-card glass glass-strong">
          <h1>This link isn&apos;t working</h1>
          <p className="visit-lead">
            It may have expired after the visit, or been replaced with a new one. Please ask the MKA Delegations team for a
            new Region Guidance link.
          </p>
        </section>
      ) : (
        <RegionBrief token={token} view={view} />
      )}

      <SiteFooter className="visit-foot" />
      <Watermark />
    </main>
  );
}

function RegionBrief({ token, view }: { token: string; view: RegionView }) {
  const d = view.delegation;
  const a = view.aek;
  const people = a?.members ?? d.members;
  const head = a?.head_name ?? d.head_of_delegation;
  const headPhone = a?.head_contact ?? d.head_contact;
  const arrival = a?.arrival_date ?? d.arrival_date;
  const departure = a?.departure_date ?? d.departure_date;
  const days = d.arrival_date && d.departure_date ? stayDays({ arrival_date: d.arrival_date, departure_date: d.departure_date }) : [];

  const pickup = view.drivers.filter((x) => x.leg === "pickup");
  const dropoff = view.drivers.filter((x) => x.leg === "dropoff");
  const venues = [...new Set(view.stays.map((s) => s.venue))];
  const mealDays = new Set(view.meals.map((m) => m.day)).size;

  return (
    <>
      <section className="visit-card visit-intro glass glass-strong">
        <span className="eyebrow">Region Guidance</span>
        <h1>{d.name}</h1>
        <p className="region-meta">
          {d.country && (
            <span>
              <MapPin size={15} /> {d.country}
            </span>
          )}
          {people != null && (
            <span>
              <Users size={15} /> {people} {people === 1 ? "person" : "people"}
            </span>
          )}
          {d.arrival_date && d.departure_date && (
            <span>
              <CalendarDays size={15} /> {dayRange(d.arrival_date, d.departure_date)} · {daysLabel(days.length)}
            </span>
          )}
        </p>
        <p className="visit-lead">
          Everything your team needs for this delegation, on one page. Please add the drivers at the bottom. You don&apos;t
          need everything at once: come back and add to it over the next few days.
        </p>
      </section>

      {/* What the team needs to do */}
      <section className="visit-card glass glass-strong">
        <h2>Your team&apos;s tasks</h2>
        <ol className="task-list">
          <Task
            icon={<PlaneLanding size={18} />}
            title="Airport pickup"
            done={pickup.length > 0}
            doneText={`${pickup.length} driver${pickup.length === 1 ? "" : "s"} added`}
            todoText="Add drivers below"
          >
            {arrival ? longDay(arrival) : "Date to be confirmed"}
            {a?.arrival_time ? `, ${hhmm(a.arrival_time)}` : ", time to be confirmed"}
            {a?.arrival_place && ` at ${a.arrival_place}`}
            {a?.arrival_travel && ` (${a.arrival_travel})`}
            {people != null && ` · ${people} people`}
          </Task>
          <Task icon={<BedDouble size={18} />} title="Accommodation" done={venues.length > 0} doneText="Planned" todoText="Not planned yet">
            {venues.length ? venues.join(", ") : "The Delegations team will add this."}
          </Task>
          <Task icon={<Utensils size={18} />} title="Food" done={view.meals.length > 0} doneText={`${view.meals.length} meals`} todoText="Not planned yet">
            {view.meals.length
              ? `${view.meals.length} meal${view.meals.length === 1 ? "" : "s"} arranged across ${mealDays} day${mealDays === 1 ? "" : "s"}. Details below.`
              : "The Delegations team will add this."}
          </Task>
          <Task
            icon={<PlaneTakeoff size={18} />}
            title="Airport drop-off"
            done={dropoff.length > 0}
            doneText={`${dropoff.length} driver${dropoff.length === 1 ? "" : "s"} added`}
            todoText="Optional"
            optional
          >
            {departure ? longDay(departure) : "Date to be confirmed"}
            {a?.departure_time ? `, ${hhmm(a.departure_time)}` : ", time to be confirmed"}
            {a?.departure_place && ` from ${a.departure_place}`}
            {a?.departure_travel && ` (${a.departure_travel})`}
          </Task>
        </ol>
      </section>

      {/* Travel and contacts */}
      <div className="region-grid">
        <TravelCard
          icon={<PlaneLanding size={18} />}
          title="Arrival"
          date={arrival}
          time={a?.arrival_time ?? null}
          travel={a?.arrival_travel ?? null}
          place={a?.arrival_place ?? null}
          placeLabel="Arriving at"
        />
        <TravelCard
          icon={<PlaneTakeoff size={18} />}
          title="Departure"
          date={departure}
          time={a?.departure_time ?? null}
          travel={a?.departure_travel ?? null}
          place={a?.departure_place ?? null}
          placeLabel="Leaving from"
        />
      </div>

      <section className="visit-card glass glass-strong">
        <h2>
          <UserRound size={18} /> Contact
        </h2>
        <div className="region-contact">
          <div>
            <small>Amir-e-Kafla (head of delegation)</small>
            <strong>{head ?? "To be confirmed"}</strong>
          </div>
          {headPhone ? (
            <a className="btn" href={telHref(headPhone)}>
              <Phone size={16} /> {headPhone}
            </a>
          ) : (
            <span className="muted-note">Phone number to be confirmed</span>
          )}
        </div>
        {a?.notes && (
          <div className="region-note">
            <Info size={16} />
            <p>
              <strong>From the delegation:</strong> {a.notes}
            </p>
          </div>
        )}
        {a?.submitted_at && <p className="muted-note region-updated">Travel details last updated by the delegation on {ukTime(a.submitted_at)} (UK time).</p>}
      </section>

      {/* Accommodation */}
      <section className="visit-card glass glass-strong">
        <h2>
          <BedDouble size={18} /> Accommodation
        </h2>
        {view.stays.length === 0 ? (
          <p className="muted-note">Not planned yet. It will appear here once the Delegations team adds it.</p>
        ) : (
          <ul className="region-list">
            {view.stays.map((s, i) => {
              const nights = Math.max(spanDays(s.start_date, s.end_date) - 1, 0);
              return (
                <li key={i}>
                  <div className="region-list-main">
                    <strong>{s.venue}</strong>
                    <span>
                      {dayRange(s.start_date, s.end_date)}
                      {nights > 0 && ` · ${nights} night${nights === 1 ? "" : "s"}`}
                      {s.rooms && ` · ${s.rooms}`}
                    </span>
                    {s.notes && <small>{s.notes}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Food */}
      <section className="visit-card glass glass-strong">
        <h2>
          <Utensils size={18} /> Food plan
        </h2>
        {view.meals.length === 0 ? (
          <p className="muted-note">Not planned yet. It will appear here once the Delegations team adds it.</p>
        ) : (
          <div className="food-days">
            {[...new Set(view.meals.map((m) => m.day))].sort().map((day) => (
              <div key={day} className="food-day">
                <h3>{shortDay(day)}</h3>
                <ul>
                  {MEALS.map((meal) => {
                    const m = view.meals.find((x) => x.day === day && x.meal === meal.key);
                    return (
                      <li key={meal.key} className={m ? "" : "is-none"}>
                        <span className="food-meal">{meal.label}</span>
                        {m ? (
                          <span className="food-detail">
                            {m.location ?? "Location to be confirmed"}
                            {m.menu && <small>{m.menu}</small>}
                          </span>
                        ) : (
                          <span className="food-detail">Not arranged by us</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transport the team has already arranged */}
      {view.transport.length > 0 && (
        <section className="visit-card glass glass-strong">
          <h2>
            <Bus size={18} /> Transport already arranged
          </h2>
          <ul className="region-list">
            {view.transport.map((t, i) => (
              <li key={i}>
                <div className="region-list-main">
                  <strong>
                    {t.transport_type}
                    {t.vehicle && ` · ${t.vehicle}`}
                  </strong>
                  <span>
                    {t.start_date === t.end_date ? shortDay(t.start_date) : dayRange(t.start_date, t.end_date)}
                    {t.pickup_time && ` · ${hhmm(t.pickup_time)}`}
                    {(t.pickup || t.dropoff) && ` · ${[t.pickup, t.dropoff].filter(Boolean).join(" → ")}`}
                  </span>
                  {(t.driver || t.notes) && <small>{[t.driver && `Driver: ${t.driver}`, t.notes].filter(Boolean).join(" · ")}</small>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DriversForm token={token} pickup={pickup} dropoff={dropoff} savedAt={view.drivers_saved_at} />

      <p className="visit-privacy">
        <AlertTriangle size={15} /> This private link is for the local team arranging this visit. Please don&apos;t share it
        more widely.
      </p>
    </>
  );
}

function Task({
  icon,
  title,
  done,
  doneText,
  todoText,
  optional,
  children,
}: {
  icon: ReactNode;
  title: string;
  done: boolean;
  doneText: string;
  todoText: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`task ${done ? "is-done" : optional ? "is-optional" : "is-todo"}`}>
      <span className="task-icon">{icon}</span>
      <div className="task-text">
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
      <span className="task-state">{done ? doneText : todoText}</span>
    </li>
  );
}

function TravelCard({
  icon,
  title,
  date,
  time,
  travel,
  place,
  placeLabel,
}: {
  icon: ReactNode;
  title: string;
  date: string | null;
  time: string | null;
  travel: string | null;
  place: string | null;
  placeLabel: string;
}) {
  return (
    <section className="visit-card glass glass-strong travel-card">
      <h2>
        {icon} {title}
      </h2>
      <dl className="travel-kv">
        <dt>
          <CalendarDays size={14} /> Date
        </dt>
        <dd>{date ? longDay(date) : <TBC />}</dd>
        <dt>
          <Clock4 size={14} /> Time (UK)
        </dt>
        <dd className="tnum">{time ? hhmm(time) : <TBC />}</dd>
        <dt>
          <PlaneLanding size={14} /> Flight / train
        </dt>
        <dd>{travel ?? <TBC />}</dd>
        <dt>
          <MapPin size={14} /> {placeLabel}
        </dt>
        <dd>{place ?? <TBC />}</dd>
      </dl>
    </section>
  );
}

function TBC() {
  return <span className="tbc">To be confirmed</span>;
}
