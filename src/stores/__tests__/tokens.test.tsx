import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { api, resetClients, result } from '@/api/client';
import { queryClient } from '@/query';
import { useSession } from '../session';
import { claimSession, DUPLICATE_TAB_REASON, releaseSession } from '../sessionLock';
import { RequireAuth } from '@/features/shell/RequireAuth';

/**
 * Token lifetime as IRIS for Health 2026.2 (Build 221U) handles it, measured on the instance:
 * access tokens live 60 s and refresh tokens 900 s; a refresh issues a new pair and the previous
 * access token stops working at once; replaying a refresh token that was already used revokes the
 * whole session. The mock implements the same rules; these tests hold the portal to them.
 */
const BASE = 'http://iris.test';
const API = `${BASE}/api/admin`;

async function signIn() {
  await useSession
    .getState()
    .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
}

const post = (path: string, body: unknown, bearer?: string) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
const info = async (token: string) =>
  (await fetch(`${API}/info`, { headers: { Authorization: `Bearer ${token}` } })).status;

beforeEach(() => {
  resetDb();
  resetClients();
  sessionStorage.clear();
  releaseSession();
  useSession.setState({
    status: 'anonymous',
    mode: null,
    accessToken: null,
    refreshToken: null,
    basicCredentials: null,
    info: null,
    baseUrl: '',
    sessionKey: null,
  });
});

describe('the mock rotates tokens as IRIS does', () => {
  it('issues 60 s access and 900 s refresh tokens, not enveloped', async () => {
    const res = await post('/login', { user: '_SYSTEM', password: 'SYS' });
    const body = (await res.json()) as Record<string, number | string>;
    expect(Object.keys(body).sort()).toEqual(['access_token', 'exp', 'iat', 'refresh_token', 'sub']);
    // exp is whole seconds, iat is not (IRIS: 59.32 s measured), so the lifetime is just under 60 s.
    const lifetime = (body.exp as number) - (body.iat as number);
    expect(lifetime).toBeGreaterThan(59);
    expect(lifetime).toBeLessThanOrEqual(60);
  });

  it('kills the old access token on refresh, and the whole session when an old refresh token returns', async () => {
    const t1 = (await (await post('/login', { user: '_SYSTEM', password: 'SYS' })).json()) as {
      access_token: string;
      refresh_token: string;
    };
    const r = await post('/refresh', { refresh_token: t1.refresh_token });
    const t2 = (await r.json()) as { access_token: string; refresh_token: string };
    expect(r.status).toBe(200);
    expect(await info(t2.access_token)).toBe(200);
    expect(await info(t1.access_token)).toBe(401);
    // The first refresh token again: refused, and the pair issued in its place dies with it.
    expect((await post('/refresh', { refresh_token: t1.refresh_token })).status).toBe(401);
    expect(await info(t2.access_token)).toBe(401);
    expect((await post('/refresh', { refresh_token: t2.refresh_token })).status).toBe(401);
  });
});

