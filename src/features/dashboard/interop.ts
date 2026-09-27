import type { MetricSample } from '@/api/monitor';
import type { InteropSample } from '@/stores/metrics';

/**
 * The interoperability figures of one /api/monitor reading, per namespace. IRIS labels them
 * `id` (the namespace) and `production`, and, when host labels are switched on, one line per
 * business host: those are summed, so a namespace is one series whichever way the instance
 * reports. Absent entirely (no production running, or SAM not enabled for the namespace) the
 * result is empty, and the dashboard says why.
 */
export function interopByNamespace(samples: readonly MetricSample[], t: number): InteropSample {
  const namespaces: InteropSample['namespaces'] = {};
  for (const s of samples) {
    const key =
      s.name === 'iris_interop_messages_per_sec'
        ? 'messagesPerSec'
        : s.name === 'iris_interop_queued'
          ? 'queued'
          : null;
    if (!key || !Number.isFinite(s.value)) continue;
    const ns = s.labels.id || s.labels.namespace;
    if (!ns) continue;
    const entry = (namespaces[ns] ??= { messagesPerSec: 0, queued: 0 });
    entry[key] += s.value;
  }
  return { t, namespaces };
}

/** Every namespace seen in the history, in the order it first appeared: the chart's series. */
export function interopNamespaces(history: readonly InteropSample[]): string[] {
  const seen: string[] = [];
  for (const h of history) for (const ns of Object.keys(h.namespaces)) if (!seen.includes(ns)) seen.push(ns);
  return seen;
}
