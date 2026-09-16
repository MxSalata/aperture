import { create } from 'zustand';

/**
 * Ring buffer of dashboard samples so charts keep their history while you
 * navigate between screens. Filled by the Dashboard's polling query.
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

export const useMetrics = create<MetricsState>()((set) => ({
  samples: [],
  push: (sample) =>
    set((s) => {
      const last = s.samples[s.samples.length - 1];
      if (last && sample.t - last.t < 500) return s;
      const samples = [...s.samples, sample];
      return { samples: samples.length > MAX ? samples.slice(samples.length - MAX) : samples };
    }),
  clear: () => set({ samples: [] }),
}));
