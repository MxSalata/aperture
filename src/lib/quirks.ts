/**
 * Differences between the published specification and real IRIS instances,
 * collected while building Aperture and from other contest entries' verification
 * records. The Explorer shows them next to the affected operation and applies
 * the body adapters before sending.
 */
export interface SpecQuirk {
  id: string;
  appliesTo: (op: { method: string; path: string }) => boolean;
  note: string;
  source: string;
  transformBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  /** Where IRIS really serves the operation, when that is not the documented path. */
  servedAt?: string;
}

/**
 * Operations IRIS serves at another path than the spec documents. Checked with GET on both paths:
 * %CSP.REST answers 405 (Allow: POST) where a route exists for another method, and 404 where none
 * does; the routes %Api.Admin declares are in docs/verification/…/o-api-admin-routes.json.
 */
const MOVED: { method: string; path: string; servedAt: string }[] = [
  { method: 'POST', path: '/v2/security/oauth2/revoke', servedAt: '/v2/security/oauth2/server/revoke' },
];

export const SPEC_QUIRKS: SpecQuirk[] = [
  ...MOVED.map((m) => ({
    id: 'oauth2-revoke-path',
    appliesTo: (op: { method: string; path: string }) => op.method === m.method && op.path === m.path,
    note: `IRIS 2026.2 serves this operation at ${m.servedAt}; the documented path answers 404 to every method. The Explorer sends it there.`,
    source:
      'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification, o-api-admin-routes.json)',
    servedAt: m.servedAt,
  })),
  {
    id: 'oauth-client-server-definition',
    appliesTo: (op) =>
      op.path === '/v2/security/oauth2/client/client-configuration' &&
      (op.method === 'PUT' || op.method === 'POST'),
    note: 'IRIS 2026.2 accepts the field `ServerDefinition`; the spec names it `OAuth2ServerDefinition`. Aperture sends both when you fill the spec field.',
    source: 'IRIS Workbench verification record, IRIS Community 2026.2.0.221',
    transformBody: (body) =>
      body.OAuth2ServerDefinition !== undefined && body.ServerDefinition === undefined
        ? { ...body, ServerDefinition: body.OAuth2ServerDefinition }
        : body,
  },
  {
    id: 'local-database-list-shape',
    appliesTo: (op) => op.path === '/v2/database-dirs',
    note: 'The spec declares the result as a single object; servers return an array. Aperture accepts both.',
    source: 'spec/mainspec_v2.json (LocalDatabaseList)',
  },
  {
    id: 'service-list-enabled-boolean',
    appliesTo: (op) => op.path === '/v2/security/services' && op.method === 'GET',
    note: 'The spec declares Enabled as a string next to a boolean EnabledBoolean; IRIS 2026.2 answers Enabled as a boolean and sends no EnabledBoolean. The Services screen reads either.',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'process-list-exename',
    appliesTo: (op) => op.path === '/v2/processes' && op.method === 'GET',
    note: 'IRIS 2026.2 spells the executable field EXEname; the spec says EXEName. ElapsedTime arrives as hh:mm:ss.',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'journal-records-half-maxrows',
    appliesTo: (op) => op.path === '/v2/journal/file/records',
    note: 'The task result holds half the maxRows asked for: maxRows=200 gives the first 100 records, the default 1000 gives 500, 5000 gives 2500. The records are contiguous; the count is halved. Aperture asks for twice its page.',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'task-upcoming-default-100',
    appliesTo: (op) => op.path === '/v2/task/upcoming',
    note: 'Without maxRows the list stops at 100 runs; the spec documents a default of 1000 (443 runs came back with maxRows=1000 on the test instance).',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'database-lists-need-manage',
    appliesTo: (op) =>
      op.method === 'GET' && (op.path === '/v2/databases' || op.path === '/v2/database-dirs'),
    note: 'The spec allows %Admin_Manage:U or %Admin_Operate:U; IRIS 2026.2 answers 403 (with an empty error list) to an account holding %Operator, which has %Admin_Operate:U and %DB_IRISSYS:RW. One directory (GET /v2/database-dir) is readable with Operate.',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'async-result-reread-alert',
    appliesTo: (op) => op.path === '/v2/async-result' && op.method === 'GET',
    note: 'Every read of a task after the one that first reported it ended logs a severity-2 alert (ERROR #7846 "WQM attach passed invalid token" from TryToKillQueue); the answer itself is unchanged. The alert reaches messages.log, /api/monitor/alerts and iris_system_state (Warning). Aperture keeps the first final answer and never reads an ended task again.',
    source:
      'Aperture live verification, IRIS for Health 2026.2 Build 221U (reproduced: 1 alert per re-read, 0 for a single read)',
  },
  {
    id: 'sql-privileges-object-action',
    appliesTo: (op) => op.path === '/v2/security/sql-privileges' && op.method === 'GET',
    note: 'IRIS 2026.2 names the object and the action Object and Action; the spec says Name and Privilege. The SQL privileges screen reads either.',
    source: 'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification)',
  },
  {
    id: 'info-envelope',
    appliesTo: (op) => op.path === '/info',
    note: 'The spec documents Info without the {status, console, result} envelope; IRIS 2026.2 wraps it like every /v2 answer. /login and /refresh are not wrapped, as the spec says. Aperture accepts both forms.',
    source:
      'Aperture live verification, IRIS for Health 2026.2 Build 221U (docs/verification, j-sign-in.json)',
  },
  {
    id: 'integrity-check-body',
    appliesTo: (op) => op.path === '/v2/database-dir/integrity-check',
    note: 'Targets go in the body (Databases[].Directory) instead of the ?dir= parameter used by its sibling operations.',
    source: 'spec/mainspec_v2.json',
  },
  {
    id: 'switch-dir-no-body',
    appliesTo: (op) => op.path === '/v2/journal/switch-dir',
    note: 'No request body is documented, so only the configured alternate directory can be targeted.',
    source: 'spec/mainspec_v2.json',
  },
  {
    id: 'error-envelope-variants',
    appliesTo: () => false,
    note: 'Errors arrive as status.Errors (strings), status.errors (objects with code) or a top-level errors array. Aperture normalizes all three.',
    source: 'IRIS Workbench verification record',
  },
  {
    id: 'optional-body-415',
    appliesTo: () => false,
    note: 'An operation that declares a request body answers 415 Unsupported Media Type when the request carries none, even if every field is optional (seen on POST /v2/task/suspend). Aperture sends `{}` with Content-Type: application/json in that case.',
    source: 'Aperture CI, IRIS Community 2026.2 Build 221U (scripts/live-check.mjs --mutate)',
  },
  {
    id: 'task-suspended-lag',
    appliesTo: (op) => op.path === '/v2/task/suspend' || op.path === '/v2/task/resume',
    note: 'Right after a successful suspend, GET /v2/task/info reports Suspended=true while the GET /v2/tasks list still reports false. Aperture re-reads both after each change and says which one has not caught up.',
    source:
      'Reproduced by Aperture CI (IRIS Community 2026.2 Build 221U, run 35719716417), first reported in the IRIS Fieldwork verification record; `npm run verify:live -- --mutate` records what your instance does',
  },
  {
    id: 'resource-create-empty-public',
    appliesTo: (op) => op.path === '/v2/security/resource' && op.method === 'PUT',
    note: 'Creating a resource with an empty PublicPermission was rejected by IRIS 2026.2, although the spec allows any combination of R, W and U. Editing an existing resource to "none" is not affected.',
    source: 'iris-fieldwork verification record (IRIS 2026.2, runtime/extended-validation.json)',
  },
  {
    id: 'process-resume-state',
    appliesTo: (op) => op.path === '/v2/process/resume',
    note: 'A resumed process reports state HANG (waiting) rather than RUNW until it runs again.',
    source: 'IRIS Workbench verification record',
  },
];

export function quirksFor(op: { method: string; path: string }): SpecQuirk[] {
  return SPEC_QUIRKS.filter((q) => q.appliesTo(op));
}

/** The path to send an operation to: where IRIS serves it. */
export function servedPath(op: { method: string; path: string }): string {
  return quirksFor(op).find((q) => q.servedAt)?.servedAt ?? op.path;
}

/**
 * For the mock: the documented operation a request reaches. A moved operation answers at its
 * served path, and its documented path is a 404, as on IRIS.
 */
export function documentedPath(method: string, path: string): string | null {
  if (MOVED.some((m) => m.method === method && m.path === path)) return null;
  return MOVED.find((m) => m.method === method && m.servedAt === path)?.path ?? path;
}

export function applyQuirks(
  op: { method: string; path: string },
  body: Record<string, unknown>,
): Record<string, unknown> {
  return quirksFor(op).reduce((b, q) => (q.transformBody ? q.transformBody(b) : b), body);
}
