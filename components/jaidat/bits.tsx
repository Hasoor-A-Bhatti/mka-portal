import type { ReactNode } from "react";
import { tone } from "@/lib/jaidat";
import { vars } from "@/lib/css";

/** Colours a control (e.g. a status dropdown) like a status pill. */
export function tonePill(value: string) {
  return vars({ "--tone": tone(value) });
}

export function Pill({ value, label, title }: { value: string; label?: string; title?: string }) {
  return (
    <span className="status" style={vars({ "--tone": tone(value) })} title={title}>
      {label ?? value}
    </span>
  );
}

/** A ring showing a score out of 100. */
export function HealthRing({ score, size = 64, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const colour = score >= 80 ? "#15805a" : score >= 60 ? "#9a6600" : "#c43a3a";
  return (
    <span className="jd-ring" style={vars({ "--ring": colour }, { width: size, height: size })} role="img" aria-label={`${label ?? "Health"} ${score} out of 100`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="jd-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="jd-ring-fill"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{score}</b>
    </span>
  );
}

/** A thin progress bar with its label. */
export function Meter({ value, total, label, tone: t }: { value: number; total: number; label?: ReactNode; tone?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="jd-meter">
      {label && (
        <div className="jd-meter-label">
          <span>{label}</span>
          <b className="tnum">
            {value}/{total}
          </b>
        </div>
      )}
      <div className="jd-meter-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={vars({ "--w": `${pct}%`, ...(t ? { "--tone": t } : {}) })} />
      </div>
    </div>
  );
}

/** Names offered in "who" fields across Jaidat. */
export function PeopleList({ names }: { names: string[] }) {
  return (
    <datalist id="jaidat-people">
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
      {action && <div>{action}</div>}
    </div>
  );
}
