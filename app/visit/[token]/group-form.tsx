"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { hhmm, shortDay, type Traveller } from "@/lib/delegations";
// The file parsers themselves (SheetJS, pdf.js) load only when a file is dropped.
import { IMPORT_ACCEPT, groupCsv, nameKey, readGroupFile, type ImportedPerson } from "@/lib/group-import";
import type { GroupPerson } from "./actions";

const AIRPORTS = ["Heathrow T2", "Heathrow T3", "Heathrow T4", "Heathrow T5", "Gatwick North", "Gatwick South", "Stansted", "Luton", "Manchester", "Birmingham"];

/** A person as edited on the page. `key` keeps rows steady while new people have no id yet. */
export type GroupRow = GroupPerson & { key: string; fromTeam: boolean; ref: number | null };

export const toGroupRow = (t: Traveller): GroupRow => ({
  key: t.id,
  id: t.id,
  ref: t.ref,
  fromTeam: t.source !== "aek",
  full_name: t.full_name,
  arrival_date: t.arrival_date ?? "",
  arrival_time: hhmm(t.arrival_time) ?? "",
  arrival_flight: t.arrival_flight ?? "",
  arrival_place: t.arrival_place ?? "",
  departure_date: t.departure_date ?? "",
  departure_time: hhmm(t.departure_time) ?? "",
  departure_flight: t.departure_flight ?? "",
  departure_place: t.departure_place ?? "",
  needs_pickup: t.needs_pickup,
  needs_dropoff: t.needs_dropoff,
  needs_accommodation: t.needs_accommodation ?? true,
});

let added = 0;
export const emptyGroupRow = (): GroupRow => ({
  key: `new-${++added}-${Date.now()}`,
  ref: null,
  fromTeam: false,
  full_name: "",
  arrival_date: "",
  arrival_time: "",
  arrival_flight: "",
  arrival_place: "",
  departure_date: "",
  departure_time: "",
  departure_flight: "",
  departure_place: "",
  needs_pickup: true,
  needs_dropoff: true,
  needs_accommodation: true,
});

type Leg = "arrival" | "departure";
const LEG_FIELDS = (leg: Leg) => [`${leg}_date`, `${leg}_time`, `${leg}_flight`, `${leg}_place`] as const;
const TRAVEL_KEYS = [...LEG_FIELDS("arrival"), ...LEG_FIELDS("departure")];

const named = (r: GroupRow) => Boolean(r.full_name.trim());

/** What we still need for this person: date, time and flight for each journey we're meeting. */
function gaps(r: GroupRow): string[] {
  const out: string[] = [];
  const leg = (l: Leg, word: string, needed: boolean) => {
    const [d, t, f] = LEG_FIELDS(l);
    if (!r[d]) out.push(`${word} date`);
    if (needed && !r[f]) out.push(`${word} flight`);
    if (needed && !r[t]) out.push(`${word} time`);
  };
  leg("arrival", "arrival", r.needs_pickup);
  leg("departure", "return", r.needs_dropoff);
  return out;
}

const problem = (r: GroupRow) => (r.arrival_date && r.departure_date && r.departure_date < r.arrival_date ? "Return is before arrival" : null);

