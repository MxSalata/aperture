import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The choices next to every Refresh button, in seconds; 0 is off, the default. */
export const REFRESH_INTERVALS = [5, 15, 30, 60] as const;

interface AutoRefreshState {
  /**
   * Seconds between refreshes, per screen, 0 for off. A screen that is not listed takes its own
   * default: off for all but Processes, which polls every 5 seconds as its switch used to.
   */
  intervals: Record<string, number>;
  set(screen: string, seconds: number): void;
}

/** A device preference: each screen remembers the interval chosen for it. */
export const useAutoRefresh = create<AutoRefreshState>()(
  persist(
    (set) => ({
      intervals: {},
      set: (screen, seconds) =>
        set((s) => ({ intervals: { ...s.intervals, [screen]: Math.max(0, seconds) } })),
    }),
    { name: 'aperture.refresh', partialize: (s) => ({ intervals: s.intervals }) },
  ),
);
