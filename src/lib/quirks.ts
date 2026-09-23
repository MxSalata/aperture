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
}

export const SPEC_QUIRKS: SpecQuirk[] = [
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
    id: 'info-without-envelope',
    appliesTo: (op) => op.path === '/info',
    note: 'Returned without the standard {status, console, result} envelope.',
    source: 'spec/mainspec_v2.json',
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

export function applyQuirks(
  op: { method: string; path: string },
  body: Record<string, unknown>,
): Record<string, unknown> {
  return quirksFor(op).reduce((b, q) => (q.transformBody ? q.transformBody(b) : b), body);
}
