"use client";

import { useState } from "react";
import { CalendarDays, Check, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { TASK_STATUSES, daysUntil, money, num, taskStatus, todayISO, type FleetFile, type Task } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { deleteTask, saveTask } from "@/app/(portal)/fleet/actions";
import { Pill } from "./bits";
import { FileList, FormError, Sheet, UploadButton, useRun } from "./ui";

const ORDER: Record<string, number> = { Overdue: 0, Pending: 1, Completed: 2 };

export function MaintenancePanel({
  vehicleId,
  tasks,
  receipts,
  canManage,
}: {
  vehicleId: string;
  tasks: Task[];
  receipts: FleetFile[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ task: Task | null } | null>(null);
  const year = todayISO().slice(0, 4);

  const withStatus = tasks.map((t) => ({ ...t, effective: taskStatus(t) }));
  const sorted = withStatus.sort(
    (a, b) =>
      ORDER[a.effective]! - ORDER[b.effective]! ||
      (a.effective === "Completed"
        ? (b.completed_on ?? "").localeCompare(a.completed_on ?? "")
        : (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
  );

  const overdue = withStatus.filter((t) => t.effective === "Overdue").length;
  const pending = withStatus.filter((t) => t.effective === "Pending").length;
  const spent = withStatus
    .filter((t) => t.status === "Completed" && (t.completed_on ?? t.due_date ?? "").startsWith(year))
    .reduce((n, t) => n + num(t.cost), 0);
  const upcoming = withStatus.filter((t) => t.status !== "Completed").reduce((n, t) => n + num(t.cost), 0);

  return (
    <>
      <section className="stats" aria-label="Maintenance summary">
        <div className="stat glass">
          <strong style={{ color: overdue ? "var(--danger)" : undefined }}>{overdue}</strong>
          <span>overdue</span>
        </div>
        <div className="stat glass">
          <strong>{pending}</strong>
          <span>pending</span>
        </div>
        <div className="stat glass">
          <strong>{money(spent)}</strong>
          <span>spent in {year}</span>
        </div>
        <div className="stat glass">
          <strong>{money(upcoming)}</strong>
          <span>still to pay</span>
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <h2>Maintenance tasks</h2>
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ task: null })}>
              <Plus size={18} />
              Add task
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="empty">
            <strong>No maintenance tasks</strong>
            Add services, repairs and checks here, with their cost and receipts.
          </div>
        ) : (
          <ul className="task-list">
            {sorted.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                effective={t.effective}
                vehicleId={vehicleId}
                receipts={receipts.filter((r) => r.maintenance_id === t.id)}
                canManage={canManage}
                onEdit={() => setEditing({ task: t })}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && <TaskDialog vehicleId={vehicleId} task={editing.task} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaskRow({
  task,
  effective,
  vehicleId,
  receipts,
  canManage,
  onEdit,
}: {
  task: Task;
  effective: string;
  vehicleId: string;
  receipts: FleetFile[];
  canManage: boolean;
  onEdit: () => void;
}) {
  const { pending, error, run } = useRun();

  const complete = () => {
    const fd = new FormData();
    fd.set("description", task.description);
    fd.set("due_date", task.due_date ?? "");
    fd.set("status", "Completed");
    fd.set("cost", task.cost === null ? "" : String(task.cost));
    fd.set("notes", task.notes ?? "");
    run(() => saveTask(vehicleId, task.id, fd));
  };

  const remove = () => {
    if (!window.confirm(`Remove "${task.description}" and its receipts?`)) return;
    run(() => deleteTask(vehicleId, task.id));
  };

  let when = "";
  if (effective === "Completed") when = task.completed_on ? `Completed ${formatDate(task.completed_on)}` : "Completed";
  else if (task.due_date) {
    const d = daysUntil(task.due_date);
    when = `Due ${formatDate(task.due_date)}${d < 0 ? ` (${-d} day${d === -1 ? "" : "s"} late)` : d === 0 ? " (today)" : d <= 14 ? ` (in ${d} day${d === 1 ? "" : "s"})` : ""}`;
  } else when = "No date set";

  return (
    <li className={`task is-${effective.toLowerCase()}`}>
      <div className="task-main">
        <div className="task-title">
          <strong>{task.description}</strong>
          <Pill value={effective} />
        </div>
        <div className="task-meta">
          <span>
            <CalendarDays size={14} /> {when}
          </span>
          <span className="tnum">{task.cost === null ? "No price" : money(num(task.cost))}</span>
        </div>
        {task.notes && <p className="task-notes">{task.notes}</p>}

        <div className="task-receipts">
          <span className="label">
            <Receipt size={14} /> Receipts
          </span>
          <FileList files={receipts} vehicleId={vehicleId} canDelete={canManage} empty="None uploaded" />
          {canManage && <UploadButton vehicleId={vehicleId} kind="receipt" maintenanceId={task.id} multiple small label="Upload receipt" />}
        </div>
        <FormError error={error} />
      </div>

      {canManage && (
        <div className="task-actions">
          {effective !== "Completed" && (
            <button type="button" className="btn btn-sm" onClick={complete} disabled={pending}>
              <Check size={15} /> Mark done
            </button>
          )}
          <button type="button" className="icon-link" title="Edit task" onClick={onEdit}>
            <Pencil size={16} />
            <span className="sr-only">Edit task</span>
          </button>
          <button type="button" className="icon-link danger" title="Remove task" onClick={remove} disabled={pending}>
            <Trash2 size={16} />
            <span className="sr-only">Remove task</span>
          </button>
        </div>
      )}
    </li>
  );
}

function TaskDialog({ vehicleId, task, onClose }: { vehicleId: string; task: Task | null; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [status, setStatus] = useState(task?.status ?? "Pending");

  return (
    <Sheet title={task ? "Edit maintenance task" : "Add maintenance task"} onClose={onClose} subtitle={!task ? "You can upload receipts once it's saved." : undefined}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveTask(vehicleId, task?.id ?? null, fd), onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field wide">
            <label htmlFor="t-desc">
              Description<span className="req">*</span>
            </label>
            <input id="t-desc" name="description" className="input" required defaultValue={task?.description} placeholder="e.g. Full service and oil change" />
          </div>
          <div className="field">
            <label htmlFor="t-date">Due date</label>
            <input id="t-date" name="due_date" type="date" className="input" defaultValue={task?.due_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="t-cost">Price (£)</label>
            <input id="t-cost" name="cost" className="input tnum" inputMode="decimal" defaultValue={task?.cost ?? ""} placeholder="0.00" />
          </div>
          <div className="field">
            <label htmlFor="t-status">Status</label>
            <select id="t-status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {TASK_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {status === "Completed" ? (
            <div className="field">
              <label htmlFor="t-done">Completed on</label>
              <input id="t-done" name="completed_on" type="date" className="input" max={todayISO()} defaultValue={task?.completed_on ?? todayISO()} />
            </div>
          ) : (
            <p className="muted-note" style={{ alignSelf: "end" }}>
              Pending tasks turn overdue by themselves once the due date passes.
            </p>
          )}
          <div className="field wide">
            <label htmlFor="t-notes">Notes</label>
            <textarea id="t-notes" name="notes" className="textarea" defaultValue={task?.notes ?? ""} placeholder="Garage, parts, anything useful" />
          </div>
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : task ? "Save changes" : "Add task"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
