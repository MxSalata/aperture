import { api, result, run } from '@/api/hooks';
import { sqlAuditState, type AuditEventRow, type SqlAuditState } from '@/lib/sqlAudit';

/** `%System/%Login/LoginFailure` → parts for the query params. */
export function splitEvent(name: string | undefined): { source: string; type: string; name: string } {
  const [source = '', type = '', ...rest] = (name ?? '').split('/');
  return { source, type, name: rest.join('/') };
}

/** PUT /v2/security/audit/event: switch one event on or off (IRIS writes a %Security/AuditChange record). */
export function setAuditEvent(id: string, enabled: boolean) {
  return run(
    api().PUT('/v2/security/audit/event', { params: { query: splitEvent(id) }, body: { Enabled: enabled } }),
    'PUT',
  );
}

/** GET both audit settings and say what they mean for SQL: the read-back after a change. */
export async function readSqlAudit(): Promise<SqlAuditState> {
  const [enabled, events] = await Promise.all([
    result(api().GET('/v2/security/audit/enabled')),
    result(api().GET('/v2/security/audit/events')),
  ]);
  return sqlAuditState((enabled as { Enabled?: boolean }).Enabled, events as AuditEventRow[]);
}

/**
 * Switch the given SQL audit events on, then read the settings back: done only when IRIS reports
 * every one of them on, otherwise the error names those it still reports off.
 */
export async function enableSqlAuditEvents(ids: string[]): Promise<SqlAuditState & { summary?: string }> {
  for (const id of ids) await setAuditEvent(id, true);
  const after = await readSqlAudit();
  const off = after.events.filter((e) => ids.includes(e.id) && !e.enabled).map((e) => e.id);
  if (off.length) throw new Error(`IRIS answered the change but still reports ${off.join(' and ')} as off.`);
  return after;
}

/** PUT /v2/security/audit/enabled to switch system-wide auditing on, then read it back. */
export async function enableAuditing(): Promise<SqlAuditState & { summary?: string }> {
  await run(api().PUT('/v2/security/audit/enabled', { body: { Enabled: true } }), 'PUT');
  const after = await readSqlAudit();
  if (after.auditing !== true) throw new Error('IRIS answered the change but still reports auditing as off.');
  return after;
}
