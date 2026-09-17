import { mockDb } from '../db';
import { drift, ok, fmtDate, inMinutes, hoursAgo } from '../util';
import { http, HttpResponse } from 'msw';
import { route, OPERATE } from '../secure';

function uptime(): string {
  const ms = Date.now() - mockDb.startedAt;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

function mainDashboard() {
  const refs = drift(18_500, 6_000, 45);
  const busy = mockDb.processes.filter((p) => p.State === 'RUNW' && p.Username).length;
  return {
    Performance: {
      GlobalRefsPerSecond: Math.round(refs),
      GlobalRefs: Math.round(1_284_003_112 + (Date.now() - mockDb.startedAt) * 18),
      GlobalSetKill: Math.round(drift(2_300, 900, 30, 1)),
      RoutineRefs: Math.round(drift(4_100, 1_200, 50, 2)),
      LogicalRequests: Math.round(drift(9_800, 3_000, 40, 3)),
      DiskReads: Math.round(drift(120, 90, 35, 4)),
      DiskWrites: Math.round(drift(60, 40, 55, 5)),
      CacheEfficiency: Number((98.2 + drift(0.6, 0.5, 70, 6)).toFixed(2)),
    },
    ECP: {
      ECPClients: '0',
      ECPClientTraffic: 0,
      ECPServers: '0',
      ECPServerTraffic: 0,
      ShadowConnections: '0',
    },
    Status: {
      UpTime: uptime(),
      LastBackup: fmtDate(new Date(Date.now() - 26 * 3_600_000)),
      SystemMonitor: true,
    },
    SystemUsage: {
      DatabaseSpace: 'Normal',
      DatabaseJournal: 'Normal',
      JournalSpace: 'Normal',
      JournalEntries: Math.round(42_113_002 + (Date.now() - mockDb.startedAt) / 4),
      LockTable: 'Normal',
      WriteDaemon: 'Normal',
      Processes: mockDb.processes.length,
      CSPSessions: mockDb.webSessions.length,
      BusyProcesses: mockDb.processes.filter((p) => p.State === 'RUNW' && p.Username).slice(0, busy).map((p) => ({ Pid: p.Pid, Username: p.Username, Routine: p.Routine, State: p.State })),
    },
    Alerts: {
      SeriousAlerts: mockDb.tasks.some((t) => t.Status === 'Error') ? 1 : 0,
      ApplicationErrors: 3,
    },
    Licensing: {
      LicenseLimit: 20,
      LicenseUse: Number(((busy + 4) * 5).toFixed(0)),
      LicenseUseHigh: 65,
    },
    UpcomingTasks: mockDb.tasks
      .filter((t) => t.NextScheduled)
      .slice(0, 6)
      .map((t) => ({ Task: t.Name, Time: t.NextScheduled, Status: t.Suspended ? 'Suspended' : 'Scheduled' })),
  };
}

function prometheusText(): string {
  const cpu = drift(23, 12, 90, 2).toFixed(2);
  const mem = drift(64, 6, 200, 3).toFixed(2);
  const dbs = mockDb.localDbs.map((d) => ({ dir: d.Directory, size: d.Size, free: Math.round(d.AvailableSpace), full: Math.min(99, Math.round(100 - (d.AvailableSpace / Math.max(1, d.Size)) * 100)) }));
  const lines = [
    '# HELP iris_cpu_usage Percentage of CPU used by the instance',
    '# TYPE iris_cpu_usage gauge',
    `iris_cpu_usage ${cpu}`,
    '# HELP iris_phys_mem_percent_used Percentage of physical memory in use',
    '# TYPE iris_phys_mem_percent_used gauge',
    `iris_phys_mem_percent_used ${mem}`,
    '# HELP iris_license_percent_used Percentage of licence units in use',
    '# TYPE iris_license_percent_used gauge',
    `iris_license_percent_used ${Math.round(drift(45, 15, 120))}`,
    '# HELP iris_process_count Number of IRIS processes',
    '# TYPE iris_process_count gauge',
    `iris_process_count ${mockDb.processes.length}`,
    '# HELP iris_system_alerts Number of alerts in alerts.log',
    '# TYPE iris_system_alerts gauge',
    'iris_system_alerts 2',
    '# HELP iris_glorefs_per_sec Global references per second',
    '# TYPE iris_glorefs_per_sec gauge',
    `iris_glorefs_per_sec ${Math.round(drift(18_500, 6_000, 45))}`,
    '# HELP iris_jrn_free_space Free space in the journal directory (MB)',
    '# TYPE iris_jrn_free_space gauge',
    `iris_jrn_free_space{id="primary"} ${Math.round(drift(41_200, 200, 300))}`,
    '# HELP iris_db_size_mb Database size in MB',
    '# TYPE iris_db_size_mb gauge',
    ...dbs.map((d) => `iris_db_size_mb{id="${d.dir}"} ${d.size}`),
    '# HELP iris_db_free_space Free space available to the database (MB)',
    '# TYPE iris_db_free_space gauge',
    ...dbs.map((d) => `iris_db_free_space{id="${d.dir}"} ${d.free}`),
    '# HELP iris_disk_percent_full Percentage of the volume holding the database that is in use',
    '# TYPE iris_disk_percent_full gauge',
    ...dbs.map((d) => `iris_disk_percent_full{id="${d.dir}"} ${d.full}`),
    '# HELP iris_wd_cycle_time Write daemon cycle time in ms',
    '# TYPE iris_wd_cycle_time gauge',
    `iris_wd_cycle_time ${Math.round(drift(12, 6, 30))}`,
  ];
  return lines.join('\n') + '\n';
}

export const nativeMonitorHandlers = [
  http.get('*/api/monitor/metrics', () => new HttpResponse(prometheusText(), { status: 200, headers: { 'Content-Type': 'text/plain; version=0.0.4' } })),
  http.get('*/api/monitor/alerts', () =>
    HttpResponse.json([
      { time: hoursAgo(20), severity: 2, process: '5471', message: 'ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)' },
      { time: hoursAgo(31), severity: 1, process: 'JRNDMN', message: 'Journal file /usr/irissys/mgr/journal/20260915.002 switched: file size limit reached' },
    ]),
  ),
];

export const monitorHandlers = [
  route('get', '/v2/monitor/dashboard/main', OPERATE, () => ok(mainDashboard())),

  route('get', '/v2/monitor/dashboard/system-resources', OPERATE, () =>
    ok(
      ['Global', 'Routine', 'Lock', 'GlobalBufferPool', 'JournalBuffer', 'DirectoryBlock', 'PIDTable', 'Shared memory heap'].map((Name, i) => ({
        Name,
        Seize: Math.round(drift(120_000 / (i + 1), 8_000, 60, i)),
        Nseize: Math.round(drift(400 / (i + 1), 80, 60, i + 1)),
        Aseize: Math.round(drift(80 / (i + 1), 30, 60, i + 2)),
        Bseize: Math.round(drift(20 / (i + 1), 10, 60, i + 3)),
        BusySet: Math.round(drift(5, 4, 60, i + 4)),
      })),
    ),
  ),

  route('get', '/v2/monitor/dashboard/globals-and-routines', OPERATE, () =>
    ok({
      Globals: {
        RefLocal: Math.round(drift(18_500, 6_000, 45)),
        RefUpdateLocal: Math.round(drift(2_300, 900, 30, 1)),
        RefRemote: 0,
        RefUpdateRemote: 0,
        RefPrivate: Math.round(drift(900, 300, 40, 2)),
        RefUpdatePrivate: Math.round(drift(200, 80, 40, 3)),
        LogicalBlocks: Math.round(drift(9_800, 3_000, 40, 3)),
        PhysBlockReads: Math.round(drift(120, 90, 35, 4)),
        PhysBlockWrites: Math.round(drift(60, 40, 55, 5)),
        WIJWrites: Math.round(drift(30, 20, 65, 6)),
        JrnEntries: Math.round(drift(700, 300, 50, 7)),
        JrnBlocks: Math.round(drift(90, 40, 50, 8)),
      },
      Routines: {
        RtnCallsLocal: Math.round(drift(4_100, 1_200, 50, 2)),
        RtnFetchLocal: Math.round(drift(12, 10, 80, 9)),
        RtnCallsRemote: 0,
        RtnCommands: Math.round(drift(410_000, 120_000, 50, 2)),
        RtnNotCached: Math.round(drift(3, 3, 90, 10)),
        RtnFetchRemote: 0,
      },
    }),
  ),

  route('get', '/v2/monitor/dashboard/ecp', OPERATE, () =>
    ok({
      AppServer: { MaxConn: 0, ActConn: 0, GloRef: 0, ByteSent: 0, ByteRcvd: 0, BlockAdd: 0, BlockBuffPurge: 0, BlockSvrPurge: 0, GloRefLocal: 0, GloRefRemote: 0, GloUpdateLocal: 0, RoutineCallLocal: 0, RoutineCallRemote: 0, RoutineBuffLocal: 0, RoutineBuffRemote: 0 },
      DataServer: { GloUpdate: 0, ReqRcvd: 0, ReqBuff: 0, BlockSent: 0, LockGrant: 0, LockFail: 0, LockQueGrant: 0, LockQueFail: 0, SvrBlockPurge: 0, RoutinePurge: 0, BigKill: 0, BigString: 0, MaxConn: 0, ActConn: 0, ByteRcvd: 0, ByteSent: 0, GloRef: 0 },
    }),
  ),

  route('get', '/v2/monitor/system-usage', OPERATE, () => {
    const t = (Date.now() - mockDb.startedAt) / 1000;
    return ok({
      AllGlobalReferences: Math.round(t * 18_500),
      GlobalUpdateReferences: Math.round(t * 2_300),
      RoutineCalls: Math.round(t * 4_100),
      RoutineBufferLoadsAndSaves: Math.round(t * 12),
      LogicalBlockRequests: Math.round(t * 9_800),
      BlockReads: Math.round(t * 120),
      BlockWrites: Math.round(t * 60),
      WIJwrites: Math.round(t * 30),
      JournalEntries: Math.round(t * 700),
      JournalBlockWrites: Math.round(t * 90),
      RoutineLines: Math.round(t * 410_000),
      LastUpdate: fmtDate(new Date()),
    });
  }),

  route('get', '/v2/monitor/system-usage/shared-memory', OPERATE, () =>
    ok(
      [
        ['Global buffers', 262_144, 0, 262_144],
        ['Routine buffers', 65_536, 0, 65_536],
        ['Journal buffers', 65_536, 0, 65_536],
        ['Shared memory heap', 87_040, 31_202, 55_838],
        ['GST (global state table)', 12_288, 3_100, 9_188],
        ['Lock table', 16_384, 1_402, 14_982],
      ].map(([Description, SMHAllocated, SMHUsed, SMHAvailable]) => ({
        Description,
        SMHAllocated,
        SMHAvailable,
        SMHUsed,
        SMTUsed: Math.round(Number(SMHUsed) * 0.4),
        GSTUsed: Math.round(Number(SMHUsed) * 0.2),
        AllUsed: SMHUsed,
      })),
    ),
  ),

  route('get', '/v2/monitor/license-usage', OPERATE, () => {
    const users = mockDb.processes.filter((p) => p.Username && p.IPAddress);
    const byUser = new Map<string, number>();
    for (const p of users) byUser.set(`${p.Username}@${p.IPAddress || 'local'}`, (byUser.get(`${p.Username}@${p.IPAddress || 'local'}`) ?? 0) + 1);
    return ok({
      Summary: [
        { Type: 'Local', CurrentUsed: byUser.size, MaxUsed: 13, Available: 20 - byUser.size, Enforced: 20 },
        { Type: 'Distributed', CurrentUsed: byUser.size, MaxUsed: 13, Available: 20 - byUser.size, Enforced: 20 },
      ],
      UsageByUser: [...byUser.entries()].map(([id, n]) => ({ UserId: id, Connections: n, Units: 1, Type: 'Local', Active: true, Grace: 0 })),
      UsageByProcess: users.map((p) => ({ Pid: p.Pid, UserId: `${p.Username}@${p.IPAddress || 'local'}`, Type: 'Local', Units: 1, ClientIP: p.IPAddress, EXEName: p.EXEName, Connections: 1, LicenseCheck: 'OK' })),
      ConnectionList: users.map((p) => ({ Pid: p.Pid, UserId: p.Username, ClientIP: p.IPAddress, Connections: 1, Type: 'Local', Expires: inMinutes(30) })),
    });
  }),
];
