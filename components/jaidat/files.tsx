"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Eye, FileSpreadsheet, FileText, ImageIcon, Link2, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_FILES, DOC_CATEGORIES, EVIDENCE_STATUSES, MAX_FILE_BYTES, fileKind, fileSize, todayISO, type JaidatFile } from "@/lib/jaidat";
import { formatDate } from "@/lib/format";
import { deleteFile, registerFile, saveLink, updateFile, type NewFile } from "@/app/(portal)/jaidat/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";
import { Pill } from "./bits";

const TYPES_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type Links = NewFile["links"];

/** Uploads one file to private storage, then records it. Returns an error message or null. */
async function upload(o: { propertyId: string | null; file: File; title: string; category: string; expiresOn: string | null; links?: Links }) {
  const ext = o.file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = o.file.type || TYPES_BY_EXT[ext] || "";
  if (!ACCEPTED_FILES.split(",").includes(type)) return `${o.file.name} isn't a PDF, image, Word or Excel file.`;
  if (o.file.size > MAX_FILE_BYTES) return `${o.file.name} is over 15 MB.`;
  const safe = o.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${o.propertyId ?? "general"}/${crypto.randomUUID()}-${safe}`;
  const { error } = await createClient().storage.from("jaidat").upload(path, o.file, { contentType: type, upsert: false });
  if (error) return `Couldn't upload ${o.file.name}: ${error.message}`;
  const res = await registerFile({
    propertyId: o.propertyId,
    path,
    fileName: o.file.name,
    mimeType: type,
    size: o.file.size,
    title: o.title,
    category: o.category,
    expiresOn: o.expiresOn,
    links: o.links,
  });
  return res.error ?? null;
}

/**
 * "Add document" button: upload a file or save a Google Drive link.
 * Opens a small form for the title, category and expiry date.
 */
