import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useActivity } from '@/stores/activity';
import { useReadOnly } from '@/stores/readOnly';
import { ApiError, NotSentError, normalizeErrors } from '@/lib/errors';
import { classifyStatement } from '@/lib/sqlStatement';
import { mgmntCredentials } from './mgmnt';
import { READ_ONLY_REFUSAL } from './readOnly';

/**
 * SQL through the Atelier REST API (`/api/atelier`, the API VS Code's ObjectScript extension uses),
 * which ships with every IRIS outside the SysAdmin spec. Its query action runs a statement as the
 * signed-in account, so IRIS applies that account's SQL privileges.
 *
 * Checked on IRIS for Health 2026.2 (18 Oct 2026, `docs/verification/2026-10-18-irishealth-2026.2/`):
 * the web application takes a password only (JWT off) and needs `%Development:USE`, so a Basic
 * session sends its credentials and a JWT session gives the password once (`stores/mgmntAuth.ts`,
 * shared with /api/mgmnt and /api/aperture). It serves API version 8; `?positional=1` answers one
 * entry per result set with the columns' names and SQL types, `?max=` caps the rows, and an SQL error
 * is an HTTP 200 whose `status.errors` carry the SQLCODE and IRIS's message. `%Api.Atelier` opens a
 * CSP session and sets its cookie, and that cookie alone runs SQL as the account, with no password:
 * the browser keeps no cookie from it (`credentials: 'omit'`, as for /api/mgmnt), so every request
 * carries its own credentials and nothing outlives sign-out.
 */
export const ATELIER_PREFIX = '/api/atelier';
const VERSION = 'v8';

export const NOTHING_TO_RUN = 'There is no statement to run: the text is empty or only comments.';

export interface SqlColumn {
  name: string;
  type: string;
}

export interface SqlResult {
  columns: SqlColumn[];
  rows: unknown[][];
  /** The rows were cut at the limit asked for (there may be more). */
  truncated: boolean;
  ms: number;
}

export interface AtelierServer {
  version: string;
  api: number;
  namespaces: string[];
  features?: { name: string; enabled: boolean }[];
}

/** An SQL error IRIS reported: its SQLCODE and message. */
export class SqlError extends ApiError {
  readonly sqlcode: number | null;
  constructor(url: string, sqlcode: number | null, message: string, errors: string[]) {
    super({ status: 200, url, method: 'POST', summary: message, errors });
    this.name = 'SqlError';
    this.sqlcode = sqlcode;
  }
}

async function atelierFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ json: T; res: Response }> {
  const url = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${ATELIER_PREFIX}${path}`;
  const credentials = mgmntCredentials();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (credentials) headers.Authorization = `Basic ${credentials}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'omit',
    });
  } catch (e) {
    throw new ApiError({ status: 0, url, summary: e instanceof Error ? e.message : 'Network error' });
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no JSON body */
  }
  if (res.ok) return { json: json as T, res };
  // A refused password is forgotten at once: sending it again would count toward the account's
  // invalid-login limit.
  if (res.status === 401) useMgmntAuth.getState().clear();
  const n = normalizeErrors(json);
  throw new ApiError({
    status: res.status,
    url,
    method: init.method ?? 'GET',
    errors: n.errors,
    summary:
      res.status === 401
        ? credentials
          ? 'The instance refused the password for /api/atelier.'
          : '/api/atelier needs your password.'
        : res.status === 403
          ? 'This account may not use /api/atelier: it needs %Development:USE.'
          : res.status === 404
            ? 'The /api/atelier web application is not enabled on this instance.'
            : n.summary || n.errors[0] || `HTTP ${res.status}`,
  });
}

export async function fetchAtelierServer(): Promise<AtelierServer> {
  const { json } = await atelierFetch<{ result?: { content?: AtelierServer } }>('/');
  const c = json?.result?.content;
  if (!c)
    throw new ApiError({
      status: 200,
      url: ATELIER_PREFIX,
      summary: 'Atelier answered without a server descriptor.',
    });
  return c;
}

