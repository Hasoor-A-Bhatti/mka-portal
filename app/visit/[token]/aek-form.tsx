"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, PlaneLanding, PlaneTakeoff, Upload, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_FILES, MAX_FILE_BYTES } from "@/lib/fleet";
import type { AekUpdate } from "@/lib/delegations";
import { registerAekFile, submitAek } from "./actions";

export type AekView = {
  delegation: {
    id: string;
    name: string;
    country: string | null;
    members: number | null;
    head_of_delegation: string | null;
    head_contact: string | null;
    arrival_date: string | null;
    departure_date: string | null;
  };
  update: AekUpdate | null;
  files: { name: string; at: string }[];
};

const TYPES_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export function AekForm({ token, view }: { token: string; view: AekView }) {
  const router = useRouter();
  const d = view.delegation;
  const u = view.update;
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState<string[]>([]);

  // What they sent before, otherwise what we have on record.
  const v = {
    arrival_date: u?.arrival_date ?? d.arrival_date ?? "",
    arrival_time: u?.arrival_time?.slice(0, 5) ?? "",
    arrival_travel: u?.arrival_travel ?? "",
    arrival_place: u?.arrival_place ?? "",
    departure_date: u?.departure_date ?? d.departure_date ?? "",
    departure_time: u?.departure_time?.slice(0, 5) ?? "",
    departure_travel: u?.departure_travel ?? "",
    departure_place: u?.departure_place ?? "",
    head_name: u?.head_name ?? d.head_of_delegation ?? "",
    head_contact: u?.head_contact ?? d.head_contact ?? "",
    members: u?.members ?? d.members ?? "",
    notes: u?.notes ?? "",
  };

  const upload = async (files: File[]) => {
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const type = file.type || TYPES_BY_EXT[ext] || "";
        if (!ACCEPTED_FILES.split(",").includes(type)) throw new Error(`${file.name} isn't a PDF or image.`);
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 10 MB.`);
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${d.id}/aek/${token}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await createClient()
          .storage.from("delegations")
          .upload(path, file, { contentType: type, upsert: false });
        if (upErr) throw new Error(`Couldn't upload ${file.name}. Please try again.`);
        const res = await registerAekFile(token, { path, fileName: file.name, mimeType: type, size: file.size });
        if (res.error) throw new Error(res.error);
        setJustUploaded((n) => [...n, file.name]);
      }
      router.refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const allFiles = [...view.files.map((f) => f.name), ...justUploaded.filter((n) => !view.files.some((f) => f.name === n))];

  return (
    <>
      <form
        className="visit-card glass glass-strong visit-form"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setSaved(false);
          startSave(async () => {
            const res = await submitAek(token, fd);
            if (res.error) setError(res.error);
            else {
              setSaved(true);
              router.refresh();
            }
          });
        }}
        onChange={() => setSaved(false)}
      >
        <fieldset className="visit-group">
          <legend>
            <PlaneLanding size={18} /> Arrival in the UK
          </legend>
          <div className="visit-grid">
            <Field label="Date" htmlFor="a-date">
              <input id="a-date" name="arrival_date" type="date" className="input" defaultValue={v.arrival_date} />
            </Field>
            <Field label="Time (UK time)" htmlFor="a-time">
              <input id="a-time" name="arrival_time" type="time" className="input" defaultValue={v.arrival_time} />
            </Field>
            <Field label="Flight, train or coach number" htmlFor="a-travel">
              <input id="a-travel" name="arrival_travel" className="input" maxLength={120} placeholder="e.g. LH 920" defaultValue={v.arrival_travel} />
            </Field>
            <Field label="Arriving at" htmlFor="a-place">
              <input id="a-place" name="arrival_place" className="input" maxLength={120} placeholder="e.g. Heathrow Terminal 2" defaultValue={v.arrival_place} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="visit-group">
          <legend>
            <PlaneTakeoff size={18} /> Departure from the UK
          </legend>
          <div className="visit-grid">
            <Field label="Date" htmlFor="d-date">
              <input id="d-date" name="departure_date" type="date" className="input" defaultValue={v.departure_date} />
            </Field>
            <Field label="Time (UK time)" htmlFor="d-time">
              <input id="d-time" name="departure_time" type="time" className="input" defaultValue={v.departure_time} />
            </Field>
            <Field label="Flight, train or coach number" htmlFor="d-travel">
              <input id="d-travel" name="departure_travel" className="input" maxLength={120} placeholder="e.g. LH 923" defaultValue={v.departure_travel} />
            </Field>
            <Field label="Leaving from" htmlFor="d-place">
              <input id="d-place" name="departure_place" className="input" maxLength={120} placeholder="e.g. Heathrow Terminal 2" defaultValue={v.departure_place} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="visit-group">
          <legend>
            <UserRound size={18} /> Amir-e-Kafla (head of delegation)
          </legend>
          <div className="visit-grid">
            <Field label="Full name" htmlFor="h-name">
              <input id="h-name" name="head_name" className="input" maxLength={120} autoComplete="name" defaultValue={v.head_name} />
            </Field>
            <Field label="Mobile number, with country code" htmlFor="h-phone">
              <input
                id="h-phone"
                name="head_contact"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="input"
                maxLength={40}
                placeholder="+49 151 2345 6789"
                defaultValue={v.head_contact}
              />
            </Field>
            <Field label="Number of people in the group" htmlFor="h-members">
              <input id="h-members" name="members" type="number" min={0} max={2000} inputMode="numeric" className="input tnum" defaultValue={v.members} />
            </Field>
          </div>
          <Field label="Anything we should know?" htmlFor="h-notes" hint="Dietary or medical needs, accessibility, special requests.">
            <textarea id="h-notes" name="notes" className="textarea" maxLength={2000} rows={4} defaultValue={v.notes} />
          </Field>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="visit-submit">
          {saved && (
            <span className="visit-saved" role="status">
              <CheckCircle2 size={17} /> Sent to the MKA Delegations team. JazakAllah.
            </span>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Sending…" : u ? "Update my details" : "Send my details"}
          </button>
        </div>
      </form>

      <section className="visit-card glass glass-strong">
        <div className="visit-files-head">
          <div>
            <h2>Itinerary</h2>
            <p className="visit-lead">Your schedule, tickets or travel plans. PDFs or photos, up to 10 MB each.</p>
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
              if (chosen.length) upload(chosen);
            }}
          />
          <button type="button" className="btn" disabled={uploading} onClick={() => input.current?.click()}>
            <Upload size={16} /> {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {allFiles.length > 0 ? (
          <ul className="visit-files">
            {allFiles.map((name, i) => (
              <li key={`${name}-${i}`}>
                <FileText size={16} /> <span>{name}</span> <CheckCircle2 size={15} className="ok" aria-label="received" />
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className="dropzone" onClick={() => input.current?.click()} disabled={uploading}>
            <FileText size={24} />
            <strong>No itinerary uploaded yet</strong>
            <span>Tap to choose a file</span>
          </button>
        )}
        {uploadError && (
          <p className="form-error" role="alert">
            {uploadError}
          </p>
        )}
      </section>
    </>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}
