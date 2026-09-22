import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';

/**
 * Ring buffer of dashboard samples so charts keep their history while you
 * navigate between screens and across a reload of the tab. Filled by the
 * Dashboard's polling query while it is mounted; cleared with the session.
 */
export interface MetricSample {
  t: number;
  globalRefsPerSec: number;
  globalSetKill: number;
  routineRefs: number;
  logicalRequests: number;
  diskReads: number;
  diskWrites: number;
  cacheEfficiency: number;
  licenseUse: number | null;
  processes: number;
  cspSessions: number;
}

const MAX = 120;

interface MetricsState {
  samples: MetricSample[];
  push(sample: MetricSample): void;
  clear(): void;
}

export const useMetrics = create<MetricsState>()(
  persist(
    (set) => ({
      samples: [],
      push: (sample) =>
        set((s) => {
          const last = s.samples[s.samples.length - 1];
          if (last && sample.t - last.t < 500) return s;
          const samples = [...s.samples, sample];
          return { samples: samples.length > MAX ? samples.slice(samples.length - MAX) : samples };
        }),
      clear: () => set({ samples: [] }),
    }),
    { name: 'aperture.metrics', storage: createJSONStorage(() => safeSessionStorage), partialize: (s) => ({ samples: s.samples }) as MetricsState },
  ),
);
