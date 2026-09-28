import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyOrder, movedBefore } from '@/lib/order';

/** The charts the dashboard can show, by id, with their titles; the page maps each id to a card. */
export const CHART_TITLES = {
  cacheEfficiency: 'Cache efficiency',
  diskIo: 'Disk I/O per second',
  globalRefs: 'Global references per second',
  interopMessages: 'Message throughput per namespace',
  interopQueued: 'Queued messages per namespace',
  license: 'License units in use',
  logicalRequests: 'Logical requests per second',
  processes: 'Processes and web sessions',
  routineRefs: 'Routine references per second',
} as const;
export type DashboardChart = keyof typeof CHART_TITLES;

/** Every chart, A to Z by title: the order of a fresh device, and where a chart added later goes. */
export const DASHBOARD_CHARTS: readonly DashboardChart[] = (
  Object.keys(CHART_TITLES) as DashboardChart[]
).sort((a, b) => CHART_TITLES[a].localeCompare(CHART_TITLES[b], 'en'));

/** What a fresh device shows: what an administrator watches, the productions' throughput and queues. */
export const DEFAULT_CHARTS: DashboardChart[] = ['interopMessages', 'interopQueued'];

/** Every chart in the order the user arranged them (A to Z where they did not). */
export const orderCharts = (order: readonly string[]): DashboardChart[] =>
  applyOrder(DASHBOARD_CHARTS, order, (c) => c);

/** True when the arrangement differs from A to Z, i.e. there is something to reset. */
export const isCustomChartOrder = (order: readonly string[]) =>
  orderCharts(order).some((c, i) => c !== DASHBOARD_CHARTS[i]);

interface DashboardState {
  /** The charts shown; the dashboard shows them in `order`. */
  charts: DashboardChart[];
  /** The order the user arranged, by chart id; empty is A to Z. */
  order: string[];
  toggle(chart: DashboardChart): void;
  /** Moves a chart in front of `before` (to the end when null). */
  move(chart: DashboardChart, before: DashboardChart | null): void;
  /** A to Z again; which charts show is kept. */
  resetOrder(): void;
  reset(): void;
}

const isChart = (c: unknown): c is DashboardChart =>
  typeof c === 'string' && (DASHBOARD_CHARTS as readonly string[]).includes(c);

/** A device preference: which charts the dashboard shows, and in which order. */
export const useDashboard = create<DashboardState>()(
  persist(
    (set, get) => ({
      charts: DEFAULT_CHARTS,
      order: [],
      toggle: (chart) =>
        set((s) => ({
          charts: s.charts.includes(chart)
            ? s.charts.filter((c) => c !== chart)
            : DASHBOARD_CHARTS.filter((c) => c === chart || s.charts.includes(c)),
        })),
      move: (chart, before) => {
        const next = movedBefore(orderCharts(get().order), chart, before);
        if (next) set({ order: next });
      },
      resetOrder: () => set({ order: [] }),
      reset: () => set({ charts: DEFAULT_CHARTS }),
    }),
    {
      name: 'aperture.dashboard',
      partialize: (s) => ({ charts: s.charts, order: s.order }),
      // A chart id from a later version that this build does not know is dropped, not crashed on.
      merge: (persisted, current) => {
        const stored = persisted as Partial<DashboardState> | undefined;
        return {
          ...current,
          charts: Array.isArray(stored?.charts) ? stored.charts.filter(isChart) : current.charts,
          order: Array.isArray(stored?.order) ? stored.order.filter(isChart) : current.order,
        };
      },
    },
  ),
);
