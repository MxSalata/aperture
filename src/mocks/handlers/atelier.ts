import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { findAccount } from '../auth';
import { runStatement, SqlCode } from '../sql';

/**
 * The Atelier REST API (`/api/atelier`) as IRIS for Health 2026.2 answers what the SQL explorer
 * calls: a password only (a token or nothing is a bodiless 401), `%Development:USE` (held by the
 * demo's %All accounts only; IRIS answers an account without it with the same 401 as a wrong
 * password, and audits a LoginFailure), the server descriptor, and the query action with `positional` and
 * `max` (a namespace that does not exist is a bodiless 404). An SQL error is an HTTP 200 whose `status.errors` carry the SQLCODE, as on IRIS; the
 * statements run in the demo's SQL engine (`mocks/sql.ts`), and are counted under their audit event.
 */
function basicAccount(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const [user, ...rest] = atob(header.slice(6)).split(':');
    return findAccount(user, rest.join(':')) ?? null;
  } catch {
    return null;
  }
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * IRIS counts every Dynamic SQL statement under its kind's audit event (the `Total` of
 * GET /v2/security/audit/events) whether the event is on or not, and writes it only when the
 * event and auditing are both on.
 */
function countSqlAudit(query: string) {
  const first = (
    query.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '').match(/^[A-Za-z]+/)?.[0] ?? ''
  ).toUpperCase();
  const kind = ['SELECT', 'WITH', 'EXPLAIN'].includes(first)
    ? 'Query'
    : ['CREATE', 'ALTER', 'DROP', 'GRANT', 'REVOKE'].includes(first)
      ? 'DDL'
      : ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].includes(first)
        ? 'DML'
        : 'Utility';
  const e = mockDb.auditEvents.find(
    (x) => x.EventSource === '%System' && x.EventType === '%SQL' && x.EventName === `DynamicStatement${kind}`,
  );
  if (!e) return;
  e.Total += 1;
  if (e.Enabled && mockDb.auditEnabled) e.Written += 1;
}

const unauthorized = () =>
  new HttpResponse(null, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="IRIS"' } });
const envelope = (result: unknown, errors: unknown[] = []) =>
  HttpResponse.json({
    status: { errors, summary: errors.length ? String((errors[0] as { error: string }).error) : '' },
    console: [],
    result,
  });

function allowed(request: Request) {
  const account = basicAccount(request);
  if (!account) return { refusal: unauthorized() };
  if (!account.roles.includes('%All')) return { refusal: unauthorized() };
  return { account };
}

export const atelierHandlers = [
  http.get('*/api/atelier/', ({ request }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    return envelope({
      content: {
        version:
          'IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2 (Build 221U) Fri Jun 26 2026 09:58:52 EDT',
        id: 'B9FFD262-B73A-11F1-8424-AA96C72DA267',
        api: 8,
        features: [{ name: 'ENSEMBLE', enabled: true }],
        namespaces: ['%SYS', ...mockDb.namespaces.map((n) => n.Name).filter((n) => n !== '%SYS')],
      },
    });
  }),
  http.post('*/api/atelier/:version/:ns/action/query', async ({ request, params }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    const url = new URL(request.url);
    const ns = decodeURIComponent(String(params.ns));
    // A namespace that does not exist is a bodiless 404, as on IRIS.
    if (!mockDb.namespaces.some((n) => n.Name === ns)) return new HttpResponse(null, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { query?: string; parameters?: unknown[] };
    const max = Number(url.searchParams.get('max')) || 1000;
    try {
      const { columns, rows } = runStatement(ns, body.query ?? '', body.parameters ?? [], max);
      countSqlAudit(body.query ?? '');
      // A change answers an empty result, as on IRIS.
      return envelope(columns.length ? [{ columns, content: rows }] : []);
    } catch (e) {
      const code = e instanceof SqlCode ? e.sqlcode : -400;
      const message = e instanceof Error ? e.message : String(e);
      return envelope({}, [
        {
          error: `ERROR #5540: SQLCODE: ${code} Message:  ${message}`,
          code: 5540,
          domain: '%ObjectErrors',
          id: 'SQLCode',
          // IRIS escapes the message for HTML in `params`, though not in `error`.
          params: [String(code), ` ${escapeHtml(message)}`],
        },
      ]);
    }
  }),
];
