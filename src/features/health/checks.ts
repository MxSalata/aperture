import { certificateStatus, EXPIRY_WARNING_DAYS } from '@/lib/certs';
import { parseIrisDate } from '@/lib/format';
import { serviceEnabled } from '@/features/security/keys';
import type { StorageLocation } from '@/features/databases/storage';

/**
 * The health check's findings and the checks that produce them. Every check is a pure function
 * over data a screen already reads (the runner fetches it with the signed-in account's own
 * access), deterministic, and says what it means, what to do, what it read and where the fix is.
 * No score: counts by severity and the list of what was and was not examined.
 */
export type Severity = 'critical' | 'warning' | 'advice';
export const SEVERITIES: Severity[] = ['critical', 'warning', 'advice'];
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  advice: 'Advice',
};

export type Area =
  'Databases' | 'Journal' | 'Backup' | 'Security' | 'Certificates' | 'Tasks' | 'System' | 'Logs';
export const AREAS: Area[] = [
  'Databases',
  'Journal',
  'Backup',
  'Security',
  'Certificates',
  'Tasks',
  'System',
  'Logs',
];

export type CheckId =
  | 'disk-space'
  | 'databases'
  | 'journal-freeze'
  | 'journal-space'
  | 'backup'
  | 'unknown-user'
  | 'auditing'
  | 'services'
  | 'web-apps'
  | 'all-holders'
  | 'certificates'
  | 'tasks'
  | 'system-monitor'
  | 'alerts'
  | 'licence'
  | 'messages-log';

/** What a check read: the API it came from, when, and the fields with their values. */
export interface Evidence {
  source: string;
  /** Milliseconds since the epoch, when the data was read. */
  read: number;
  fields: { label: string; value: string }[];
}

export interface Finding {
  id: string;
  check: CheckId;
  severity: Severity;
  area: Area;
  title: string;
  meaning: string;
  action: string;
  evidence: Evidence;
  /** The Aperture screen where the fix is made, with the review and confirmation it gives. */
  link?: { to: string; label: string };
}

export interface CheckInfo {
  id: CheckId;
  title: string;
  area: Area;
  /** Resources any of which lets the account read the data (empty: no resource, another gate). */
  needs: string[];
  /** What the check reads, for the list of checks. */
  reads: string;
}

export const CHECKS: CheckInfo[] = [
  {
    id: 'disk-space',
    title: 'Disk space where the databases live',
    area: 'Databases',
    needs: ['%Admin_Manage:U'],
    reads: 'GET /v2/database-dir/volumes per database',
  },
  {
    id: 'databases',
    title: 'Databases mounted, writable, mounted at startup, within their maximum size',
    area: 'Databases',
    needs: ['%Admin_Manage:U'],
    reads: 'GET /v2/databases, GET /v2/database-dirs',
  },
  {
    id: 'journal-freeze',
    title: 'Journal: freeze on error',
    area: 'Journal',
    needs: ['%Admin_Journal:U', '%Admin_Manage:U'],
    reads: 'GET /v2/journal/settings',
  },
  {
    id: 'journal-space',
    title: 'Journal space',
    area: 'Journal',
    needs: ['%Admin_Operate:U'],
    reads: 'GET /v2/monitor/dashboard/main (SystemUsage.JournalSpace)',
  },
  {
    id: 'backup',
    title: 'Last backup',
    area: 'Backup',
    needs: ['%Admin_Operate:U'],
    reads: 'GET /v2/monitor/dashboard/main (Status.LastBackup)',
  },
  {
    id: 'unknown-user',
    title: 'UnknownUser account',
    area: 'Security',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/security/users',
  },
  {
    id: 'auditing',
    title: 'Auditing, and the login events',
    area: 'Security',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/security/audit/enabled, GET /v2/security/audit/events',
  },
  {
    id: 'services',
    title: 'Services that accept unauthenticated access',
    area: 'Security',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/security/services',
  },
  {
    id: 'web-apps',
    title: 'Web applications open to unauthenticated access, or pointing at a namespace that is gone',
    area: 'Security',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/web-apps, GET /v2/namespaces',
  },
  {
    id: 'all-holders',
    title: 'Accounts holding %All',
    area: 'Security',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/security/users',
  },
  {
    id: 'certificates',
    title: 'X.509 certificates expired or expiring',
    area: 'Certificates',
    needs: ['%Admin_Secure:U'],
    reads: 'GET /v2/security/x509-credentials, GET /v2/security/x509-credential/certificate per alias',
  },
  {
    id: 'tasks',
    title: 'Tasks whose last run failed, or suspended',
    area: 'Tasks',
    needs: ['%Admin_Task:U', '%Admin_Operate:U'],
    reads: "GET /v2/tasks, each task's GET /v2/task/info (the list reports every task as active)",
  },
  {
    id: 'system-monitor',
    title: 'System monitor running',
    area: 'System',
    needs: ['%Admin_Operate:U'],
    reads: 'GET /v2/monitor/dashboard/main (Status.SystemMonitor)',
  },
  {
    id: 'alerts',
    title: 'Serious alerts',
    area: 'System',
    needs: ['%Admin_Operate:U'],
    reads: 'GET /v2/monitor/dashboard/main (Alerts.SeriousAlerts)',
  },
  {
    id: 'licence',
    title: 'Licence use',
    area: 'System',
    needs: ['%Admin_Operate:U'],
    reads: 'GET /v2/monitor/dashboard/main (Licensing)',
  },
  {
    id: 'messages-log',
    title: 'Severe entries of messages.log in the last 24 hours',
    area: 'Logs',
    needs: [],
    reads: 'GET /api/aperture/logs/read (the newest window)',
  },
];

