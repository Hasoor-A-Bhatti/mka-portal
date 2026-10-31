"use client";

import { useState } from "react";
import { BedDouble, CalendarRange, DoorOpen, Plus, StickyNote } from "lucide-react";
import { dayRange, daysLabel, spanDays, type Stay } from "@/lib/delegations";
import { deleteStay, saveStay } from "@/app/(portal)/[dept]/[id]/actions";
import { vars } from "@/lib/css";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { DateSpanFields, SuggestInput } from "./fields";
import { Planner, toneFor } from "./planner";

const VENUES = ["Baitul Futuh", "Baitul Ehsan", "Fazl Mosque", "Hotel"];

export function StaysPanel({
  delegationId,
  days,
  today,
  stays,
  suggestions,
  canManage,
}: {
  delegationId: string;
  days: string[];
  today: string;
  stays: Stay[];
  suggestions: string[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ stay: Stay | null; day?: string } | null>(null);
  const covered = new Set(days.filter((d) => stays.some((s) => d >= s.start_date && d <= s.end_date)));
  const missing = days.length - covered.size;
  const venues = [...new Set(stays.map((s) => s.venue))];
  const sorted = [...stays].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <>
      <section className="stats" aria-label="Accommodation summary">
        <div className="stat glass is-accent">
          <strong>
            {covered.size}
            <small> / {days.length}</small>
          </strong>
          <span>days with accommodation</span>
        </div>
        <div className="stat glass">
          <strong style={{ color: missing ? "#9a6600" : "var(--ok)" }}>{missing}</strong>
          <span>{missing === 1 ? "day still to arrange" : "days still to arrange"}</span>
        </div>
        <div className="stat glass">
          <strong>{venues.length}</strong>
          <span>{venues.length === 1 ? "venue" : "venues"}</span>
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Accommodation planner</h2>
            <p className="muted-note">Where the group sleeps each night. Click a bar to edit it.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ stay: null })}>
            <Plus size={18} /> Add stay
          </button>
        </div>
        <Planner
          days={days}
          today={today}
          items={stays.map((s) => ({
            id: s.id,
            start: s.start_date,
            end: s.end_date,
            title: s.venue,
            subtitle: s.rooms,
            tone: toneFor(s.venue),
            icon: <BedDouble size={13} />,
          }))}
          onOpen={(id) => setEditing({ stay: stays.find((s) => s.id === id) ?? null })}
          onAdd={(day) => setEditing({ stay: null, day })}
          gaps={{ covered: "Accommodation arranged", missing: "No accommodation yet" }}
          addLabel="Add stay"
        />
      </section>

      {sorted.length > 0 && (
        <section className="panel glass">
          <div className="panel-head">
            <h2>Stays</h2>
          </div>
          <ul className="plan-list">
            {sorted.map((s) => (
              <li key={s.id}>
                <button type="button" className="plan-card" style={vars({ "--tone": toneFor(s.venue) })} onClick={() => setEditing({ stay: s })}>
                  <span className="plan-card-bar" aria-hidden />
                  <span className="plan-card-body">
                    <strong>{s.venue}</strong>
                    <span>
                      <CalendarRange size={14} /> {dayRange(s.start_date, s.end_date)} · {daysLabel(spanDays(s.start_date, s.end_date))}
                    </span>
                    {s.rooms && (
                      <span>
                        <DoorOpen size={14} /> {s.rooms}
                      </span>
                    )}
                    {s.notes && (
                      <span className="plan-card-notes">
                        <StickyNote size={14} /> {s.notes}
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
        <StayDialog
          delegationId={delegationId}
          stay={editing.stay}
          first={days[0]}
          last={days[days.length - 1]}
          startDay={editing.day}
          venues={[...venues, ...suggestions, ...VENUES]}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function StayDialog({
  delegationId,
  stay,
  first,
  last,
  startDay,
  venues,
  canManage,
  onClose,
}: {
  delegationId: string;
  stay: Stay | null;
  first: string;
  last: string;
  startDay?: string;
  venues: string[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const start = stay?.start_date ?? startDay ?? first;
  // A new stay runs to the end of the visit by default.
  const end = stay?.end_date ?? last;

  const remove = () => {
    if (!stay || !window.confirm(`Remove the stay at ${stay.venue}?`)) return;
    run(() => deleteStay(delegationId, stay.id), onClose);
  };

  return (
    <Sheet title={stay ? "Edit stay" : "Add stay"} subtitle={`Within the visit: ${dayRange(first, last)}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveStay(delegationId, stay?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="s-venue">
              Where they're staying<span className="req">*</span>
            </label>
            <SuggestInput id="s-venue" name="venue" defaultValue={stay?.venue} options={venues} placeholder="e.g. Baitul Futuh guest rooms" required />
          </div>
          <DateSpanFields first={first} last={last} start={start} end={end} daysLabel="Number of days there" />
          <div className="field wide">
            <label htmlFor="s-rooms">Rooms</label>
            <input id="s-rooms" name="rooms" className="input" defaultValue={stay?.rooms ?? ""} placeholder="e.g. Rooms 1 & 4, or 2 family rooms" />
          </div>
          <div className="field wide">
            <label htmlFor="s-notes">Notes</label>
            <textarea id="s-notes" name="notes" className="textarea" defaultValue={stay?.notes ?? ""} placeholder="Keys, bedding, contact on site, anything useful" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {stay && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={pending}>
              Remove stay
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : stay ? "Save changes" : "Add stay"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
