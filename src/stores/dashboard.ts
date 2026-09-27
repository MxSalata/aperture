import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The charts the dashboard can show; the page maps each id to a card. */
export const DASHBOARD_CHARTS = [
  'globalRefs',
  'diskIo',
  'interopMessages',
  'interopQueued',
  'cacheEfficiency',
  'logicalRequests',
  'routineRefs',
  'processes',
  'license',
] as const;
export type DashboardChart = (typeof DASHBOARD_CHARTS)[number];

/** What a fresh device shows: the two charts the dashboard always had. */
export const DEFAULT_CHARTS: DashboardChart[] = ['globalRefs', 'diskIo'];

interface DashboardState {
  /** In the order chosen; the catalogue's order decides where a newly ticked chart goes. */
  charts: DashboardChart[];
  toggle(chart: DashboardChart): void;
  reset(): void;
}

/** A device preference: which charts the dashboard shows. */
export const useDashboard = create<DashboardState>()(
  persist(
    (set) => ({
      charts: DEFAULT_CHARTS,
      toggle: (chart) =>
        set((s) => ({
          charts: s.charts.includes(chart)
            ? s.charts.filter((c) => c !== chart)
            : DASHBOARD_CHARTS.filter((c) => c === chart || s.charts.includes(c)),
        })),
      reset: () => set({ charts: DEFAULT_CHARTS }),
    }),
    {
      name: 'aperture.dashboard',
      partialize: (s) => ({ charts: s.charts }),
      // A chart id from a later version that this build does not know is dropped, not crashed on.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<DashboardState> | undefined)?.charts;
        const known = Array.isArray(stored)
          ? stored.filter((c): c is DashboardChart => (DASHBOARD_CHARTS as readonly string[]).includes(c))
          : current.charts;
        return { ...current, charts: known };
      },
    },
  ),
);
