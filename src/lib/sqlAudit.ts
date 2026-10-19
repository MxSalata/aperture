/**
 * What the IRIS audit settings mean for the statements run through Dynamic SQL: pure, so the
 * Health check can use it as well as the SQL screen. The writes that change the settings are in
 * `features/security/audit.ts`.
 */

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
  /**
   * The audit settings could not be read (no %Admin_Secure:U, or the read failed), or the instance
   * does not list the events that would tell.
   */
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
  /** A split change event the instance does not list (it lists the other): the state is unknown. */
  missing: string[];
}

/**
 * Whether IRIS writes the SQL screen's statements to its audit log. Nothing is written while
 * system-wide auditing is off, whatever the events say; with it on, changes are written when
 * both DynamicStatementDML and DynamicStatementDDL are on (or the combined DynamicStatement, on
 * an instance that lists no split events), and queries when DynamicStatementQuery is on. An
 * instance that lists one split change event but not the other leaves the state unknown, and a
 * split instance with no query event audits changes at most, never "all".
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
  const missing = split ? [SQL_AUDIT.dml, SQL_AUDIT.ddl].filter((id) => !byId.has(id)) : [];
  const base = { auditing, changeEvents, queryEvent, queries, events, missing };
  // Not read, or the instance lists none of the events (or only one of the split change events):
  // nothing to go on.
  if (auditing === undefined || !rows || !changeIds.length || missing.length)
    return { ...base, level: 'unknown' };
  const changes = !changeEvents.length;
  const level: SqlAuditLevel = !auditing || !changes ? 'off' : queries ? 'all' : 'changes';
  return { ...base, level };
}

const KIND: Record<string, string> = {
  [SQL_AUDIT.dml]: 'changes to data (INSERT, UPDATE, DELETE)',
  [SQL_AUDIT.ddl]: 'changes to definitions (DDL)',
  [SQL_AUDIT.combined]: 'statements',
};

/**
 * What goes unrecorded while system-wide auditing is on but some change events are off: every
 * statement when no SQL event is on, otherwise the kinds of change those events would record
 * ("changes to definitions (DDL)"), so a partial state is not described as nothing audited.
 */
export function unauditedChanges(state: SqlAuditState): { all: boolean; kinds: string } {
  const all = state.auditing === false || state.events.every((e) => !e.enabled);
  return { all, kinds: state.changeEvents.map((id) => KIND[id] ?? id).join(' and ') };
}
