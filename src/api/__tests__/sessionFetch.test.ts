import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { sessionFetch } from '../sessionFetch';
import { resetClients } from '../client';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { queryClient } from '@/query';
import { ApiError, RefusedError } from '@/lib/errors';
import { useHealth } from '@/stores/health';
import { useSession } from '@/stores/session';

const signIn = (auth: 'jwt' | 'basic' = 'jwt') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS', auth });

/** Whether the app's query client would try a failed read again. */
const retried = (error: unknown) => {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  return typeof retry === 'function' ? retry(0, error as Error) : retry;
};

describe('sessionFetch', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    useHealth.getState().reset();
  });

  it('refreshes once after a 401, then reports a refusal that nothing retries', async () => {
    await signIn();
    const before = useSession.getState().accessToken;
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/interop-editors/info', ({ request }) => {
        seen.push(request.headers.get('Authorization'));
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const e = await sessionFetch('/api/interop-editors/info').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RefusedError);
    expect((e as ApiError).summary).toMatch(/did not accept this session's token.*by-ID group/);
    // Sent with the token, refreshed once, resent with the new one: no more.
    const after = useSession.getState().accessToken;
    expect(after).not.toBe(before);
    expect(seen).toEqual([`Bearer ${before}`, `Bearer ${after}`]);
    expect(retried(e)).toBe(false);
    // The session goes on: the application refused it, not the instance.
    expect(useSession.getState().status).toBe('authenticated');
    // A 401 from the SysAdmin API still gets its one retry.
    expect(retried(new ApiError({ status: 401, url: 'x' }))).toBe(true);
  });

  it('ends the session when the refresh itself is refused, as the SysAdmin client does', async () => {
    await signIn();
    server.use(
      http.get('*/api/interop-editors/info', () => new HttpResponse(null, { status: 401 })),
      http.post('*/api/admin/refresh', () => new HttpResponse(null, { status: 401 })),
    );
    const e = await sessionFetch('/api/interop-editors/info').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RefusedError);
    await expect.poll(() => useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().endedReason).toMatch(/session expired/);
  });

  it('does not resend a password a Basic session was refused with', async () => {
    await signIn('basic');
    let sent = 0;
    server.use(
      http.get('*/api/interop-editors/info', () => {
        sent++;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const e = await sessionFetch('/api/interop-editors/info').catch((x: unknown) => x);
    expect(sent).toBe(1);
    expect((e as ApiError).summary).toMatch(/user name and password/);
    expect(retried(e)).toBe(false);
  });

  it('counts a gateway with no instance behind it as unreachable, and an answer as reachable', async () => {
    await signIn();
    server.use(
      http.get(
        '*/api/interop-editors/info',
        () =>
          new HttpResponse('<html><head><title>502 Bad Gateway</title></head></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
        { once: true },
      ),
    );
    const e = await sessionFetch('/api/interop-editors/info').catch((x: unknown) => x);
    expect((e as ApiError).summary).toBe('502 Bad Gateway');
    expect(useHealth.getState().reachable).toBe(false);
    await sessionFetch('/api/interop-editors/info');
    expect(useHealth.getState().reachable).toBe(true);
  });

  it('takes a page from a path no proxy sends to IRIS for an error, not for an empty answer', async () => {
    await signIn();
    server.use(
      http.get(
        '*/api/interop-editors/info',
        () =>
          new HttpResponse('<!doctype html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    const e = await sessionFetch('/api/interop-editors/info').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).summary).toMatch(/did not answer in JSON/);
  });
});
