import { http, HttpResponse } from 'msw';
import { accounts, findAccount, infoFor, issueToken, parseToken, revokeSession, authenticate } from '../auth';
import { mockDb } from '../db';
import { jsonBody, unauthorized } from '../util';

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 24 * 60 * 60;

function loginResponse(username: string, sid: string) {
  const access = issueToken(username, 'access', ACCESS_TTL, sid);
  const refresh = issueToken(username, 'refresh', REFRESH_TTL, sid);
  const payload = parseToken(access)!;
  return HttpResponse.json({
    status: { Errors: [], summary: '' },
    console: [],
    result: {
      access_token: access,
      refresh_token: refresh,
      sub: username,
      iat: payload.iat,
      exp: payload.exp,
    },
  });
}

export const generalHandlers = [
  http.post('*/api/admin/login', async ({ request }) => {
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
    if (body.role && !['%All', '%Manager', 'BreakGlass'].includes(body.role)) {
      return HttpResponse.json(
        {
          status: {
            Errors: [`Role ${body.role} is not a valid escalation role for this user`],
            summary: 'Invalid escalation role',
          },
          console: [],
          result: {},
        },
        { status: 401 },
      );
    }
    const sid = Math.random().toString(36).slice(2, 12);
    return loginResponse(account.username, sid);
  }),

  http.post('*/api/admin/refresh', async ({ request }) => {
    const body = await jsonBody<{ refresh_token?: string }>(request);
    const payload = body.refresh_token ? parseToken(body.refresh_token) : null;
    if (!payload || payload.typ !== 'refresh' || payload.exp * 1000 < Date.now()) return unauthorized();
    if (!accounts.some((a) => a.username === payload.sub)) return unauthorized();
    return loginResponse(payload.sub, payload.sid);
  }),

  http.post('*/api/admin/logout', async ({ request }) => {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ')) {
      const p = parseToken(header.slice(7));
      if (p) revokeSession(p.sid);
    }
    return HttpResponse.json({ status: { Errors: [], summary: 'Logged out' }, console: [], result: {} });
  }),

  http.post('*/api/admin/revoke', async ({ request }) => {
    const header = request.headers.get('authorization') ?? '';
    if (header.startsWith('Bearer ')) {
      const p = parseToken(header.slice(7));
      if (p) revokeSession(p.sid);
    }
    return HttpResponse.json({ status: { Errors: [], summary: 'Token revoked' }, console: [], result: {} });
  }),

  http.get('*/api/admin/info', ({ request }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    if (!account.privileges.length) return new HttpResponse(null, { status: 403 });
    return HttpResponse.json(
      infoFor(
        account,
        mockDb.namespaces.map((n) => n.Name),
      ),
    );
  }),
];
