import { describe, expect, it } from 'vitest';
import type { MetricSample } from '@/stores/metrics';
import { busyProcesses, withRates } from '../rates';

const sample = (t: number, diskReads: number, logicalRequests = 0): MetricSample => ({
  t,
  globalRefsPerSec: 0,
  globalSetKill: 0,
  routineRefs: 0,
  logicalRequests,
  diskReads,
  diskWrites: 0,
  cacheEfficiency: 680.73,
  licenseUse: 0,
  processes: 4,
  cspSessions: 0,
});

describe('dashboard rates', () => {
  it('turns totals since startup into per-second rates', () => {
    // DiskReads and LogicalRequests as IRIS reported them a minute after startup, then 3 s later.
    const r = withRates([sample(0, 2_628, 108_831), sample(3_000, 2_637, 111_831)]);
    expect(r[0].diskReadsPerSec).toBeNull();
    expect(r[1].diskReadsPerSec).toBe(3);
    expect(r[1].logicalRequestsPerSec).toBe(1_000);
  });

  it('has no rate across a restart (a total that went down)', () => {
    const r = withRates([sample(0, 53_500), sample(3_000, 120), sample(6_000, 150)]);
    expect(r[1].diskReadsPerSec).toBeNull();
    expect(r[2].diskReadsPerSec).toBe(10);
  });
});

describe('busy processes', () => {
  it('keeps the real rows of the ten IRIS always sends', () => {
    // GET /v2/monitor/dashboard/main on IRIS for Health 2026.2: one busy process, nine pads.
    const rows = [
      { Process: 1054, Commands: 777266 },
      ...Array.from({ length: 9 }, () => ({ Process: '', Commands: 0 })),
    ];
    expect(busyProcesses(rows)).toEqual([{ pid: 1054, commands: 777266 }]);
  });

  it('is empty for anything that is not a list', () => {
    expect(busyProcesses(undefined)).toEqual([]);
    expect(busyProcesses({})).toEqual([]);
  });
});
