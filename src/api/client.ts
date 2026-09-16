import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { useSession } from '@/stores/session';
import { jobIdFromLocation, useJobs } from '@/stores/jobs';
import { ApiError } from '@/lib/errors';
import { API_PREFIX } from './base';

export { API_PREFIX };

/** Set these request headers to give a 202 job a friendly name/subject in the Job Center. */
export const JOB_NAME_HEADER = 'x-aperture-job';
export const JOB_SUBJECT_HEADER = 'x-aperture-subject';

/** Request bodies stashed by id so a 401→refresh→retry can resend them. */
const bodyStash = new Map<string, string | undefined>();

function defaultJobName(request: Request): string {
  const url = new URL(request.url, 'http://placeholder.local');
  const path = url.pathname.replace(/^.*\/api\/admin/, '');
  return `${request.method} ${path}`;
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

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        bodyStash.set(id, await request.clone().text());
      } catch {
        bodyStash.set(id, undefined);
      }
    }
    return request;
  },

  async onResponse({ request, response, id }) {
    const body = bodyStash.get(id);
    bodyStash.delete(id);

    // Long-running operations: the API queues a task and tells us where to poll.
    if (response.status === 202) {
      const jobId = jobIdFromLocation(response.headers.get('Location'));
      if (jobId && !request.headers.has('x-aperture-silent')) {
        useJobs.getState().track({
          id: jobId,
          name: request.headers.get(JOB_NAME_HEADER) ?? defaultJobName(request),
          subject: request.headers.get(JOB_SUBJECT_HEADER) ?? undefined,
        });
      }
      return response;
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
          return fetch(new Request(request.url, { method: request.method, headers, body, credentials: 'omit' }));
        }
      }
      // Refresh impossible or failed: the session is over.
      void session.logout({ reason: 'Your session expired. Please sign in again.', remote: false });
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
  const body = (error && typeof error === 'object' ? error : {}) as Envelope;
  return new ApiError({
    status: response.status,
    url: response.url,
    method,
    errors: body.status?.Errors,
    summary: body.status?.summary || (typeof error === 'string' ? error : undefined),
    console: body.console,
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
    throw new ApiError({ status: 0, url: '', method, summary: e instanceof Error ? e.message : 'Network error' });
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
