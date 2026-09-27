import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NAV, type NavSection } from '@/features/shell/nav';

/**
 * The order of the navigation menu, a device preference like the appearance: which sections come
 * first, and which screens come first within a section. Only what the user moved is stored, by
 * section label and screen path; a section or screen that nav.ts adds later, or that the stored
 * order does not know, keeps the place nav.ts gives it. A screen never leaves its section.
 */
export interface NavOrder {
  sections: string[];
  items: Record<string, string[]>;
}

interface NavOrderState extends NavOrder {
  /** Moves the section with this label in front of the section `before` (to the end when null). */
  moveSection(label: string, before: string | null): void;
  /** Moves the screen with this path in front of the screen `before` of its section (to the end when null). */
  moveItem(section: string, path: string, before: string | null): void;
  reset(): void;
}

const EMPTY: NavOrder = { sections: [], items: {} };

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

/** The menu as the user arranged it. */
export function orderNav(nav: readonly NavSection[], order: NavOrder): NavSection[] {
  return applyOrder(nav, order.sections, (s) => s.label).map((section) => ({
    ...section,
    items: applyOrder(section.items, order.items[section.label] ?? [], (i) => i.to),
  }));
}

/** True when the arrangement differs from nav.ts, i.e. there is something to reset. */
export function isCustomOrder(nav: readonly NavSection[], order: NavOrder): boolean {
  const arranged = orderNav(nav, order);
  return arranged.some(
    (s, i) => s.label !== nav[i].label || s.items.some((item, j) => item.to !== nav[i].items[j]?.to),
  );
}

/**
 * `entry` placed in front of `before` (at the end when null); "in front of" rather than an index,
 * so that a caller who sees only the screens the account may use can still say where it goes.
 */
function movedBefore(list: readonly string[], entry: string, before: string | null): string[] | null {
  if (!list.includes(entry) || entry === before || (before !== null && !list.includes(before))) return null;
  const next = list.filter((k) => k !== entry);
  next.splice(before === null ? next.length : next.indexOf(before), 0, entry);
  return next;
}

export const useNavOrder = create<NavOrderState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      moveSection: (label, before) => {
        const next = movedBefore(
          orderNav(NAV, get()).map((s) => s.label),
          label,
          before,
        );
        if (next) set({ sections: next });
      },
      moveItem: (section, path, before) => {
        const current = orderNav(NAV, get())
          .find((s) => s.label === section)
          ?.items.map((i) => i.to);
        const next = current && movedBefore(current, path, before);
        if (next) set({ items: { ...get().items, [section]: next } });
      },
      reset: () => set({ ...EMPTY }),
    }),
    { name: 'aperture.nav', partialize: (s) => ({ sections: s.sections, items: s.items }) },
  ),
);