export const CHECK_INFO: Record<CheckId, CheckInfo> = Object.fromEntries(
  CHECKS.map((c) => [c.id, c]),
) as Record<CheckId, CheckInfo>;

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const f = (label: string, value: unknown) => ({ label, value: s(value) });

function finding(
  check: CheckId,
  key: string,
  severity: Severity,
  title: string,
  meaning: string,
  action: string,
  evidence: Evidence,
  link?: Finding['link'],
): Finding {
  return {
    id: `${check}:${key}`,
    check,
    severity,
    area: CHECK_INFO[check].area,
    title,
    meaning,
    action,
    evidence,
    link,
  };
}

/** Free space per disk (src/features/databases/storage.ts decides low and critical). */
export function checkDiskSpace(locations: StorageLocation[], read: number): Finding[] {
  return locations
    .filter((l) => l.level !== 'ok')
    .map((l) =>
      finding(
        'disk-space',
        l.path,
        l.level === 'critical' ? 'critical' : 'warning',
        `${l.level === 'critical' ? 'Critically low' : 'Low'} disk space on ${l.path}`,
        `${l.databases.join(', ')} grow${l.databases.length === 1 ? 's' : ''} on this disk. A database that cannot expand answers <FILEFULL> to every write, and IRIS may stop.`,
        'Free space on the disk, move a database, or cap what may grow there; the Databases screen shows each disk and what sits on it.',
        {
          source: 'GET /v2/database-dir/volumes',
          read,
          fields: [
            f('Disk', l.path),
            f('Free', `${Math.round(l.freeMB)} MB`),
            f('Data on it', `${Math.round(l.usedMB)} MB`),
            f('Databases', l.databases.join(', ')),
            f('Level', l.level),
          ],
        },
        { to: '/databases', label: 'Databases' },
      ),
    );
}

/** System databases IRIS ships read-only; a read-only one of these is expected. */
const READ_ONLY_BY_DESIGN = new Set(['IRISLIB', 'ENSLIB', 'HSLIB', 'HSSYSLIB', 'IRISSYS']);

export interface DatabaseFacts {
  name: string;
  directory: string;
  mounted?: boolean;
  readOnly?: boolean;
  mountAtStartup?: boolean;
  /** MB */
  sizeMB?: number;
  /** MB, or "Unlimited" / 0 for no limit. */
  maxSize?: string | number;
}