export function AddDocument({
  propertyId,
  links,
  category = "Other",
  label = "Add document",
  small = false,
  title: suggested = "",
}: {
  propertyId: string | null;
  links?: Links;
  category?: string;
  label?: string;
  small?: boolean;
  title?: string;
}) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button type="button" className={`btn ${small ? "btn-ghost btn-sm" : ""}`} onClick={() => setOpen(true)}>
        <Paperclip size={small ? 15 : 17} /> {label}
      </button>
      {open && <DocumentDialog propertyId={propertyId} links={links} category={category} suggested={suggested} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocumentDialog({
  propertyId,
  links,
  category,
  suggested,
  onClose,
}: {
  propertyId: string | null;
  links?: Links;
  category: string;
  suggested: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [files, setFiles] = useState<File[]>([]);
  const { pending, error, setError, run } = useRun();

  return (
    <Sheet title="Add a document" subtitle="Upload a file, or save a link to it in the restricted Google Drive folder." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (mode === "link") {
            run(() => saveLink(propertyId, links, fd), () => (router.refresh(), onClose()));
            return;
          }
          if (!files.length) {
            setError("Choose a file first.");
            return;
          }
          const title = String(fd.get("title") ?? "");
          const cat = String(fd.get("category") ?? "Other");
          const expires = String(fd.get("expires_on") ?? "") || null;
          run(
            async () => {
              for (const file of files) {
                const err = await upload({ propertyId, file, title: files.length > 1 ? "" : title, category: cat, expiresOn: expires, links });
                if (err) return { error: err };
              }
            },
            () => (router.refresh(), onClose()),
          );
        }}
      >
        <div className="sheet-body">
          <div className="wide jd-seg" role="group" aria-label="Upload or link">
            <button type="button" className="chip" aria-pressed={mode === "file"} onClick={() => setMode("file")}>
              <Upload size={14} /> Upload a file
            </button>
            <button type="button" className="chip" aria-pressed={mode === "link"} onClick={() => setMode("link")}>
              <Link2 size={14} /> Google Drive link
            </button>
          </div>

          {mode === "file" ? (
            <div className="field wide">
              <input
                ref={input}
                type="file"
                accept={ACCEPTED_FILES}
                multiple
                hidden
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button type="button" className="dropzone" onClick={() => input.current?.click()}>
                <Upload size={18} />
                {files.length ? files.map((f) => f.name).join(", ") : "Choose files (PDF, image, Word or Excel, up to 15 MB)"}
              </button>
            </div>
          ) : (
            <div className="field wide">
              <label htmlFor="doc-link">
                Link<span className="req">*</span>
              </label>
              <input id="doc-link" name="link_url" type="url" className="input" required placeholder="https://drive.google.com/…" />
              <small className="muted-note">Use a restricted link, so only named people can open it.</small>
            </div>
          )}

          <div className="field wide">
            <label htmlFor="doc-title">Title{mode === "link" && <span className="req">*</span>}</label>
            <input
              id="doc-title"
              name="title"
              className="input"
              required={mode === "link"}
              defaultValue={suggested}
              placeholder={mode === "file" ? "Leave blank to use the file name" : "e.g. Lease agreement 2024"}
            />
          </div>
          <div className="field">
            <label htmlFor="doc-cat">Category</label>
            <select id="doc-cat" name="category" className="select" defaultValue={category}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="doc-exp">Expiry date</label>
            <input id="doc-exp" name="expires_on" type="date" className="input" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save document"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function Icon({ f }: { f: JaidatFile }) {
  const k = fileKind(f);
  if (k === "Image") return <ImageIcon size={18} />;
  if (k === "Excel") return <FileSpreadsheet size={18} />;
  if (k === "Link") return <Link2 size={18} />;
  return <FileText size={18} />;
}

/** A list of documents with view, download, edit and remove. */
export function DocList({
  files,
  canDelete,
  empty,
  showProperty,
  compact = false,
}: {
  files: JaidatFile[];
  canDelete: boolean;
  empty?: string;
  showProperty?: (id: string | null) => string;
  compact?: boolean;
}) {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<JaidatFile | null>(null);
  const { pending, error, run } = useRun();
  const today = todayISO();

  if (!files.length) return empty ? <p className="muted-note">{empty}</p> : null;

  return (
    <>
      <ul className="file-list">
        {files.map((f) => {
          const href = f.link_url ?? f.viewUrl;
          const expired = f.expires_on && f.expires_on < today;
          return (
            <li key={f.id} className="file-row">
              <span className="file-icon">
                <Icon f={f} />
              </span>
              <div className="file-meta">
                <a href={href} target="_blank" rel="noreferrer" className="file-name">
                  {f.title}
                </a>
                <small>
                  {[
                    showProperty ? showProperty(f.property_id) : null,
                    compact ? null : f.category,
                    fileKind(f),
                    fileSize(f.size_bytes),
                    f.expires_on ? `${expired ? "Expired" : "Expires"} ${formatDate(f.expires_on)}` : null,
                    compact ? null : formatDate(f.created_at),
                    compact ? null : f.creator?.full_name,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </div>
              <div className="file-actions">
                {!compact && f.verification === "Verified" && <Pill value="Verified" />}
                {expired && <Pill value="Expired" />}
                <a href={href} target="_blank" rel="noreferrer" className="icon-link" title={f.link_url ? "Open link" : "View"}>
                  {f.link_url ? <ExternalLink size={16} /> : <Eye size={16} />}
                  <span className="sr-only">Open {f.title}</span>
                </a>
                {f.downloadUrl && (
                  <a href={f.downloadUrl} className="icon-link" title="Download">
                    <Download size={16} />
                    <span className="sr-only">Download {f.title}</span>
                  </a>
                )}
                {canEdit && (
                  <button type="button" className="icon-link" title="Edit details" onClick={() => setEditing(f)}>
                    <Pencil size={15} />
                    <span className="sr-only">Edit {f.title}</span>
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="icon-link danger"
                    title="Remove"
                    disabled={pending}
                    onClick={() => window.confirm(`Remove ${f.title}? This can't be undone.`) && run(() => deleteFile(f.id))}
                  >
                    <Trash2 size={15} />
                    <span className="sr-only">Remove {f.title}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <FormError error={error} />
      {editing && <EditDocument file={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditDocument({ file, onClose }: { file: JaidatFile; onClose: () => void }) {
  const { pending, error, run } = useRun();
  return (
    <Sheet title="Edit document" subtitle={file.file_name ?? file.link_url ?? undefined} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => updateFile(file.id, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="ef-title">
              Title<span className="req">*</span>
            </label>
            <input id="ef-title" name="title" className="input" required defaultValue={file.title} />
          </div>
          <div className="field">
            <label htmlFor="ef-cat">Category</label>
            <select id="ef-cat" name="category" className="select" defaultValue={file.category}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ef-ver">Checked</label>
            <select id="ef-ver" name="verification" className="select" defaultValue={file.verification}>
              {EVIDENCE_STATUSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ef-exp">Expiry date</label>
            <input id="ef-exp" name="expires_on" type="date" className="input" defaultValue={file.expires_on ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ef-v">Version</label>
            <input id="ef-v" name="version" className="input" defaultValue={file.version ?? ""} placeholder="1.0" />
          </div>
          <div className="field wide">
            <label htmlFor="ef-notes">Notes</label>
            <textarea id="ef-notes" name="notes" className="textarea" defaultValue={file.notes ?? ""} />
          </div>
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
