/**
 * In-memory state for the mock SysAdmin API.
 *
 * Seeded to look like a small but busy IRIS 2026.2 Community instance running in
 * a container: five namespaces, nine databases, ~30 processes, system tasks,
 * journals, users/roles/resources, web applications and audit events.
 */
import { daysAgo, hoursAgo, minutesAgo, seeded, pick, inMinutes, inDays } from './util';
import { resetAsyncTasks } from './async';

export const MGR = '/usr/irissys/mgr/';

export interface DbConfig {
  Name: string;
  Directory: string;
  Server: string;
  ClusterMountMode: boolean;
  MountRequired: boolean;
  MountAtStartup: boolean;
  StreamLocation: string;
  Status: string;
}

export interface DbLocal {
  Directory: string;
  MaxSize: string;
  Size: number;
  Status: string;
  Resource: string;
  Encrypted: boolean;
  Mirrored: boolean;
  SFN: number;
  EncryptionKeyID: string;
  EncryptionVersion: string;
  // detail (LocalDatabase)
  ClusterMountMode: boolean;
  ExpansionSize: number;
  NewGlobalCollation: number;
  NewGlobalIsKeep: boolean;
  NewVolumeDirectory: string;
  NewVolumeThreshold: number;
  GlobalJournalState: boolean;
  ReadOnly: boolean;
  // metrics
  Blocks: number;
  BlockSize: number;
  Full: boolean;
  LastExpansionTime: string;
  AvailableSpace: number;
  DiskFree: string;
  EndFree: number;
  Mounted: boolean;
}

export interface NamespaceRec {
  Name: string;
  Globals: string;
  Routines: string;
  SysGlobals: string;
  SysRoutines: string;
  Library: string;
  TempGlobals: string;
  interop: boolean;
  globalMappings: {
    Name: string;
    Subscript: string;
    Database: string;
    Collation: string;
    LockDatabase: string;
  }[];
  packageMappings: { Name: string; Database: string }[];
  routineMappings: { Name: string; Type: string; Database: string }[];
}

export interface ProcessRec {
  Job: number;
  Pid: number;
  Username: string;
  Device: string;
  Nspace: string;
  Routine: string;
  Commands: number;
  Globals: number;
  State: string;
  ClientName: string;
  EXEName: string;
  IPAddress: string;
  CanBeExamined: boolean;
  CanBeSuspended: boolean;
  CanBeTerminated: boolean;
  CanReceiveBroadcast: boolean;
  PrvGblBlkCnt: number;
  OSUserName: string;
  CPUTime: number;
  ParentPid: number;
  ElapsedTime: string;
  StartTimeUTC: string;
  MemoryAllocated: number;
  MemoryUsed: number;
  MemoryPeak: number;
  Roles: string[];
  OpenDevices: string[];
  InTransaction: number;
  Location: string;
  LastGlobalReference: string;
}

export interface LockRec {
  Pid: string;
  ModeCount: string;
  Reference: string;
  Directory: string;
  System: string;
  Removable: boolean;
  DeleteID: string;
  CanBeExamined: boolean;
  RemoteOwner: boolean;
  RoutineInfo: string;
  OSUserName: string;
}

export interface JournalRec {
  Name: string;
  Size: number;
  CreationTime: string;
  Reason: string;
  DataSize: number;
}

export interface TaskRec {
  Id: number;
  Name: string;
  Type: 'System' | 'User';
  Namespace: string;
  Description: string;
  Suspended: boolean;
  LastFinished: string;
  NextScheduled: string;
  TaskClass: string;
  RunAsUser: string;
  Priority: string;
  TimePeriod: string;
  TimePeriodEvery: string;
  DailyFrequency: string;
  DailyStartTime: string;
  DailyEndTime: string;
  StartDate: string;
  EndDate: string;
  Expires: boolean;
  ExpiresDays: number;
  SuspendOnError: boolean;
  RescheduleOnStart: boolean;
  OutputDirectory: string;
  OutputFilename: string;
  Settings: Record<string, unknown>;
  Status: string;
  Error: string;
}

export interface UserRec {
  Name: string;
  FullName: string;
  Enabled: boolean;
  Type: string;
  Namespace: string;
  Routine: string;
  Comment: string;
  EmailAddress: string;
  Roles: string[];
  EscalationRoles: string[];
  AccountNeverExpires: boolean;
  PasswordNeverExpires: boolean;
  ChangePassword: boolean;
  ExpirationDate: string;
  AutheEnabled: number;
  PhoneNumber: string;
  PhoneProvider: string;
  HOTPKeyDisplay: boolean;
  password: string;
}

export interface RoleRec {
  Name: string;
  Description: string;
  CreatedBy: string;
  EscalationOnly: boolean;
  GrantedRoles: string[];
  Resources: string[];
}

export interface ResourceRec {
  Name: string;
  Description: string;
  PublicPermission: string;
  ResourceType: string;
  AllowDelete: boolean;
}

export interface ServiceRec {
  Name: string;
  Enabled: string;
  EnabledBoolean: boolean;
  Public: string;
  AuthenticationMethods: string[];
  AllowedConnections: string[];
  Description: string;
  HttpOnlyCookies: boolean;
  TwoFactorEnabled: boolean;
  AutheEnabled: number;
  ClientSystems: string[];
}

export interface WebAppRec {
  Name: string;
  Namespace: string;
  NamespaceDefault: boolean;
  Enabled: boolean;
  Type: string;
  Resource: string;
  AuthenticationMethods: string[];
  IsSystemApp: boolean;
  DispatchClass: string;
  Description: string;
  AutheEnabled: number;
  Path: string;
  Timeout: number;
  JWTAuthEnabled: boolean;
  JWTAccessTokenTimeout: number;
  JWTRefreshTokenTimeout: number;
  CorsAllowlist: string[];
  CorsCredentialsAllowed: boolean;
  CorsHeadersList: string[];
  CSRFToken: boolean;
  ServeFiles: string;
  Recurse: boolean;
  MatchRoles: string[];
  UseCookies: number;
}

export interface AuditEventRec {
  EventSource: string;
  EventType: string;
  EventName: string;
  Description: string;
  Enabled: boolean;
  Total: number;
  Written: number;
  Lost: number;
}

export interface WebSessionRec {
  ID: string;
  Username: string;
  Preserve: number;
  Application: string;
  Timeout: string;
  LicenseId: string;
  SesProcessId: string;
  AllowEndSession: boolean;
}

export interface SslRec {
  Name: string;
  Description: string;
  Enabled: boolean;
  Type: string;
  CAFile: string;
  CertificateFile: string;
  PrivateKeyFile: string;
  TLSMinVersion: number;
  TLSMaxVersion: number;
  VerifyPeer: number;
  CipherList: string[];
  Ciphersuites: string[];
}

export interface X509Rec {
  Alias: string;
  HasPrivateKey: boolean;
  OwnerList: string[];
  PeerNames: string[];
  CAFile: string;
  SerialNumber: string;
  IssuerDN: string;
  SubjectDN: string;
  ValidityNotBefore: string;
  ValidityNotAfter: string;
}

