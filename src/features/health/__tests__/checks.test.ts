import { describe, expect, it } from 'vitest';
import {
  CHECKS,
  checkAlerts,
  checkAllHolders,
  checkAuditing,
  checkBackup,
  checkCertificates,
  checkDatabases,
  checkDiskSpace,
  checkJournalFreeze,
  checkJournalSpace,
  checkLicence,
  checkMessagesLog,
  checkServices,
  checkSystemMonitor,
  checkTasks,
  checkUnknownUser,
  checkWebApps,
  sortFindings,
} from '../checks';
import { parseLogLines } from '@/lib/messagesLog';

const READ = 1_700_000_000_000;
const NOW = Date.parse('2026-09-28T12:00:00');
const iris = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

describe('health checks', () => {
  it('names every check with an area and what it reads', () => {
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length);
    for (const c of CHECKS) expect(c.reads).toMatch(/GET /);
  });

  it('disk space: low and critical disks, with the databases on them', () => {
    const findings = checkDiskSpace(
      [
        {
          path: '/irisdata/',
          freeMB: 1500,
          usedMB: 4000,
          databases: ['CLINICAL', 'INTEROP'],
          level: 'critical',
        },
        { path: '/usr/irissys/mgr/', freeMB: 8000, usedMB: 2000, databases: ['USER'], level: 'low' },
        { path: '/big/', freeMB: 900_000, usedMB: 10, databases: ['ARCHIVE'], level: 'ok' },
      ],
      READ,
    );
    expect(findings.map((f) => [f.severity, f.title])).toEqual([
      ['critical', 'Critically low disk space on /irisdata/'],
      ['warning', 'Low disk space on /usr/irissys/mgr/'],
    ]);
    expect(findings[0].link?.to).toBe('/databases');
    expect(findings[0].evidence.fields.find((f) => f.label === 'Databases')?.value).toBe('CLINICAL, INTEROP');
  });

  it('databases: not mounted, read-only (except the libraries), not at startup, near the maximum', () => {
    const findings = checkDatabases(
      [
        { name: 'USER', directory: '/mgr/user/', mounted: false, mountAtStartup: true },
        { name: 'ENSLIB', directory: '/mgr/enslib/', mounted: true, readOnly: true },
        {
          name: 'APP',
          directory: '/mgr/app/',
          mounted: true,
          readOnly: true,
          mountAtStartup: false,
          sizeMB: 950,
          maxSize: '1000',
        },
        { name: 'FULL', directory: '/mgr/full/', mounted: true, sizeMB: 98, maxSize: 100 },
        { name: 'FREE', directory: '/mgr/free/', mounted: true, sizeMB: 500, maxSize: 'Unlimited' },
      ],
      READ,
    );
    expect(findings.map((f) => f.id)).toEqual([
      'databases:USER:mounted',
      'databases:APP:read-only',
      'databases:APP:startup',
      'databases:APP:size',
      'databases:FULL:size',
    ]);
    expect(findings.map((f) => f.severity)).toEqual([
      'critical',
      'warning',
      'warning',
      'warning',
      'critical',
    ]);
    expect(findings[0].link?.to).toBe('/databases/detail?dir=%2Fmgr%2Fuser%2F&name=USER');
  });

  it('journal: freeze on error off, and the journal space state', () => {
    expect(checkJournalFreeze({ FreezeOnError: true }, READ)).toEqual([]);
    expect(checkJournalFreeze(undefined, READ)).toEqual([]);
    expect(checkJournalFreeze({ FreezeOnError: false }, READ).map((f) => f.severity)).toEqual(['warning']);
    expect(checkJournalSpace({ SystemUsage: { JournalSpace: 'Normal' } }, READ)).toEqual([]);
    expect(checkJournalSpace({ SystemUsage: { JournalSpace: 'Warning' } }, READ)[0].severity).toBe('warning');
    expect(checkJournalSpace({ SystemUsage: { JournalSpace: 'Troubled' } }, READ)[0].severity).toBe(
      'critical',
    );
  });

  it('backup: never, a week ago, yesterday', () => {
    expect(checkBackup({ Status: { LastBackup: 'Never' } }, READ, NOW)[0].title).toMatch(
      /No backup has ever/,
    );
    const old = checkBackup({ Status: { LastBackup: iris(new Date(NOW - 9 * 86_400_000)) } }, READ, NOW);
    expect(old[0].title).toBe('The last backup is 9 days old');
    expect(checkBackup({ Status: { LastBackup: iris(new Date(NOW - 86_400_000)) } }, READ, NOW)).toEqual([]);
    expect(checkBackup(undefined, READ, NOW)).toEqual([]);
  });

  it('security: UnknownUser, auditing and the login events, open services and applications, %All', () => {
    expect(checkUnknownUser([{ Name: 'UnknownUser', Enabled: false }], READ)).toEqual([]);
    expect(
      checkUnknownUser([{ Name: 'UnknownUser', Enabled: true, Roles: ['%DB_USER'] }], READ)[0].link?.to,
    ).toBe('/security/users/UnknownUser');
    const audit = checkAuditing(
      {
        enabled: false,
        // As the list answers (the name joined) and as the parts, both.
        events: [
          { EventName: '%System/%Login/Login', Enabled: false },
          { EventSource: '%System', EventType: '%Login', EventName: 'LoginFailure', Enabled: true },
        ],
      },
      READ,
    );
    expect(audit.map((f) => [f.severity, f.id])).toEqual([
      ['critical', 'auditing:off'],
      ['warning', 'auditing:Login'],
    ]);
    const services = checkServices(
      [
        { Name: '%Service_Terminal', Enabled: true, AuthenticationMethods: ['Unauthenticated', 'Password'] },
        { Name: '%Service_Weblink', Enabled: false, AutheEnabled: 64 },
        { Name: '%Service_Bindings', Enabled: 'Yes', AutheEnabled: 32 },
        { Name: '%Service_CallIn', Enabled: 'Yes', AutheEnabled: 112 },
      ],
      READ,
    );
    expect(services.map((f) => f.title)).toEqual([
      '%Service_Terminal accepts unauthenticated access',
      '%Service_CallIn accepts unauthenticated access',
    ]);
    const apps = checkWebApps(
      [
        { Name: '/aperture', Namespace: '%SYS', Enabled: true, AutheEnabled: 64, DispatchClass: '' },
        {
          Name: '/api/monitor',
          Namespace: '%SYS',
          Enabled: true,
          AutheEnabled: 64,
          DispatchClass: '%Api.Monitor',
          IsSystemApp: true,
        },
        {
          Name: '/hl7',
          Namespace: 'CLINICAL',
          Enabled: true,
          AutheEnabled: 96,
          DispatchClass: 'dc.HL7.REST',
        },
        { Name: '/csp/legacy', Namespace: 'OLDAPP', Enabled: true, AutheEnabled: 32, DispatchClass: '' },
      ],
      ['%SYS', 'USER', 'CLINICAL'],
      READ,
    );
    expect(apps.map((f) => [f.severity, f.id])).toEqual([
      ['advice', 'web-apps:/api/monitor:open'],
      ['warning', 'web-apps:/hl7:open'],
      ['warning', 'web-apps:/csp/legacy:namespace'],
    ]);
    // Without the namespace list, only the open-access part runs.
    expect(
      checkWebApps(
        [{ Name: '/csp/legacy', Namespace: 'OLDAPP', Enabled: true, AutheEnabled: 32 }],
        undefined,
        READ,
      ),
    ).toEqual([]);
    const all = checkAllHolders(
      [
        { Name: '_SYSTEM', Type: 'User' },
        { Name: 'old', Type: 'User' },
        { Name: 'ops', Type: 'User (escalation)' },
        { Name: '%Manager', Type: 'Role' },
      ],
      [
        { Name: '_SYSTEM', Enabled: true },
        { Name: 'old', Enabled: false },
        { Name: 'ops', Enabled: true },
      ],
      READ,
    );
    expect(all[0].title).toBe('1 enabled account holds %All');
    expect(all[0].severity).toBe('advice');
  });

  it('certificates: expired is critical, within 30 days a warning, later nothing', () => {
    const findings = checkCertificates(
      [
        { Alias: 'old', ValidityNotAfter: iris(new Date(NOW - 40 * 86_400_000)) },
        { Alias: 'soon', ValidityNotAfter: iris(new Date(NOW + 12 * 86_400_000)) },
        { Alias: 'fine', ValidityNotAfter: iris(new Date(NOW + 400 * 86_400_000)) },
        { Alias: 'unread', ValidityNotAfter: null },
      ],
      READ,
      NOW,
    );
    expect(findings.map((f) => [f.severity, f.title])).toEqual([
      ['critical', 'Certificate old expired 40 days ago'],
      ['warning', 'Certificate soon expires in 12 days'],
    ]);
  });

  it('tasks, the system monitor, alerts and the licence', () => {
    const tasks = checkTasks(
      [
        { Id: 7, Name: 'Nightly export' },
        { Id: 8, Name: 'Warm cache', Suspended: true },
        { Id: 9, Name: 'Purge' },
      ],
      [
        { TaskId: 7, Status: 'Success', LastFinished: '2026-09-26 02:00:00' },
        { TaskId: 7, Status: 'Error', Error: 'SFTP refused', LastFinished: '2026-09-27 02:00:00' },
        { TaskId: 9, Status: 'Error', LastFinished: '2026-09-25 01:00:00' },
        { TaskId: 9, Status: 'Success', LastFinished: '2026-09-27 01:00:00' },
      ],
      READ,
    );
    expect(tasks.map((f) => [f.severity, f.link?.to])).toEqual([
      ['warning', '/tasks/7'],
      ['advice', '/tasks/8'],
    ]);
    expect(checkSystemMonitor({ Status: { SystemMonitor: false } }, READ)[0].severity).toBe('warning');
    expect(checkSystemMonitor({ Status: { SystemMonitor: true } }, READ)).toEqual([]);
    expect(checkAlerts({ Alerts: { SeriousAlerts: '2' } }, READ)[0].title).toBe(
      '2 serious alerts in alerts.log',
    );
    expect(checkAlerts({ Alerts: { SeriousAlerts: 0 } }, READ)).toEqual([]);
    expect(checkLicence({ Licensing: { LicenseUse: 100, LicenseLimit: 8 } }, READ)[0].severity).toBe(
      'critical',
    );
    expect(checkLicence({ Licensing: { LicenseUse: 85 } }, READ)[0].severity).toBe('warning');
    expect(checkLicence({ Licensing: { LicenseUse: 40, LicenseUseHigh: 100 } }, READ)[0].id).toBe(
      'licence:peak',
    );
    expect(checkLicence({ Licensing: { LicenseUse: 40, LicenseUseHigh: 65 } }, READ)).toEqual([]);
  });

  it('messages.log: severe entries of the last 24 hours, newest first, at most ten, linked to their similar entries', () => {
    const stamp = (msAgo: number) => {
      const d = new Date(NOW - msAgo);
      const p = (n: number, w = 2) => String(n).padStart(w, '0');
      return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)}-${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    // In file order, oldest first, as a window is; the screen shows the newest first.
    const lines = [
      `${stamp(30 * 3_600_000)} (1) 3 [Generic.Event] old fatal`,
      ...Array.from(
        { length: 12 },
        (_, i) => `${stamp(6_000_000 - i * 60_000)} (1) 2 [Utility.Event] repeated ${i}`,
      ),
      `${stamp(2 * 3_600_000)} (1) 0 [Generic.Event] fine`,
      `${stamp(3_600_000)} (1) 2 [Generic.Event] ERROR #5002: SFTP connection refused`,
    ];
    const entries = parseLogLines(lines).reverse();
    const findings = checkMessagesLog(entries, 'messages.log', READ, NOW);
    expect(findings).toHaveLength(10);
    expect(findings[0].title).toMatch(/^Severe entry .* SFTP connection refused/);
    expect(findings[0].link?.to).toBe(
      `/logs/messages?file=messages.log&at=${encodeURIComponent(entries[0].time)}`,
    );
    expect(findings.some((f) => /old fatal/.test(f.title))).toBe(false);
  });

  it('sorts findings by severity, then area and title', () => {
    const sorted = sortFindings([
      ...checkAlerts({ Alerts: { SeriousAlerts: 1 } }, READ),
      ...checkAllHolders([{ Name: 'a', Type: 'User' }], [{ Name: 'a', Enabled: true }], READ),
      ...checkAuditing({ enabled: false }, READ),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(['critical', 'warning', 'advice']);
  });
});
