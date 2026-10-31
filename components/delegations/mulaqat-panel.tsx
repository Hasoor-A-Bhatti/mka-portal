"use client";

import { useState } from "react";
import { Clock, MapPin, Plus, StickyNote, Users } from "lucide-react";
import { dayRange, fmtDay, hhmm, type Mulaqat, type TeamMember } from "@/lib/delegations";
import { deleteMulaqat, saveMulaqat } from "@/app/(portal)/[dept]/[id]/actions";
import { initials } from "@/lib/format";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { Planner } from "./planner";

const TONE = "#8a6210";

function countdown(day: string, today: string) {
  const diff = Math.round((new Date(`${day}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (diff < 0) return "Done";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

export function MulaqatPanel({
  delegationId,
  days,
  today,
  mulaqats,
  team,
  canManage,
}: {
  delegationId: string;
  days: string[];
  today: string;
  mulaqats: Mulaqat[];
  team: TeamMember[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ mulaqat: Mulaqat | null; day?: string } | null>(null);
  const names = new Map(team.map((t) => [t.id, t.full_name]));
  const sorted = [...mulaqats].sort(
    (a, b) => a.mulaqat_date.localeCompare(b.mulaqat_date) || (a.mulaqat_time ?? "").localeCompare(b.mulaqat_time ?? ""),
  );

  return (
    <>
      <section className="panel glass">
        <div className="panel-head">
          <div>
            <h2>Mulaqat schedule</h2>
            <p className="muted-note">When the group meets, and who from the team attends.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ mulaqat: null })}>
            <Plus size={18} /> Add mulaqat
          </button>
        </div>
        <Planner
          days={days}
          today={today}
          items={mulaqats.map((m) => ({
            id: m.id,
            start: m.mulaqat_date,
            end: m.mulaqat_date,
            title: hhmm(m.mulaqat_time) ?? "Mulaqat",
            subtitle: m.location,
            tone: TONE,
            icon: <Users size={13} />,
          }))}
          onOpen={(id) => setEditing({ mulaqat: mulaqats.find((m) => m.id === id) ?? null })}
          onAdd={(day) => setEditing({ mulaqat: null, day })}
          addLabel="Add mulaqat"
        />
      </section>

      {sorted.length > 0 && (
        <ol className="mulaqat-list">
          {sorted.map((m) => {
            const people = [
              ...m.attendee_ids.map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
              ...(m.other_attendees ? m.other_attendees.split(",").map((s) => s.trim()).filter(Boolean) : []),
            ];
            const past = m.mulaqat_date < today;
            return (
              <li key={m.id}>
                <button type="button" className={`mulaqat glass ${past ? "is-past" : ""}`} onClick={() => setEditing({ mulaqat: m })}>
                  <span className={`cal-date ${m.mulaqat_date === today ? "is-today" : ""}`}>
                    <small>{fmtDay(m.mulaqat_date, { weekday: "short" })}</small>
                    <strong>{fmtDay(m.mulaqat_date, { day: "numeric" })}</strong>
                    <small>{fmtDay(m.mulaqat_date, { month: "short" })}</small>
                  </span>
                  <span className="mulaqat-body">
                    <span className="cal-when">{countdown(m.mulaqat_date, today)}</span>
                    <strong>
                      Mulaqat{m.mulaqat_time ? ` at ${hhmm(m.mulaqat_time)}` : ""}
                      {m.location ? `, ${m.location}` : ""}
                    </strong>
                    <span className="mulaqat-meta">
                      {m.mulaqat_time && (
                        <span>
                          <Clock size={14} /> {hhmm(m.mulaqat_time)}
                        </span>
                      )}
                      {m.location && (
                        <span>
                          <MapPin size={14} /> {m.location}
                        </span>
                      )}
                    </span>
                    {people.length > 0 ? (
                      <span className="people">
                        {people.map((p, i) => (
                          <span key={`${p}-${i}`} className="person">
                            <span className="avatar" aria-hidden>
                              {initials(p)}
                            </span>
                            {p}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted-note">No one assigned yet</span>
                    )}
                    {m.notes && (
                      <span className="plan-card-notes">
                        <StickyNote size={14} /> {m.notes}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <MulaqatDialog
          delegationId={delegationId}
          mulaqat={editing.mulaqat}
          first={days[0]}
          last={days[days.length - 1]}
          startDay={editing.day}
          team={team}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function MulaqatDialog({
  delegationId,
  mulaqat,
  first,
  last,
  startDay,
  team,
  canManage,
  onClose,
}: {
  delegationId: string;
  mulaqat: Mulaqat | null;
  first: string;
  last: string;
  startDay?: string;
  team: TeamMember[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const [chosen, setChosen] = useState(new Set(mulaqat?.attendee_ids ?? []));

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = () => {
    if (!mulaqat || !window.confirm("Remove this mulaqat?")) return;
    run(() => deleteMulaqat(delegationId, mulaqat.id), onClose);
  };

  return (
    <Sheet title={mulaqat ? "Edit mulaqat" : "Add mulaqat"} subtitle={`Within the visit: ${dayRange(first, last)}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveMulaqat(delegationId, mulaqat?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="m-date">
              Date<span className="req">*</span>
            </label>
            <input
              id="m-date"
              name="mulaqat_date"
              type="date"
              className="input"
              required
              min={first}
              max={last}
              defaultValue={mulaqat?.mulaqat_date ?? startDay ?? first}
            />
          </div>
          <div className="field">
            <label htmlFor="m-time">Time</label>
            <input id="m-time" name="mulaqat_time" type="time" className="input" defaultValue={hhmm(mulaqat?.mulaqat_time ?? null) ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="m-loc">Location</label>
            <input id="m-loc" name="location" className="input" defaultValue={mulaqat?.location ?? ""} placeholder="e.g. Islamabad, Tilford" />
          </div>

          <fieldset className="field wide team-pick">
            <legend>Team members attending</legend>
            {team.length === 0 ? (
              <p className="muted-note">No team members found. Add names below.</p>
            ) : (
              <div className="chips">
                {team.map((t) => (
                  <label key={t.id} className={`chip person-chip ${chosen.has(t.id) ? "is-on" : ""}`}>
                    <input type="checkbox" name="attendee_ids" value={t.id} checked={chosen.has(t.id)} onChange={() => toggle(t.id)} />
                    <span className="avatar" aria-hidden>
                      {initials(t.full_name)}
                    </span>
                    {t.full_name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="field wide">
            <label htmlFor="m-others">Others attending</label>
            <input
              id="m-others"
              name="other_attendees"
              className="input"
              defaultValue={mulaqat?.other_attendees ?? ""}
              placeholder="Names not on the portal, separated by commas"
            />
          </div>
          <div className="field wide">
            <label htmlFor="m-notes">Notes</label>
            <textarea id="m-notes" name="notes" className="textarea" defaultValue={mulaqat?.notes ?? ""} placeholder="Dress code, gifts, who leads, anything to prepare" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {mulaqat && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={pending}>
              Remove mulaqat
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : mulaqat ? "Save changes" : "Add mulaqat"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
