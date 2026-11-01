"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BedDouble,
  Bus,
  CalendarDays,
  ChevronRight,
  Download,
  Eye,
  MapPinned,
  PlaneLanding,
  PlaneTakeoff,
  FileText,
  ImageIcon,
  Pencil,
  Phone,
  Trash2,
  Upload,
  Users,
  Utensils,
} from "lucide-react";
import { getDepartment, statusTone } from "@/lib/departments";
import { ACCEPTED_FILES, MAX_FILE_BYTES, fileSize } from "@/lib/fleet";
import {
  AEK_TITLE,
  aekTravelLine,
  dayRange,
  daysLabel,
  fmtDay,
  fromCalendar,
  telHref,
  type AekUpdate,
  type Delegation,
  type DelegationFile,
  type Driver,
  type ShareState,
} from "@/lib/delegations";
import { ShareLinkPanel } from "@/components/delegations/share-links";
import { formatDate, formatDateTime } from "@/lib/format";
import { vars } from "@/lib/css";
import { createClient } from "@/lib/supabase/client";
import { deleteItinerary, registerItinerary, saveDelegationInfo } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

export type PlanSummary = {
  totalDays: number;
  stayDays: number;
  transport: number;
  meals: number;
  mealsTotal: number;
  mulaqats: number;
  nextMulaqat: string | null;
};

const STATUSES = getDepartment("delegations")!.statuses;

const TYPES_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export type AekState = { update: AekUpdate | null; share: ShareState };
export type RegionState = { share: ShareState; drivers: Driver[] };

/** True when the AeK gave a value that isn't what's on record. */
const differs = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && a.trim() && a.trim().toLowerCase() !== (b ?? "").trim().toLowerCase());

