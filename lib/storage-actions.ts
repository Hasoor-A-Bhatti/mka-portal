// Shared helpers for the Storage and Equipment Loans server actions.

import { revalidatePath } from "next/cache";

export type Result = { ok?: boolean; error?: string; id?: string };

type DbError = { code?: string; message: string };

const MIGRATION = "Run supabase/migrations/0014_storage_loans.sql in Supabase first.";

export function friendly(error: DbError): string {
  const code = error.code ?? "";
  if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return MIGRATION;
  if (code === "23505") return "That already exists.";
  if (code === "42501") return /row-level security|permission denied/i.test(error.message) ? "You don't have permission to do that." : error.message;
  if (code === "23514") return "One of the values isn't allowed, or is too long.";
  if (code === "23502") return "A required field is empty.";
  if (code === "23503") return "That links to something that no longer exists.";
  return error.message;
}

export function done(id?: string): Result {
  revalidatePath("/storage", "layout");
  revalidatePath("/equipment-loans", "layout");
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true, id };
}

export class Invalid extends Error {}

export function text(fd: FormData, name: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  if (v.length > (opts.max ?? 300)) throw new Invalid(`${label} is too long (${opts.max ?? 300} characters at most).`);
  return v;
}

export function whole(fd: FormData, name: string, label: string, opts: { min?: number; max?: number; required?: boolean } = {}) {
  const raw = String(fd.get(name) ?? "").replace(/[,\s]/g, "");
  if (!raw) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  const n = Number(raw);
  const min = opts.min ?? 0;
  const max = opts.max ?? 1_000_000;
  if (!Number.isInteger(n) || n < min || n > max) throw new Invalid(`${label} must be a whole number from ${min} to ${max.toLocaleString("en-GB")}.`);
  return n;
}

export function date(fd: FormData, name: string, label: string, opts: { required?: boolean } = {}) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) {
    if (opts.required) throw new Invalid(`${label} is required.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Invalid(`${label} isn't a valid date.`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function ref(fd: FormData, name: string) {
  const v = String(fd.get(name) ?? "").trim();
  if (!v) return null;
  if (!isId(v)) throw new Invalid("Pick from the list.");
  return v;
}

export const checked = (fd: FormData, name: string) => fd.get(name) === "on" || fd.get(name) === "true";

export async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Invalid) return { error: e.message };
    throw e;
  }
}