export function checkDatabases(dbs: DatabaseFacts[], read: number): Finding[] {
  const out: Finding[] = [];
  const src = 'GET /v2/databases, GET /v2/database-dirs';
  for (const db of dbs) {
    const link = {
      to: `/databases/detail?dir=${encodeURIComponent(db.directory)}&name=${encodeURIComponent(db.name)}`,
      label: db.name || db.directory,
    };
    const base = [f('Database', db.name), f('Directory', db.directory)];
    if (db.mounted === false)
      out.push(
        finding(
          'databases',
          `${db.name}:mounted`,
          'critical',
          `${db.name} is not mounted`,
          'Nothing can read or write it; every access to a global mapped there fails.',
          'Mount it from the database’s screen (Actions, Mount), or dismount it on purpose and remove the configuration entry.',
          { source: src, read, fields: [...base, f('Mounted', db.mounted)] },
          link,
        ),
      );
    if (db.readOnly && !READ_ONLY_BY_DESIGN.has(db.name.toUpperCase()))
      out.push(
        finding(
          'databases',
          `${db.name}:read-only`,
          'warning',
          `${db.name} is read-only`,
          'Writes to it fail with <PROTECT>. IRIS mounts a database read-only when its file is on read-only media or was marked so; only its library databases are read-only by design.',
          'If this is not intended, check the file’s permissions and the mount options, then mount it read-write.',
          { source: src, read, fields: [...base, f('ReadOnly', db.readOnly)] },
          link,
        ),
      );
    if (db.mountAtStartup === false)
      out.push(
        finding(
          'databases',
          `${db.name}:startup`,
          'warning',
          `${db.name} is not mounted at startup`,
          'After a restart the database stays dismounted until someone mounts it; anything mapped to it fails until then.',
          'Switch "Mount at startup" on in the database’s configuration, unless the database is meant to be mounted by hand.',
          { source: src, read, fields: [...base, f('MountAtStartup', db.mountAtStartup)] },
          link,
        ),
      );
    const max = typeof db.maxSize === 'number' ? db.maxSize : Number(db.maxSize);
    if (db.sizeMB !== undefined && Number.isFinite(max) && max > 0) {
      const ratio = db.sizeMB / max;
      if (ratio >= 0.9)
        out.push(
          finding(
            'databases',
            `${db.name}:size`,
            ratio >= 0.97 ? 'critical' : 'warning',
            `${db.name} is at ${Math.round(ratio * 100)} % of its maximum size`,
            'A database at its maximum size cannot expand: writes fail with <FILEFULL> once the free blocks are used.',
            'Raise the maximum size (or remove the limit) in the database’s configuration, or make room in it.',
            { source: src, read, fields: [...base, f('Size', `${db.sizeMB} MB`), f('MaxSize', `${max} MB`)] },
            link,
          ),
        );
    }
  }
  return out;
}

export function checkJournalFreeze(
  settings: { FreezeOnError?: boolean } | undefined,
  read: number,
): Finding[] {
  if (!settings || settings.FreezeOnError !== false) return [];
  return [
    finding(
      'journal-freeze',
      'off',
      'warning',
      'Journaling does not freeze on error',
      'With FreezeOnError off, IRIS keeps running when it cannot write the journal, and what is written meanwhile cannot be recovered or mirrored.',
      'Switch "Freeze on error" on in the journal settings (Journals, Settings), after checking the journal directories have room.',
      { source: 'GET /v2/journal/settings', read, fields: [f('FreezeOnError', settings.FreezeOnError)] },
      { to: '/journal', label: 'Journals' },
    ),
  ];
}

export interface DashboardFacts {
  Status?: { SystemMonitor?: boolean; LastBackup?: string };
  SystemUsage?: { JournalSpace?: string; DatabaseSpace?: string };
  Alerts?: { SeriousAlerts?: number | string };
  Licensing?: {
    LicenseUse?: number | string;
    LicenseLimit?: number | string;
    LicenseUseHigh?: number | string;
  };
}

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || Number.isNaN(n) ? undefined : n;
};

export function checkJournalSpace(d: DashboardFacts | undefined, read: number): Finding[] {
  const state = d?.SystemUsage?.JournalSpace;
  if (!state || /^(normal|ok)$/i.test(state)) return [];
  return [
    finding(
      'journal-space',
      state,
      /alert|troubled|critical/i.test(state) ? 'critical' : 'warning',
      `Journal space is ${state.toLowerCase()}`,
      'When the journal directory fills, journaling stops or IRIS freezes (with FreezeOnError on); either way writes are at risk.',
      'Free space in the journal directories, purge old journal files (the Purge Journal Files task), or move the journal to a larger disk.',
      { source: 'GET /v2/monitor/dashboard/main', read, fields: [f('SystemUsage.JournalSpace', state)] },
      { to: '/journal', label: 'Journals' },
    ),
  ];
}

