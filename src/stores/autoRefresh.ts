import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The choices next to every Refresh button, in seconds; 0 is off, the default. */
export const REFRESH_INTERVALS = [5, 15, 30, 60] as const;

interface AutoRefreshState {
  /** Seconds between refreshes, per screen; a screen that is not listed refreshes by hand only. */
  intervals: Record<string, number>;
  set(screen: string, seconds: number): void;
}

/** A device preference: each screen remembers the interval chosen for it. */
export const useAutoRefresh = create<AutoRefreshState>()(
  persist(
    (set) => ({
      intervals: {},
      set: (screen, seconds) =>
        set((s) => {
          const intervals = { ...s.intervals };
          if (seconds > 0) intervals[screen] = seconds;
          else delete intervals[screen];
          return { intervals };
        }),
    }),
    { name: 'aperture.refresh', partialize: (s) => ({ intervals: s.intervals }) },
  ),
);
