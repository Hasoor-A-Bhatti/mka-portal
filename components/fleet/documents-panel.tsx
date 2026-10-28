"use client";

import { useState } from "react";
import { CalendarClock, FileCheck2, ShieldCheck, Wrench } from "lucide-react";
import { DOC_KINDS, daysUntil, docState, type DocKind, type FleetFile } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { updateFileExpiry } from "@/app/(portal)/fleet/actions";
import { Pill } from "./bits";
import { FileList, FormError, UploadButton, useRun } from "./ui";

const ICONS: Record<DocKind, typeof ShieldCheck> = {
  insurance: ShieldCheck,
  mot: Wrench,
  road_tax: FileCheck2,
};

export function DocumentsPanel({
  vehicleId,
  files,
  canManage,
}: {
  vehicleId: string;
  files: FleetFile[];
  canManage: boolean;
}) {
  return (
    <div className="doc-grid">
      {DOC_KINDS.map(({ kind, label }) => {
        const all = files
          .filter((f) => f.kind === kind)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const [current, ...older] = all;
        const state = docState(current);
        const Icon = ICONS[kind];
        return (
          <section key={kind} className="panel glass doc-card">
            <div className="doc-head">
              <span className="doc-icon">
                <Icon size={20} />
              </span>
              <div>
                <h2>{label}</h2>
                <ExpiryLine file={current} />
              </div>
              <Pill value={state} />
            </div>

            {current ? (
              <FileList files={[current]} vehicleId={vehicleId} canDelete={canManage} />
            ) : (
              <p className="muted-note">No {label.toLowerCase()} document uploaded yet.</p>
            )}

            {canManage && (
              <div className="doc-actions">
                <UploadButton vehicleId={vehicleId} kind={kind} askExpiry label={current ? "Upload new version" : `Upload ${label.toLowerCase()}`} />
                {current && <ExpiryEditor vehicleId={vehicleId} file={current} />}
              </div>
            )}

            {older.length > 0 && (
              <details className="history">
                <summary>Previous versions ({older.length})</summary>
                <FileList files={older} vehicleId={vehicleId} canDelete={canManage} />
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ExpiryLine({ file }: { file?: FleetFile }) {
  if (!file) return <p className="doc-sub">Nothing on file</p>;
  if (!file.expires_on) return <p className="doc-sub">No expiry date set</p>;
  const d = daysUntil(file.expires_on);
  const when = d < 0 ? `${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`;
  return (
    <p className="doc-sub">
      {d < 0 ? "Expired" : "Expires"} {formatDate(file.expires_on)} ({when})
    </p>
  );
}

function ExpiryEditor({ vehicleId, file }: { vehicleId: string; file: FleetFile }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(file.expires_on ?? "");
  const { pending, error, run } = useRun();

  if (!editing) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
        <CalendarClock size={16} />
        {file.expires_on ? "Change expiry" : "Set expiry"}
      </button>
    );
  }
  return (
    <div className="upload-confirm">
      <label className="mini-field">
        Expiry date
        <input type="date" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => updateFileExpiry(vehicleId, file.id, value || null), () => setEditing(false))}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      <FormError error={error} />
    </div>
  );
}
