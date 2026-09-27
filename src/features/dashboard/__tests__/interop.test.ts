import { describe, expect, it } from 'vitest';
import { interopByNamespace, interopNamespaces } from '../interop';

const sample = (name: string, labels: Record<string, string>, value: number) => ({ name, labels, value });

describe('interoperability metrics per namespace', () => {
  it('sums a production’s hosts into its namespace and ignores the other metrics', () => {
    const t = 1_700_000_000_000;
    const reading = interopByNamespace(
      [
        sample('iris_interop_messages_per_sec', { id: 'INTEROP', production: 'HL7', host: 'In' }, 30.5),
        sample('iris_interop_messages_per_sec', { id: 'INTEROP', production: 'HL7', host: 'Out' }, 11.5),
        sample('iris_interop_queued', { id: 'INTEROP', production: 'HL7', host: 'Out' }, 3),
        sample('iris_interop_messages_per_sec', { id: 'CLINICAL', production: 'FHIR' }, 8),
        sample('iris_interop_hosts', { id: 'CLINICAL', production: 'FHIR', status: 'OK' }, 6),
        sample('iris_interop_queued', { id: 'CLINICAL', production: 'FHIR' }, NaN),
        sample('iris_cpu_usage', {}, 12),
      ],
      t,
    );
    expect(reading).toEqual({
      t,
      namespaces: {
        INTEROP: { messagesPerSec: 42, queued: 3 },
        CLINICAL: { messagesPerSec: 8, queued: 0 },
      },
    });
  });

  it('is empty when the instance reports no production, and lists namespaces in order of appearance', () => {
    expect(interopByNamespace([sample('iris_cpu_usage', {}, 12)], 1).namespaces).toEqual({});
    const history = [
      interopByNamespace([sample('iris_interop_queued', { id: 'B' }, 1)], 1),
      interopByNamespace(
        [sample('iris_interop_queued', { id: 'A' }, 1), sample('iris_interop_queued', { id: 'B' }, 2)],
        2,
      ),
    ];
    expect(interopNamespaces(history)).toEqual(['B', 'A']);
  });
});
