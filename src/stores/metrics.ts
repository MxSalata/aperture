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

/**
 * One reading of the interoperability metrics of /api/monitor: per namespace, the messages
 * processed per second and the messages queued, summed over the production's hosts.
 */
export interface InteropSample {
  t: number;
  namespaces: Record<string, { messagesPerSec: number; queued: number }>;
}

const MAX = 120;

interface MetricsState {
  samples: MetricSample[];
  /** Read every third poll, so 120 samples span about six minutes at the dashboard's rate. */
  interop: InteropSample[];
  push(sample: MetricSample): void;
  pushInterop(sample: InteropSample): void;
  clear(): void;
}

function append<T extends { t: number }>(list: T[], sample: T): T[] | null {
  const last = list[list.length - 1];
  if (last && sample.t - last.t < 500) return null;
  const next = [...list, sample];
  return next.length > MAX ? next.slice(next.length - MAX) : next;
}

export const useMetrics = create<MetricsState>()(
  persist(
    (set) => ({
      samples: [],
      interop: [],
      push: (sample) =>
        set((s) => {
          const samples = append(s.samples, sample);
          return samples ? { samples } : s;
        }),
      pushInterop: (sample) =>
        set((s) => {
          const interop = append(s.interop, sample);
          return interop ? { interop } : s;
        }),
      clear: () => set({ samples: [], interop: [] }),
    }),
    {
      name: 'aperture.metrics',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ samples: s.samples, interop: s.interop }) as MetricsState,
    },
  ),
);
