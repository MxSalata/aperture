import { describe, expect, it } from 'vitest';
import { exampleFromSchema, loadSpec, resultSchema, groupLabel } from '../openapi';
import { findIndexedOperation, index } from '../specIndex';

describe('openapi helpers', () => {
  it('indexes every operation with its privileges', () => {
    expect(index.operations.length).toBe(273);
    const op = findIndexedOperation('GET', '/v2/security/users');
    expect(op?.privileges).toEqual(['%Admin_Secure:U']);
    expect(findIndexedOperation('POST', '/v2/database-dir/compact')?.async).toBe(true);
  });
  it('labels groups', () => {
    expect(groupLabel('/v2/database-dir')).toBe('Local databases');
  });
  it('generates examples from response schemas', async () => {
    const doc = await loadSpec();
    const schema = resultSchema(doc, 'GET', '/v2/processes');
    const ex = exampleFromSchema(doc, schema) as Record<string, unknown>[];
    expect(Array.isArray(ex)).toBe(true);
    expect(ex[0]).toHaveProperty('Pid');
  });
  it('keeps generated values inside an enum', async () => {
    const doc = await loadSpec();
    const rows = exampleFromSchema(doc, resultSchema(doc, 'GET', '/v2/ecp/application-servers')) as {
      Status?: string;
    }[];
    const allowed = ['Normal', 'Trouble', 'Recovering', 'Restart', 'DeadCleanup', 'Invalid'];
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(allowed).toContain(r.Status);
  });
});