export function InfoPanel({
  delegation: d,
  files,
  summary,
  canManage,
  aek,
  region,
}: {
  delegation: Delegation;
  files: DelegationFile[];
  summary: PlanSummary;
  canManage: boolean;
  aek: AekState;
  region: RegionState;
}) {
  const u = aek.update;
  const newName = u && differs(u.head_name, d.head_of_delegation) ? u.head_name : null;
  const newPhone = u && differs(u.head_contact, d.head_contact) ? u.head_contact : null;
  const [editing, setEditing] = useState(false);
  const canEdit = useCanEdit();
  const base = `/delegations/${d.id}`;
  const phoneHref = d.head_contact ? `tel:${d.head_contact.replace(/[^+\d]/g, "")}` : null;

  return (
    <div className="split">
      <div className="stack">
        <section className="panel glass">
          <div className="panel-head">
            <h2>Delegation details</h2>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              {canEdit ? (
                <>
                  <Pencil size={15} /> Edit details
                </>
              ) : (
                "View details"
              )}
            </button>
          </div>

          <div className="head-card">
            <span className="avatar head-avatar" aria-hidden>
              {(d.head_of_delegation ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"}
            </span>
            <div>
              <small>Head of delegation</small>
              <strong>{d.head_of_delegation ?? "Not set yet"}</strong>
              {phoneHref ? (
                <a href={phoneHref} className="head-phone">
                  <Phone size={14} /> {d.head_contact}
                </a>
              ) : (
                <span className="muted-note">No contact number</span>
              )}
              {(newName || newPhone) && (
                <AekNote>
                  {newName}
                  {newName && newPhone && " · "}
                  {newPhone && <a href={`tel:${newPhone.replace(/[^+\d]/g, "")}`}>{newPhone}</a>}
                </AekNote>
              )}
            </div>
          </div>

          <dl className="kv">
            <dt>Delegation</dt>
            <dd>{d.name}</dd>
            <dt>Country</dt>
            <dd>{d.country ?? "—"}</dd>
            <dt>Members</dt>
            <dd className="tnum">
              {d.members ?? "—"}
              {u?.members != null && u.members !== d.members && <AekNote>{u.members} people</AekNote>}
            </dd>
            <dt>Venue</dt>
            <dd>{d.venue ?? "—"}</dd>
            <dt>Arrives</dt>
            <dd>
              <DateWithSource date={d.arrival_date} synced={fromCalendar(d)} />
              {u && <AekTravel date={u.arrival_date} recorded={d.arrival_date} time={u.arrival_time} travel={u.arrival_travel} place={u.arrival_place} />}
            </dd>
            <dt>Departs</dt>
            <dd>
              <DateWithSource date={d.departure_date} synced={fromCalendar(d)} />
              {u && (
                <AekTravel date={u.departure_date} recorded={d.departure_date} time={u.departure_time} travel={u.departure_travel} place={u.departure_place} />
              )}
            </dd>
            <dt>Status</dt>
            <dd>
              <span className="status" style={vars({ "--tone": statusTone(d.status) })}>
                {d.status}
              </span>
            </dd>
            {d.notes && (
              <>
                <dt>Notes</dt>
                <dd className="pre">{d.notes}</dd>
              </>
            )}
            {u?.notes && (
              <>
                <dt>AeK notes</dt>
                <dd className="pre aek-notes">{u.notes}</dd>
              </>
            )}
          </dl>
          {u && (
            <p className="muted-note sync-line">
              <span className="aek-chip" title={AEK_TITLE}>
                AeK
              </span>
              Details last sent by the AeK on {formatDateTime(u.submitted_at)}.
            </p>
          )}
          {fromCalendar(d) && (
            <p className="muted-note sync-line">
              <CalendarDays size={14} /> Name and dates come from the Google Calendar.
            </p>
          )}
        </section>

        <DriversPanel drivers={region.drivers} hasLink={Boolean(region.share.link)} />

        <ItineraryPanel delegationId={d.id} files={files} canManage={canManage} />
      </div>

      <div className="stack">
      <ShareLinkPanel kind="aek" delegation={d} state={aek.share} />
      <ShareLinkPanel kind="region" delegation={d} state={region.share} />

      <section className="panel glass">
        <div className="panel-head">
          <h2>Plan at a glance</h2>
        </div>
        {summary.totalDays === 0 ? (
          <p className="muted-note">Set arrival and departure dates to start planning.</p>
        ) : (
          <ul className="plan-glance">
            <GlanceRow
              href={`${base}?tab=accommodation`}
              icon={<BedDouble size={18} />}
              label="Accommodation"
              value={`${summary.stayDays} / ${daysLabel(summary.totalDays)}`}
              done={summary.stayDays === summary.totalDays}
              ratio={summary.stayDays / summary.totalDays}
            />
            <GlanceRow
              href={`${base}?tab=transport`}
              icon={<Bus size={18} />}
              label="Transport"
              value={summary.transport ? `${summary.transport} booking${summary.transport === 1 ? "" : "s"}` : "None yet"}
              done={summary.transport > 0}
            />
            <GlanceRow
              href={`${base}?tab=food`}
              icon={<Utensils size={18} />}
              label="Food"
              value={`${summary.meals} / ${summary.mealsTotal} meals`}
              done={summary.meals === summary.mealsTotal}
              ratio={summary.meals / summary.mealsTotal}
            />
            <GlanceRow
              href={`${base}?tab=mulaqat`}
              icon={<Users size={18} />}
              label="Mulaqat"
              value={summary.nextMulaqat ? `Next ${summary.nextMulaqat}` : summary.mulaqats ? `${summary.mulaqats} held` : "None yet"}
              done={summary.mulaqats > 0}
            />
          </ul>
        )}
      </section>
      </div>

      {editing && <InfoDialog delegation={d} onClose={() => setEditing(false)} />}
    </div>
  );
}

function GlanceRow({
  href,
  icon,
  label,
  value,
  done,
  ratio,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  done: boolean;
  ratio?: number;
}) {
  return (
    <li>
      <Link href={href} className={`plan-glance-row ${done ? "is-done" : ""}`} scroll={false}>
        <span className="plan-glance-icon">{icon}</span>
        <span className="plan-glance-text">
          <strong>{label}</strong>
          <span>{value}</span>
          {ratio !== undefined && (
            <span className="meter sm" aria-hidden>
              <span style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }} />
            </span>
          )}
        </span>
        <ChevronRight size={16} />
      </Link>
    </li>
  );
}