export function checkBackup(d: DashboardFacts | undefined, read: number, now: number): Finding[] {
  const last = d?.Status?.LastBackup;
  if (last === undefined) return [];
  const src = 'GET /v2/monitor/dashboard/main';
  if (!last || /^never$/i.test(last))
    return [
      finding(
        'backup',
        'never',
        'warning',
        'No backup has ever been taken',
        'IRIS records the last full backup; it has none. Without a backup, a disk failure or a bad change cannot be undone.',
        'Schedule a full backup (a task that runs the backup, or your platform’s snapshot), and check the restore once.',
        { source: src, read, fields: [f('Status.LastBackup', last || 'Never')] },
        { to: '/tasks', label: 'Tasks' },
      ),
    ];
  const when = parseIrisDate(last);
  if (!when) return [];
  const days = Math.floor((now - when.valueOf()) / 86_400_000);
  if (days < 7) return [];
  return [
    finding(
      'backup',
      'stale',
      'warning',
      `The last backup is ${days} days old`,
      'IRIS records the last full backup; a week or more without one means a week of changes with no copy.',
      'Check the backup task or job and why it stopped; take a full backup.',
      { source: src, read, fields: [f('Status.LastBackup', last), f('Days ago', days)] },
      { to: '/tasks', label: 'Tasks' },
    ),
  ];
}

export interface UserFacts {
  Name: string;
  Enabled?: boolean;
  Roles?: string[];
}

export function checkUnknownUser(users: UserFacts[], read: number): Finding[] {
  const u = users.find((x) => x.Name === 'UnknownUser');
  if (!u || !u.Enabled) return [];
  return [
    finding(
      'unknown-user',
      'enabled',
      'warning',
      'UnknownUser is enabled',
      'UnknownUser is the account unauthenticated access runs as. Enabled, every service or web application that allows unauthenticated access gives its roles to anyone.',
      'Disable the account unless a web application relies on it, and give it as little as possible (it holds no role by default).',
      {
        source: 'GET /v2/security/users',
        read,
        fields: [
          f('Name', u.Name),
          f('Enabled', u.Enabled),
          f('Roles', (u.Roles ?? []).join(', ') || '(none)'),
        ],
      },
      { to: '/security/users/UnknownUser', label: 'UnknownUser' },
    ),
  ];
}

export interface AuditFacts {
  enabled?: boolean;
  /** As GET /v2/security/audit/events lists them: `EventName` is "%System/%Login/Login", or the three parts. */
  events?: { EventSource?: string; EventType?: string; EventName?: string; Enabled?: boolean }[];
}

const isEvent = (e: NonNullable<AuditFacts['events']>[number], source: string, type: string, name: string) =>
  e.EventName === `${source}/${type}/${name}` ||
  (e.EventSource === source && e.EventType === type && e.EventName === name);

export function checkAuditing(a: AuditFacts, read: number): Finding[] {
  const out: Finding[] = [];
  if (a.enabled === false)
    out.push(
      finding(
        'auditing',
        'off',
        'critical',
        'Auditing is off',
        'Nothing is recorded: no login, no change to users, roles or applications, no purge. Without the audit log there is no way to tell who did what.',
        'Turn auditing on (Audit, "Auditing"), then enable the events you need, the login ones first.',
        { source: 'GET /v2/security/audit/enabled', read, fields: [f('Enabled', a.enabled)] },
        { to: '/security/audit', label: 'Audit' },
      ),
    );
  const login = a.events?.find((e) => isEvent(e, '%System', '%Login', 'Login'));
  const failure = a.events?.find((e) => isEvent(e, '%System', '%Login', 'LoginFailure'));
  for (const [ev, name] of [
    [login, 'Login'],
    [failure, 'LoginFailure'],
  ] as const)
    if (ev && ev.Enabled === false)
      out.push(
        finding(
          'auditing',
          name,
          'warning',
          `The ${name} audit event is off`,
          name === 'Login'
            ? 'Successful logins are not recorded, so a session cannot be traced to a person and a time.'
            : 'Failed logins are not recorded, so a password-guessing attempt leaves no trace.',
          `Enable the %System/%Login/${name} event on the Audit screen.`,
          {
            source: 'GET /v2/security/audit/events',
            read,
            fields: [f('Event', `%System/%Login/${name}`), f('Enabled', ev.Enabled)],
          },
          { to: '/security/audit', label: 'Audit' },
        ),
      );
  return out;
}

