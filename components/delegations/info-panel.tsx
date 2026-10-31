"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  Bus,
  CalendarDays,
  ChevronRight,
  Download,
  Eye,
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
import { dayRange, daysLabel, fromCalendar, type Delegation, type DelegationFile } from "@/lib/delegations";
import { formatDate } from "@/lib/format";
import { vars } from "@/lib/css";
import { createClient } from "@/lib/supabase/client";
import { deleteItinerary, registerItinerary, saveDelegationInfo } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";

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

export function InfoPanel({
  delegation: d,
  files,
  summary,
  canManage,
}: {
  delegation: Delegation;
  files: DelegationFile[];
  summary: PlanSummary;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const base = `/delegations/${d.id}`;
  const phoneHref = d.head_contact ? `tel:${d.head_contact.replace(/[^+\d]/g, "")}` : null;

  return (
    <div className="split">
      <div className="stack">
        <section className="panel glass">
          <div className="panel-head">
            <h2>Delegation details</h2>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit details
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
            </div>
          </div>

          <dl className="kv">
            <dt>Delegation</dt>
            <dd>{d.name}</dd>
            <dt>Country</dt>
            <dd>{d.country ?? "—"}</dd>
            <dt>Members</dt>
            <dd className="tnum">{d.members ?? "—"}</dd>
            <dt>Venue</dt>
            <dd>{d.venue ?? "—"}</dd>
            <dt>Arrives</dt>
            <dd>{d.arrival_date ? formatDate(d.arrival_date) : "—"}</dd>
            <dt>Departs</dt>
            <dd>{d.departure_date ? formatDate(d.departure_date) : "—"}</dd>
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
          </dl>
          {fromCalendar(d) && (
            <p className="muted-note sync-line">
              <CalendarDays size={14} /> Name and dates come from the Google Calendar.
            </p>
          )}
        </section>

        <ItineraryPanel delegationId={d.id} files={files} canManage={canManage} />
      </div>

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
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => input.current?.click()}>
          <Upload size={15} /> {pending ? "Uploading…" : "Upload itinerary"}
        </button>
      </div>

      {files.length === 0 ? (
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
                    {[f.mime_type === "application/pdf" ? "PDF" : "Image", fileSize(f.size_bytes), formatDate(f.created_at), f.creator?.full_name ?? ""]
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
