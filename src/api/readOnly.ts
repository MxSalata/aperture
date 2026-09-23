/**
 * Operations that change nothing on the instance although they are not GETs: the API sends some
 * reads as POST (a filter in the body, a test, or a long read queued as a task).
 */
const READ_POSTS: ReadonlySet<string> = new Set([
  '/v2/database-dir/info',
  '/v2/database-dir/integrity-check',
  '/v2/journal/file/integrity-check',
  '/v2/journal/file/records',
  '/v2/license/key/validate',
  '/v2/security/audit/records',
  '/v2/security/ldap/test',
  '/v2/security/ssl-configuration/test',
]);

const TASK_CONTROL = /^\/v2\/async-result\/(cancel|pause|resume)$/;

/** Whether `METHOD path` (relative to the API prefix) only reads. */
export function isReadOperation(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || (m === 'POST' && READ_POSTS.has(path));
}

/**
 * Whether a read-only tab may send this request: reads, and cancelling, pausing or resuming a task
 * that is itself a read (an integrity check started from this tab). `taskPath` names the
 * operation that queued a task this tab knows; a task it does not know is not touched.
 */
export function allowedWhenReadOnly(
  method: string,
  path: string,
  query: URLSearchParams,
  taskPath: (id: string) => string | undefined,
): boolean {
  if (isReadOperation(method, path)) return true;
  if (method.toUpperCase() !== 'POST' || !TASK_CONTROL.test(path)) return false;
  const id = query.get('id');
  const queuedBy = id ? taskPath(id) : undefined;
  return !!queuedBy && isReadOperation('POST', queuedBy);
}

export const READ_ONLY_REFUSAL =
  'Not sent: this tab is read-only. Turn read-only off in the account menu to make changes.';
