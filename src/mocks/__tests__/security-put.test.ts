/**
 * The mock answers security PUTs as IRIS 2026.2 did in the live write probe
 * (docs/verification/2026-09-27-irishealth-2026.2/writes.json): partial bodies merge, and a
 * resource with no public permission is refused.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mockDb, resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';

const BASE = 'http://iris.test';

async function put(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method: 'PUT',
    headers: {
      Authorization: useSession.getState().authorizationHeader() ?? '',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json()) as { status?: { summary?: string; errors?: unknown[] } },
  };
}

describe('security PUTs in the mock', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
  });

  it('refuses a resource with no public permission, created or edited, as IRIS does', async () => {
    const empty = await put('/v2/security/resource?name=ProbeRes', {
      Description: 'x',
      PublicPermission: '',
    });
    expect(empty.status).toBe(400);
    expect(empty.json.status).toEqual({ errors: [], summary: '' });
    const missing = await put('/v2/security/resource?name=ProbeRes', { Description: 'x' });
    expect(missing.status).toBe(400);
    expect(missing.json.status?.summary).toMatch(/PublicPermission' is required/);
    expect((await put('/v2/security/resource?name=ProbeRes', { PublicPermission: 'R' })).status).toBe(201);
    expect((await put('/v2/security/resource?name=ProbeRes', { PublicPermission: null })).status).toBe(400);
    expect((await put('/v2/security/resource?name=ProbeRes', { Description: 'y' })).status).toBe(200);
    expect(mockDb.resources.find((r) => r.Name === 'ProbeRes')).toMatchObject({
      Description: 'y',
      PublicPermission: 'R',
    });
  });

  it('keeps a TLS server a server when a PUT names only its description', async () => {
    const server = mockDb.sslConfigs.find((c) => c.Type === 'Server');
    expect(server).toBeDefined();
    const name = encodeURIComponent(server!.Name);
    expect(
      (await put(`/v2/security/ssl-configuration?name=${name}`, { Description: 'renamed' })).status,
    ).toBe(200);
    expect(mockDb.sslConfigs.find((c) => c.Name === server!.Name)).toMatchObject({
      Type: 'Server',
      Description: 'renamed',
    });
  });
});
