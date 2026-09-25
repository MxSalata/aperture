import { describe, expect, it } from 'vitest';
import { loadSpec } from '@/lib/openapi';
import { findIndexedOperation, index } from '@/lib/specIndex';
import { operationRequest, operationRequests } from '../requests';

describe('Explorer operations as requests', () => {
  it('takes the typed values, the examples of required parameters and the privileges', async () => {
    const doc = await loadSpec();
    const op = findIndexedOperation('POST', '/v2/database-dir/compact')!;
    const r = operationRequest(op, doc);
    expect(r).toMatchObject({
      name: 'POST /v2/database-dir/compact',
      method: 'POST',
      path: '/api/admin/v2/database-dir/compact',
      folder: 'Local databases',
      notes: [
        'Needs %Admin_Operate:U',
        'Answers 202 Accepted: poll the Location header (/v2/async-result?id=…)',
      ],
    });
    expect(r.query).toEqual([
      {
        name: 'dir',
        value: '/Users/user/iris/mgr/mydb/',
        required: true,
        description: 'Directory of the database',
        type: 'string',
      },
    ]);
    expect(JSON.parse(r.body!)).toHaveProperty('TargetFreeSpace');
    const typed = operationRequest(op, doc, { dir: '/data/user/' }, '{"TargetFreeSpace": 5}');
    expect(typed.query[0].value).toBe('/data/user/');
    expect(typed.body).toBe('{\n  "TargetFreeSpace": 5\n}');
  });

  it('redacts a secret typed into the body and keeps text that is not JSON', async () => {
    const doc = await loadSpec();
    const op = findIndexedOperation('POST', '/v2/security/user')!;
    const r = operationRequest(op, doc, {}, '{"Name":"jdoe","Password":"hunter2"}');
    expect(r.body).not.toContain('hunter2');
    expect(JSON.parse(r.body!).Name).toBe('jdoe');
    expect(operationRequest(op, doc, {}, '{not json').body).toBe('{not json');
  });

  it('sends a moved operation where IRIS serves it', async () => {
    const doc = await loadSpec();
    const op = findIndexedOperation('POST', '/v2/security/oauth2/revoke')!;
    expect(operationRequest(op, doc).path).toBe('/api/admin/v2/security/oauth2/server/revoke');
  });

  it('builds one request per operation, without a body for reads', async () => {
    const doc = await loadSpec();
    const all = operationRequests(index.operations, doc);
    expect(all).toHaveLength(273);
    expect(all.filter((r) => r.method === 'GET').every((r) => r.body === undefined)).toBe(true);
    expect(new Set(all.map((r) => r.folder)).size).toBe(21);
  });
});
