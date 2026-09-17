import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { useSession } from '@/stores/session';
import { jobIdFromLocation, useJobs } from '@/stores/jobs';
import { useActivity } from '@/stores/activity';
import { useHealth } from '@/stores/health';
import { ApiError, normalizeErrors } from '@/lib/errors';
import { API_PREFIX } from './base';

export { API_PREFIX };

/** Set these request headers to give a 202 job a friendly name/subject in the Job Center. */
export const JOB_NAME_HEADER = 'x-aperture-job';
export const JOB_SUBJECT_HEADER = 'x-aperture-subject';
/** Keep a 202 out of the Job Center (metric lookups, explorer polls). */
export const SILENT_HEADER = 'x-aperture-silent';

/** Per-request bookkeeping keyed by openapi-fetch's request id. */
const inflight = new Map<string, { body?: string; startedAt: number }>();

function relativePath(request: Request): { path: string; query: string } {
  const url = new URL(request.url, 'http://placeholder.local');
  const i = url.pathname.indexOf(API_PREFIX);
  return { path: i >= 0 ? url.pathname.slice(i + API_PREFIX.length) : url.pathname, query: url.search.replace(/^\?/, '') };
}

function defaultJobName(request: Request): string {
  return `${request.method} ${relativePath(request).path}`;
}

/**
 * Task id of a 202 response: the Location header, or the GUID in the body (some
 * deployments do not expose the header). Pass the parsed body when the stream has
 * already been consumed; otherwise the response is cloned and parsed here.
 */
export async function jobIdFromResponse(response: Response, parsedBody?: unknown): Promise<string | null> {
  const fromHeader = jobIdFromLocation(response.headers.get('Location'));
  if (fromHeader) return fromHeader;
  const guidOf = (body: unknown) => ((body as { result?: { GUID?: string } } | null)?.result?.GUID ?? null);
  if (parsedBody !== undefined) return guidOf(parsedBody);
  if (response.bodyUsed) return null;
  try {
    return guidOf(await response.clone().json());
  } catch {
    return null;
  }
}

const middleware: Middleware = {
  async onRequest({ request, id }) {
    const session = useSession.getState();

    // Proactive refresh shortly before the access token expires.
    if (session.mode === 'jwt' && session.refreshToken && session.expiresAt && session.expiresAt - Date.now() < 20_000) {
      await session.refresh();
    }

    const auth = useSession.getState().authorizationHeader();
    if (auth && !request.headers.has('Authorization')) request.headers.set('Authorization', auth);
    if (!request.headers.has('Accept')) request.headers.set('Accept', 'application/json');

    const entry: { body?: string; startedAt: number } = { startedAt: Date.now() };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        entry.body = await request.clone().text();
      } catch {
        /* body not readable; a retry will be sent without it */
      }
    }
    inflight.set(id, entry);
    return request;
  },

  async onResponse({ request, response, id }) {
    const entry = inflight.get(id);
    inflight.delete(id);
    useHealth.getState().markOk();

    // Long-running operations: the API queues a task and tells us where to poll.
    let jobId: string | null = null;
    if (response.status === 202) {
      jobId = await jobIdFromResponse(response);
      if (jobId && !request.headers.has(SILENT_HEADER)) {
        useJobs.getState().track({
          id: jobId,
          name: request.headers.get(JOB_NAME_HEADER) ?? defaultJobName(request),
          subject: request.headers.get(JOB_SUBJECT_HEADER) ?? undefined,
        });
      }
    }

    if (response.status === 401) {
      const session = useSession.getState();
      if (session.status !== 'authenticated') return response;
      if (session.mode === 'jwt' && !request.headers.has('x-aperture-retried')) {
        const refreshed = await session.refresh();
        if (refreshed) {
          const headers = new Headers(request.headers);
          headers.set('Authorization', useSession.getState().authorizationHeader() ?? '');
          headers.set('x-aperture-retried', '1');
          return fetch(new Request(request.url, { method: request.method, headers, body: entry?.body, credentials: 'omit' }));
        }
      }
      // Refresh impossible or failed: the session is over.
      void session.logout({ reason: 'Your session expired. Please sign in again.', remote: false });
      return response;
    }

    // Session history: every change the portal sent, with the server's verdict.
    if (request.method !== 'GET' && request.method !== 'HEAD' && !request.headers.has(SILENT_HEADER)) {
      let summary = '';
      try {
        const body = (await response.clone().json()) as unknown;
        const n = normalizeErrors(body);
        summary = n.summary || n.errors[0] || '';
      } catch {
        /* no JSON body */
      }
      const { path, query } = relativePath(request);
      useActivity.getState().record({
        at: Date.now(),
        method: request.method,
        path,
        query,
        status: response.status,
        ok: response.ok,
        summary,
        durationMs: entry ? Date.now() - entry.startedAt : 0,
        jobId,
      });
    }
    return response;
  },
};

const clients = new Map<string, Client<paths>>();

/**
 * Typed client for the current connection. Path/param/body/response types come
 * straight from `mainspec_v2.json` via openapi-typescript.
 */
export function api(): Client<paths> {
  const base = useSession.getState().apiBase();
  let client = clients.get(base);
  if (!client) {
    client = createClient<paths>({ baseUrl: base, credentials: 'omit' });
    client.use(middleware);
    clients.set(base, client);
  }
  return client;
}

/** Test hook: forget cached clients (e.g. after changing the base URL). */
export function resetClients() {
  clients.clear();
}

interface Envelope {
  status?: { Errors?: string[]; summary?: string };
  console?: string[];
}

interface FetchLike<D, E> {
  data?: D;
  error?: E;
  response: Response;
}

function toApiError(response: Response, error: unknown, method: string): ApiError {
  const n = normalizeErrors(error);
  return new ApiError({
    status: response.status,
    url: response.url,
    method,
    errors: n.errors,
    summary: n.summary,
    console: n.console,
  });
}

/**
 * Await an openapi-fetch call and turn HTTP errors into `ApiError`.
 * Returns the parsed envelope and the raw response (for headers such as `Location`).
 */
export async function call<D, E>(
  promise: Promise<FetchLike<D, E>>,
  method = 'GET',
): Promise<{ data: D; response: Response }> {
  let res: FetchLike<D, E>;
  try {
    res = await promise;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    useHealth.getState().markFail(message);
    throw new ApiError({ status: 0, url: '', method, summary: `Cannot reach the server: ${message}` });
  }
  if (!res.response.ok) throw toApiError(res.response, res.error, method);
  return { data: res.data as D, response: res.response };
}

type ResultOf<D> = D extends { result?: infer R } ? NonNullable<R> : never;

/** Like `call`, but returns only the `result` payload of the standard envelope. */
export async function result<D, E>(promise: Promise<FetchLike<D, E>>, method = 'GET'): Promise<ResultOf<D>> {
  const { data } = await call(promise, method);
  return ((data as { result?: unknown } | undefined)?.result ?? undefined) as ResultOf<D>;
}

/** For write operations: returns the full envelope (status summary + console lines). */
export async function envelope<D, E>(
  promise: Promise<FetchLike<D, E>>,
  method = 'POST',
): Promise<{ data: D; response: Response; console: string[]; summary: string }> {
  const { data, response } = await call(promise, method);
  const env = (data ?? {}) as Envelope;
  return { data, response, console: env.console ?? [], summary: env.status?.summary ?? '' };
}