/** One row of the audit log written by a mutation in the mock (real IRIS writes these itself). */
export type AuditRecordRec = Record<string, unknown> & {
  AuditIndex: number;
  TimeStamp: string;
  EventSource: string;
  EventType: string;
  Event: string;
  Username: string;
  Description: string;
};

export interface MockDb {
  namespaces: NamespaceRec[];
  configDbs: DbConfig[];
  localDbs: DbLocal[];
  processes: ProcessRec[];
  locks: LockRec[];
  journals: JournalRec[];
  journalSettings: Record<string, unknown>;
  tasks: TaskRec[];
  taskHistory: Record<string, unknown>[];
  taskManager: 'Running' | 'Not running' | 'Suspended';
  users: UserRec[];
  roles: RoleRec[];
  resources: ResourceRec[];
  services: ServiceRec[];
  webApps: WebAppRec[];
  auditEnabled: boolean;
  auditEvents: AuditEventRec[];
  webSessions: WebSessionRec[];
  sslConfigs: SslRec[];
  x509: X509Rec[];
  /** Audit records produced by writes made through the mock, newest first. */
  auditLog: AuditRecordRec[];
  startedAt: number;
  broadcasts: string[];
  /** alerts.log entries not yet handed out by /api/monitor/alerts (the endpoint is a cursor). */
  pendingAlerts: { time: string; severity: number; message: string }[];
}

function db(
  name: string,
  dir: string,
  opts: Partial<DbLocal & DbConfig> & { size: number; max?: string; resource?: string; ro?: boolean } = {
    size: 1,
  },
): { config: DbConfig; local: DbLocal } {
  const status = opts.ro ? 'Mounted/R' : 'Mounted/RW';
  return {
    config: {
      Name: name,
      Directory: dir,
      Server: '',
      ClusterMountMode: false,
      MountRequired: !!opts.MountRequired,
      MountAtStartup: opts.MountAtStartup ?? true,
      StreamLocation: `${dir}stream/`,
      Status: status,
    },
    local: {
      Directory: dir,
      MaxSize: opts.max ?? 'Unlimited',
      Size: opts.size,
      Status: status,
      Resource: opts.resource ?? `%DB_${name}`,
      Encrypted: !!opts.Encrypted,
      Mirrored: false,
      SFN: 0,
      EncryptionKeyID: opts.Encrypted ? 'EFD1818C-0ACE-11F1-938E-603E5F3B8304' : '',
      EncryptionVersion: '0',
      ClusterMountMode: false,
      ExpansionSize: 0,
      NewGlobalCollation: 5,
      NewGlobalIsKeep: false,
      NewVolumeDirectory: '',
      NewVolumeThreshold: 0,
      GlobalJournalState: opts.GlobalJournalState ?? true,
      ReadOnly: !!opts.ro,
      Blocks: Math.round((opts.size * 1024) / 8),
      BlockSize: 8192,
      Full: false,
      LastExpansionTime: daysAgo(3),
      AvailableSpace: Math.round(opts.size * 0.23),
      DiskFree: '41.2 GB',
      EndFree: Math.round(opts.size * 0.11),
      Mounted: true,
    },
  };
}

function seedDatabases() {
  const list = [
    db('IRISSYS', MGR, { size: 214, resource: '%DB_IRISSYS' }),
    db('IRISLIB', `${MGR}irislib/`, { size: 1236, ro: true, resource: '%DB_IRISLIB' }),
    db('IRISTEMP', `${MGR}iristemp/`, { size: 81, resource: '%DB_IRISTEMP', GlobalJournalState: false }),
    db('IRISLOCALDATA', `${MGR}irislocaldata/`, { size: 11, resource: '%DB_IRISLOCALDATA' }),
    db('IRISAUDIT', `${MGR}irisaudit/`, { size: 34, resource: '%DB_IRISAUDIT' }),
    db('ENSLIB', `${MGR}enslib/`, { size: 466, ro: true, resource: '%DB_ENSLIB' }),
    db('USER', `${MGR}user/`, { size: 97, max: '4096', resource: '%DB_USER' }),
    db('IRISAPP', `${MGR}irisapp/`, { size: 512, resource: '%DB_IRISAPP' }),
    db('INTEROP', `${MGR}interop/`, { size: 1290, max: '8192', resource: '%DB_INTEROP' }),
    db('CLINICAL', `${MGR}clinical/`, {
      size: 2048,
      max: '16384',
      resource: '%DB_CLINICAL',
      Encrypted: true,
    }),
  ];
  return { configDbs: list.map((d) => d.config), localDbs: list.map((d) => d.local) };
}

function ns(
  Name: string,
  Globals: string,
  Routines = Globals,
  extra: Partial<NamespaceRec> = {},
): NamespaceRec {
  return {
    Name,
    Globals,
    Routines,
    SysGlobals: 'IRISSYS',
    SysRoutines: 'IRISSYS',
    Library: 'IRISLIB',
    TempGlobals: 'IRISTEMP',
    interop: false,
    globalMappings: [],
    packageMappings: [],
    routineMappings: [],
    ...extra,
  };
}

function seedNamespaces(): NamespaceRec[] {
  return [
    ns('%SYS', 'IRISSYS', 'IRISSYS'),
    ns('USER', 'USER'),
    ns('IRISAPP', 'IRISAPP', 'IRISAPP', {
      packageMappings: [{ Name: 'dc.Aperture', Database: 'IRISAPP' }],
      globalMappings: [
        {
          Name: 'dc.Config',
          Subscript: '',
          Database: 'IRISAPP',
          Collation: 'IRIS standard',
          LockDatabase: 'IRISAPP',
        },
      ],
    }),
    ns('INTEROP', 'INTEROP', 'INTEROP', {
      interop: true,
      packageMappings: [
        { Name: 'Ens', Database: 'ENSLIB' },
        { Name: 'EnsLib', Database: 'ENSLIB' },
        { Name: 'EnsPortal', Database: 'ENSLIB' },
        { Name: 'HS.Util', Database: 'CLINICAL' },
      ],
      globalMappings: [
        {
          Name: 'Ens.*',
          Subscript: '',
          Database: 'ENSLIB',
          Collation: 'IRIS standard',
          LockDatabase: 'ENSLIB',
        },
        {
          Name: 'HL7.Archive',
          Subscript: '',
          Database: 'CLINICAL',
          Collation: 'IRIS standard',
          LockDatabase: 'CLINICAL',
        },
      ],
      routineMappings: [{ Name: 'Ens*', Type: 'ALL', Database: 'ENSLIB' }],
    }),
    ns('CLINICAL', 'CLINICAL', 'CLINICAL', {
      globalMappings: [
        {
          Name: 'DICOM.Study',
          Subscript: '',
          Database: 'CLINICAL',
          Collation: 'IRIS standard',
          LockDatabase: 'CLINICAL',
        },
      ],
    }),
  ];
}

