/**
 * Object types whose PUT merges: a body naming some fields leaves every other field as it was.
 * Recorded per type on IRIS 2026.2 Build 221U: each probe named one field, read the object back,
 * found only that field changed, and restored it.
 *
 * - database directory, database, journal settings, namespace: scripts/live/partial-put.mjs,
 *   docs/verification/2026-09-23-iris-community-2026.2-local/partial-put.json;
 * - role, resource, user, web application, service, TLS configuration: e2e/live/writes.spec.ts,
 *   docs/verification/2026-09-27-irishealth-2026.2/writes.json. A list named in the body
 *   (a role's Resources, a user's Roles) replaces the stored list whole, so an edit sends the
 *   whole list whenever it changed.
 *
 * For a merging type an edit sends only what the user changed. A field the form holds but nobody
 * touched then cannot overwrite a change made on the server since the dialog opened, and a value
 * IRIS reports in another shape than it accepts is never sent back.
 */
export const MERGING_PUT: ReadonlySet<string> = new Set([
  '/v2/database-dir',
  '/v2/database',
  '/v2/journal/settings',
  '/v2/namespace',
  '/v2/security/role',
  '/v2/security/resource',
  '/v2/security/user',
  '/v2/web-app',
  '/v2/security/service',
  '/v2/security/ssl-configuration',
]);

export function sendsOnlyChanges(path: string): boolean {
  return MERGING_PUT.has(path);
}

/** The body of an edit: the changed fields for a merging type, the whole form otherwise. */
export function putBody<T extends object>(path: string, form: T, changes: Partial<T>): Partial<T> {
  return sendsOnlyChanges(path) ? changes : form;
}
