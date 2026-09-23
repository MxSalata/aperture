import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';

/**
 * The REST management API (`/api/mgmnt`) ships with every IRIS, outside the SysAdmin spec. It lists
 * the REST applications of the instance and describes each one in OpenAPI 2.0, generated from the
 * dispatch class: the routes inside a REST web application, which the SysAdmin API does not know.
 *
 * Checked on IRIS for Health 2026.2: its web application takes a password only (JWTAuthEnabled
 * off), and a token from /api/admin/login gets a 401 there. A Basic session's credentials are
 * sent; a JWT session asks for the password once (`stores/mgmntAuth.ts`). `/v1/{namespace}/restapps`
 * lists the REST web applications of the whole instance whatever the namespace, so it is read in
 * %SYS, which %Operator may use; `/v2/` lists the spec-first REST classes of every namespace.
 */
export interface RestApp {
  /** The web application, e.g. /api/atelier. */
  name: string;
  dispatchClass: string;
  namespace: string;
  /** Where /api/mgmnt serves its OpenAPI 2.0 description. */
  swaggerSpec: string;
  enabled?: boolean;
  resource?: string;
}

export interface SpecClass {
  /** The spec-first application (its package), e.g. %Api.IAM.v1. */
  name: string;
  dispatchClass: string;
  namespace: string;
  swaggerSpec: string;
  /** The web application serving it; absent when none does. */
  webApplications?: string;
}

export interface Route {
  method: string;
  path: string;
  summary: string;
}

export interface RestDescription {
  title: string;
  basePath: string;
  routes: Route[];
}

const PREFIX = '/api/mgmnt';

/** The Basic credentials to send, or null when a JWT session has not given the password yet. */
export function mgmntCredentials(): string | null {
  const s = useSession.getState();
  return s.mode === 'basic' && s.basicCredentials ? s.basicCredentials : useMgmntAuth.getState().basic;
}

async function mgmntFetch<T>(path: string): Promise<T> {
  const url = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${PREFIX}${path}`;
  const credentials = mgmntCredentials();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (credentials) headers.Authorization = `Basic ${credentials}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, credentials: 'omit' });
  } catch (e) {
    throw new ApiError({ status: 0, url, summary: e instanceof Error ? e.message : 'Network error' });
  }
  if (res.ok) return (await res.json()) as T;
  let msg = '';
  try {
    msg = ((await res.json()) as { msg?: string }).msg ?? '';
  } catch {
    /* no JSON body */
  }
  // A refused password is forgotten at once: sending it again would count toward the account's
  // invalid-login limit.
  if (res.status === 401) useMgmntAuth.getState().clear();
  throw new ApiError({
    status: res.status,
    url,
    summary:
      res.status === 401
        ? credentials
          ? 'The instance refused the password for /api/mgmnt.'
          : '/api/mgmnt needs your password.'
        : res.status === 403
          ? `This account may not use /api/mgmnt here${msg ? `: ${msg}` : '.'}`
          : res.status === 404
            ? msg || 'The /api/mgmnt web application is not enabled on this instance.'
            : msg || `HTTP ${res.status}`,
  });
}

export const fetchRestApps = () => mgmntFetch<RestApp[]>('/v1/%25SYS/restapps');

export const fetchSpecClasses = () => mgmntFetch<SpecClass[]>('/v2/');

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

interface Swagger2 {
  info?: { title?: string };
  basePath?: string;
  paths?: Record<string, Record<string, { summary?: string; description?: string; operationId?: string }>>;
}

/** The routes of an OpenAPI 2.0 description, sorted by path, then method. */
export function routesOf(spec: Swagger2): RestDescription {
  const basePath = (spec.basePath ?? '').replace(/\/+$/, '');
  const routes: Route[] = [];
  for (const [path, ops] of Object.entries(spec.paths ?? {}))
    for (const [method, op] of Object.entries(ops ?? {}))
      if (METHODS.includes(method))
        routes.push({
          method: method.toUpperCase(),
          path: `${basePath}${path}`,
          summary: (op.summary ?? op.description ?? op.operationId ?? '').replace(/\s+/g, ' ').trim(),
        });
  routes.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      METHODS.indexOf(a.method.toLowerCase()) - METHODS.indexOf(b.method.toLowerCase()),
  );
  return { title: spec.info?.title ?? '', basePath, routes };
}

/** The description at `swaggerSpec` (a path under /api/mgmnt, as the lists give it). */
export async function fetchRoutes(swaggerSpec: string): Promise<RestDescription> {
  // Only ever follow a link into /api/mgmnt itself: the lists come from the server.
  if (!swaggerSpec.startsWith(`${PREFIX}/`)) throw new Error(`Not an /api/mgmnt description: ${swaggerSpec}`);
  return routesOf(await mgmntFetch<Swagger2>(swaggerSpec.slice(PREFIX.length)));
}