function InfoDialog({ delegation: d, onClose }: { delegation: Delegation; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const locked = fromCalendar(d);

  return (
    <Sheet title="Edit delegation" subtitle={d.arrival_date && d.departure_date ? dayRange(d.arrival_date, d.departure_date) : undefined} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveDelegationInfo(d.id, fd), onClose);
        }}
      >
        <div className="sheet-body">
          {locked && (
            <div className="sync-note wide">
              <CalendarDays size={18} />
              <p>
                <strong>From the Google Calendar.</strong> The name and dates follow the calendar, so change them there.
              </p>
            </div>
          )}
          <div className="field wide">
            <label htmlFor="i-name">
              Delegation<span className="req">*</span>
            </label>
            <input id="i-name" name="name" className="input" required readOnly={locked} defaultValue={d.name} />
          </div>
          <div className="field">
            <label htmlFor="i-head">Head of delegation</label>
            <input id="i-head" name="head_of_delegation" className="input" defaultValue={d.head_of_delegation ?? ""} placeholder="Full name" />
          </div>
          <div className="field">
            <label htmlFor="i-phone">Contact number</label>
            <input
              id="i-phone"
              name="head_contact"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="input"
              defaultValue={d.head_contact ?? ""}
              placeholder="+49 151 2345 6789"
            />
          </div>
          <div className="field">
            <label htmlFor="i-country">Country</label>
            <input id="i-country" name="country" className="input" defaultValue={d.country ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-members">Members</label>
            <input id="i-members" name="members" type="number" min={0} className="input tnum" defaultValue={d.members ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-arr">Arrives</label>
            <input id="i-arr" name="arrival_date" type="date" className="input" readOnly={locked} defaultValue={d.arrival_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-dep">Departs</label>
            <input id="i-dep" name="departure_date" type="date" className="input" readOnly={locked} defaultValue={d.departure_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-venue">Venue</label>
            <input id="i-venue" name="venue" className="input" defaultValue={d.venue ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-status">Status</label>
            <select id="i-status" name="status" className="select" defaultValue={d.status}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="i-notes">Notes</label>
            <textarea id="i-notes" name="notes" className="textarea" defaultValue={d.notes ?? ""} />
          </div>
          {locked && (
            <p className="muted-note wide">Status updates itself from the dates, unless you set it to Cancelled.</p>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Itinerary ----------

function ItineraryPanel({ delegationId, files, canManage }: { delegationId: string; files: DelegationFile[]; canManage: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { pending, error, setError, run } = useRun();
  const canEdit = useCanEdit();

  const upload = (chosen: File[]) =>
    run(
      async () => {
        for (const file of chosen) {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          const type = file.type || TYPES_BY_EXT[ext] || "";
          if (!ACCEPTED_FILES.split(",").includes(type)) return { error: `${file.name} isn't a PDF or image.` };
          if (file.size > MAX_FILE_BYTES) return { error: `${file.name} is over 10 MB.` };

          const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
          const path = `${delegationId}/itinerary/${crypto.randomUUID()}-${safe}`;
          const { error: upErr } = await createClient().storage.from("delegations").upload(path, file, { contentType: type, upsert: false });
          if (upErr) return { error: `Couldn't upload ${file.name}: ${upErr.message}` };
          const res = await registerItinerary(delegationId, { path, fileName: file.name, mimeType: type, size: file.size });
          if (res.error) return res;
        }
      },
      () => router.refresh(),
    );

  const remove = (f: DelegationFile) => {
    if (!window.confirm(`Remove ${f.file_name}? This can't be undone.`)) return;
    run(() => deleteItinerary(delegationId, f.id));
  };

  return (
    <section className="panel glass">
      <div className="panel-head">
        <div>
          <h2>Itinerary</h2>
          <p className="muted-note">PDFs or photos of their schedule, flights and plans.</p>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          hidden
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? []);
            e.target.value = "";
            setError(null);
            if (chosen.length) upload(chosen);
          }}
        />
        {canEdit && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => input.current?.click()}>
            <Upload size={15} /> {pending ? "Uploading…" : "Upload itinerary"}
          </button>
        )}
      </div>

      {files.length === 0 && !canEdit ? (
        <p className="muted-note">No itinerary uploaded yet.</p>
      ) : files.length === 0 ? (
        <button type="button" className="dropzone" onClick={() => input.current?.click()} disabled={pending}>
          <FileText size={24} />
          <strong>No itinerary yet</strong>
          <span>Upload a PDF or image, up to 10 MB each.</span>
        </button>
      ) : (
        <ul className="file-list">
          {files.map((f) => {
            const image = f.mime_type?.startsWith("image/");
            return (
              <li key={f.id} className="file-row">
                {image && f.viewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="file-thumb" src={f.viewUrl} alt="" loading="lazy" />
                ) : (
                  <span className="file-icon">{image ? <ImageIcon size={18} /> : <FileText size={18} />}</span>
                )}
                <div className="file-meta">
                  <a href={f.viewUrl} target="_blank" rel="noreferrer" className="file-name">
                    {f.file_name}
                  </a>
                  <small>
                    {f.source === "aek" && (
                      <span className="aek-chip" title={AEK_TITLE}>
                        From AeK
                      </span>
                    )}
                    {[f.mime_type === "application/pdf" ? "PDF" : "Image", fileSize(f.size_bytes), formatDate(f.created_at), f.source === "aek" ? "" : (f.creator?.full_name ?? "")]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <div className="file-actions">
                  <a href={f.viewUrl} target="_blank" rel="noreferrer" className="icon-link" title="View">
                    <Eye size={16} />
                    <span className="sr-only">View {f.file_name}</span>
                  </a>
                  <a href={f.downloadUrl} className="icon-link" title="Download">
                    <Download size={16} />
                    <span className="sr-only">Download {f.file_name}</span>
                  </a>
                  {canManage && (
                    <button type="button" className="icon-link danger" title="Remove" disabled={pending} onClick={() => remove(f)}>
                      <Trash2 size={16} />
                      <span className="sr-only">Remove {f.file_name}</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FormError error={error} />
    </section>
  );
}

// ---------- AeK ----------

/** "Update from AeK" marker with what they sent. */
function AekNote({ children }: { children: ReactNode }) {
  return (
    <span className="aek-line">
      <span className="aek-chip" title={AEK_TITLE}>
        Update from AeK
      </span>
      <span>{children}</span>
    </span>
  );
}

function DateWithSource({ date, synced }: { date: string | null; synced: boolean }) {
  if (!date) return <>—</>;
  return (
    <span className="date-source">
      {fmtDay(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      {synced && (
        <span className="cal-chip" title="From the Google Calendar">
          <CalendarDays size={12} /> Google Calendar
        </span>
      )}
    </span>
  );
}

function AekTravel({
  date,
  recorded,
  time,
  travel,
  place,
}: {
  date: string | null;
  recorded: string | null;
  time: string | null;
  travel: string | null;
  place: string | null;
}) {
  const line = aekTravelLine(time, travel, place);
  if (!date && !line) return null;
  const moved = Boolean(date && recorded && date !== recorded);
  return (
    <AekNote>
      {[date && fmtDay(date, { weekday: "short", day: "numeric", month: "short" }), line].filter(Boolean).join(" · ")}
      {moved && (
        <em className="aek-differs" title="The AeK gave a different date from the Google Calendar. Update the calendar if theirs is right.">
          <AlertTriangle size={12} /> Different date from calendar
        </em>
      )}
    </AekNote>
  );
}

// ---------- Drivers (from the Region Guidance link) ----------

function DriversPanel({ drivers, hasLink }: { drivers: Driver[]; hasLink: boolean }) {
  const legs = [
    { key: "pickup" as const, label: "Airport pickup", icon: <PlaneLanding size={16} /> },
    { key: "dropoff" as const, label: "Airport drop-off", icon: <PlaneTakeoff size={16} /> },
  ];
  return (
    <section className="panel glass">
      <div className="panel-head">
        <div>
          <h2>Drivers</h2>
          <p className="muted-note">Added by the local operator through the Region Guidance link.</p>
        </div>
        <span className="region-chip">
          <MapPinned size={12} /> Region
        </span>
      </div>
      <div className="driver-legs">
        {legs.map((leg) => {
          const list = drivers.filter((x) => x.leg === leg.key);
          return (
            <div key={leg.key} className="driver-leg">
              <h3>
                {leg.icon} {leg.label}
                <span className="count-pill">{list.length}</span>
              </h3>
              {list.length === 0 ? (
                <p className="muted-note">{hasLink ? "None added yet." : "Share the Region Guidance link so the region can add drivers."}</p>
              ) : (
                <ul className="driver-list">
                  {list.map((x, i) => (
                    <li key={i}>
                      <span className="avatar driver-avatar" aria-hidden>
                        {(x.full_name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"}
                      </span>
                      <div>
                        <strong>{x.full_name ?? "Name not given"}</strong>
                        <small>
                          {x.aims ? <>AIMS {x.aims}</> : "No AIMS number"}
                          {x.phone && (
                            <>
                              {" · "}
                              <a href={telHref(x.phone)}>{x.phone}</a>
                            </>
                          )}
                        </small>
                      </div>
                      {x.phone && (
                        <a className="icon-link" href={telHref(x.phone)} title={`Call ${x.full_name ?? "driver"}`}>
                          <Phone size={16} />
                          <span className="sr-only">Call</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
