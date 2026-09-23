import { http, HttpResponse } from 'msw';
import {
  accounts,
  findAccount,
  infoFor,
  issueToken,
  parseToken,
  revokeSession,
  rotate,
  authenticate,
} from '../auth';
import { mockDb } from '../db';
import { jsonBody, unauthorized } from '../util';

/**
 * IRIS 2026.2's defaults for /api/admin (JWTAccessTokenTimeout, JWTRefreshTokenTimeout): the
 * portal refreshes every 40 s, and a session idle for 15 minutes ends.
 */
const ACCESS_TTL = 60;
const REFRESH_TTL = 900;

function loginResponse(username: string, sid: string, gen = 0) {
  const access = issueToken(username, 'access', ACCESS_TTL, sid, gen);
  const refresh = issueToken(username, 'refresh', REFRESH_TTL, sid, gen);
  const payload = parseToken(access)!;
  // Not enveloped on IRIS 2026.2 (unlike every /v2 answer and /info).
  return HttpResponse.json({
    access_token: access,
    refresh_token: refresh,
    sub: username,
    iat: payload.iat,
    exp: payload.exp,
  });
}

export const generalHandlers = [
  http.post('*/api/admin/login', async ({ request }) => {
    // With JWT authentication switched off on /api/admin, IRIS asks for a password before /login
    // is reached: 401, no body, WWW-Authenticate: Basic, whatever the body carries.
    if (mockDb.webApps.find((w) => w.Name === '/api/admin')?.JWTAuthEnabled === false)
      return new HttpResponse(null, {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'WWW-Authenticate': 'Basic' },
      });
    const body = await jsonBody<{ user?: string; password?: string; role?: string }>(request);
    let account = body.user ? findAccount(body.user, body.password ?? '') : undefined;
    // Basic auth on /login is also allowed by IRIS.
    if (!account) {
      const header = request.headers.get('authorization') ?? '';
      if (header.startsWith('Basic ')) {
        const [u, ...rest] = atob(header.slice(6)).split(':');
        account = findAccount(u, rest.join(':'));
      }
    }
    if (!account) return unauthorized();
    // An escalation role the account may not use is refused like a wrong password: 401, no body.
    if (body.role && !['%All', '%Manager', 'BreakGlass'].includes(body.role)) return unauthorized();
    const sid = Math.random().toString(36).slice(2, 12);
    return loginResponse(account.username, sid);
  }),

  http.post('*/api/admin/refresh', async ({ request }) => {
    const body = await jsonBody<{ refresh_token?: string }>(request);
    const payload = body.refresh_token ? parseToken(body.refresh_token) : null;
    if (!payload || payload.typ !== 'refresh' || payload.exp * 1000 < Date.now()) return unauthorized();
    if (!accounts.some((a) => a.username === payload.sub)) return unauthorized();
    const gen = rotate(payload);
    if (gen === null) return unauthorized();
    return loginResponse(payload.sub, payload.sid, gen);
  }),

  http.post('*/api/admin/logout', async ({ request }) => {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ')) {
      const p = parseToken(header.slice(7));
      if (p) revokeSession(p.sid);
    }
    // IRIS answers 200 with an empty body.
    return new HttpResponse(null, { status: 200 });
  }),

  http.post('*/api/admin/revoke', async ({ request }) => {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ')) {
      const p = parseToken(header.slice(7));
      if (p) revokeSession(p.sid);
    }
    return HttpResponse.json({ status: { errors: [], summary: 'Token revoked' }, console: [], result: {} });
  }),

  http.get('*/api/admin/info', ({ request }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    if (!account.privileges.length) return new HttpResponse(null, { status: 403 });
    // Enveloped on IRIS 2026.2, although the spec documents /info without the envelope.
    return HttpResponse.json({
      status: { errors: [], summary: '' },
      console: [],
      result: infoFor(
        account,
        mockDb.namespaces.map((n) => n.Name),
      ),
    });
  }),
];