const UNAUTHENTICATED = 64;

export interface ServiceFacts {
  Name: string;
  Enabled?: unknown;
  EnabledBoolean?: unknown;
  /** The detail's bits ... */
  AutheEnabled?: number;
  /** ... or the list's names ("Unauthenticated", "Password", ...). */
  AuthenticationMethods?: string[];
}

const unauthenticated = (x: { AutheEnabled?: number; AuthenticationMethods?: string[] }) =>
  ((x.AutheEnabled ?? 0) & UNAUTHENTICATED) === UNAUTHENTICATED ||
  (x.AuthenticationMethods ?? []).includes('Unauthenticated');

export function checkServices(services: ServiceFacts[], read: number): Finding[] {
  return services
    .filter((svc) => serviceEnabled(svc) && unauthenticated(svc))
    .map((svc) =>
      finding(
        'services',
        svc.Name,
        'warning',
        `${svc.Name} accepts unauthenticated access`,
        `Anyone who can reach the service uses it as UnknownUser, with whatever that account holds. ${svc.Name === '%Service_Terminal' || svc.Name === '%Service_Console' ? 'A terminal without a password is an open shell on the instance.' : ''}`.trim(),
        'Remove "Unauthenticated" from the service’s allowed authentication methods (Services, edit), or disable the service if nothing uses it.',
        {
          source: 'GET /v2/security/services',
          read,
          fields: [
            f('Service', svc.Name),
            f('Enabled', serviceEnabled(svc)),
            f(
              'Authentication',
              svc.AuthenticationMethods ? svc.AuthenticationMethods.join(', ') : svc.AutheEnabled,
            ),
          ],
        },
        { to: '/security/services', label: 'Services' },
      ),
    );
}

export interface WebAppFacts {
  Name: string;
  Namespace?: string;
  Enabled?: boolean;
  AutheEnabled?: number;
  DispatchClass?: string;
  IsSystemApp?: boolean;
  ServeFiles?: string;
}

/** `namespaces` undefined: the list could not be read, so the gone-namespace part is skipped. */
export function checkWebApps(apps: WebAppFacts[], namespaces: string[] | undefined, read: number): Finding[] {
  const out: Finding[] = [];
  const known = namespaces ? new Set(namespaces.map((n) => n.toUpperCase())) : null;
  for (const app of apps) {
    const link = { to: `/security/web-apps/detail?name=${encodeURIComponent(app.Name)}`, label: app.Name };
    const open = app.Enabled !== false && ((app.AutheEnabled ?? 0) & UNAUTHENTICATED) === UNAUTHENTICATED;
    const staticFiles = !app.DispatchClass;
    if (open && !staticFiles)
      out.push(
        finding(
          'web-apps',
          `${app.Name}:open`,
          app.IsSystemApp ? 'advice' : 'warning',
          `${app.Name} accepts unauthenticated access`,
          app.IsSystemApp
            ? 'A bundled application that IRIS ships open; it runs as UnknownUser for anyone who reaches it.'
            : 'Its code runs as UnknownUser for anyone who reaches it, with whatever that account holds.',
          'Remove "Unauthenticated" from the application’s allowed authentication methods, or disable the application if nothing uses it. Static file applications are left out of this check.',
          {
            source: 'GET /v2/web-apps',
            read,
            fields: [
              f('Application', app.Name),
              f('Namespace', app.Namespace),
              f('Enabled', app.Enabled),
              f('AutheEnabled', app.AutheEnabled),
              f('DispatchClass', app.DispatchClass),
              f('IsSystemApp', app.IsSystemApp),
            ],
          },
          link,
        ),
      );
    if (known && app.Namespace && app.Namespace !== '%SYS' && !known.has(app.Namespace.toUpperCase()))
      out.push(
        finding(
          'web-apps',
          `${app.Name}:namespace`,
          'warning',
          `${app.Name} points at a namespace that no longer exists`,
          `Its namespace, ${app.Namespace}, is not defined on this instance: every request to the application fails.`,
          'Point the application at an existing namespace, or delete the application.',
          {
            source: 'GET /v2/web-apps, GET /v2/namespaces',
            read,
            fields: [
              f('Application', app.Name),
              f('Namespace', app.Namespace),
              f('Namespaces defined', namespaces!.join(', ')),
            ],
          },
          link,
        ),
      );
  }
  return out;
}

