/** A figure of the dashboard's answers as a number: some arrive as strings, anything else counts as 0. */
export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** A percentage, or null when IRIS sends none (no licence limit). */
export function pct(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
