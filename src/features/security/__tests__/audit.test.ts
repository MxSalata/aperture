import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { resetClients } from '@/api/client';
import { mockDb, resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { useActivity } from '@/stores/activity';
import { useSession } from '@/stores/session';
import { auditEventId, sqlAuditState, SQL_AUDIT } from '@/lib/sqlAudit';
import { enableAuditing, enableSqlAuditEvents, readSqlAudit, splitEvent } from '../audit';

const signIn = () =>
  useSession.getState().login({
    connectionId: 't',
    baseUrl: 'http://iris.test',
    username: '_SYSTEM',
    password: 'SYS',
    auth: 'basic',
  });

const row = (id: string, Enabled: boolean) => ({ EventName: id, Enabled });

describe('splitEvent and auditEventId', () => {
  it('split a full name into the query parameters and join either shape back', () => {
    expect(splitEvent('%System/%SQL/DynamicStatementDML')).toEqual({
      source: '%System',
      type: '%SQL',
      name: 'DynamicStatementDML',
    });
    expect(auditEventId({ EventName: '%System/%SQL/DML' })).toBe('%System/%SQL/DML');
    expect(auditEventId({ EventSource: '%System', EventType: '%SQL', EventName: 'DML' })).toBe(
      '%System/%SQL/DML',
    );
  });
});

describe('sqlAuditState', () => {
  // As IRIS for Health 2026.2 lists them out of the box: every %SQL event off.
  const shipped = [
    row(SQL_AUDIT.combined, false),
    row(SQL_AUDIT.ddl, false),
    row(SQL_AUDIT.dml, false),
    row(SQL_AUDIT.query, false),
    row('%System/%SQL/DML', false),
    row('%System/%Login/Login', true),
  ];

  it('is off as IRIS ships, and names the two change events to switch on', () => {
    const s = sqlAuditState(true, shipped);
    expect(s.level).toBe('off');
    expect(s.changeEvents).toEqual([SQL_AUDIT.dml, SQL_AUDIT.ddl]);
    expect(s.queryEvent).toBe(SQL_AUDIT.query);
    expect(s.queries).toBe(false);
    expect(s.events.map((e) => e.id)).toEqual([SQL_AUDIT.dml, SQL_AUDIT.ddl, SQL_AUDIT.query]);
  });

  it('needs both change events: DML alone leaves DDL unrecorded', () => {
    const s = sqlAuditState(true, [
      row(SQL_AUDIT.dml, true),
      row(SQL_AUDIT.ddl, false),
      row(SQL_AUDIT.query, false),
    ]);
    expect(s.level).toBe('off');
    expect(s.changeEvents).toEqual([SQL_AUDIT.ddl]);
  });

  it('audits changes, then everything, and nothing while system-wide auditing is off', () => {
    const changes = [row(SQL_AUDIT.dml, true), row(SQL_AUDIT.ddl, true), row(SQL_AUDIT.query, false)];
    expect(sqlAuditState(true, changes).level).toBe('changes');
    const all = [row(SQL_AUDIT.dml, true), row(SQL_AUDIT.ddl, true), row(SQL_AUDIT.query, true)];
    expect(sqlAuditState(true, all)).toMatchObject({ level: 'all', queries: true, changeEvents: [] });
    expect(sqlAuditState(false, all)).toMatchObject({
      level: 'off',
      auditing: false,
      changeEvents: [],
      queries: false,
    });
  });

  it('reads the combined DynamicStatement only on an instance that lists no split event', () => {
    expect(sqlAuditState(true, [row(SQL_AUDIT.combined, false)])).toMatchObject({
      level: 'off',
      changeEvents: [SQL_AUDIT.combined],
      queryEvent: SQL_AUDIT.combined,
    });
    expect(sqlAuditState(true, [row(SQL_AUDIT.combined, true)]).level).toBe('all');
    // Where the split events exist, the combined one on does not make the screen's statements audited.
    expect(sqlAuditState(true, [row(SQL_AUDIT.combined, true), ...shipped.slice(1)]).level).toBe('off');
  });

  it('is unknown when nothing was read or the instance lists no Dynamic SQL event', () => {
    expect(sqlAuditState(undefined, shipped).level).toBe('unknown');
    expect(sqlAuditState(true, undefined).level).toBe('unknown');
    expect(sqlAuditState(true, [row('%System/%Login/Login', true)]).level).toBe('unknown');
  });
});

describe('enabling SQL auditing', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    useActivity.getState().clear();
    await signIn();
  });

  it('switches the change events on, reads them back and leaves the writes in Activity', async () => {
    expect((await readSqlAudit()).level).toBe('off');
    const after = await enableSqlAuditEvents([SQL_AUDIT.dml, SQL_AUDIT.ddl]);
    expect(after.level).toBe('changes');
    expect(
      mockDb.auditEvents.filter((e) => e.EventType === '%SQL' && e.Enabled).map((e) => e.EventName),
    ).toEqual(['DynamicStatementDDL', 'DynamicStatementDML']);
    const writes = useActivity.getState().entries.filter((e) => e.method === 'PUT');
    // Newest first.
    expect(writes.map((e) => e.query)).toEqual([
      expect.stringContaining('name=DynamicStatementDDL'),
      expect.stringContaining('name=DynamicStatementDML'),
    ]);
    // IRIS audits the change to its audit settings.
    expect(mockDb.auditLog[0]).toMatchObject({ Event: 'AuditChange' });
  });

  it('fails when IRIS answers the change but still reports the event off', async () => {
    server.use(
      http.put('*/api/admin/v2/security/audit/event', () =>
        HttpResponse.json({ status: { errors: [], summary: '' }, console: [], result: {} }),
      ),
    );
    await expect(enableSqlAuditEvents([SQL_AUDIT.dml])).rejects.toThrow(
      /still reports %System\/%SQL\/DynamicStatementDML as off/,
    );
  });

  it('switches system-wide auditing on and reads it back', async () => {
    mockDb.auditEnabled = false;
    expect((await enableAuditing()).auditing).toBe(true);
    expect(mockDb.auditEnabled).toBe(true);
  });
});
