import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { api, call, envelope, resetClients, jobIdFromResponse, inflightSize } from '../client';
import { useSession } from '@/stores/session';
import { useActivity } from '@/stores/activity';
import { useHealth } from '@/stores/health';
import { useJobs } from '@/stores/jobs';
import { resetDb } from '@/mocks/db';

const BASE = 'http://iris.test';

beforeEach(async () => {
  resetDb();
  resetClients();
  sessionStorage.clear();
  useActivity.setState({ entries: [] });
  useJobs.setState({ jobs: {}, order: [] });
  useHealth.getState().reset();
  await useSession
    .getState()
    .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
});

describe('activity log and health', () => {
  it('records writes with the server summary, not reads', async () => {
    await call(api().GET('/v2/namespaces'));
    await envelope(api().POST('/v2/journal/switch-file'));
    const entries = useActivity.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      path: '/v2/journal/switch-file',
      status: 200,
      ok: true,
    });
    expect(entries[0].summary).toMatch(/Switched to/);
  });

  it('records failed writes too', async () => {
    await expect(
      envelope(api().DELETE('/v2/namespace', { params: { query: { name: '%SYS' } } }), 'DELETE'),
    ).rejects.toMatchObject({ status: 400 });
    const [e] = useActivity.getState().entries;
    expect(e.ok).toBe(false);
    expect(e.summary).toMatch(/cannot be deleted/);
  });

  it('falls back to the GUID in the body when Location is missing', async () => {
    server.use(
      http.post(`${BASE}/api/admin/v2/database-dir/defragment`, () =>
        HttpResponse.json(
          { status: { Errors: [], summary: '' }, console: [], result: { GUID: 'body-guid-1' } },
          { status: 202 },
        ),
      ),
    );
    const { data, response } = await call(
      api().POST('/v2/database-dir/defragment', { params: { query: { dir: '/usr/irissys/mgr/user/' } } }),
      'POST',
    );
    expect(response.headers.get('Location')).toBeNull();
    // The middleware tracked the job from the body before the stream was consumed…
    expect(Object.keys(useJobs.getState().jobs)).toEqual(['body-guid-1']);
    // …and callers holding the parsed body get the same answer without re-reading the stream.
    expect(await jobIdFromResponse(response, data)).toBe('body-guid-1');
    expect(await jobIdFromResponse(response)).toBeNull();
    const fresh = new Response(JSON.stringify({ result: { GUID: 'fresh-guid' } }), { status: 202 });
    expect(await jobIdFromResponse(fresh)).toBe('fresh-guid');
  });

  it('records a write exactly once when it succeeds on the post-refresh retry', async () => {
    useSession.setState({ accessToken: 'garbage', expiresAt: Date.now() + 60_000 });
    await envelope(api().POST('/v2/journal/switch-file'));
    const entries = useActivity.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      path: '/v2/journal/switch-file',
      status: 200,
      ok: true,
    });
  });

  it('registers a 202 delivered on the post-refresh retry in the Job Center', async () => {
    useSession.setState({ accessToken: 'garbage', expiresAt: Date.now() + 60_000 });
    await call(
      api().POST('/v2/database-dir/compact', {
        params: { query: { dir: '/usr/irissys/mgr/user/' } },
        body: { TargetFreeSpace: 10 },
        headers: { 'x-aperture-job': 'Compact USER' },
      }),
      'POST',
    );
    expect(Object.values(useJobs.getState().jobs).map((j) => j.name)).toEqual(['Compact USER']);
  });

  it('keeps the client-side metadata headers off the wire', async () => {
    let seen: string[] | null = null;
    server.use(
      http.post(`${BASE}/api/admin/v2/journal/switch-file`, ({ request }) => {
        seen = [...request.headers.keys()].filter((h) => h.startsWith('x-aperture'));
        return HttpResponse.json({ status: { Errors: [], summary: 'ok' }, console: [], result: {} });
      }),
    );
    await envelope(
      api().POST('/v2/journal/switch-file', {
        headers: { 'x-aperture-job': 'Switch', 'x-aperture-subject': 'journal' },
      }),
    );
    expect(seen).toEqual([]);
  });

  it('drops request bookkeeping when the network fails', async () => {
    server.use(http.post(`${BASE}/api/admin/v2/journal/switch-file`, () => HttpResponse.error()));
    await expect(envelope(api().POST('/v2/journal/switch-file'))).rejects.toMatchObject({ status: 0 });
    expect(inflightSize()).toBe(0);
  });

  it('marks the instance offline on network failure and back online on success', async () => {
    server.use(http.get(`${BASE}/api/admin/v2/locks`, () => HttpResponse.error()));
    await expect(call(api().GET('/v2/locks'))).rejects.toMatchObject({ status: 0 });
    expect(useHealth.getState().reachable).toBe(false);
    await call(api().GET('/v2/namespaces'));
    expect(useHealth.getState().reachable).toBe(true);
  });
});