export interface OwnerFacts {
  Name: string;
  /** "User", "User (escalation)" or "Role", as GET /v2/security/role/owners answers. */
  Type?: string;
}

/** `owners`: who holds %All directly (GET /v2/security/role/owners?name=%All); `users`: the users list, for Enabled. */
export function checkAllHolders(owners: OwnerFacts[], users: UserFacts[], read: number): Finding[] {
  const enabled = new Map(users.map((u) => [u.Name, u.Enabled !== false]));
  const holders = owners
    .filter((o) => (o.Type ?? 'User') === 'User' && enabled.get(o.Name) !== false)
    .map((o) => ({ Name: o.Name, Roles: ['%All'] }));
  if (!holders.length) return [];
  return [
    finding(
      'all-holders',
      'list',
      'advice',
      `${holders.length} enabled account${holders.length === 1 ? ' holds' : 's hold'} %All`,
      `%All grants every privilege of the instance. ${holders.map((u) => u.Name).join(', ')}: each is a complete key to the system, and each password is worth guessing.`,
      'Keep %All to the accounts that need it, give the others the %Admin_* resources their work needs, and make sure every %All account has a strong password (or is disabled, for the bundled ones).',
      {
        source: 'GET /v2/security/role/owners?name=%All, GET /v2/security/users',
        read,
        fields: holders.map((u) => f(u.Name, 'holds %All, enabled')),
      },
      { to: '/security/users', label: 'Users' },
    ),
  ];
}

export interface CertificateFacts {
  Alias: string;
  ValidityNotAfter?: string | null;
  SubjectDN?: string;
}

export function checkCertificates(certs: CertificateFacts[], read: number, now: number): Finding[] {
  const out: Finding[] = [];
  for (const c of certs) {
    const { state, days } = certificateStatus(c.ValidityNotAfter, now);
    if (state !== 'expired' && state !== 'expiring') continue;
    out.push(
      finding(
        'certificates',
        c.Alias,
        state === 'expired' ? 'critical' : 'warning',
        state === 'expired'
          ? `Certificate ${c.Alias} expired ${-(days ?? 0)} day${days === -1 ? '' : 's'} ago`
          : `Certificate ${c.Alias} expires in ${days} day${days === 1 ? '' : 's'}`,
        state === 'expired'
          ? 'Every TLS connection that presents or verifies it fails: mirrors, ECP, web gateways, outbound HTTPS.'
          : `A certificate within ${EXPIRY_WARNING_DAYS} days of its end will stop TLS connections when it passes.`,
        'Renew the certificate and load the new one into the X.509 credential (TLS and certificates, X.509 credentials), then test the TLS configurations that use it.',
        {
          source: 'GET /v2/security/x509-credential/certificate',
          read,
          fields: [
            f('Alias', c.Alias),
            f('Subject', c.SubjectDN),
            f('ValidityNotAfter', c.ValidityNotAfter),
            f('Days', days),
          ],
        },
        { to: '/security/ssl', label: 'TLS and certificates' },
      ),
    );
  }
  return out;
}

export interface TaskFacts {
  Id?: number | string;
  Name: string;
  /** From the task's GET /v2/task/info; null when it could not be read. */
  Suspended?: boolean | null;
  LastFinished?: string;
}

/** A run of a task, as GET /v2/task/history lists them (the fields IRIS names). */
export interface TaskRunFacts {
  TaskId?: number | string;
  Task?: string;
  Name?: string;
  Status?: string;
  Error?: string;
  Result?: string;
  /** When the run ended, as IRIS names it (Completed, LogDatetime), or started (LastStart). */
  Completed?: string;
  LogDatetime?: string;
  LastStart?: string;
  LastFinished?: string;
  Finished?: string;
  Started?: string;
}

