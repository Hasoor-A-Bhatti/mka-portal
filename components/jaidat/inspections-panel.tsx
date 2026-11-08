"use client";

import { useState } from "react";
import { CalendarClock, Check, ClipboardCheck, Copy, DoorOpen, Minus, Plus, X } from "lucide-react";
import {
  INSPECTION_TYPES,
  OUTCOMES,
  WALK_CHECKS,
  addDays,
  inspectionState,
  relDays,
  todayISO,
  type CheckResult,
  type ChecklistEntry,
  type Inspection,
  type JaidatFile,
  type Property,
} from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteInspection, saveInspection, saveRooms } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Empty, Pill } from "./bits";
import { AddDocument, DocList } from "./files";

export function InspectionsPanel({
  property,
  inspections,
  files,
  canManage,
  origin,
}: {
  property: Property;
  inspections: Inspection[];
  files: JaidatFile[];
  canManage: boolean;
  origin: string;
}) {
  const canEdit = useCanEdit();
  const today = todayISO();
  const [editing, setEditing] = useState<{ inspection: Inspection | null } | null>(null);
  const state = inspectionState(inspections, today);
  const latest = inspections[0];

  return (
    <>
      <section className="stats" aria-label="Inspection summary">
        <div className="stat glass is-accent">
          <strong className="jd-stat-word">{state}</strong>
          <span>{latest?.next_due ? `next due ${formatDate(latest.next_due)} (${relDays(latest.next_due, today)})` : "set a next due date on the latest inspection"}</span>
        </div>
        <div className="stat glass">
          <strong className="jd-stat-word">{latest ? formatDate(latest.inspected_on) : "Never"}</strong>
          <span>last inspected</span>
        </div>
        <div className="stat glass">
          <strong>{inspections.length}</strong>
          <span>inspections on record</span>
        </div>
      </section>

      <div className="split">
        <section className="panel glass">
          <div className="panel-head">
            <h2>Inspections and walk-rounds</h2>
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ inspection: null })}>
                <ClipboardCheck size={17} /> Start a walk-round
              </button>
            )}
          </div>
          {inspections.length === 0 ? (
            <Empty title="No inspections yet">Walk round each room, tick what&apos;s fine, and flag problems. Flagged items can become tickets straight away.</Empty>
          ) : (
            <ul className="task-list">
              {inspections.map((i) => {
                const issues = i.checklist.filter((c) => c.result === "issue").length;
                const checked = i.checklist.filter((c) => c.result !== "na").length;
                return (
                  <li key={i.id}>
                    <button type="button" className={`task jd-insp is-${i.outcome.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => setEditing({ inspection: i })}>
                      <div className="task-main">
                        <div className="task-title">
                          <strong>
                            {i.inspection_type} · {formatDate(i.inspected_on)}
                          </strong>
                          <Pill value={i.outcome} />
                        </div>
                        <div className="task-meta">
                          {i.inspector && <span>By {i.inspector}</span>}
                          {checked > 0 && (
                            <span>
                              {checked} check{checked === 1 ? "" : "s"}, {issues} problem{issues === 1 ? "" : "s"}
                            </span>
                          )}
                          {i.next_due && (
                            <span>
                              <CalendarClock size={14} /> Next {formatDate(i.next_due)}
                            </span>
                          )}
                        </div>
                        {i.findings && <p className="task-notes">{i.findings}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Rooms property={property} origin={origin} />
      </div>

      {editing && (
        <InspectionDialog
          property={property}
          inspection={editing.inspection}
          files={editing.inspection ? files.filter((f) => f.inspection_id === editing.inspection!.id) : []}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** The rooms and areas of a property, with a report link for each (for QR stickers). */
function Rooms({ property, origin }: { property: Property; origin: string }) {
  const canEdit = useCanEdit();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  const rooms = property.rooms ?? [];
  const link = (room?: string) => `${origin}/report?p=${property.id}${room ? `&room=${encodeURIComponent(room)}` : ""}`;

  const copy = async (room?: string) => {
    try {
      await navigator.clipboard.writeText(link(room));
      setCopied(room ?? "");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy the link:", link(room));
    }
  };

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>Rooms and areas</h2>
      </div>
      <p className="muted-note">Walk-rounds go room by room. Each room has its own report link: print it as a QR code on a sticker so anyone can report a problem there.</p>
      {rooms.length === 0 ? (
        <p className="muted-note" style={{ marginTop: 10 }}>
          No rooms yet.
        </p>
      ) : (
        <ul className="jd-rooms">
          {rooms.map((r) => (
            <li key={r}>
              <DoorOpen size={15} />
              <span>{r}</span>
              <button type="button" className="icon-link" title="Copy report link" onClick={() => copy(r)}>
                {copied === r ? <Check size={14} /> : <Copy size={14} />}
                <span className="sr-only">Copy report link for {r}</span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="icon-link danger"
                  title="Remove room"
                  disabled={pending}
                  onClick={() => run(() => saveRooms(property.id, rooms.filter((x) => x !== r)))}
                >
                  <X size={14} />
                  <span className="sr-only">Remove {r}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="jd-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            const add = name
              .split(/[,\n]/)
              .map((x) => x.trim())
              .filter(Boolean);
            if (add.length) run(() => saveRooms(property.id, [...rooms, ...add]), () => setName(""));
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add rooms, e.g. Gym, Kitchen, Hall" aria-label="Add rooms" />
          <button type="submit" className="btn" disabled={pending || !name.trim()}>
            <Plus size={15} /> Add
          </button>
        </form>
      )}
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => copy()}>
        {copied === "" ? <Check size={14} /> : <Copy size={14} />} Copy the property&apos;s report link
      </button>
      <FormError error={error} />
    </section>
  );
}

function InspectionDialog({
  property,
  inspection: i,
  files,
  canManage,
  onClose,
}: {
  property: Property;
  inspection: Inspection | null;
  files: JaidatFile[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { pending, error, run } = useRun();
  const rooms = property.rooms?.length ? property.rooms : ["Whole building"];
  const [list, setList] = useState<ChecklistEntry[]>(() => {
    if (i) return i.checklist;
    return rooms.flatMap((room) => WALK_CHECKS.map((c) => ({ room, check: c.key, result: "ok" as CheckResult })));
  });
  const set = (room: string, check: string, patch: Partial<ChecklistEntry>) =>
    setList((cur) => {
      const found = cur.some((e) => e.room === room && e.check === check);
      if (!found) return [...cur, { room, check, result: "ok", ...patch }];
      return cur.map((e) => (e.room === room && e.check === check ? { ...e, ...patch } : e));
    });
  const issues = list.filter((e) => e.result === "issue");
  const roomsShown = [...new Set([...rooms, ...list.map((e) => e.room)])];

  return (
    <Sheet
      title={i ? `${i.inspection_type} · ${formatDate(i.inspected_on)}` : "Walk-round"}
      subtitle={i ? property.name : `${property.name}: tap a check to flag a problem. Everything else counts as fine.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("checklist", JSON.stringify(list));
          run(() => saveInspection(i?.id ?? null, property.id, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="n-type">Type</label>
            <select id="n-type" name="inspection_type" className="select" defaultValue={i?.inspection_type ?? "Walk-round"}>
              {INSPECTION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-date">
              Date<span className="req">*</span>
            </label>
            <input id="n-date" name="inspected_on" type="date" className="input" required max={todayISO()} defaultValue={i?.inspected_on ?? todayISO()} />
          </div>
          <div className="field">
            <label htmlFor="n-by">Inspected by</label>
            <input id="n-by" name="inspector" className="input" list="jaidat-people" defaultValue={i?.inspector ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="n-next">Next due</label>
            <input id="n-next" name="next_due" type="date" className="input" defaultValue={i?.next_due ?? addDays(todayISO(), 90)} />
          </div>

          <div className="wide jd-walk">
            {roomsShown.map((room) => (
              <fieldset key={room} className="jd-walk-room">
                <legend>{room}</legend>
                {WALK_CHECKS.map((c) => {
                  const e = list.find((x) => x.room === room && x.check === c.key);
                  const r = e?.result ?? "ok";
                  return (
                    <div key={c.key} className={`jd-walk-row is-${r}`}>
                      <span>{c.key}</span>
                      <div className="jd-tri" role="group" aria-label={`${c.key} in ${room}`}>
                        <button type="button" aria-pressed={r === "ok"} title="Fine" onClick={() => set(room, c.key, { result: "ok" })}>
                          <Check size={14} />
                          <span className="sr-only">Fine</span>
                        </button>
                        <button type="button" aria-pressed={r === "issue"} title="Problem" onClick={() => set(room, c.key, { result: "issue" })}>
                          <X size={14} />
                          <span className="sr-only">Problem</span>
                        </button>
                        <button type="button" aria-pressed={r === "na"} title="Not relevant" onClick={() => set(room, c.key, { result: "na" })}>
                          <Minus size={14} />
                          <span className="sr-only">Not relevant</span>
                        </button>
                      </div>
                      {r === "issue" && (
                        <input
                          className="input jd-walk-note"
                          value={e?.note ?? ""}
                          onChange={(ev) => set(room, c.key, { note: ev.target.value })}
                          placeholder="What's wrong?"
                          aria-label={`What's wrong with ${c.key.toLowerCase()} in ${room}`}
                          maxLength={300}
                        />
                      )}
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>

          {!i && issues.length > 0 && (
            <label className="check wide">
              <input type="checkbox" name="raise_tickets" defaultChecked />
              <span>
                <strong>
                  Raise {issues.length} ticket{issues.length === 1 ? "" : "s"} for the problems found
                </strong>
                <small>Each becomes a P3 ticket you can then assign and prioritise.</small>
              </span>
            </label>
          )}
          <div className="field">
            <label htmlFor="n-out">Outcome</label>
            <select id="n-out" name="outcome" className="select" defaultValue={i?.outcome ?? ""}>
              {!i && <option value="">Work it out from the checks</option>}
              {OUTCOMES.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="n-find">Findings</label>
            <textarea id="n-find" name="findings" className="textarea" defaultValue={i?.findings ?? ""} />
          </div>
          <div className="field wide">
            <label htmlFor="n-act">Actions and who&apos;s responsible</label>
            <textarea id="n-act" name="actions" className="textarea" defaultValue={i?.actions ?? ""} />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          {i && canManage && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={pending} onClick={() => window.confirm("Remove this inspection?") && run(() => deleteInspection(i.id), onClose)}>
              Remove
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : i ? "Save changes" : "Save walk-round"}
            </button>
          </div>
        </div>
      </form>
      {i && (
        <div className="jd-sheet-extra">
          <section className="jd-sub">
            <div className="jd-sub-head">
              <h3>Photos and reports</h3>
              <AddDocument propertyId={property.id} links={{ inspection_id: i.id }} category="Photos" label="Attach" small />
            </div>
            <DocList files={files} canDelete={canManage} empty="Nothing attached." compact />
          </section>
        </div>
      )}
    </Sheet>
  );
}