function seedProcesses(): ProcessRec[] {
  const rnd = seeded(42);
  const daemons = [
    'CONTROL',
    'WRTDMN',
    'GARCOL',
    'JRNDMN',
    'EXPDMN',
    'AUXWD',
    'AUXWD',
    'AUXWD',
    'MONITOR',
    'CLNDMN',
    'RECEIVE',
    'LMFMON',
    'DBEXPDMN',
  ];
  const list: ProcessRec[] = [];
  let pid = 5320;
  const mk = (p: Partial<ProcessRec>): ProcessRec => {
    pid += 1 + Math.floor(rnd() * 40);
    const started = new Date(Date.now() - Math.floor(rnd() * 36) * 3_600_000);
    const elapsedMs = Date.now() - started.getTime();
    const h = Math.floor(elapsedMs / 3_600_000);
    const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
    return {
      Job: list.length + 1,
      Pid: pid,
      Username: '',
      Device: '',
      Nspace: '%SYS',
      Routine: '',
      Commands: Math.floor(rnd() * 5_000_000),
      Globals: Math.floor(rnd() * 2_000_000),
      State: 'RUNW',
      ClientName: '',
      EXEName: '',
      IPAddress: '',
      CanBeExamined: true,
      CanBeSuspended: true,
      CanBeTerminated: true,
      CanReceiveBroadcast: false,
      PrvGblBlkCnt: Math.floor(rnd() * 200),
      OSUserName: 'irisowner',
      CPUTime: Math.floor(rnd() * 200_000),
      ParentPid: 5301,
      ElapsedTime: `${h}h ${m}m`,
      StartTimeUTC: started.toISOString().replace('T', ' ').slice(0, 19),
      MemoryAllocated: 262144,
      MemoryUsed: Math.floor(rnd() * 200_000),
      MemoryPeak: Math.floor(rnd() * 260_000),
      Roles: ['%All'],
      OpenDevices: [],
      InTransaction: 0,
      Location: '',
      LastGlobalReference: '',
      ...p,
    };
  };
  for (const d of daemons) {
    list.push(
      mk({
        Username: '',
        Routine: d,
        State: 'RUNW',
        CanBeSuspended: false,
        CanBeTerminated: false,
        Device: '',
      }),
    );
  }
  list.push(
    mk({ Username: 'CSPSystem', Routine: '%SYS.TaskSuper.1', State: 'HANG', CanBeTerminated: false }),
  );
  list.push(
    mk({
      Username: '_Ensemble',
      Nspace: 'INTEROP',
      Routine: 'Ens.Director.1',
      State: 'RUNW',
      Device: '|TCP|19110',
    }),
  );
  list.push(
    mk({
      Username: '_Ensemble',
      Nspace: 'INTEROP',
      Routine: 'EnsLib.HL7.Service.TCPService.1',
      State: 'RUNW',
      Device: '|TCP|2575|4012',
      CanReceiveBroadcast: true,
      InTransaction: 1,
      LastGlobalReference: '^Ens.MessageHeaderD(4021339)',
    }),
  );
  list.push(
    mk({
      Username: '_Ensemble',
      Nspace: 'INTEROP',
      Routine: 'EnsLib.DICOM.Service.TCP.1',
      State: 'RUNW',
      Device: '|TCP|4242',
    }),
  );
  list.push(
    mk({
      Username: '_Ensemble',
      Nspace: 'INTEROP',
      Routine: 'EnsLib.HL7.Operation.TCPOperation.1',
      State: 'EVTW',
      Device: '|TCP|10.0.0.14:6661',
    }),
  );
  list.push(
    mk({ Username: '_Ensemble', Nspace: 'INTEROP', Routine: 'Ens.Alerting.AlertManager.1', State: 'EVTW' }),
  );
  list.push(
    mk({
      Username: 'jdoe',
      Nspace: 'IRISAPP',
      Routine: '%SYS.REST.1',
      State: 'RUNW',
      Device: '|TCP|127.0.0.1:52773|54211',
      ClientName: 'devbox',
      EXEName: 'CSPa24.so',
      IPAddress: '10.0.0.41',
      CanReceiveBroadcast: true,
      OSUserName: 'jdoe',
      Roles: ['%Developer', '%DB_IRISAPP'],
    }),
  );
  list.push(
    mk({
      Username: 'jdoe',
      Nspace: 'USER',
      Routine: '%Studio.General.1',
      State: 'RUNW',
      Device: '|TCP|1972|61023',
      ClientName: 'devbox',
      EXEName: 'code',
      IPAddress: '10.0.0.41',
      CanReceiveBroadcast: true,
      OSUserName: 'jdoe',
      Roles: ['%Developer'],
    }),
  );
  list.push(
    mk({
      Username: 'analytics',
      Nspace: 'CLINICAL',
      Routine: '%SQL.StatementResult.1',
      State: 'RUNW',
      Device: '|TCP|1972|61102',
      ClientName: 'bi-server',
      EXEName: 'java',
      IPAddress: '10.0.0.77',
      CanReceiveBroadcast: true,
      OSUserName: 'tomcat',
      Roles: ['%SQL', '%DB_CLINICAL'],
      Globals: 4_812_003,
      InTransaction: 0,
      LastGlobalReference: '^DICOM.StudyD(88213)',
    }),
  );
  list.push(
    mk({
      Username: 'analytics',
      Nspace: 'CLINICAL',
      Routine: '%SQL.StatementResult.1',
      State: 'RUNW',
      Device: '|TCP|1972|61105',
      ClientName: 'bi-server',
      EXEName: 'python3',
      IPAddress: '10.0.0.77',
      CanReceiveBroadcast: true,
      OSUserName: 'tomcat',
      Roles: ['%SQL', '%DB_CLINICAL'],
    }),
  );
  list.push(
    mk({
      Username: '_SYSTEM',
      Nspace: '%SYS',
      Routine: '%SYS.REST.1',
      State: 'RUNW',
      Device: '|TCP|127.0.0.1:52773|54310',
      ClientName: 'localhost',
      EXEName: 'CSPa24.so',
      IPAddress: '127.0.0.1',
      CanReceiveBroadcast: true,
      OSUserName: 'irisowner',
    }),
  );
  list.push(
    mk({
      Username: 'irisowner',
      Nspace: 'USER',
      Routine: '%SYS.TaskSuper.1',
      State: 'RUNW',
      Device: '/dev/pts/0',
      ClientName: 'container',
      EXEName: 'iris',
      IPAddress: '',
      CanReceiveBroadcast: true,
      OSUserName: 'irisowner',
    }),
  );
  list.push(
    mk({
      Username: 'ops',
      Nspace: 'USER',
      Routine: 'MYREPORT',
      State: 'LOCK',
      Device: '/dev/pts/1',
      ClientName: 'container',
      EXEName: 'irissession',
      CanReceiveBroadcast: true,
      OSUserName: 'ops',
      Location: '+12^MYREPORT',
      InTransaction: 1,
      LastGlobalReference: '^MyGlobal("batch",17)',
    }),
  );
  return list;
}