describe('the portal and rotating tokens', () => {
  it('counts the token lifetime from its own clock, whatever the server clock says', async () => {
    // A server clock an hour behind this browser: exp is in the browser's past.
    server.use(
      http.post(`${API}/login`, async () => {
        const iat = Date.now() / 1000 - 3600;
        const token = `h.${btoa(JSON.stringify({ sub: '_SYSTEM', iat, exp: iat + 60, typ: 'access', sid: 's', gen: 0 }))}.s`;
        return HttpResponse.json({
          access_token: token,
          refresh_token: token,
          sub: '_SYSTEM',
          iat,
          exp: iat + 60,
        });
      }),
      http.get(`${API}/info`, () =>
        HttpResponse.json({
          status: { errors: [], summary: '' },
          console: [],
          result: { apiVersion: 2, username: '_SYSTEM' },
        }),
      ),
    );
    await signIn();
    const left = (useSession.getState().expiresAt ?? 0) - Date.now();
    expect(left).toBeGreaterThan(55_000);
    expect(left).toBeLessThanOrEqual(60_000);
  });

  it('retries a request caught by a refresh with the new token instead of refreshing again', async () => {
    await signIn();
    const oldHeader = useSession.getState().authorizationHeader();
    let refreshes = 0;
    const onRequest = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.endsWith('/refresh')) refreshes++;
    };
    server.events.on('request:start', onRequest);
    // GET /v2/locks is in flight with the old token while another request refreshes the session.
    let release!: () => void;
    const refreshed = new Promise<void>((r) => (release = r));
    server.use(
      http.get(`${API}/v2/locks`, async ({ request }) => {
        if (request.headers.get('Authorization') === oldHeader) {
          await refreshed;
          return new HttpResponse(null, { status: 401 }); // IRIS: that token was revoked meanwhile
        }
        return HttpResponse.json({ status: { errors: [], summary: '' }, console: [], result: [] });
      }),
    );
    try {
      const pending = result(api().GET('/v2/locks'));
      await new Promise((r) => setTimeout(r, 20));
      expect(await useSession.getState().refresh()).toBe(true);
      release();
      await expect(pending).resolves.toEqual([]);
      expect(refreshes).toBe(1);
      expect(useSession.getState().status).toBe('authenticated');
    } finally {
      server.events.removeListener('request:start', onRequest);
    }
  });
});

describe('one tab per session', () => {
  /**
   * Web Locks as a browser grants them: one holder per name across all tabs of the origin, and the
   * callback runs in a later task, not synchronously (which is what let two claims of one page race).
   */
  const heldByAnyTab = new Set<string>();
  const fakeLocks = {
    request: async (name: string, _opts: { ifAvailable: boolean }, cb: (lock: unknown) => unknown) => {
      await new Promise((r) => setTimeout(r, 5));
      if (heldByAnyTab.has(name)) return cb(null);
      heldByAnyTab.add(name);
      await cb({ name });
      heldByAnyTab.delete(name);
    },
  };
  beforeEach(() => {
    heldByAnyTab.clear();
    Object.defineProperty(navigator, 'locks', { value: fakeLocks, configurable: true });
  });
  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  it('lets two claims of the same page for the same session both win', async () => {
    // login() claims, and RequireAuth, mounted by the sign-in itself, claims again at once.
    const [a, b] = await Promise.all([claimSession('k1'), claimSession('k1')]);
    expect([a, b]).toEqual(['owner', 'owner']);
  });

  it('keeps the session of the tab that signed in, also when it checks again', async () => {
    await signIn();
    const key = useSession.getState().sessionKey!;
    expect(key).toBeTruthy();
    expect(await claimSession(key)).toBe('owner');
  });

  it('signs a copied tab out locally, without revoking the original tab', async () => {
    await signIn();
    const { sessionKey, accessToken } = useSession.getState();
    // Another tab signed in first and holds the session this tab's copied storage names.
    releaseSession();
    await new Promise((r) => setTimeout(r, 20)); // this page's lock is gone…
    heldByAnyTab.add(`aperture.session.${sessionKey}`); // …and the original tab holds the session
    let logouts = 0;
    const onRequest = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.endsWith('/logout')) logouts++;
    };
    server.events.on('request:start', onRequest);
    try {
      render(
        <MantineProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route element={<RequireAuth />}>
                  <Route path="/" element={<p>portal</p>} />
                </Route>
                <Route path="/login" element={<p>sign in</p>} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </MantineProvider>,
      );
      // After the grace a reload's old page would have used to let go.
      await waitFor(() => expect(useSession.getState().status).toBe('anonymous'), { timeout: 5_000 });
      expect(useSession.getState().endedReason).toBe(DUPLICATE_TAB_REASON);
      expect(logouts).toBe(0);
      // The original tab's token still works.
      expect(await info(accessToken!)).toBe(200);
    } finally {
      server.events.removeListener('request:start', onRequest);
      queryClient.clear();
    }
  });
});
