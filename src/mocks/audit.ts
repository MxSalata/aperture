import { mockDb, type AuditRecordRec } from './db';
import { now } from './util';

let nextIndex = 5_000_001;

/**
 * Real IRIS writes an audit record for every security change (%System/%Security/UserChange,
 * RoleChange, …). The mock does the same, so the Activity screen's "find in audit" works in
 * the demo exactly as it does against an instance.
 */
export function recordAudit(
  account: { username: string },
  event: string,
  description: string,
  eventData = '',
): AuditRecordRec {
  const stamp = now();
  const rec: AuditRecordRec = {
    SystemID: 'iris-demo:IRIS',
    AuditIndex: nextIndex++,
    TimeStamp: stamp,
    UTCTimeStamp: stamp,
    EventSource: '%System',
    EventType: '%Security',
    Event: event,
    Pid: 5401,
    JobNumber: 1,
    JobId: 5401,
    SessionID: '',
    Username: account.username,
    Description: description,
    Authentication: 'JWT',
    ClientExecutableName: 'CSPa24.so',
    ClientIPAddress: '127.0.0.1',
    EventData: eventData,
    Namespace: '%SYS',
    Roles: '%All',
    RoutineSpec: '%SYS.REST.1',
    UserInfo: '',
    Status: 'Success',
  };
  mockDb.auditLog.unshift(rec);
  const ev = mockDb.auditEvents.find((e) => e.EventType === '%Security' && e.EventName === event);
  if (ev) {
    ev.Total += 1;
    ev.Written += 1;
  }
  return rec;
}
