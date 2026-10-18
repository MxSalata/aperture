import { useSession } from '@/stores/session';
import { useHealth } from '@/stores/health';
import { ApiError, normalizeErrors, textFromBody } from '@/lib/errors';

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
 * simply resent with the newer token. A second 401 is that application's refusal, not the end of the
 * session: it is reported and the session goes on.
 */
export interface SessionFetchInit {
  method?: string;
  body?: unknown;
  /** What to say when the application itself is missing (404 without an answer of its own). */
  missing?: string;
}

function headersFor(auth: string | null, hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (auth) h.Authorization = auth;
  if (hasBody) h['Content-Type'] = 'application/json';
  return h;
}

export async function sessionFetch<T>(path: string, init: SessionFetchInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
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
  try {
    res = await send(sentWith);
    if (res.status === 401 && useSession.getState().mode === 'jwt') {
      const current = useSession.getState().authorizationHeader();
      const retry = sentWith !== current ? true : await useSession.getState().refresh();
      if (retry) {
        sentWith = useSession.getState().authorizationHeader();
        res = await send(sentWith);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    useHealth.getState().markFail(message);
    throw new ApiError({ status: 0, url, method, summary: message });
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (res.ok) return json as T;

  const n = json === undefined ? { errors: [], summary: '' } : normalizeErrors(json);
  const fromBody = n.summary || n.errors[0] || (json === undefined && text ? textFromBody(text) : '');
  throw new ApiError({
    status: res.status,
    url,
    method,
    errors: n.errors,
    summary:
      res.status === 401
        ? `The instance refused this session's credentials for ${new URL(url, 'http://x').pathname}.`
        : res.status === 404 && !fromBody && init.missing
          ? init.missing
          : fromBody || undefined,
  });
}