function legText(r: Pick<GroupPerson, (typeof TRAVEL_KEYS)[number]>, leg: Leg): string | null {
  const [d, t, f] = LEG_FIELDS(leg);
  const bits = [r[d] ? shortDay(r[d]) : null, r[t] || null, r[f] || null].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

type Review = {
  fileName: string;
  people: (ImportedPerson & { key: string; on: boolean; match: string | null })[];
};

/**
 * Everyone in the group, edited on the AeK link. Each person here goes onto
 * the delegation's Travellers list when the form is sent.
 *
 * Built for big groups: one line per person (open one to edit it), search, a
 * "still missing details" filter, and a list the AeK can drop in from Excel,
 * CSV or PDF instead of typing everyone.
 */
export function GroupEditor({
  rows,
  onChange,
  onRemove,
  year,
  onImported,
}: {
  rows: GroupRow[];
  onChange: (rows: GroupRow[]) => void;
  onRemove: (row: GroupRow) => void;
  /** The year to assume when a file gives "12 Aug" without one. */
  year: number;
  /** Called with the whole list after a file is added, so the form can fill in what's blank above. */
  onImported?: (rows: GroupRow[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const people = rows.filter(named);
  const missing = people.filter((r) => gaps(r).length || problem(r));
  const s = nameKey(q);
  const shown = rows.filter((r) => (!s || nameKey(r.full_name).includes(s) || [r.arrival_flight, r.departure_flight].join(" ").toLowerCase().includes(q.trim().toLowerCase())) && (!onlyMissing || !named(r) || gaps(r).length || problem(r)));

  const set = (key: string, patch: Partial<GroupRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const focusRow = (key: string) =>
    requestAnimationFrame(() => {
      const li = listRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
      li?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      li?.querySelector<HTMLInputElement>("input.grp-name")?.focus({ preventScroll: true });
    });

  const addPerson = () => {
    const row = emptyGroupRow();
    onChange([...rows.filter((r) => r.id || named(r)), row]);
    setQ("");
    setOnlyMissing(false);
    setOpen(row.key);
    focusRow(row.key);
  };

  // ----- Import -----

  const read = async (file: File) => {
    setImportError(null);
    setNotice(null);
    setReading(file.name);
    try {
      const res = await readGroupFile(file, year);
      const index = new Map(rows.filter(named).map((r) => [nameKey(r.full_name), r.key]));
      setReview({
        fileName: res.fileName,
        people: res.people.map((p, i) => ({ ...p, key: `imp-${i}`, on: true, match: index.get(nameKey(p.full_name)) ?? null })),
      });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "We couldn't read that file.");
    } finally {
      setReading(null);
    }
  };

  const applyImport = () => {
    if (!review) return;
    const chosen = review.people.filter((p) => p.on);
    let next = rows.filter((r) => r.id || named(r));
    const index = new Map(next.map((r) => [nameKey(r.full_name), r.key]));
    let added = 0;
    let updated = 0;
    for (const p of chosen) {
      // Only what the file gives: blanks in the file never wipe out what's already here.
      const patch: Partial<GroupRow> = {};
      for (const k of TRAVEL_KEYS) if (p[k]) patch[k] = p[k];
      const at = index.get(nameKey(p.full_name));
      if (at) {
        next = next.map((r) => (r.key === at ? { ...r, ...patch } : r));
        if (Object.keys(patch).length) updated++;
      } else {
        const row = { ...emptyGroupRow(), ...patch, full_name: p.full_name };
        next.push(row);
        index.set(nameKey(p.full_name), row.key);
        added++;
      }
    }
    onChange(next);
    onImported?.(next);
    setReview(null);
    setOpen(null);
    setQ("");
    const left = next.filter((r) => named(r) && gaps(r).length).length;
    setNotice(
      [
        added ? `${added} ${added === 1 ? "person" : "people"} added` : null,
        updated ? `${updated} updated` : null,
        left ? `${left} still need a few details` : "everyone has their travel details",
      ]
        .filter(Boolean)
        .join(" · ") + ". Press Send at the bottom when you're ready.",
    );
  };

  const downloadCsv = () => {
    const blob = new Blob([groupCsv(people)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: people.length ? "group-travel.csv" : "group-travel-template.csv" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Copy one person's journey to everyone who hasn't got one yet.
  const copyLeg = (from: GroupRow, leg: Leg) => {
    const keys = LEG_FIELDS(leg);
    const patch = Object.fromEntries(keys.map((k) => [k, from[k]])) as Partial<GroupRow>;
    const [d, , f] = keys;
    onChange(rows.map((r) => (r.key !== from.key && named(r) && !r[d] && !r[f] ? { ...r, ...patch } : r)));
  };
  const blankFor = (from: GroupRow, leg: Leg) => {
    const [d, , f] = LEG_FIELDS(leg);
    return rows.filter((r) => r.key !== from.key && named(r) && !r[d] && !r[f]).length;
  };

  const drop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setDragging(false);
      read(e.dataTransfer.files[0]);
    },
  };

  const empty = people.length === 0 && rows.length <= 1 && !rows.some((r) => r.key === open);

  return (
    <fieldset className={`visit-group grp ${dragging ? "is-dragging" : ""}`} {...drop}>
      <legend>
        <Users size={18} /> Your group
        {people.length > 0 && <span className="grp-count">{people.length}</span>}
      </legend>
      <p className="visit-help">
        Everyone travelling, with their arrival and return journeys, so we can meet each flight and take everyone back. If you
        have a list already, drop it in and we&apos;ll fill this in for you.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) read(f);
        }}
      />

      {/* ----- Drop a file ----- */}
      {!review && (
        <div className={`grp-import ${empty ? "is-big" : ""}`}>
          {reading ? (
            <p className="grp-import-busy" role="status">
              <Loader2 size={18} className="spin" /> Reading {reading}…
            </p>
          ) : (
            <>
              <span className="grp-import-icon" aria-hidden>
                <FileSpreadsheet size={empty ? 26 : 20} />
              </span>
              <span className="grp-import-text">
                <strong>{empty ? "Drop your group's list here" : "Have an updated list? Drop it here"}</strong>
                <small>Excel, CSV or PDF. We&apos;ll pick out names, dates, times and flights; anything missing stays blank for you to add.</small>
              </span>
              <span className="grp-import-actions">
                <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
                  <Upload size={15} /> Choose a file
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={downloadCsv}>
                  <Download size={15} /> {people.length ? "Download as spreadsheet" : "Get a template"}
                </button>
              </span>
            </>
          )}
        </div>
      )}
      {importError && (
        <p className="form-error grp-import-error" role="alert">
          <AlertCircle size={16} /> {importError}
        </p>
      )}

      {/* ----- Check what was found ----- */}
      {review && <ImportReview review={review} onChange={setReview} onApply={applyImport} onCancel={() => setReview(null)} />}

      {notice && !review && (
        <p className="grp-notice" role="status">
          <Check size={16} /> {notice}
          <button type="button" className="icon-link" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </p>
      )}

      {/* ----- The list ----- */}
      {!empty && (
        <>
          <div className="grp-toolbar">
            <label className="search grp-search">
              <Search size={16} />
              <span className="sr-only">Find someone</span>
              <input className="input" type="search" placeholder="Find a name or flight" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="chips grp-filter" role="group" aria-label="Show">
              <button type="button" className="chip" aria-pressed={!onlyMissing} onClick={() => setOnlyMissing(false)}>
                Everyone · {people.length}
              </button>
              <button type="button" className="chip" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(true)} disabled={!missing.length && !onlyMissing}>
                Missing details · {missing.length}
              </button>
            </div>
          </div>

          <div className="grp-scroll">
            <div className="grp-cols" aria-hidden>
              <span>No.</span>
              <span>Name</span>
              <span>Arrives</span>
              <span>Returns</span>
              <span />
            </div>
            <ol className="grp-list" ref={listRef}>
              {shown.map((r) => {
                const n = rows.indexOf(r) + 1;
                const isOpen = open === r.key;
                const g = gaps(r);
                const bad = problem(r);
                const who = r.full_name || `person ${n}`;
                return (
                  <li key={r.key} data-key={r.key} className={`grp-item ${isOpen ? "is-open" : ""}`}>
                    <button type="button" className="grp-line" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}>
                      <span className="grp-ref">{r.ref ?? n}</span>
                      <span className="grp-who">{r.full_name || <em>New person</em>}</span>
                      <span className={`grp-sum ${legText(r, "arrival") ? "" : "is-blank"}`}>
                        <PlaneLanding size={14} aria-label="Arrives" /> {legText(r, "arrival") ?? "Not given"}
                      </span>
                      <span className={`grp-sum ${legText(r, "departure") ? "" : "is-blank"}`}>
                        <PlaneTakeoff size={14} aria-label="Returns" /> {legText(r, "departure") ?? "Not given"}
                      </span>
                      <span className="grp-state">
                        {bad ? (
                          <span className="grp-flag is-bad">{bad}</span>
                        ) : g.length && named(r) ? (
                          <span className="grp-flag" title={`Missing: ${g.join(", ")}`}>
                            {g.length} missing
                          </span>
                        ) : named(r) ? (
                          <Check size={16} className="grp-ok" aria-label="Complete" />
                        ) : null}
                        <ChevronDown size={16} className="grp-chev" aria-hidden />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="grp-edit">
                        <input
                          className="input grp-name"
                          maxLength={120}
                          autoComplete="off"
                          placeholder="Full name"
                          aria-label={`Person ${n}: full name`}
                          value={r.full_name}
                          onChange={(e) => set(r.key, { full_name: e.target.value })}
                        />
                        {(["arrival", "departure"] as const).map((leg) => {
                          const [d, t, f, p] = LEG_FIELDS(leg);
                          const others = r[d] || r[f] ? blankFor(r, leg) : 0;
                          return (
                            <div key={leg} className="grp-leg">
                              <span className="grp-leg-label">
                                {leg === "arrival" ? <PlaneLanding size={14} /> : <PlaneTakeoff size={14} />} {leg === "arrival" ? "Arrives" : "Returns"}
                              </span>
                              <div className="grp-leg-grid">
                                <input type="date" className="input" aria-label={`${who}: ${leg} date`} value={r[d]} onChange={(e) => set(r.key, { [d]: e.target.value })} />
                                <input type="time" className="input" aria-label={`${who}: ${leg} time`} value={r[t]} onChange={(e) => set(r.key, { [t]: e.target.value })} />
                                <input className="input" maxLength={40} placeholder="Flight" aria-label={`${who}: ${leg} flight`} value={r[f]} onChange={(e) => set(r.key, { [f]: e.target.value })} />
                                <input className="input" maxLength={80} list="grp-airports" placeholder="Airport and terminal" aria-label={`${who}: ${leg} airport`} value={r[p]} onChange={(e) => set(r.key, { [p]: e.target.value })} />
                              </div>
                              {others > 0 && (
                                <button type="button" className="grp-copy" onClick={() => copyLeg(r, leg)}>
                                  <CopyCheck size={14} /> Use this {leg === "arrival" ? "arrival" : "return"} for the {others} {others === 1 ? "person" : "people"} without one
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <div className="grp-edit-foot">
                          <div className="grp-needs">
                            {(
                              [
                                ["needs_pickup", "Airport pickup"],
                                ["needs_dropoff", "Airport drop-off"],
                                ["needs_accommodation", "Accommodation"],
                              ] as const
                            ).map(([k, label]) => (
                              <label key={k} className="grp-drop">
                                <input type="checkbox" checked={r[k]} onChange={(e) => set(r.key, { [k]: e.target.checked })} />
                                {label}
                              </label>
                            ))}
                          </div>
                          <span className="grp-edit-actions">
                            {!r.fromTeam && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-danger"
                                onClick={() => {
                                  setOpen(null);
                                  onRemove(r);
                                }}
                              >
                                <Trash2 size={15} /> Remove
                              </button>
                            )}
                            <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
                              Done
                            </button>
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {shown.length === 0 && <p className="muted-note grp-none">{onlyMissing ? "Everyone has their travel details." : "No one matches."}</p>}
          </div>
        </>
      )}

      <div className="grp-foot">
        {rows.length < 1000 && (
          <button type="button" className="btn btn-sm driver-add" onClick={addPerson}>
            <Plus size={15} /> {empty ? "Or add people one at a time" : "Add a person"}
          </button>
        )}
      </div>
      <datalist id="grp-airports">
        {AIRPORTS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </fieldset>
  );
}

/** What was found in the file, to check before it goes onto the list. */
function ImportReview({
  review,
  onChange,
  onApply,
  onCancel,
}: {
  review: Review;
  onChange: (r: Review) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const chosen = review.people.filter((p) => p.on);
  const isNew = chosen.filter((p) => !p.match).length;
  const known = chosen.length - isNew;
  const found = useMemo(() => {
    const c = (k: keyof ImportedPerson) => review.people.filter((p) => p[k]).length;
    return [
      ["arrival dates", c("arrival_date")],
      ["arrival times", c("arrival_time")],
      ["arrival flights", c("arrival_flight")],
      ["return dates", c("departure_date")],
      ["return times", c("departure_time")],
      ["return flights", c("departure_flight")],
      ["airports", c("arrival_place") + c("departure_place")],
    ].filter(([, n]) => Number(n) > 0) as [string, number][];
  }, [review.people]);
  const toggle = (key: string, on: boolean) => onChange({ ...review, people: review.people.map((p) => (p.key === key ? { ...p, on } : p)) });
  const all = chosen.length === review.people.length;

  return (
    <section className="grp-review" aria-label="People found in your file">
      <header className="grp-review-head">
        <span className="grp-import-icon" aria-hidden>
          <FileSpreadsheet size={20} />
        </span>
        <div>
          <strong>
            Found {review.people.length} {review.people.length === 1 ? "person" : "people"} in {review.fileName}
          </strong>
          <small>
            {found.length ? `Also read: ${found.map(([label]) => label).join(", ")}.` : "Only names were found; you can add travel details after."} Untick
            anyone who shouldn&apos;t be on the list.
          </small>
        </div>
      </header>

      <div className="grp-review-table">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  className="grp-check"
                  checked={all}
                  aria-label={all ? "Untick everyone" : "Tick everyone"}
                  onChange={(e) => onChange({ ...review, people: review.people.map((p) => ({ ...p, on: e.target.checked })) })}
                />
              </th>
              <th>Name</th>
              <th>Arrives</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            {review.people.map((p) => (
              <tr key={p.key} className={p.on ? "" : "is-off"}>
                <td>
                  <input type="checkbox" className="grp-check" checked={p.on} onChange={(e) => toggle(p.key, e.target.checked)} aria-label={`Include ${p.full_name}`} />
                </td>
                <td>
                  <strong>{p.full_name}</strong>
                  {p.match && <span className="grp-flag is-soft">On your list</span>}
                </td>
                <td className={legText(p, "arrival") ? "" : "is-blank"}>
                  {legText(p, "arrival") ?? "—"}
                  {p.arrival_place && <small>{p.arrival_place}</small>}
                </td>
                <td className={legText(p, "departure") ? "" : "is-blank"}>
                  {legText(p, "departure") ?? "—"}
                  {p.departure_place && <small>{p.departure_place}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="grp-review-foot">
        <small className="muted">
          {isNew > 0 && `${isNew} new`}
          {isNew > 0 && known > 0 && " · "}
          {known > 0 && `${known} already on your list will be updated (blanks in the file won't clear anything)`}
        </small>
        <span className="grp-edit-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!chosen.length} onClick={onApply}>
            <Check size={15} /> Add {chosen.length} to the list
          </button>
        </span>
      </footer>
    </section>
  );
}
