import type { MetricSample } from '@/stores/metrics';

/**
 * Counters of GET /v2/monitor/dashboard/main that IRIS reports as totals "since system startup"
 * (the spec's `Performance` descriptions). Only `GlobalRefsPerSecond` and `CacheEfficiency` are
 * "most recently measured" values; everything else must be turned into a rate here.
 */
export const COUNTERS = [
  'globalSetKill',
  'routineRefs',
  'logicalRequests',
  'diskReads',
  'diskWrites',
] as const;
export type Counter = (typeof COUNTERS)[number];
export type Rates = Record<`${Counter}PerSec`, number | null>;

/**
 * Per-second rates from consecutive samples of the cumulative counters. The first sample has no
 * rate, and neither does an interval in which a total went down: the instance restarted and its
 * counters began again at zero.
 */
export function withRates<T extends MetricSample>(samples: T[]): (T & Rates)[] {
  return samples.map((s, i) => {
    const prev = samples[i - 1];
    const seconds = prev ? (s.t - prev.t) / 1000 : 0;
    const rates = {} as Rates;
    for (const c of COUNTERS) {
      const delta = prev ? s[c] - prev[c] : NaN;
      rates[`${c}PerSec`] = seconds > 0 && Number.isFinite(delta) && delta >= 0 ? delta / seconds : null;
    }
    return { ...s, ...rates };
  });
}

/**
 * The busy processes of the dashboard. IRIS 2026.2 always answers ten rows of `{ Process, Commands }`
 * and pads the ones it has no process for with `{ Process: "", Commands: 0 }` (the spec declares
 * Process as an integer).
 */
export function busyProcesses(rows: unknown): { pid: number; commands: number }[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => r as { Process?: unknown; Commands?: unknown })
    .filter(
      (r) => typeof r.Process === 'number' || (typeof r.Process === 'string' && /^\d+$/.test(r.Process)),
    )
    .map((r) => ({ pid: Number(r.Process), commands: Number(r.Commands) || 0 }));
}
