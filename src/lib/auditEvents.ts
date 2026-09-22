/**
 * Which native audit record proves a write made through the SysAdmin API.
 *
 * IRIS writes a `%System/%Security/<Event>` record for every security configuration
 * change (UserChange, RoleChange, ApplicationChange, …). A successful HTTP response says
 * the server accepted the request; the audit record says the change happened and who made
 * it. The Activity screen looks the record up around the time of the request so a change
 * can be shown next to the evidence, instead of next to an optimistic "200 OK".
 */
export interface AuditExpectation {
  /** Event names to accept; empty means any event of `eventType`. */
  events: string[];
  eventType: string;
}

const RULES: [RegExp, string[]][] = [
  [/^\/v2\/security\/user(\/|$)/, ['UserChange']],
  [/^\/v2\/security\/role(\/|$)/, ['RoleChange']],
  [/^\/v2\/security\/resource(\/|$)/, ['ResourceChange']],
  [/^\/v2\/security\/service(\/|$)/, ['ServiceChange']],
  [/^\/v2\/web-app(\/|$)/, ['ApplicationChange']],
  [/^\/v2\/security\/ssl-configuration(\/|$)/, ['SSLConfigChange']],
  [/^\/v2\/security\/x509-credential(\/|$)/, ['X509CredentialChange']],
  [/^\/v2\/security\/ldap(\/|$)/, ['LDAPConfigChange']],
  [/^\/v2\/security\/audit\/(enabled|event)(\/|$)/, ['AuditChange']],
  [/^\/v2\/security\/(sql|oauth2|domain|kmip|encryption|wallet)(\/|$)/, []],
];

/** Requests that read or query, and therefore leave no change record. */
const NOT_A_CHANGE = new Set([
  '/v2/security/audit/records',
  '/v2/security/audit/record',
  '/v2/security/audit/record/copy',
  '/v2/security/ssl-configuration/test',
  '/v2/security/ldap/test',
]);

/** Null when the request is not a security change IRIS audits. */
export function auditExpectation(method: string, path: string): AuditExpectation | null {
  if (method === 'GET' || method === 'HEAD') return null;
  if (NOT_A_CHANGE.has(path)) return null;
  for (const [re, events] of RULES) if (re.test(path)) return { events, eventType: '%Security' };
  return null;
}

/** The subject of a change as the request named it: `?name=jdoe`, `?alias=…`, `?id=…`. */
export function auditSubject(query: string): string | null {
  const q = new URLSearchParams(query);
  return q.get('name') ?? q.get('alias') ?? q.get('id') ?? null;
}

/** How far either side of the request time the audit log is searched. */
export const AUDIT_WINDOW_MS = 5 * 60_000;

interface RecordLike {
  Event?: string;
  Description?: string;
  EventData?: string;
}

/**
 * Records that plausibly belong to a change: the expected event, and the subject named in
 * the description or the event data when the request named one. The subject must appear as
 * a whole name: user "a" is not in "Role %Manager modified", and "ops" not in "devops".
 */
export function matchAuditRecords<T extends RecordLike>(
  records: T[],
  expect: AuditExpectation,
  subject: string | null,
): T[] {
  const escaped = subject?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Names may hold %, _, / and . (%Manager, /api/admin, john.doe): other characters, or a full
  // stop that ends the sentence, delimit one.
  const named = escaped ? new RegExp(`(^|[^\\w%./-])${escaped}($|[^\\w%./-]|\\.(?=\\s|$))`, 'i') : null;
  return records.filter(
    (r) =>
      (expect.events.length === 0 || expect.events.includes(r.Event ?? '')) &&
      (!named || named.test(`${r.Description ?? ''}\n${r.EventData ?? ''}`)),
  );
}
