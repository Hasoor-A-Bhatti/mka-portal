import { formatPlate, odometer, tone } from "@/lib/fleet";
import { vars } from "@/lib/css";

/** A UK number plate. */
export function Plate({ reg, size = "md" }: { reg: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`plate plate-${size}`} aria-label={`Registration ${formatPlate(reg)}`}>
      <span className="plate-band" aria-hidden>
        UK
      </span>
      <span className="plate-text">{formatPlate(reg)}</span>
    </span>
  );
}

export function Pill({ value, label }: { value: string; label?: string }) {
  return (
    <span className="status" style={vars({ "--tone": tone(value) })}>
      {label ?? value}
    </span>
  );
}

/** Mileage shown as odometer digits. */
export function Odometer({ value }: { value: number }) {
  return (
    <span className="odometer" aria-label={`${value.toLocaleString("en-GB")} miles`}>
      {odometer(value)
        .split("")
        .map((d, i) => (
          <span key={i} aria-hidden>
            {d}
          </span>
        ))}
    </span>
  );
}
