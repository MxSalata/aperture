import { describe, expect, it } from 'vitest';
import { auditExpectation, auditSubject, matchAuditRecords } from '../auditEvents';

describe('auditExpectation', () => {
  it('maps security writes to the native change event', () => {
    expect(auditExpectation('PUT', '/v2/security/user')?.events).toEqual(['UserChange']);
    expect(auditExpectation('POST', '/v2/security/user/password')?.events).toEqual(['UserChange']);
    expect(auditExpectation('DELETE', '/v2/security/role')?.events).toEqual(['RoleChange']);
    expect(auditExpectation('PUT', '/v2/web-app')?.events).toEqual(['ApplicationChange']);
    expect(auditExpectation('PUT', '/v2/security/ssl-configuration')?.events).toEqual(['SSLConfigChange']);
    expect(auditExpectation('PUT', '/v2/security/audit/enabled')?.events).toEqual(['AuditChange']);
  });
  it('accepts any %Security event for areas without a single event name', () => {
    expect(auditExpectation('PUT', '/v2/security/oauth2/server')).toEqual({
      events: [],
      eventType: '%Security',
    });
  });
  it('ignores reads, queries and tests', () => {
    expect(auditExpectation('GET', '/v2/security/user')).toBeNull();
    expect(auditExpectation('POST', '/v2/security/audit/records')).toBeNull();
    expect(auditExpectation('POST', '/v2/security/ssl-configuration/test')).toBeNull();
    expect(auditExpectation('POST', '/v2/database-dir/compact')).toBeNull();
  });
});

describe('auditSubject', () => {
  it('reads the name, alias or id the request addressed', () => {
    expect(auditSubject('name=jdoe')).toBe('jdoe');
    expect(auditSubject('alias=WebServerCert')).toBe('WebServerCert');
    expect(auditSubject('id=12')).toBe('12');
    expect(auditSubject('')).toBeNull();
  });
});

describe('matchAuditRecords', () => {
  const records = [
    { Event: 'UserChange', Description: 'User jdoe modified', EventData: 'Comment' },
    { Event: 'UserChange', Description: 'User ops modified', EventData: '' },
    { Event: 'Login', Description: 'jdoe logged in', EventData: '' },
    { Event: 'RoleChange', Description: 'Role Clinician modified', EventData: 'Resources' },
  ];
  it('keeps the expected event that names the subject', () => {
    const m = matchAuditRecords(records, { events: ['UserChange'], eventType: '%Security' }, 'jdoe');
    expect(m).toEqual([records[0]]);
  });
  it('keeps every expected event when the request named no subject', () => {
    const m = matchAuditRecords(records, { events: ['UserChange'], eventType: '%Security' }, null);
    expect(m).toHaveLength(2);
  });
  it('matches case-insensitively in the description or the event data', () => {
    const m = matchAuditRecords(records, { events: ['RoleChange'], eventType: '%Security' }, 'clinician');
    expect(m).toEqual([records[3]]);
  });
  it('accepts any event when the expectation lists none', () => {
    expect(matchAuditRecords(records, { events: [], eventType: '%Security' }, 'jdoe')).toHaveLength(2);
  });
  it('matches the subject as a whole name, not as a substring', () => {
    const recs = [
      { Event: 'UserChange', Description: 'User devops modified' },
      { Event: 'UserChange', Description: 'User ops modified.' },
      { Event: 'UserChange', Description: 'User john.doe modified' },
      { Event: 'RoleChange', Description: 'Role %Manager modified' },
    ];
    const any = { events: [], eventType: '%Security' };
    expect(matchAuditRecords(recs, any, 'ops').map((r) => r.Description)).toEqual(['User ops modified.']);
    expect(matchAuditRecords(recs, any, 'john')).toEqual([]);
    expect(matchAuditRecords(recs, any, 'john.doe')).toHaveLength(1);
    expect(matchAuditRecords(recs, any, 'a')).toEqual([]);
    expect(matchAuditRecords(recs, any, '%Manager')).toHaveLength(1);
  });
});