function seedLocks(processes: ProcessRec[]): LockRec[] {
  const p = (routine: string) => processes.find((x) => x.Routine === routine)?.Pid ?? 1;
  const mk = (
    Pid: number,
    ModeCount: string,
    Reference: string,
    Directory: string,
    RoutineInfo: string,
    OSUserName: string,
    Removable = true,
  ): LockRec => ({
    Pid: String(Pid),
    ModeCount,
    Reference,
    Directory,
    System: '',
    Removable,
    DeleteID: `${Math.floor(Math.random() * 900000000)},1,P${Pid}`,
    CanBeExamined: true,
    RemoteOwner: false,
    RoutineInfo,
    OSUserName,
  });
  return [
    mk(p('MYREPORT'), 'Exclusive', '^MyGlobal("batch",17)', `${MGR}user/`, '+12^MYREPORT', 'ops'),
    mk(p('MYREPORT'), 'Exclusive', '^MyGlobal("batch")', `${MGR}user/`, '+8^MYREPORT', 'ops'),
    mk(
      p('Ens.Director.1'),
      'Exclusive',
      '^Ens.Runtime("Ens.Director")',
      `${MGR}interop/`,
      '+45^Ens.Director.1',
      'irisowner',
      false,
    ),
    mk(
      p('EnsLib.HL7.Service.TCPService.1'),
      'Exclusive/1',
      '^Ens.MessageHeaderD(4021339)',
      `${MGR}interop/`,
      '+120^Ens.BusinessService.1',
      'irisowner',
    ),
    mk(
      p('%SYS.TaskSuper.1'),
      'Exclusive',
      '^%SYS("TaskManager")',
      MGR,
      '+3^%SYS.TaskSuper.1',
      'irisowner',
      false,
    ),
    mk(
      p('%SQL.StatementResult.1'),
      'Shared/2',
      '^DICOM.StudyD(88213)',
      `${MGR}clinical/`,
      '+77^%SQL.StatementResult.1',
      'tomcat',
    ),
  ];
}

function seedJournals(): JournalRec[] {
  const out: JournalRec[] = [];
  const reasons = [
    'file size limit reached',
    'file size limit reached',
    'daily switch task',
    'journal switch requested',
  ];
  const rnd = seeded(7);
  let idx = 0;
  for (let day = 4; day >= 0; day--) {
    const d = new Date(Date.now() - day * 86_400_000);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const perDay = day === 0 ? 3 : 4;
    for (let i = 1; i <= perDay; i++) {
      const size = day === 0 && i === perDay ? 12_582_912 : 1_073_741_824;
      out.push({
        Name: `${MGR}journal/${stamp}.${String(i).padStart(3, '0')}`,
        Size: Math.round(size * (0.7 + rnd() * 0.3)),
        CreationTime: hoursAgo(day * 24 + (perDay - i) * 5 + 1),
        Reason: day === 0 && i === perDay ? '' : pick(rnd, reasons),
        DataSize: Math.round(size * 1.6),
      });
      idx++;
    }
  }
  void idx;
  return out;
}

function task(
  Id: number,
  Name: string,
  Type: 'System' | 'User',
  Namespace: string,
  Description: string,
  TaskClass: string,
  extra: Partial<TaskRec> = {},
): TaskRec {
  return {
    Id,
    Name,
    Type,
    Namespace,
    Description,
    Suspended: false,
    LastFinished: daysAgo(1),
    NextScheduled: inMinutes(60 * (Id + 2)),
    TaskClass,
    RunAsUser: '_SYSTEM',
    Priority: 'Normal',
    TimePeriod: 'Daily',
    TimePeriodEvery: '1',
    DailyFrequency: 'Once',
    DailyStartTime: '02:00:00',
    DailyEndTime: '',
    StartDate: '2026-01-01',
    EndDate: '',
    Expires: false,
    ExpiresDays: 0,
    SuspendOnError: false,
    RescheduleOnStart: false,
    OutputDirectory: '',
    OutputFilename: '',
    Settings: {},
    Status: 'Success',
    Error: '',
    ...extra,
  };
}

function seedTasks(): TaskRec[] {
  return [
    task(
      1,
      'Purge Journal Files',
      'System',
      '%SYS',
      'Purge journal files that are no longer needed',
      '%SYS.Task.PurgeJournal',
    ),
    task(
      2,
      'Purge Audit Database',
      'System',
      '%SYS',
      'Purge audit records older than 60 days',
      '%SYS.Task.PurgeAudit',
      { Settings: { DaysToKeep: 60 } },
    ),
    task(3, 'Purge Tasks', 'System', '%SYS', 'Purge task history', '%SYS.Task.PurgeTaskHistory'),
    task(4, 'Switch Journal', 'System', '%SYS', 'Switch to a new journal file', '%SYS.Task.SwitchJournal', {
      DailyStartTime: '00:00:00',
    }),
    task(
      5,
      'Integrity Check',
      'System',
      '%SYS',
      'Weekly integrity check of all databases',
      '%SYS.Task.IntegrityCheck',
      { TimePeriod: 'Weekly', NextScheduled: inMinutes(60 * 30) },
    ),
    task(
      6,
      'Purge Errors and Log Files',
      'System',
      '%SYS',
      'Purge error globals and log files',
      '%SYS.Task.PurgeErrorsAndLogs',
    ),
    task(
      7,
      'Diagnostic Report',
      'System',
      '%SYS',
      'Generate a diagnostic report',
      '%SYS.Task.DiagnosticReport',
      { Suspended: true, Status: 'Suspended' },
    ),
    task(
      8,
      'Update SQL query statistics',
      'System',
      '%SYS',
      'Update SQL statement statistics',
      '%SYS.Task.UpdateSQLStats',
    ),
    task(
      9,
      'Inventory Scan',
      'System',
      '%SYS',
      'Scan the installation inventory',
      '%SYS.Task.InventoryScan',
      { TimePeriod: 'Weekly' },
    ),
    task(
      10,
      'Security Scan',
      'System',
      '%SYS',
      'Check for expiring passwords and inactive accounts',
      '%SYS.Task.SecurityScan',
    ),
    task(
      11,
      'Purge Interop Management Data',
      'System',
      '%SYS',
      'Purge old interoperability messages and logs',
      'Ens.Util.Tasks.PurgeAll',
      { Namespace: 'INTEROP', Settings: { NumberOfDaysToKeep: 30, BodiesToo: true } },
    ),
    task(
      12,
      'Nightly HL7 archive export',
      'User',
      'INTEROP',
      'Export HL7 archive to the DMZ SFTP',
      'dc.Tasks.ExportHL7',
      {
        RunAsUser: 'ops',
        DailyStartTime: '23:30:00',
        Settings: { Target: 'sftp://dmz/exports', Compress: true },
        Status: 'Error',
        Error: 'ERROR #5002: SFTP connection refused',
        LastFinished: hoursAgo(20),
      },
    ),
    task(
      13,
      'DICOM study index rebuild',
      'User',
      'CLINICAL',
      'Rebuild the study search index',
      'dc.Tasks.RebuildDicomIndex',
      { TimePeriod: 'Weekly', RunAsUser: 'analytics' },
    ),
    task(
      14,
      'Warm cache',
      'User',
      'IRISAPP',
      'Pre-load reference tables after restart',
      'dc.Tasks.WarmCache',
      { TimePeriod: 'On Demand', NextScheduled: '', DailyFrequency: '' },
    ),
  ];
}

