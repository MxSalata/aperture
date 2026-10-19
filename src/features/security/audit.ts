import { api, result, run } from '@/api/hooks';

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

/** A row of GET /v2/security/audit/events: `EventName` is "%System/%SQL/DML", or the three parts. */
export interface AuditEventRow {
  EventSource?: string;
  EventType?: string;
  EventName?: string;
  Enabled?: boolean;
}

/** The full "source/type/name" of a row, whichever way it is given. */
export function auditEventId(e: AuditEventRow): string {
  if (e.EventSource && e.EventType) return `${e.EventSource}/${e.EventType}/${e.EventName ?? ''}`;
  return e.EventName ?? '';
}

/**
 * The events that record what the SQL screen runs. The screen runs Dynamic SQL through the
 * Atelier API, and IRIS 2026.2 counts those statements under the split DynamicStatement events
 * (one for changes to data, one for changes to definitions, one for queries). An instance that
 * lists only the combined DynamicStatement event audits all three through it.
 */
export const SQL_AUDIT = {
  dml: '%System/%SQL/DynamicStatementDML',
  ddl: '%System/%SQL/DynamicStatementDDL',
  query: '%System/%SQL/DynamicStatementQuery',
  combined: '%System/%SQL/DynamicStatement',
} as const;

export type SqlAuditLevel =
  /** The audit settings could not be read: no %Admin_Secure:U, or the read failed. */
  | 'unknown'
  /** Neither changes nor queries are written to the audit log. */
  | 'off'
  /** Changes (DML and DDL) are written, queries are not. */
  | 'changes'
  /** Changes and queries are written. */
  | 'all';

export interface SqlAuditState {
  level: SqlAuditLevel;
  /** System-wide auditing (GET /v2/security/audit/enabled); undefined when not read. */
  auditing?: boolean;
  /** The events to switch on so changes are written (empty when they already are, or none is listed). */
  changeEvents: string[];
  /** The event to switch on so queries are written too, if it is off. */
  queryEvent?: string;
  /** Whether queries are written (auditing on and the query event on). */
  queries: boolean;
  /** The SQL events as read, with their state, for the evidence. */
  events: { id: string; enabled: boolean }[];
}

/**
 * Whether IRIS writes the SQL screen's statements to its audit log. Nothing is written while
 * system-wide auditing is off, whatever the events say; with it on, changes are written when
 * both DynamicStatementDML and DynamicStatementDDL are on (or the combined DynamicStatement, on
 * an instance that lists no split events), and queries when DynamicStatementQuery is on.
 */
export function sqlAuditState(
  auditing: boolean | undefined,
  rows: AuditEventRow[] | undefined,
): SqlAuditState {
  const byId = new Map((rows ?? []).map((e) => [auditEventId(e), e.Enabled === true]));
  const split = byId.has(SQL_AUDIT.dml) || byId.has(SQL_AUDIT.ddl) || byId.has(SQL_AUDIT.query);
  const changeIds: string[] = split
    ? [SQL_AUDIT.dml, SQL_AUDIT.ddl].filter((id) => byId.has(id))
    : byId.has(SQL_AUDIT.combined)
      ? [SQL_AUDIT.combined]
      : [];
  const queryId: string | undefined = split
    ? byId.has(SQL_AUDIT.query)
      ? SQL_AUDIT.query
      : undefined
    : changeIds[0];
  const events = [...changeIds, ...(queryId && !changeIds.includes(queryId) ? [queryId] : [])].map((id) => ({
    id,
    enabled: byId.get(id) === true,
  }));
  const changeEvents = changeIds.filter((id) => !byId.get(id));
  const queryEvent = queryId && !byId.get(queryId) ? queryId : undefined;
  const queries = auditing === true && !!queryId && byId.get(queryId) === true;
  const base = { auditing, changeEvents, queryEvent, queries, events };
  // Not read, or the instance lists none of the events: nothing to go on.
  if (auditing === undefined || !rows || !changeIds.length) return { ...base, level: 'unknown' };
  // A split instance needs both change events; one of them alone leaves the other kind unrecorded.
  const changes = changeIds.length === (split ? 2 : 1) && !changeEvents.length;
  const level: SqlAuditLevel = !auditing || !changes ? 'off' : queryEvent ? 'changes' : 'all';
  return { ...base, level };
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
