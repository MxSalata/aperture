import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';
import { exampleFromSchema, type JsonSchema, type OpenApiDoc } from '@/lib/openapi';
import { redactDeep } from '@/lib/redact';
import { pathParamsOf, type GeneratedRequest } from '@/lib/requestExport';

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

export interface RouteParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'formData';
  required: boolean;
  type: string;
  description: string;
  example?: string;
}

export interface Route {
  method: string;
  path: string;
  summary: string;
  /** The declared parameters, and the path's `{name}` segments when it declares none. */
  params: RouteParam[];
  /** An example JSON body from the body parameter's schema; `{}` for a write without one. */
  body?: string;
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
const WRITES = ['put', 'post', 'patch'];

/**
 * A parameter as Swagger 2.0 declares it (`type` beside `in`), with the OpenAPI 3 spelling
 * (`schema.type`, `example`) accepted too, since a spec-first class serves the document it was
 * generated from.
 */
interface DescribedParam {
  name: string;
  in: string;
  required?: boolean;
  type?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  'x-example'?: unknown;
  enum?: unknown[];
  schema?: JsonSchema;
}

interface DescribedOp {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: DescribedParam[];
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
}

/** An OpenAPI 2.0 (or 3.0) description, as far as the routes need it. */
export interface Swagger2 {
  info?: { title?: string };
  basePath?: string;
  paths?: Record<string, Record<string, DescribedOp | DescribedParam[] | undefined>>;
  definitions?: Record<string, JsonSchema>;
  components?: { schemas?: Record<string, JsonSchema> };
}

function paramType(p: DescribedParam): string {
  const t = p.type ?? p.schema?.type;
  return Array.isArray(t) ? t[0] : (t ?? 'string');
}

function paramExample(p: DescribedParam): string | undefined {
  const v = p.example ?? p['x-example'] ?? p.default ?? p.schema?.example ?? p.schema?.default;
  return v === undefined || v === null ? undefined : String(v);
}

/** The example body of a write: the body parameter's schema, or `{}` when none is declared. */
function exampleBody(spec: Swagger2, op: DescribedOp, params: DescribedParam[]): string {
  const schema =
    params.find((p) => p.in === 'body')?.schema ?? op.requestBody?.content?.['application/json']?.schema;
  const value = schema ? exampleFromSchema(spec as unknown as OpenApiDoc, schema) : {};
  return JSON.stringify(redactDeep(value && typeof value === 'object' ? value : {}).value, null, 2);
}

/** The routes of an OpenAPI 2.0 description, sorted by path, then method. */
export function routesOf(spec: Swagger2): RestDescription {
  const basePath = (spec.basePath ?? '').replace(/\/+$/, '');
  const routes: Route[] = [];
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    const shared = Array.isArray(ops?.parameters) ? ops.parameters : [];
    for (const [method, op] of Object.entries(ops ?? {})) {
      if (!METHODS.includes(method) || !op || Array.isArray(op)) continue;
      // An operation's parameter overrides the path-level one of the same name and place.
      const own = op.parameters ?? [];
      const declared = [
        ...shared.filter((s) => !own.some((o) => o.name === s.name && o.in === s.in)),
        ...own,
      ];
      const params: RouteParam[] = declared
        .filter((p): p is DescribedParam & { in: RouteParam['in'] } =>
          ['path', 'query', 'header', 'formData'].includes(p.in),
        )
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.in === 'path' || !!p.required,
          type: paramType(p),
          description: (p.description ?? '').replace(/\s+/g, ' ').trim(),
          ...(paramExample(p) !== undefined ? { example: paramExample(p) } : {}),
        }));
      for (const name of pathParamsOf(path))
        if (!params.some((p) => p.in === 'path' && p.name === name))
          params.push({ name, in: 'path', required: true, type: 'string', description: '' });
      routes.push({
        method: method.toUpperCase(),
        path: `${basePath}${path}`,
        summary: (op.summary ?? op.description ?? op.operationId ?? '').replace(/\s+/g, ' ').trim(),
        params,
        ...(WRITES.includes(method) || declared.some((p) => p.in === 'body') || op.requestBody
          ? { body: exampleBody(spec, op, declared) }
          : {}),
      });
    }
  }
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

/** The routes of a description as requests for Postman, a `.http` file or curl (`lib/requestExport.ts`). */
export function routeRequests(d: RestDescription): GeneratedRequest[] {
  return d.routes.map((r) => {
    const notes: string[] = [];
    const inPath = r.params.filter((p) => p.in === 'path').map((p) => p.name);
    if (inPath.length) notes.push(`Path parameters to replace in the URL: ${inPath.join(', ')}`);
    const headers = r.params.filter((p) => p.in === 'header').map((p) => p.name);
    if (headers.length) notes.push(`Headers it reads: ${headers.join(', ')}`);
    return {
      name: `${r.method} ${r.path.slice(d.basePath.length) || '/'}`,
      method: r.method,
      path: r.path,
      ...(r.summary ? { summary: r.summary } : {}),
      notes,
      query: r.params
        .filter((p) => p.in === 'query')
        .map((p) => ({
          name: p.name,
          value: p.example ?? '',
          required: p.required,
          ...(p.description ? { description: p.description } : {}),
          type: p.type,
        })),
      ...(r.body !== undefined ? { body: r.body } : {}),
    };
  });
}