function seedTaskHistory(tasks: TaskRec[]) {
  const rnd = seeded(99);
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const t = pick(rnd, tasks);
    const ok = !(t.Id === 12 && i % 3 === 0);
    out.push({
      LastStart: hoursAgo(i * 6 + 1),
      Completed: hoursAgo(i * 6 + 0.9),
      Name: t.Name,
      Status: ok ? 'Success' : 'Error',
      Result: ok ? '' : t.Error || 'ERROR #5001: task failed',
      TaskId: t.Id,
      Namespace: t.Namespace,
      Routine: t.TaskClass,
      Pid: String(6000 + i),
      ErrDate: ok ? '' : daysAgo(Math.floor(i / 4)).slice(0, 10),
      ErrNumber: ok ? 0 : 5001,
      Username: t.RunAsUser,
      LogDatetime: hoursAgo(i * 6 + 0.9),
    });
  }
  return out;
}

function user(Name: string, FullName: string, Roles: string[], extra: Partial<UserRec> = {}): UserRec {
  return {
    Name,
    FullName,
    Enabled: true,
    Type: 'Password user',
    Namespace: 'USER',
    Routine: '',
    Comment: '',
    EmailAddress: '',
    Roles,
    EscalationRoles: [],
    AccountNeverExpires: false,
    PasswordNeverExpires: false,
    ChangePassword: false,
    ExpirationDate: '',
    AutheEnabled: 0,
    PhoneNumber: '',
    PhoneProvider: '',
    HOTPKeyDisplay: false,
    password: 'SYS',
    ...extra,
  };
}

function seedUsers(): UserRec[] {
  return [
    user('_SYSTEM', 'SQL System Manager', ['%All'], {
      Namespace: '%SYS',
      Comment: 'Built-in super user',
      AccountNeverExpires: true,
      PasswordNeverExpires: true,
    }),
    user('SuperUser', 'Super User', ['%All'], {
      Namespace: '%SYS',
      AccountNeverExpires: true,
      PasswordNeverExpires: true,
    }),
    user('Admin', 'System Administrator', ['%Manager', '%Operator'], { Namespace: '%SYS' }),
    user('_PUBLIC', 'Public account', [], {
      Type: 'Password user',
      Comment: 'Roles held by everybody',
      Enabled: true,
    }),
    user('UnknownUser', 'Unauthenticated access', [], { Enabled: false }),
    user('CSPSystem', 'CSP Gateway user', ['%DB_IRISSYS'], {
      Namespace: '%SYS',
      Comment: 'Used by the web gateway',
    }),
    user('_Ensemble', 'Interoperability service account', ['%EnsRole_Administrator', '%DB_INTEROP'], {
      Namespace: 'INTEROP',
    }),
    user('jdoe', 'Jane Doe', ['%Developer', '%DB_IRISAPP', '%DB_USER'], {
      EmailAddress: 'jdoe@example.org',
      Namespace: 'IRISAPP',
      EscalationRoles: ['%Manager'],
    }),
    user('ops', 'Operations on-call', ['%Operator', '%DB_USER'], {
      EmailAddress: 'ops@example.org',
      ChangePassword: true,
    }),
    user('analytics', 'BI service account', ['%SQL', '%DB_CLINICAL'], {
      Comment: 'Read-only SQL for the BI cluster',
      Namespace: 'CLINICAL',
    }),
    user('auditor', 'Compliance auditor', ['%Manager'], {
      EmailAddress: 'audit@example.org',
      ExpirationDate: '2026-12-31',
    }),
    user('operator', 'Night operator', ['%Operator'], { Enabled: true }),
  ];
}

function role(Name: string, Description: string, Resources: string[], extra: Partial<RoleRec> = {}): RoleRec {
  return {
    Name,
    Description,
    CreatedBy: '_SYSTEM',
    EscalationOnly: false,
    GrantedRoles: [],
    Resources,
    ...extra,
  };
}

function seedRoles(): RoleRec[] {
  return [
    role('%All', 'The Super-User Role', [
      '%Admin_Manage:U',
      '%Admin_Operate:U',
      '%Admin_Secure:U',
      '%DB_%DEFAULT:RW',
    ]),
    role('%Manager', 'System Manager', [
      '%Admin_Manage:U',
      '%Admin_Secure:U',
      '%Admin_Task:U',
      '%DB_IRISSYS:RW',
      '%Development:U',
      '%Service_Console:U',
      '%Service_Terminal:U',
    ]),
    role('%Operator', 'System Operator', [
      '%Admin_Operate:U',
      '%Admin_Task:U',
      '%Admin_Journal:U',
      '%DB_IRISSYS:R',
      '%Service_Console:U',
      '%Service_Terminal:U',
    ]),
    role('%Developer', 'Application Developer', [
      '%Development:U',
      '%DB_USER:RW',
      '%Service_Console:U',
      '%Service_Terminal:U',
      '%Service_Bindings:U',
    ]),
    role('%SQL', 'SQL user', ['%Service_Bindings:U', '%SQL:U']),
    role('%DB_USER', 'R/W access to USER', ['%DB_USER:RW']),
    role('%DB_IRISSYS', 'R/W access to IRISSYS', ['%DB_IRISSYS:RW']),
    role('%DB_IRISAPP', 'R/W access to IRISAPP', ['%DB_IRISAPP:RW']),
    role('%DB_INTEROP', 'R/W access to INTEROP', ['%DB_INTEROP:RW']),
    role('%DB_CLINICAL', 'R/W access to CLINICAL', ['%DB_CLINICAL:RW']),
    role(
      '%EnsRole_Administrator',
      'Interoperability administrator',
      ['%Ens_Portal:U', '%Ens_Rules:RW', '%Ens_Code:RW'],
      { GrantedRoles: ['%EnsRole_Operator'] },
    ),
    role('%EnsRole_Operator', 'Interoperability operator', ['%Ens_Portal:U', '%Ens_MessageHeader:R']),
    role('BreakGlass', 'Emergency escalation to %All (audited)', [], {
      EscalationOnly: true,
      GrantedRoles: ['%All'],
      CreatedBy: 'Admin',
    }),
  ];
}

