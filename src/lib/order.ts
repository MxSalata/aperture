/**
 * Orders the user arranges by hand (the navigation menu, the dashboard's charts): only what was
 * moved is stored, by key, and applied to the list the code defines, so an entry the code adds
 * later is not lost and one it removes leaves no hole.
 */

/**
 * The stored order applied to a default list: known entries in the stored order, unknown ones
 * slotted in where the default puts them (an entry missing from the stored order is not lost).
 */
export function applyOrder<T>(defaults: readonly T[], order: readonly string[], key: (t: T) => string): T[] {
  const byKey = new Map(defaults.map((d) => [key(d), d]));
  const result: T[] = [];
  for (const k of order) {
    const d = byKey.get(k);
    if (d && !result.includes(d)) result.push(d);
  }
  defaults.forEach((d, i) => {
    if (!result.includes(d)) result.splice(Math.min(i, result.length), 0, d);
  });
  return result;
}

/**
 * `entry` placed in front of `before` (at the end when null), or null when that is no move;
 * "in front of" rather than an index, so that a caller who sees only some of the entries (the
 * screens an account may use) can still say where it goes.
 */
export function movedBefore(list: readonly string[], entry: string, before: string | null): string[] | null {
  if (!list.includes(entry) || entry === before || (before !== null && !list.includes(before))) return null;
  const next = list.filter((k) => k !== entry);
  next.splice(before === null ? next.length : next.indexOf(before), 0, entry);
  return next;
}