const runTime = (r: TaskRunFacts) =>
  r.Completed ?? r.LogDatetime ?? r.LastFinished ?? r.Finished ?? r.LastStart ?? r.Started ?? '';

/** The latest run of each task, by the run's time (IRIS timestamps compare as text). */
export function latestRuns(history: TaskRunFacts[]): Map<string, TaskRunFacts> {
  const latest = new Map<string, TaskRunFacts>();
  for (const r of history) {
    const key = String(r.TaskId ?? r.Task ?? r.Name ?? '');
    const current = latest.get(key);
    if (!current || runTime(r) > runTime(current)) latest.set(key, r);
  }
  return latest;
}

export function checkTasks(tasks: TaskFacts[], history: TaskRunFacts[], read: number): Finding[] {
  const out: Finding[] = [];
  const latest = latestRuns(history);
  for (const t of tasks) {
    const link = { to: `/tasks/${encodeURIComponent(String(t.Id ?? ''))}`, label: t.Name };
    const run = latest.get(String(t.Id ?? '')) ?? latest.get(t.Name);
    const failed = run?.Status && /error|fail/i.test(run.Status);
    if (failed)
      out.push(
        finding(
          'tasks',
          `${t.Id ?? t.Name}:error`,
          'warning',
          `The last run of "${t.Name}" failed`,
          `The Task Manager recorded "${run!.Status}"${run!.Error || run!.Result ? `: ${run!.Error || run!.Result}` : ''}. Whatever the task maintains (purges, backups, exports) has not happened.`,
          'Open the task, read its history and error, fix the cause and run it again.',
          {
            source: 'GET /v2/tasks, GET /v2/task/history',
            read,
            fields: [
              f('Task', t.Name),
              f('Status', run!.Status),
              f('Error', run!.Error || run!.Result),
              f('Run', runTime(run!)),
            ],
          },
          link,
        ),
      );
    if (t.Suspended)
      out.push(
        finding(
          'tasks',
          `${t.Id ?? t.Name}:suspended`,
          'advice',
          `"${t.Name}" is suspended`,
          'A suspended task does not run on its schedule; if it was suspended after an error it stays so until someone resumes it.',
          'Resume the task if it should run, or delete it if it should not.',
          {
            source: 'GET /v2/task/info',
            read,
            fields: [f('Task', t.Name), f('Suspended', t.Suspended), f('LastFinished', t.LastFinished)],
          },
          link,
        ),
      );
  }
  // States that could not be read are not states: say so rather than count those tasks as active.
  const unread = tasks.filter((t) => t.Suspended === null);
  if (unread.length)
    out.push(
      finding(
        'tasks',
        'states-unread',
        'advice',
        `The state of ${unread.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} could not be read`,
        'IRIS reports every task as active in its task list; only GET /v2/task/info says which are suspended, and it needs %Admin_Operate:U. A suspended task among these would go unnoticed.',
        'Run the Health check with an account that holds %Admin_Operate:U to see which tasks are suspended.',
        {
          source: 'GET /v2/task/info',
          read,
          fields: [f('Tasks not read', unread.length), f('Tasks', tasks.length)],
        },
      ),
    );
  return out;
}

export function checkSystemMonitor(d: DashboardFacts | undefined, read: number): Finding[] {
  if (d?.Status?.SystemMonitor !== false) return [];
  return [
    finding(
      'system-monitor',
      'stopped',
      'warning',
      'The system monitor is not running',
      'Without it IRIS raises no alerts for disk, journal, licence or write-daemon trouble, and the Host monitor reads stale sensors.',
      'Start it: in the terminal, in %SYS, ^%SYSMONMGR (or restart the instance).',
      {
        source: 'GET /v2/monitor/dashboard/main',
        read,
        fields: [f('Status.SystemMonitor', d?.Status?.SystemMonitor)],
      },
      { to: '/monitor', label: 'Host monitor' },
    ),
  ];
}

