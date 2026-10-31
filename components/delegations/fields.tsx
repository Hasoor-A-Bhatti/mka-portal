"use client";

import { useState } from "react";
import { addDays, fmtDay, spanDays } from "@/lib/delegations";

/**
 * Start date + number of days, sent as start_date / end_date.
 * Both are kept inside the stay (`first` to `last`).
 */
export function DateSpanFields({
  first,
  last,
  start: initialStart,
  end: initialEnd,
  daysLabel = "Number of days",
}: {
  first: string;
  last: string;
  start: string;
  end: string;
  daysLabel?: string;
}) {
  const [start, setStart] = useState(initialStart);
  const [count, setCount] = useState(String(spanDays(initialStart, initialEnd)));

  const maxDays = start >= first && start <= last ? spanDays(start, last) : 1;
  const n = Math.min(Math.max(1, Number(count) || 1), maxDays);
  const end = addDays(start, n - 1);

  return (
    <>
      <div className="field">
        <label htmlFor="span-start">
          Start date<span className="req">*</span>
        </label>
        <input
          id="span-start"
          name="start_date"
          type="date"
          className="input"
          required
          min={first}
          max={last}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="span-days">{daysLabel}</label>
        <input
          id="span-days"
          type="number"
          className="input tnum"
          min={1}
          max={maxDays}
          step={1}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          onBlur={() => setCount(String(n))}
        />
        <input type="hidden" name="end_date" value={end} />
      </div>
      <p className="span-summary wide" aria-live="polite">
        {fmtDay(start, { weekday: "short", day: "numeric", month: "short" })}
        {n > 1 && <> → {fmtDay(end, { weekday: "short", day: "numeric", month: "short" })}</>}
        <span>
          {n} day{n === 1 ? "" : "s"}
          {Number(count) > maxDays && ` (the stay ends ${fmtDay(last, { day: "numeric", month: "short" })})`}
        </span>
      </p>
    </>
  );
}

/** A text input with suggestions. */
export function SuggestInput({
  id,
  name,
  defaultValue,
  options,
  placeholder,
  required,
}: {
  id: string;
  name: string;
  defaultValue?: string | null;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  const unique = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
  return (
    <>
      <input
        id={id}
        name={name}
        className="input"
        list={`${id}-options`}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      <datalist id={`${id}-options`}>
        {unique.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