function seedResources(): ResourceRec[] {
  const admin = (n: string, d: string) => ({
    Name: n,
    Description: d,
    PublicPermission: '',
    ResourceType: 'System',
    AllowDelete: false,
  });
  const dbr = (n: string, pub = '') => ({
    Name: `%DB_${n}`,
    Description: `R/W access to the ${n} database`,
    PublicPermission: pub,
    ResourceType: 'Database',
    AllowDelete: false,
  });
  const svc = (n: string, d: string, pub = '') => ({
    Name: `%Service_${n}`,
    Description: d,
    PublicPermission: pub,
    ResourceType: 'Service',
    AllowDelete: false,
  });
  return [
    admin('%Admin_Manage', 'Manage the system'),
    admin('%Admin_Operate', 'Operate the system'),
    admin('%Admin_Secure', 'Manage security'),
    admin('%Admin_Task', 'Manage tasks'),
    admin('%Admin_Journal', 'Manage journaling'),
    admin('%Admin_Wallet', 'Manage the wallet'),
    admin('%Admin_OAuth2_Client', 'Manage OAuth2 client configuration'),
    admin('%Admin_OAuth2_Server', 'Manage OAuth2 server configuration'),
    admin('%Admin_OAuth2_Registration', 'Manage OAuth2 client registration'),
    admin('%Admin_ExternalLanguageServerEdit', 'Edit external language servers'),
    admin('%Admin_FileSystemAccess', 'Manage file system access purposes'),
    admin('%Development', 'Use development tools'),
    admin('%SQL', 'Use SQL'),
    admin('%Ens_Portal', 'Use the interoperability portal'),
    admin('%Ens_Rules', 'Edit business rules'),
    admin('%Ens_Code', 'Edit interoperability code'),
    admin('%Ens_MessageHeader', 'View message headers'),
    dbr('IRISSYS'),
    dbr('IRISLIB', 'R'),
    dbr('IRISTEMP', 'RW'),
    dbr('IRISLOCALDATA', 'RW'),
    dbr('IRISAUDIT'),
    dbr('ENSLIB', 'R'),
    dbr('USER'),
    dbr('IRISAPP'),
    dbr('INTEROP'),
    dbr('CLINICAL'),
    svc('Bindings', 'Language bindings (JDBC/ODBC/Native)'),
    svc('CallIn', 'Call-in from external processes'),
    svc('Console', 'Local console/terminal'),
    svc('Terminal', 'Terminal access'),
    svc('WebGateway', 'Web gateway connections'),
    svc('ECP', 'Enterprise cache protocol'),
    svc('Mirror', 'Mirroring'),
    svc('Telnet', 'Telnet'),
    svc('Native', 'Native API', 'U'),
    {
      Name: 'dc.Aperture.Admin',
      Description: 'Administer the Aperture portal',
      PublicPermission: '',
      ResourceType: 'Application',
      AllowDelete: true,
    },
    {
      Name: 'HL7.Archive',
      Description: 'Access the HL7 archive',
      PublicPermission: '',
      ResourceType: 'Application',
      AllowDelete: true,
    },
  ];
}

function service(
  Name: string,
  Description: string,
  enabled: boolean,
  methods: string[],
  extra: Partial<ServiceRec> = {},
): ServiceRec {
  return {
    Name,
    Description,
    Enabled: enabled ? 'Yes' : 'No',
    EnabledBoolean: enabled,
    Public: 'No',
    AuthenticationMethods: methods,
    AllowedConnections: [],
    HttpOnlyCookies: true,
    TwoFactorEnabled: false,
    AutheEnabled: methods.includes('Unauthenticated') ? 96 : 32,
    ClientSystems: [],
    ...extra,
  };
}

function seedServices(): ServiceRec[] {
  return [
    service('%Service_Bindings', 'Language bindings (JDBC/ODBC/Native)', true, ['Password']),
    service('%Service_CallIn', 'Call-in from external processes', true, ['Password', 'OS']),
    service('%Service_Console', 'Console', true, ['Password', 'OS']),
    service('%Service_DataCheck', 'DataCheck', false, ['Password']),
    service('%Service_DocDB', 'Document database', false, ['Password']),
    service('%Service_ECP', 'Enterprise cache protocol', false, ['Password']),
    service('%Service_Login', 'Login', true, ['Password', 'OS']),
    service('%Service_Mirror', 'Mirroring', false, ['Password']),
    service('%Service_Monitor', 'SNMP monitor', false, ['Password']),
    service('%Service_Native', 'Native API', true, ['Password']),
    service('%Service_Sharding', 'Sharding', false, ['Password']),
    service('%Service_Telnet', 'Telnet', false, ['Password']),
    service('%Service_Terminal', 'Terminal', true, ['Password', 'OS']),
    service('%Service_WebGateway', 'Web gateway', true, ['Password'], {
      AllowedConnections: ['127.0.0.1', '10.0.0.0/8'],
    }),
  ];
}

function webApp(Name: string, Namespace: string, Type: string, extra: Partial<WebAppRec> = {}): WebAppRec {
  return {
    Name,
    Namespace,
    NamespaceDefault: false,
    Enabled: true,
    Type,
    Resource: '',
    AuthenticationMethods: ['Password'],
    IsSystemApp: Name.startsWith('/csp/sys') || Name.startsWith('/api/'),
    DispatchClass: '',
    Description: '',
    AutheEnabled: 32,
    Path: '',
    Timeout: 900,
    JWTAuthEnabled: false,
    JWTAccessTokenTimeout: 900,
    JWTRefreshTokenTimeout: 86400,
    CorsAllowlist: [],
    CorsCredentialsAllowed: false,
    CorsHeadersList: [],
    CSRFToken: true,
    ServeFiles: 'Always',
    Recurse: true,
    MatchRoles: [],
    UseCookies: 2,
    ...extra,
  };
}

