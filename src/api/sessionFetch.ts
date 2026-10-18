import { useSession } from '@/stores/session';
import { useHealth } from '@/stores/health';
import { useActivity } from '@/stores/activity';
import { useReadOnly } from '@/stores/readOnly';
import { ApiError, NotSentError, RefusedError, normalizeErrors, textFromBody } from '@/lib/errors';
import { noteReachability } from './client';
import { READ_ONLY_REFUSAL } from './readOnly';

/**
 * A call to another web application of the instance that takes this session's own credentials.
 *
 * IRIS accepts the JWT of `/api/admin/login` on the JWT-enabled applications of the same by-ID group
 * (`%ISCMgtPortal`): `/api/interop-editors` and `/csp/fhir-management/api` answered 200 to it on IRIS
 * for Health 2026.2 (18 Oct 2026; the token's `app` claim says `/api/admin/`). A Basic session sends
 * its credentials instead.
 *
 * The token is refreshed as the SysAdmin client does it (`api/client.ts`): shortly before it expires,
 * and once after a 401, unless a refresh finished while the request was out, in which case it is
 * simply resent with the newer token. A refresh that fails ends the session, as there. A second 401
 * is that application's refusal, not the end of the session: it is reported as final (`RefusedError`,
 * which nothing retries) and the session goes on. Answers count for reachability as the SysAdmin
 * client's do, and a success that is not JSON (the SPA's own page, from a path no proxy sends to
 * IRIS) is an error, not an empty answer.
 *
 * A write (anything but GET, unless `read` says the POST only reads) is refused in a read-only tab
 * before it is sent, and recorded in the Activity screen with the server's answer, as the SysAdmin
 * client does for its own.
 */
export interface SessionFetchInit {
  method?: string;
  body?: unknown;
  /** What to say when the application itself is missing (404 without an answer of its own). */
  missing?: string;
  /** A POST that changes nothing (a search): allowed in a read-only tab, not recorded as a change. */
  read?: boolean;
}

function headersFor(auth: string | null, hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (auth) h.Authorization = auth;
  if (hasBody) h['Content-Type'] = 'application/json';
  return h;
}

export async function sessionFetch<T>(path: string, init: SessionFetchInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const write = method !== 'GET' && method !== 'HEAD' && !init.read;
  if (write && useReadOnly.getState().readOnly) throw new NotSentError(READ_ONLY_REFUSAL, path.split('?')[0]);
  const startedAt = Date.now();
  const session = useSession.getState();
  if (
    session.mode === 'jwt' &&
    session.refreshToken &&
    session.expiresAt &&
    session.expiresAt - Date.now() < 20_000
  ) {
    await session.refresh();
  }
  const url = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${path}`;
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const send = (auth: string | null) =>
    fetch(url, { method, headers: headersFor(auth, body !== undefined), body, credentials: 'omit' });

  let sentWith = useSession.getState().authorizationHeader();
  let res: Response;
  let sessionOver = false;
  try {
    res = await send(sentWith);
    if (res.status === 401 && useSession.getState().mode === 'jwt') {
      const current = useSession.getState().authorizationHeader();
      const retry = sentWith !== current ? true : await useSession.getState().refresh();
      if (retry) {
        sentWith = useSession.getState().authorizationHeader();
        res = await send(sentWith);
      } else sessionOver = useSession.getState().status === 'authenticated';
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    useHealth.getState().markFail(message);
    throw new ApiError({ status: 0, url, method, summary: message });
  }
  noteReachability(res.status);
  const pathname = new URL(url, 'http://x').pathname;
  if (sessionOver) {
    // The refresh token itself is refused: the session is over, as the SysAdmin client concludes.
    void useSession
      .getState()
      .logout({ reason: 'Your session expired. Please sign in again.', remote: false });
    throw new RefusedError({
      status: 401,
      url,
      method,
      summary: 'Your session expired. Please sign in again.',
    });
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const n = json === undefined ? { errors: [], summary: '' } : normalizeErrors(json);
  if (write) {
    const [p, query = ''] = path.split('?');
    useActivity.getState().record({
      at: startedAt,
      method,
      path: p,
      query,
      status: res.status,
      ok: res.ok,
      summary: n.summary || n.errors[0] || '',
      durationMs: Date.now() - startedAt,
      jobId: null,
    });
  }
  if (res.ok && json === undefined && text)
    throw new ApiError({
      status: res.status,
      url,
      method,
      summary: `${pathname} did not answer in JSON, so it did not reach IRIS: a proxy serves its own page there (a connection whose base URL is a proxy prefix needs this API proxied under that prefix too).`,
    });
  if (res.ok) return json as T;

  if (res.status === 401)
    throw new RefusedError({
      status: 401,
      url,
      method,
      errors: n.errors,
      summary:
        useSession.getState().mode === 'jwt'
          ? `${pathname} did not accept this session's token, although the session itself is valid: that web application may not take the token of /api/admin (JWT authentication off, or another by-ID group than /api/admin's).`
          : `${pathname} did not accept this session's user name and password.`,
    });
  const fromBody = n.summary || n.errors[0] || (json === undefined && text ? textFromBody(text) : '');
  throw new ApiError({
    status: res.status,
    url,
    method,
    errors: n.errors,
    summary: res.status === 404 && !fromBody && init.missing ? init.missing : fromBody || undefined,
  });
}
