import type { CSSProperties } from "react";

/** Inline style with CSS custom properties, e.g. vars({ "--accent": "#fff" }). */
export function vars(custom: Record<`--${string}`, string>, rest: CSSProperties = {}): CSSProperties {
  return { ...rest, ...(custom as CSSProperties) };
}
