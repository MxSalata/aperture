import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { useSession } from '../session';
import { resetClients, api, result } from '@/api/client';
import { resetDb } from '@/mocks/db';
import { queryClient } from '@/query';
import { useActivity } from '@/stores/activity';
import { useHealth } from '@/stores/health';
import { basicCredentials, decodeJwtPayload } from '@/api/base';

const BASE = 'http://iris.test';

beforeEach(() => {
  resetDb();
  resetClients();
  sessionStorage.clear();
  useSession.setState({
    status: 'anonymous',
    mode: null,
    accessToken: null,
    refreshToken: null,
    basicCredentials: null,
    info: null,
    baseUrl: '',
  });
});

describe('session', () => {
  it('logs in with JWT and loads /info', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    const s = useSession.getState();
    expect(s.status).toBe('authenticated');
    expect(s.mode).toBe('jwt');
    expect(s.accessToken).toBeTruthy();
    expect(s.info?.privileges?.Secure?.use).toBe(true);
    expect(s.authorizationHeader()).toMatch(/^Bearer /);
  });

  it('rejects bad credentials', async () => {
    await expect(
      useSession
        .getState()
        .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'nope' }),
    ).rejects.toThrow(/Invalid username or password/);
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('falls back to Basic auth when /login does not exist (IRIS < 2026.2)', async () => {
    server.use(http.post(`${BASE}/api/admin/login`, () => new HttpResponse('Not Found', { status: 404 })));
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: 'operator', password: 'SYS' });
    const s = useSession.getState();
    expect(s.mode).toBe('basic');
    expect(s.authorizationHeader()).toBe(`Basic ${btoa('operator:SYS')}`);
    expect(s.info?.privileges?.Secure?.use).toBe(false);
  });

  it('refreshes an expired access token transparently', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    // Simulate an expired/invalid access token: the middleware must refresh and retry once.
    useSession.setState({ accessToken: 'garbage', expiresAt: Date.now() + 60_000 });
    const dbs = await result(api().GET('/v2/databases'));
    expect(Array.isArray(dbs)).toBe(true);
    expect(useSession.getState().accessToken).not.toBe('garbage');
  });

  it('forgets everything cached about the instance on logout', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    queryClient.setQueryData(['processes'], [{ Pid: '1' }]);
    useActivity.getState().record({
      at: Date.now(),
      method: 'POST',
      path: '/v2/x',
      query: '',
      status: 200,
      ok: true,
      summary: '',
      durationMs: 1,
    });
    useHealth.getState().markFail('boom');
    await useSession.getState().logout({ remote: false });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useActivity.getState().entries).toEqual([]);
    expect(useHealth.getState().reachable).toBe(true);
  });

  it('resets the cache when signing in to a different instance without signing out', async () => {
    await useSession
      .getState()
      .login({ connectionId: 'a', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    queryClient.setQueryData(['processes'], [{ Pid: 'from-a' }]);
    await useSession
      .getState()
      .login({ connectionId: 'b', baseUrl: BASE, username: 'operator', password: 'SYS' });
    expect(queryClient.getQueryData(['processes'])).toBeUndefined();
  });

  it('logs out when the refresh token is invalid too', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    useSession.setState({ accessToken: 'garbage', refreshToken: 'garbage', expiresAt: Date.now() + 60_000 });
    await expect(result(api().GET('/v2/databases'))).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().endedReason).toMatch(/expired/);
  });

  it('answers a Basic sign-in with a password beyond Latin-1 instead of crashing in btoa', async () => {
    server.use(http.post(`${BASE}/api/admin/login`, () => new HttpResponse('Not Found', { status: 404 })));
    await expect(
      useSession.getState().login({
        connectionId: 't',
        baseUrl: BASE,
        username: 'mikołaj',
        password: 'zażółć',
        auth: 'basic',
      }),
    ).rejects.toThrow(/Invalid username or password/);
  });

  it('does not bring back tokens when a refresh lands after sign-out', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    const pending = useSession.getState().refresh();
    await useSession.getState().logout({ remote: false });
    expect(await pending).toBe(false);
    expect(useSession.getState().accessToken).toBeNull();
  });
});

describe('credential encoding', () => {
  it('keeps Latin-1 credentials byte-identical and sends the rest as UTF-8', () => {
    expect(basicCredentials('operator', 'café')).toBe(btoa('operator:café'));
    const utf8 = basicCredentials('u', 'ł');
    expect(Array.from(atob(utf8), (c) => c.charCodeAt(0))).toEqual([0x75, 0x3a, 0xc5, 0x82]);
  });

  it('decodes a UTF-8 JWT payload', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ sub: 'Mikołaj' }));
    const part = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
    expect(decodeJwtPayload(`h.${part}.s`)?.sub).toBe('Mikołaj');
  });
});
