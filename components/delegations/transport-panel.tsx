"use client";

import { useState } from "react";
import { Bus, CalendarRange, Clock, Hash, MapPin, Plane, PlaneLanding, Plus, StickyNote, UserRound } from "lucide-react";
import { TRANSPORT_TYPES, dayRange, daysLabel, hhmm, spanDays, type Transport } from "@/lib/delegations";
import { deleteTransport, saveTransport } from "@/app/(portal)/[dept]/[id]/actions";
import { vars } from "@/lib/css";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { DateSpanFields } from "./fields";
import { Planner } from "./planner";

const TONES: Record<string, string> = {
  "Airport pickup": "#1f6fb5",
  "Airport drop-off": "#2f7f7a",
  "Minibus / coach": "#4a1fa8",
  "Hire vehicle": "#a2348f",
  "Local transfer": "#b4592a",
  Other: "#6b6383",
};

function TypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  if (type === "Airport pickup") return <PlaneLanding size={size} />;
  if (type === "Airport drop-off") return <Plane size={size} />;
  return <Bus size={size} />;
}

function route(t: Transport) {
  if (t.pickup && t.dropoff) return `${t.pickup} → ${t.dropoff}`;
  return t.pickup ?? t.dropoff ?? null;
}

export function TransportPanel({
  delegationId,
  days,
  today,
  bookings,
  canManage,
}: {
  delegationId: string;
  days: string[];
  today: string;
  bookings: Transport[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ booking: Transport | null; day?: string } | null>(null);
  const sorted = [...bookings].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || (a.pickup_time ?? "").localeCompare(b.pickup_time ?? ""),
  );
  const first = days[0];
  const last = days[days.length - 1];
  const hasArrival = bookings.some((b) => b.transport_type === "Airport pickup");
  const hasDeparture = bookings.some((b) => b.transport_type === "Airport drop-off");

  return (
    <>
      <section className="stats" aria-label="Transport summary">
        <div className="stat glass is-accent">
          <strong>{bookings.length}</strong>
          <span>{bookings.length === 1 ? "booking" : "bookings"}</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: hasArrival ? "var(--ok)" : "#9a6600" }}>{hasArrival ? "Booked" : "Not yet"}</strong>
          <span>airport pickup</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: hasDeparture ? "var(--ok)" : "#9a6600" }}>{hasDeparture ? "Booked" : "Not yet"}</strong>
          <span>airport drop-off</span>
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Transport planner</h2>
            <p className="muted-note">Pickups, drop-offs and vehicles for each day. Click a bar to edit it.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ booking: null })}>
            <Plus size={18} /> Add transport
          </button>
        </div>
        <Planner
          days={days}
          today={today}
          items={bookings.map((b) => ({
            id: b.id,
            start: b.start_date,
            end: b.end_date,
            title: [hhmm(b.pickup_time), b.vehicle ?? b.transport_type].filter(Boolean).join(" · "),
            subtitle: b.vehicle ? b.transport_type : route(b),
            tone: TONES[b.transport_type] ?? TONES.Other,
            icon: <TypeIcon type={b.transport_type} />,
          }))}
          onOpen={(id) => setEditing({ booking: bookings.find((b) => b.id === id) ?? null })}
          onAdd={(day) => setEditing({ booking: null, day })}
          addLabel="Add transport"
        />
      </section>

      {sorted.length > 0 && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>Bookings</h2>
          </div>
          <ul className="plan-list">
            {sorted.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="plan-card"
                  style={vars({ "--tone": TONES[b.transport_type] ?? TONES.Other })}
                  onClick={() => setEditing({ booking: b })}
                >
                  <span className="plan-card-bar" aria-hidden />
                  <span className="plan-card-body">
                    <strong>
                      <TypeIcon type={b.transport_type} size={15} /> {b.transport_type}
                      {b.vehicle && <em> · {b.vehicle}</em>}
                    </strong>
                    <span>
                      <CalendarRange size={14} /> {dayRange(b.start_date, b.end_date)}
                      {b.start_date !== b.end_date && ` · ${daysLabel(spanDays(b.start_date, b.end_date))}`}
                      {b.pickup_time && (
                        <>
                          {" "}
                          · <Clock size={14} /> {hhmm(b.pickup_time)}
                        </>
                      )}
                    </span>
                    {route(b) && (
                      <span>
                        <MapPin size={14} /> {route(b)}
                      </span>
                    )}
                    {b.driver && (
                      <span>
                        <UserRound size={14} /> {b.driver}
                      </span>
                    )}
                    {b.booking_ref && (
                      <span>
                        <Hash size={14} /> {b.booking_ref}
                      </span>
                    )}
                    {b.notes && (
                      <span className="plan-card-notes">
                        <StickyNote size={14} /> {b.notes}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <TransportDialog
          delegationId={delegationId}
          booking={editing.booking}
          first={first}
          last={last}
          startDay={editing.day}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TransportDialog({
  delegationId,
  booking,
  first,
  last,
  startDay,
  canManage,
  onClose,
}: {
  delegationId: string;
  booking: Transport | null;
  first: string;
  last: string;
  startDay?: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [type, setType] = useState<string>(booking?.transport_type ?? (startDay === last ? "Airport drop-off" : startDay ? "Local transfer" : "Airport pickup"));
  const start = booking?.start_date ?? startDay ?? (type === "Airport drop-off" ? last : first);
  const end = booking?.end_date ?? start;

  const remove = () => {
    if (!booking || !window.confirm(`Remove this ${booking.transport_type.toLowerCase()} booking?`)) return;
    run(() => deleteTransport(delegationId, booking.id), onClose);
  };

  return (
    <Sheet title={booking ? "Edit transport" : "Add transport"} subtitle={`Within the visit: ${dayRange(first, last)}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveTransport(delegationId, booking?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="t-type">
              Type<span className="req">*</span>
            </label>
            <select id="t-type" name="transport_type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TRANSPORT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-vehicle">Vehicle</label>
            <input id="t-vehicle" name="vehicle" className="input" defaultValue={booking?.vehicle ?? ""} placeholder="e.g. 2 × 14 seater minibus" />
          </div>
          {/* For a new booking, switching to drop-off moves the default date to departure day. */}
          <DateSpanFields key={booking || startDay ? "fixed" : type} first={first} last={last} start={start} end={end} daysLabel="Number of days" />
          <div className="field">
            <label htmlFor="t-time">Pickup time</label>
            <input id="t-time" name="pickup_time" type="time" className="input" defaultValue={hhmm(booking?.pickup_time ?? null) ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="t-ref">Booking reference</label>
            <input id="t-ref" name="booking_ref" className="input" defaultValue={booking?.booking_ref ?? ""} placeholder="e.g. #127178887" />
          </div>
          <div className="field">
            <label htmlFor="t-from">Pickup from</label>
            <input
              id="t-from"
              name="pickup"
              className="input"
              defaultValue={booking?.pickup ?? ""}
              placeholder={type === "Airport pickup" ? "e.g. Heathrow T2" : "e.g. Baitul Futuh"}
            />
          </div>
          <div className="field">
            <label htmlFor="t-to">Drop-off at</label>
            <input
              id="t-to"
              name="dropoff"
              className="input"
              defaultValue={booking?.dropoff ?? ""}
              placeholder={type === "Airport drop-off" ? "e.g. Heathrow T2" : "e.g. Baitul Ehsan"}
            />
          </div>
          <div className="field wide">
            <label htmlFor="t-driver">Driver or contact</label>
            <input id="t-driver" name="driver" className="input" defaultValue={booking?.driver ?? ""} placeholder="Name and phone number" />
          </div>
          <div className="field wide">
            <label htmlFor="t-notes">Notes</label>
            <textarea id="t-notes" name="notes" className="textarea" defaultValue={booking?.notes ?? ""} placeholder="Flight numbers, luggage, anything the driver needs" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {booking && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={pending}>
              Remove booking
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : booking ? "Save changes" : "Add transport"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
