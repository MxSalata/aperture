import { beforeEach, describe, expect, it } from 'vitest';
import { api, call, result, resetClients } from '../client';
import { useSession } from '@/stores/session';
import { useJobs } from '@/stores/jobs';
import { resetDb } from '@/mocks/db';
import { ApiError } from '@/lib/errors';

const BASE = 'http://iris.test';

beforeEach(async () => {
  resetDb();
  resetClients();
  sessionStorage.clear();
  useJobs.setState({ jobs: {}, order: [] });
  await useSession
    .getState()
    .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
});

describe('typed client', () => {
  it('unwraps the {status, console, result} envelope', async () => {
    const list = await result(api().GET('/v2/namespaces'));
    expect(list.map((n) => n.Name)).toContain('%SYS');
  });

  it('turns HTTP errors into ApiError with the server summary', async () => {
    await expect(
      result(api().GET('/v2/namespace', { params: { query: { name: 'NOPE' } } })),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 404 && /not found/i.test(e.summary),
    );
  });

  it('reports 403 when the account lacks the privilege', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: 'operator', password: 'SYS' });
    await expect(result(api().GET('/v2/security/users'))).rejects.toMatchObject({ status: 403 });
  });

  it('registers 202 responses in the Job Center using the Location header', async () => {
    const { response } = await call(
      api().POST('/v2/database-dir/compact', {
        params: { query: { dir: '/usr/irissys/mgr/user/' } },
        body: { TargetFreeSpace: 10 },
        headers: { 'x-aperture-job': 'Compact USER' },
      }),
      'POST',
    );
    expect(response.status).toBe(202);
    const jobs = Object.values(useJobs.getState().jobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('Compact USER');
    // IRIS names the v1 path in the header of a v2 call; only the id is used.
    expect(response.headers.get('Location')).toContain(`/v1/async-result?id=${jobs[0].id}`);
  });

  it('keeps silent jobs out of the Job Center', async () => {
    await call(
      api().POST('/v2/database-dir/info', {
        params: { query: { dir: '/usr/irissys/mgr/user/' } },
        headers: { 'x-aperture-silent': '1' },
      }),
      'POST',
    );
    expect(Object.keys(useJobs.getState().jobs)).toHaveLength(0);
  });

  it('falls back to the spec-driven mock for operations without a dedicated handler', async () => {
    const list = await result(api().GET('/v2/wallet/collections'));
    expect(Array.isArray(list)).toBe(true);
  });
});
