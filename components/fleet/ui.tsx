"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, ImageIcon, Paperclip, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_FILES, MAX_FILE_BYTES, fileSize, type FileKind, type FleetFile } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { deleteFile, registerFile, type Result } from "@/app/(portal)/fleet/actions";

// ---------- Pop-up form ----------

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-label={title}>
      <div className="sheet-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => ref.current?.close()}>
          <X size={18} />
          <span className="sr-only">Close</span>
        </button>
      </div>
      {children}
    </dialog>
  );
}

/** Runs a server action, keeping track of pending state and any error message. */
export function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result | void>, onOk?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && r.error) setError(r.error);
      else onOk?.();
    });
  };
  return { pending, error, setError, run };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
}

// ---------- Uploads ----------

const TYPES_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Uploads one file straight to private storage, then records it. Returns an error message or null. */
export async function uploadFleetFile(o: {
  vehicleId: string;
  kind: FileKind;
  file: File;
  expiresOn?: string | null;
  maintenanceId?: string | null;
  incidentId?: string | null;
}): Promise<string | null> {
  const ext = o.file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = o.file.type || TYPES_BY_EXT[ext] || "";
  if (!ACCEPTED_FILES.split(",").includes(type)) return `${o.file.name} isn't a PDF or image.`;
  if (o.file.size > MAX_FILE_BYTES) return `${o.file.name} is over 10 MB.`;

  const safe = o.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${o.vehicleId}/${o.kind}/${crypto.randomUUID()}-${safe}`;
  const { error } = await createClient().storage.from("fleet").upload(path, o.file, { contentType: type, upsert: false });
  if (error) return `Couldn't upload ${o.file.name}: ${error.message}`;

  const res = await registerFile({
    vehicleId: o.vehicleId,
    kind: o.kind,
    path,
    fileName: o.file.name,
    mimeType: type,
    size: o.file.size,
    expiresOn: o.expiresOn ?? null,
    maintenanceId: o.maintenanceId ?? null,
    incidentId: o.incidentId ?? null,
  });
  return res.error ?? null;
}

export function UploadButton({
  vehicleId,
  kind,
  maintenanceId,
  incidentId,
  label = "Upload",
  askExpiry = false,
  multiple = false,
  small = false,
}: {
  vehicleId: string;
  kind: FileKind;
  maintenanceId?: string;
  incidentId?: string;
  label?: string;
  askExpiry?: boolean;
  multiple?: boolean;
  small?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[] | null>(null);
  const [expiry, setExpiry] = useState("");
  const { pending, error, setError, run } = useRun();

  const upload = (files: File[]) =>
    run(
      async () => {
        for (const file of files) {
          const err = await uploadFleetFile({ vehicleId, kind, file, expiresOn: expiry || null, maintenanceId, incidentId });
          if (err) return { error: err };
        }
      },
      () => {
        setChosen(null);
        setExpiry("");
        router.refresh();
      },
    );

  return (
    <div className="upload">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_FILES}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          setError(null);
          if (askExpiry) setChosen(files);
          else upload(files);
        }}
      />

      {chosen ? (
        <div className="upload-confirm">
          <span className="upload-name">
            <Paperclip size={14} /> {chosen.map((f) => f.name).join(", ")}
          </span>
          <label className="mini-field">
            Expiry date
            <input type="date" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </label>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => upload(chosen)}>
              {pending ? "Uploading…" : "Save document"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setChosen(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`btn ${small ? "btn-ghost btn-sm" : ""}`}
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          <Upload size={small ? 15 : 17} />
          {pending ? "Uploading…" : label}
        </button>
      )}
      <FormError error={error} />
    </div>
  );
}

// ---------- File lists ----------

function isImage(f: FleetFile) {
  return Boolean(f.mime_type?.startsWith("image/"));
}

export function FileList({
  files,
  vehicleId,
  canDelete,
  thumbs = false,
  empty,
}: {
  files: FleetFile[];
  vehicleId: string;
  canDelete: boolean;
  thumbs?: boolean;
  empty?: string;
}) {
  const { pending, error, run } = useRun();

  const remove = (f: FleetFile) => {
    if (!window.confirm(`Remove ${f.file_name}? This can't be undone.`)) return;
    run(() => deleteFile(vehicleId, f.id));
  };

  if (!files.length) return empty ? <p className="muted-note">{empty}</p> : null;

  if (thumbs) {
    return (
      <>
        <div className="thumbs">
          {files.map((f) => (
            <div key={f.id} className="thumb">
              <a href={f.viewUrl} target="_blank" rel="noreferrer" title={f.file_name}>
                {isImage(f) && f.viewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.viewUrl} alt={f.file_name} loading="lazy" />
                ) : (
                  <span className="thumb-icon">
                    <FileText size={26} />
                  </span>
                )}
              </a>
              <div className="thumb-actions">
                <a href={f.downloadUrl} className="icon-link" title="Download">
                  <Download size={14} />
                  <span className="sr-only">Download {f.file_name}</span>
                </a>
                {canDelete && (
                  <button type="button" className="icon-link danger" title="Remove" disabled={pending} onClick={() => remove(f)}>
                    <Trash2 size={14} />
                    <span className="sr-only">Remove {f.file_name}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <FormError error={error} />
      </>
    );
  }

  return (
    <>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.id} className="file-row">
            <span className="file-icon">{isImage(f) ? <ImageIcon size={18} /> : <FileText size={18} />}</span>
            <div className="file-meta">
              <a href={f.viewUrl} target="_blank" rel="noreferrer" className="file-name">
                {f.file_name}
              </a>
              <small>
                {[
                  f.mime_type === "application/pdf" ? "PDF" : "Image",
                  fileSize(f.size_bytes),
                  formatDate(f.created_at),
                  f.creator?.full_name ?? "",
                ]
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
              {canDelete && (
                <button type="button" className="icon-link danger" title="Remove" disabled={pending} onClick={() => remove(f)}>
                  <Trash2 size={16} />
                  <span className="sr-only">Remove {f.file_name}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <FormError error={error} />
    </>
  );
}