function seedWebApps(): WebAppRec[] {
  return [
    webApp('/csp/sys', '%SYS', 'CSP', {
      Resource: '%Development',
      Description: 'System Management Portal',
      Path: `${MGR}../csp/sys/`,
      AuthenticationMethods: ['Password', 'Unauthenticated'],
      AutheEnabled: 96,
    }),
    webApp('/csp/sys/mgr', '%SYS', 'CSP', {
      Resource: '%Admin_Manage',
      Description: 'System Management Portal - configuration',
      Path: `${MGR}../csp/sys/mgr/`,
    }),
    webApp('/csp/sys/op', '%SYS', 'CSP', {
      Resource: '%Admin_Operate',
      Description: 'System Management Portal - operation',
      Path: `${MGR}../csp/sys/op/`,
    }),
    webApp('/csp/sys/sec', '%SYS', 'CSP', {
      Resource: '%Admin_Secure',
      Description: 'System Management Portal - security',
      Path: `${MGR}../csp/sys/sec/`,
    }),
    webApp('/csp/sys/exp', '%SYS', 'CSP', {
      Resource: '%Development',
      Description: 'System Management Portal - explorer',
      Path: `${MGR}../csp/sys/exp/`,
    }),
    webApp('/csp/broker', '%SYS', 'CSP', {
      Description: 'Zen broker',
      Path: `${MGR}../csp/broker/`,
      AuthenticationMethods: ['Unauthenticated'],
      AutheEnabled: 64,
    }),
    webApp('/csp/user', 'USER', 'CSP', { NamespaceDefault: true, Path: `${MGR}../csp/user/` }),
    webApp('/api/admin', '%SYS', 'REST', {
      Resource: '',
      Description: 'System administration REST API',
      DispatchClass: '%Api.Admin.v2.Dispatch',
      JWTAuthEnabled: true,
      AuthenticationMethods: ['Password', 'JWT'],
      CorsAllowlist: ['http://localhost:5173'],
    }),
    webApp('/api/atelier', '%SYS', 'REST', {
      Description: 'Source code REST API',
      DispatchClass: '%Api.Atelier',
      AuthenticationMethods: ['Password', 'Unauthenticated'],
      AutheEnabled: 96,
    }),
    webApp('/api/monitor', '%SYS', 'REST', {
      Description: 'Prometheus metrics',
      DispatchClass: '%Api.Monitor',
      AuthenticationMethods: ['Unauthenticated'],
      AutheEnabled: 64,
    }),
    webApp('/api/docdb', '%SYS', 'REST', {
      Description: 'Document database REST API',
      DispatchClass: '%Api.DocDB.v1.Dispatch',
      Enabled: false,
    }),
    webApp('/api/mgmnt', '%SYS', 'REST', {
      Description: 'REST API management',
      DispatchClass: '%Api.Mgmnt.v2.impl',
    }),
    webApp('/csp/irisapp', 'IRISAPP', 'CSP', {
      NamespaceDefault: true,
      Path: `${MGR}../csp/irisapp/`,
      Description: 'IRISAPP default web app',
    }),
    webApp('/csp/healthshare/interop', 'INTEROP', 'CSP', {
      NamespaceDefault: true,
      Resource: '%Ens_Portal',
      Description: 'Interoperability portal',
      Path: `${MGR}../csp/interop/`,
    }),
    webApp('/api/hl7', 'INTEROP', 'REST', {
      DispatchClass: 'dc.HL7.REST',
      Description: 'HL7 archive REST API',
      Resource: 'HL7.Archive',
      JWTAuthEnabled: true,
      AuthenticationMethods: ['Password', 'JWT'],
    }),
    webApp('/aperture', '%SYS', 'CSP', {
      Description: 'Aperture management portal (this app)',
      Path: `${MGR}../csp/aperture/`,
      ServeFiles: 'Always',
      AuthenticationMethods: ['Unauthenticated'],
      AutheEnabled: 64,
      Resource: '',
    }),
  ];
}

function seedAuditEvents(): AuditEventRec[] {
  const rnd = seeded(5);
  const mk = (
    EventSource: string,
    EventType: string,
    EventName: string,
    Description: string,
    Enabled = true,
  ): AuditEventRec => ({
    EventSource,
    EventType,
    EventName,
    Description,
    Enabled,
    Total: Math.floor(rnd() * 50_000),
    Written: 0,
    Lost: 0,
  });
  const list = [
    mk('%System', '%Login', 'Login', 'Successful login'),
    mk('%System', '%Login', 'LoginFailure', 'Failed login attempt'),
    mk('%System', '%Login', 'Logout', 'Logout'),
    mk('%System', '%Login', 'JWTLogin', 'JWT token issued'),
    mk('%System', '%Login', 'Terminate', 'Process terminated'),
    mk('%System', '%Security', 'UserChange', 'User definition changed'),
    mk('%System', '%Security', 'RoleChange', 'Role definition changed'),
    mk('%System', '%Security', 'ResourceChange', 'Resource definition changed'),
    mk('%System', '%Security', 'ApplicationChange', 'Web application changed'),
    mk('%System', '%Security', 'AuditChange', 'Audit settings changed'),
    mk('%System', '%Security', 'Protect', 'Protection violation'),
    mk('%System', '%Security', 'SSLConfigChange', 'SSL configuration changed', false),
    mk('%System', '%System', 'Start', 'System started'),
    mk('%System', '%System', 'Stop', 'System stopped'),
    mk('%System', '%System', 'ConfigurationChange', 'Configuration changed'),
    mk('%System', '%System', 'DatabaseChange', 'Database changed'),
    mk('%System', '%System', 'JournalChange', 'Journal settings changed'),
    mk('%System', '%System', 'RoutineChange', 'Routine changed', false),
    mk('%System', '%System', 'OSCommand', 'OS command executed', false),
    mk('%System', '%DirectMode', 'DirectMode', 'Direct mode command', false),
    mk('%System', '%SQL', 'DDLStatement', 'DDL statement executed'),
    mk('%System', '%SQL', 'DMLStatement', 'DML statement executed', false),
    mk('%System', '%SQL', 'PrivilegeChange', 'SQL privilege changed'),
    mk('%System', '%SQL', 'XDBCStatement', 'ODBC/JDBC statement', false),
    mk('%Ensemble', '%Message', 'Resend', 'Message resent'),
    mk('%Ensemble', '%Production', 'Start', 'Production started'),
    mk('%Ensemble', '%Production', 'Stop', 'Production stopped'),
    mk('%Ensemble', '%Production', 'ModifyConfigItem', 'Production item modified'),
    mk('dc.Aperture', '%Portal', 'Action', 'Action performed from the Aperture portal'),
  ];
  for (const e of list) {
    e.Written = e.Enabled ? e.Total : 0;
  }
  return list;
}

function seedWebSessions(): WebSessionRec[] {
  return [
    {
      ID: 'NrT0uQV9SV',
      Username: '_SYSTEM',
      Preserve: 0,
      Application: '/api/admin',
      Timeout: inMinutes(14),
      LicenseId: '_SYSTEM@127.0.0.1',
      SesProcessId: '',
      AllowEndSession: false,
    },
    {
      ID: 'kA2mPq7LzX',
      Username: 'jdoe',
      Preserve: 1,
      Application: '/csp/sys',
      Timeout: inMinutes(9),
      LicenseId: 'jdoe@10.0.0.41',
      SesProcessId: '',
      AllowEndSession: true,
    },
    {
      ID: 'Bq91xTgH0e',
      Username: 'jdoe',
      Preserve: 0,
      Application: '/csp/irisapp',
      Timeout: inMinutes(3),
      LicenseId: 'jdoe@10.0.0.41',
      SesProcessId: '',
      AllowEndSession: true,
    },
    {
      ID: 'Zx5cVb3NmQ',
      Username: 'ops',
      Preserve: 1,
      Application: '/csp/healthshare/interop',
      Timeout: inMinutes(12),
      LicenseId: 'ops@10.0.0.52',
      SesProcessId: '',
      AllowEndSession: true,
    },
    {
      ID: 'Yt8kLp2WsD',
      Username: 'UnknownUser',
      Preserve: 0,
      Application: '/api/monitor',
      Timeout: inMinutes(1),
      LicenseId: '',
      SesProcessId: '',
      AllowEndSession: true,
    },
  ];
}