interface QueryAnswer {
  status?: { errors?: unknown[]; summary?: string };
  result?: { columns?: SqlColumn[]; content?: unknown[][] }[] | { content?: unknown[] };
}

/**
 * Run one statement in `namespace` and return its first result set. A change (anything but a read,
 * `lib/sqlStatement.ts`) is refused in a read-only tab and recorded in Activity.
 */
export async function runSql(
  namespace: string,
  query: string,
  parameters: unknown[] = [],
  max = 500,
): Promise<SqlResult> {
  const kind = classifyStatement(query);
  const path = `/${VERSION}/${encodeURIComponent(namespace)}/action/query`;
  if (!kind.keyword) throw new NotSentError(NOTHING_TO_RUN, `${ATELIER_PREFIX}${path}`);
  if (!kind.read && useReadOnly.getState().readOnly)
    throw new NotSentError(READ_ONLY_REFUSAL, `${ATELIER_PREFIX}${path}`);
  const started = Date.now();
  // One row more than shown says whether there are more.
  const qs = `?positional=1&max=${max + 1}`;
  let answer: QueryAnswer;
  let status = 200;
  try {
    answer = (
      await atelierFetch<QueryAnswer>(`${path}${qs}`, { method: 'POST', body: { query, parameters } })
    ).json;
  } catch (e) {
    status = e instanceof ApiError ? e.status : 0;
    if (!kind.read) record(path, qs, status, false, e instanceof Error ? e.message : '', started);
    throw e;
  }
  const errors = answer?.status?.errors ?? [];
  if (errors.length) {
    const first = errors[0] as { id?: string; params?: unknown[] };
    const n = normalizeErrors(answer);
    const sqlcode = first?.id === 'SQLCode' && first.params?.length ? Number(first.params[0]) : null;
    const message =
      sqlcode !== null && first.params?.[1] !== undefined
        ? `SQLCODE ${sqlcode}: ${String(first.params[1]).trim()}`
        : n.summary || n.errors[0] || 'The statement failed.';
    if (!kind.read) record(path, qs, 200, false, message, started);
    throw new SqlError(
      `${ATELIER_PREFIX}${path}`,
      Number.isFinite(sqlcode) ? sqlcode : null,
      message.replace(/&#39;/g, "'"),
      n.errors,
    );
  }
  const sets = Array.isArray(answer?.result) ? answer.result : [];
  const set = sets[0] ?? { columns: [], content: [] };
  const rows = set.content ?? [];
  if (!kind.read) record(path, qs, 200, true, `${kind.keyword} done`, started);
  return {
    columns: set.columns ?? [],
    rows: rows.slice(0, max),
    truncated: rows.length > max,
    ms: Date.now() - started,
  };
}

function record(path: string, query: string, status: number, ok: boolean, summary: string, at: number) {
  useActivity.getState().record({
    at,
    method: 'POST',
    path: `${ATELIER_PREFIX}${path}`,
    query: query.replace(/^\?/, ''),
    status,
    ok,
    summary,
    durationMs: Date.now() - at,
    jobId: null,
  });
}

export const sqlKeys = {
  all: ['atelier'] as const,
  server: ['atelier', 'server'] as const,
  schemas: (ns: string, system: boolean) => ['atelier', ns, 'schemas', system] as const,
  tables: (ns: string, schema: string) => ['atelier', ns, 'tables', schema] as const,
  columns: (ns: string, schema: string, table: string) => ['atelier', ns, 'columns', schema, table] as const,
  diagnostics: (ns: string, which: string) => ['atelier', ns, 'diagnostics', which] as const,
};

/** System schemas the catalogue hides until asked: IRIS's own, the information schema, and the products'. */
export const isSystemSchema = (schema: string) =>
  /^(%|INFORMATION_SCHEMA$|Ens|EnsLib|HS_|HSFHIR|HSMOD|Ens_|EnsPortal|SchemaMap)/i.test(schema);
