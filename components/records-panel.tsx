"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { getDepartment, statusTone, type Department, type Field } from "@/lib/departments";
import { formatDate, formatDateTime } from "@/lib/format";
import { deleteRecord, saveRecord, type SaveState } from "@/app/(portal)/[dept]/actions";
import { vars } from "@/lib/css";

export type RecordRow = {
  id: string;
  created_at: string;
  updated_at: string;
  creator: { full_name: string | null } | null;
  editor: { full_name: string | null } | null;
  [column: string]: unknown;
};

type Props = { slug: string; rows: RecordRow[]; canDelete: boolean };

export function RecordsPanel({ slug, rows, canDelete }: Props) {
  const dept = getDepartment(slug)!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: RecordRow | null; key: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const columns = dept.fields.filter((f) => f.inTable);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const s = String(r[dept.statusField] ?? "");
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return m;
  }, [rows, dept.statusField]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r[dept.statusField] !== status) return false;
      if (!q) return true;
      return dept.fields.some((f) => String(r[f.name] ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, status, dept]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const open = (row: RecordRow | null) => setEditing({ row, key: Date.now() });

  return (
    <section className="panel glass">
      <div className="panel-head">
        <h2>{capitalise(dept.plural)}</h2>
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <span className="sr-only">Search {dept.plural}</span>
            <input
              className="input"
              type="search"
              placeholder={`Search ${dept.plural}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => open(null)}>
            <Plus size={18} />
            New {dept.noun}
          </button>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={status === null} onClick={() => setStatus(null)}>
          All <em>{rows.length}</em>
        </button>
        {dept.statuses.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? null : s)}
          >
            {s} <em>{counts.get(s) ?? 0}</em>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <strong>No {dept.plural} yet</strong>
          Add the first one and it'll appear here, along with who added it.
          <div>
            <button type="button" className="btn btn-primary" onClick={() => open(null)}>
              <Plus size={18} />
              New {dept.noun}
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <strong>No matches</strong>
          Try a different search or clear the status filter.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.name}>{c.label}</th>
                ))}
                <th>Status</th>
                <th>Last edited</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => open(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(r);
                    }
                  }}
                  aria-label={`Edit ${String(r[dept.titleField] ?? dept.noun)}`}
                >
                  {columns.map((c) => (
                    <td key={c.name}>{renderCell(c, r[c.name])}</td>
                  ))}
                  <td>
                    <StatusPill value={r[dept.statusField]} />
                  </td>
                  <td className="who">
                    {r.editor?.full_name ?? r.creator?.full_name ?? "Unknown"}
                    <small>{formatDateTime(r.updated_at)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RecordDialog
          key={editing.key}
          dept={dept}
          row={editing.row}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setToast(message);
          }}
        />
      )}

      {toast && (
        <div className="toast glass glass-strong" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

function RecordDialog({
  dept,
  row,
  canDelete,
  onClose,
  onDone,
}: {
  dept: Department;
  row: RecordRow | null;
  canDelete: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<SaveState, FormData>(
    saveRecord.bind(null, dept.slug, row?.id ?? null),
    {},
  );
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const noun = capitalise(dept.noun);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (state.ok) onDone(row ? `${noun} saved` : `${noun} added`);
  }, [state.ok, state.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = () => {
    if (!row) return;
    const title = String(row[dept.titleField] ?? `this ${dept.noun}`);
    if (!window.confirm(`Remove ${title}? This can't be undone, but it stays in the activity log.`)) return;
    startDelete(async () => {
      const res = await deleteRecord(dept.slug, row.id);
      if (res.ok) onDone(`${noun} removed`);
      else setDeleteError(res.error ?? "Couldn't remove it.");
    });
  };

  const error = state.error ?? deleteError;

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="sheet-title"
    >
      <form action={action}>
        <div className="sheet-head">
          <div>
            <h2 id="sheet-title">{row ? `Edit ${dept.noun}` : `New ${dept.noun}`}</h2>
            {row && (
              <p>
                Added by {row.creator?.full_name ?? "unknown"} on {formatDateTime(row.created_at)}
                {row.editor?.full_name && row.updated_at !== row.created_at && (
                  <>. Last edited by {row.editor.full_name} on {formatDateTime(row.updated_at)}</>
                )}
                .
              </p>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => ref.current?.close()}>
            <X size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="sheet-body">
          {dept.fields.map((f) => (
            <div key={f.name} className={`field ${f.wide || f.type === "textarea" ? "wide" : ""}`}>
              <label htmlFor={`f-${f.name}`}>
                {f.label}
                {f.required && <span className="req" aria-hidden>*</span>}
              </label>
              <Control field={f} value={row ? row[f.name] : undefined} dept={dept} />
            </div>
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="sheet-foot">
          {row && canDelete && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove} disabled={deleting}>
              {deleting ? "Removing…" : `Remove ${dept.noun}`}
            </button>
          )}
          <div className="right">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : row ? "Save changes" : `Add ${dept.noun}`}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

function Control({ field, value, dept }: { field: Field; value: unknown; dept: Department }) {
  const id = `f-${field.name}`;
  const common = { id, name: field.name, required: field.required };
  const str = value === null || value === undefined ? "" : String(value);

  switch (field.type) {
    case "textarea":
      return <textarea {...common} className="textarea" defaultValue={str} placeholder={field.placeholder} />;
    case "select": {
      const fallback = field.name === dept.statusField ? dept.statuses[0] : "";
      return (
        <select {...common} className="select" defaultValue={str || fallback}>
          {!field.required && <option value="">Not set</option>}
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case "number":
      return <input {...common} type="number" min={0} step={1} inputMode="numeric" className="input" defaultValue={str} />;
    case "date":
      return <input {...common} type="date" className="input" defaultValue={str.slice(0, 10)} />;
    default:
      return <input {...common} type="text" className="input" defaultValue={str} placeholder={field.placeholder} />;
  }
}

function StatusPill({ value }: { value: unknown }) {
  if (!value) return null;
  return (
    <span className="status" style={vars({ "--tone": statusTone(value) })}>
      {String(value)}
    </span>
  );
}

function renderCell(field: Field, value: unknown) {
  if (value === null || value === undefined || value === "") return <span style={{ color: "var(--muted)" }}>—</span>;
  if (field.type === "date") return formatDate(value);
  return String(value);
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