function seedX509(): X509Rec[] {
  const ca = 'CN=Example Hospital Internal CA,O=Example Hospital NHS Trust,C=GB';
  return [
    {
      Alias: 'WebServerCert',
      HasPrivateKey: true,
      OwnerList: ['_SYSTEM'],
      PeerNames: [],
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      SerialNumber: '4A:1F:9C:02:7B:33:E1:90',
      IssuerDN: ca,
      SubjectDN: 'CN=iris.example.org,O=Example Hospital NHS Trust,C=GB',
      ValidityNotBefore: daysAgo(200),
      ValidityNotAfter: inDays(530),
    },
    {
      Alias: 'MirrorMemberCert',
      HasPrivateKey: true,
      OwnerList: ['_SYSTEM'],
      PeerNames: ['iris-mirror-a.example.org'],
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      SerialNumber: '4A:1F:9C:02:7B:33:E1:91',
      IssuerDN: ca,
      SubjectDN: 'CN=iris-mirror-b.example.org,O=Example Hospital NHS Trust,C=GB',
      ValidityNotBefore: daysAgo(353),
      ValidityNotAfter: inDays(12),
    },
    {
      Alias: 'HL7GatewayTLS',
      HasPrivateKey: true,
      OwnerList: ['_SYSTEM', 'ops'],
      PeerNames: ['hl7-gw.hospital.local'],
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      SerialNumber: '4A:1F:9C:02:7B:33:E1:A4',
      IssuerDN: ca,
      SubjectDN: 'CN=hl7-gw.hospital.local,OU=Integration,O=Example Hospital NHS Trust,C=GB',
      ValidityNotBefore: daysAgo(30),
      ValidityNotAfter: inDays(400),
    },
    {
      Alias: 'OAuthIssuerPublic',
      HasPrivateKey: false,
      OwnerList: [],
      PeerNames: ['login.example.org'],
      CAFile: '',
      SerialNumber: '03:9F:11:8C:0D:E2:77:4B:AA:10',
      IssuerDN: "CN=Let's Encrypt R11,O=Let's Encrypt,C=US",
      SubjectDN: 'CN=login.example.org',
      ValidityNotBefore: daysAgo(29),
      ValidityNotAfter: inDays(61),
    },
    {
      Alias: 'LDAPClient2024',
      HasPrivateKey: true,
      OwnerList: ['_SYSTEM'],
      PeerNames: ['ldap.example.org'],
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      SerialNumber: '4A:1F:9C:02:7B:33:D0:07',
      IssuerDN: ca,
      SubjectDN: 'CN=iris-ldap-client,O=Example Hospital NHS Trust,C=GB',
      ValidityNotBefore: daysAgo(405),
      ValidityNotAfter: daysAgo(40),
    },
  ];
}

function seedSsl(): SslRec[] {
  return [
    {
      Name: '%SuperServer',
      Description: 'Superserver TLS',
      Enabled: true,
      Type: 'Server',
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      CertificateFile: '/usr/irissys/mgr/certs/server.pem',
      PrivateKeyFile: '/usr/irissys/mgr/certs/server.key',
      TLSMinVersion: 16,
      TLSMaxVersion: 32,
      VerifyPeer: 0,
      CipherList: ['ALL:!aNULL:!eNULL:!EXP:!SSLv2'],
      Ciphersuites: ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'],
    },
    {
      Name: 'MirrorSSL',
      Description: 'Mirror member TLS',
      Enabled: false,
      Type: 'Client',
      CAFile: '/usr/irissys/mgr/certs/ca.pem',
      CertificateFile: '/usr/irissys/mgr/certs/mirror.pem',
      PrivateKeyFile: '/usr/irissys/mgr/certs/mirror.key',
      TLSMinVersion: 16,
      TLSMaxVersion: 32,
      VerifyPeer: 1,
      CipherList: ['HIGH'],
      Ciphersuites: [],
    },
    {
      Name: 'DMZ-SFTP',
      Description: 'Outbound TLS to the DMZ SFTP',
      Enabled: true,
      Type: 'Client',
      CAFile: '/usr/irissys/mgr/certs/dmz-ca.pem',
      CertificateFile: '',
      PrivateKeyFile: '',
      TLSMinVersion: 16,
      TLSMaxVersion: 32,
      VerifyPeer: 1,
      CipherList: ['HIGH'],
      Ciphersuites: [],
    },
    {
      Name: 'LDAP-Corp',
      Description: 'LDAPS to the corporate directory',
      Enabled: true,
      Type: 'Client',
      CAFile: '/etc/ssl/certs/corp-root.pem',
      CertificateFile: '',
      PrivateKeyFile: '',
      TLSMinVersion: 16,
      TLSMaxVersion: 32,
      VerifyPeer: 1,
      CipherList: ['HIGH'],
      Ciphersuites: [],
    },
  ];
}

export function createDb(): MockDb {
  const { configDbs, localDbs } = seedDatabases();
  const processes = seedProcesses();
  const tasks = seedTasks();
  return {
    namespaces: seedNamespaces(),
    configDbs,
    localDbs,
    processes,
    locks: seedLocks(processes),
    journals: seedJournals(),
    journalSettings: {
      CurrentDirectory: `${MGR}journal/`,
      AlternateDirectory: `${MGR}journal/alt/`,
      ArchiveName: '',
      BackupsBeforePurge: 2,
      DaysBeforePurge: 2,
      FileSizeLimit: 1024,
      FreezeOnError: false,
      JournalFilePrefix: '',
      JournalcspSession: false,
      PurgeArchived: false,
      CompressFiles: true,
      wijdir: MGR,
      targwijsz: 0,
    },
    tasks,
    taskHistory: seedTaskHistory(tasks),
    taskManager: 'Running',
    users: seedUsers(),
    roles: seedRoles(),
    resources: seedResources(),
    services: seedServices(),
    webApps: seedWebApps(),
    auditEnabled: true,
    auditEvents: seedAuditEvents(),
    webSessions: seedWebSessions(),
    sslConfigs: seedSsl(),
    x509: seedX509(),
    auditLog: [],
    startedAt: Date.now() - 3 * 86_400_000 - 4 * 3_600_000 - 17 * 60_000,
    broadcasts: [],
    // Shape and UTC time format of the documented example ("Monitoring InterSystems IRIS via REST").
    pendingAlerts: [
      {
        time: new Date(Date.now() - 31 * 3_600_000).toISOString(),
        severity: 1,
        message: 'Journal file /usr/irissys/mgr/journal/20260915.002 switched: file size limit reached',
      },
      {
        time: new Date(Date.now() - 20 * 3_600_000).toISOString(),
        severity: 2,
        message: 'ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)',
      },
    ],
  };
}

export let mockDb: MockDb = createDb();

export function resetDb() {
  mockDb = createDb();
  resetAsyncTasks();
}

export function minutesAgoStr(m: number) {
  return minutesAgo(m);
}