export function checkAlerts(d: DashboardFacts | undefined, read: number): Finding[] {
  const n = num(d?.Alerts?.SeriousAlerts) ?? 0;
  if (n <= 0) return [];
  return [
    finding(
      'alerts',
      'serious',
      'warning',
      `${n} serious alert${n === 1 ? '' : 's'} in alerts.log`,
      'IRIS raised alerts of severity 2 or 3 since the log was last reviewed: a failing task, a journal problem, a licence limit, a full disk.',
      'Read alerts.log on the Host monitor (or in the Messages log), act on each, and the count resets as the log is reviewed.',
      { source: 'GET /v2/monitor/dashboard/main', read, fields: [f('Alerts.SeriousAlerts', n)] },
      { to: '/monitor', label: 'Host monitor' },
    ),
  ];
}

export function checkLicence(d: DashboardFacts | undefined, read: number): Finding[] {
  const use = num(d?.Licensing?.LicenseUse);
  const peak = num(d?.Licensing?.LicenseUseHigh);
  const limit = num(d?.Licensing?.LicenseLimit);
  if (use === undefined) return [];
  const src = 'GET /v2/monitor/dashboard/main';
  const fields = [
    f('Licensing.LicenseUse', `${use} %`),
    f('Licensing.LicenseUseHigh', peak === undefined ? '' : `${peak} %`),
    f('Licensing.LicenseLimit', limit),
  ];
  const link = { to: '/license', label: 'License' };
  if (use >= 100)
    return [
      finding(
        'licence',
        'over',
        'critical',
        `Licence use is at ${use} % of the limit`,
        'At the limit, the next connection is refused with a licence error, whoever makes it.',
        'Free licence units (end idle web sessions, close terminals) or move to a larger key.',
        { source: src, read, fields },
        link,
      ),
    ];
  if (use >= 85)
    return [
      finding(
        'licence',
        'near',
        'warning',
        `Licence use is at ${use} % of the limit`,
        'Close to the limit, a burst of connections is refused with a licence error.',
        'Watch the use (License, usage), end idle sessions, or plan a larger key.',
        { source: src, read, fields },
        link,
      ),
    ];
  if (peak !== undefined && peak >= 100)
    return [
      finding(
        'licence',
        'peak',
        'warning',
        `Licence use peaked at ${peak} % since startup`,
        'Connections were refused at that moment; the current use is lower.',
        'Find what consumed the units at the peak (web sessions, terminals), and plan a larger key if it recurs.',
        { source: src, read, fields },
        link,
      ),
    ];
  return [];
}

export interface LogEntryFacts {
  time: string;
  severity: number | null;
  category: string;
  message: string;
}

/**
 * Entries of severity 2 or 3 in the last 24 hours, newest first, at most ten, each opening the
 * entry in the Messages log (which offers its similar entries) by its stamp.
 */
export function checkMessagesLog(
  entries: LogEntryFacts[],
  file: string,
  read: number,
  now: number,
): Finding[] {
  const since = now - 24 * 3_600_000;
  const severe = entries.filter(
    (e) =>
      e.severity !== null && e.severity >= 2 && e.time && (parseIrisDate(e.time)?.valueOf() ?? 0) >= since,
  );
  return severe.slice(0, 10).map((e, i) =>
    finding(
      'messages-log',
      `${file}:${e.time}:${i}`,
      e.severity === 3 ? 'critical' : 'warning',
      `${e.severity === 3 ? 'Fatal' : 'Severe'} entry at ${e.time}: ${e.message.split('\n')[0].slice(0, 90)}`,
      'IRIS wrote this to messages.log with severity 2 or higher; such entries usually name a failing component, a refused connection or a resource limit.',
      'Open the entry; "Similar entries" shows how often the same message occurred and when, which tells a recurring fault from a one-off.',
      {
        source: 'GET /api/aperture/logs/read',
        read,
        fields: [
          f('File', file),
          f('Time', e.time),
          f('Severity', e.severity),
          f('Category', e.category),
          f('Message', e.message.slice(0, 400)),
        ],
      },
      {
        to: `/logs/messages?file=${encodeURIComponent(file)}&at=${encodeURIComponent(e.time)}`,
        label: 'the entry and its similar entries',
      },
    ),
  );
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

/** Highest severity first, then by area and title, so a report reads the same twice. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      ORDER[a.severity] - ORDER[b.severity] || a.area.localeCompare(b.area) || a.title.localeCompare(b.title),
  );
}
