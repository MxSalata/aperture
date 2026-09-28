import { diskFreeMB, diskPercentFull, mockDb } from '../db';
import { counter, drift, ok, fmtDate } from '../util';
import { http, HttpResponse } from 'msw';
import { route, OPERATE } from '../secure';

/** Post an entry to alerts.log, as IRIS does for a message of severity 2 or more. */
export function postAlert(severity: '2' | '3', message: string): void {
  mockDb.pendingAlerts.push({ time: new Date().toISOString(), severity, message });
  mockDb.alertsPosted += 1;
}

function uptime(): string {
  const ms = Date.now() - mockDb.startedAt;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  // As IRIS writes it: "0d  0h 35m" (hours padded with a space).
  return `${d}d ${String(h).padStart(2, ' ')}h ${String(m).padStart(2, '0')}m`;
}

function mainDashboard() {
  const refs = drift(18_500, 6_000, 45);
  const busy = mockDb.processes.filter((p) => p.State === 'RUNW' && p.Username).length;
  return {
    Performance: {
      GlobalRefsPerSecond: Math.round(refs),
      GlobalRefs: Math.round(1_284_003_112 + (Date.now() - mockDb.startedAt) * 18),
      // Totals since system startup, like GlobalRefs; only GlobalRefsPerSecond and
      // CacheEfficiency are "most recently measured".
      GlobalSetKill: counter(17_000, 2_300, 900, 30, 1, mockDb.startedAt),
      RoutineRefs: counter(87_000, 4_100, 1_200, 50, 2, mockDb.startedAt),
      LogicalRequests: counter(108_000, 9_800, 3_000, 40, 3, mockDb.startedAt),
      DiskReads: counter(2_600, 120, 90, 35, 4, mockDb.startedAt),
      DiskWrites: counter(400, 60, 40, 55, 5, mockDb.startedAt),
      // Global references per physical read or write: a ratio, several hundred on a warm cache.
      CacheEfficiency: Number(drift(650, 120, 70, 6).toFixed(2)),
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
      // Always ten rows of { Process, Commands }, padded with { Process: "", Commands: 0 }.
      BusyProcesses: [
        ...mockDb.processes
          .filter((p) => p.State === 'RUNW' && p.Username)
          .slice(0, busy)
          .map((p) => ({ Process: p.Pid, Commands: p.Commands })),
        ...Array.from({ length: 10 }, () => ({ Process: '', Commands: 0 })),
      ].slice(0, 10),
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
  // Labelled as IRIS labels them: id is the database's name, dir its directory; the disk figures
  // are those of the disk the directory is on (iris_directory_space in MB free).
  const dbs = mockDb.localDbs.map((d) => ({
    id: mockDb.configDbs.find((c) => c.Directory === d.Directory)?.Name ?? d.Directory,
    dir: d.Directory,
    size: d.Size,
    free: Math.round(d.AvailableSpace),
    diskFree: diskFreeMB(d.Directory),
    full: diskPercentFull(d.Directory),
  }));
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
    '# HELP iris_system_alerts The number of alerts posted to the messages log since system startup',
    '# TYPE iris_system_alerts gauge',
    `iris_system_alerts ${mockDb.alertsPosted}`,
    '# HELP iris_system_alerts_log The number of alerts currently located in the alerts log',
    '# TYPE iris_system_alerts_log gauge',
    `iris_system_alerts_log ${mockDb.alertsPosted}`,
    '# HELP iris_system_alerts_new Whether new alerts are available on the /api/monitor/alerts endpoint',
    '# TYPE iris_system_alerts_new gauge',
    `iris_system_alerts_new ${mockDb.pendingAlerts.length ? 1 : 0}`,
    '# HELP iris_glorefs_per_sec Global references per second',
    '# TYPE iris_glorefs_per_sec gauge',
    `iris_glorefs_per_sec ${Math.round(drift(18_500, 6_000, 45))}`,
    '# HELP iris_jrn_free_space Free space in the journal directory (MB)',
    '# TYPE iris_jrn_free_space gauge',
    `iris_jrn_free_space{id="primary"} ${Math.round(drift(41_200, 200, 300))}`,
    '# HELP iris_db_size_mb Database size in MB',
    '# TYPE iris_db_size_mb gauge',
    ...dbs.map((d) => `iris_db_size_mb{id="${d.id}",dir="${d.dir}"} ${d.size}`),
    '# HELP iris_db_free_space Free space available to the database (MB)',
    '# TYPE iris_db_free_space gauge',
    ...dbs.map((d) => `iris_db_free_space{id="${d.id}"} ${d.free}`),
    '# HELP iris_directory_space Free space on the disk that holds the database directory (MB)',
    '# TYPE iris_directory_space gauge',
    ...dbs.map((d) => `iris_directory_space{id="${d.id}",dir="${d.dir}"} ${d.diskFree}`),
    '# HELP iris_disk_percent_full Percentage of the volume holding the database that is in use',
    '# TYPE iris_disk_percent_full gauge',
    // As on IRIS for Health 2026.2, not every database has one: IRISLIB is left out.
    ...dbs
      .filter((d) => d.id !== 'IRISLIB')
      .map((d) => `iris_disk_percent_full{id="${d.id}",dir="${d.dir}"} ${d.full.toFixed(2)}`),
    '# HELP iris_wd_cycle_time Write daemon cycle time in ms',
    '# TYPE iris_wd_cycle_time gauge',
    `iris_wd_cycle_time ${Math.round(drift(12, 6, 30))}`,
    // Interoperability metrics, as IRIS reports them once EnableSAMForNamespace() ran in a
    // namespace whose production is running; aggregated per production (no host labels).
    '# HELP iris_interop_messages_per_sec Average number of messages processed within the production and namespace in a second over the most recent sampling interval',
    '# TYPE iris_interop_messages_per_sec gauge',
    `iris_interop_messages_per_sec{id="INTEROP",production="HL7.Production"} ${drift(42, 14, 60, 4).toFixed(1)}`,
    `iris_interop_messages_per_sec{id="CLINICAL",production="FHIR.Production"} ${drift(11, 5, 75, 5).toFixed(1)}`,
    '# HELP iris_interop_queued Number of messages currently queued for hosts within the production and namespace',
    '# TYPE iris_interop_queued gauge',
    `iris_interop_queued{id="INTEROP",production="HL7.Production"} ${Math.max(0, Math.round(drift(3, 4, 50, 6)))}`,
    `iris_interop_queued{id="CLINICAL",production="FHIR.Production"} ${Math.max(0, Math.round(drift(0.4, 1, 40, 7)))}`,
    '# HELP iris_interop_hosts Number of hosts within the production and namespace which currently have the specified status',
    '# TYPE iris_interop_hosts gauge',
    'iris_interop_hosts{id="INTEROP",status="OK",production="HL7.Production"} 14',
    'iris_interop_hosts{id="INTEROP",status="Error",production="HL7.Production"} 1',
    'iris_interop_hosts{id="CLINICAL",status="OK",production="FHIR.Production"} 6',
  ];
  return lines.join('\n') + '\n';
}

export const nativeMonitorHandlers = [
  http.get(
    '*/api/monitor/metrics',
    () =>
      new HttpResponse(prometheusText(), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
      }),
  ),
  // Like IRIS: each call returns the alerts posted since the previous call, then they are gone.
  http.get('*/api/monitor/alerts', () => {
    const batch = mockDb.pendingAlerts;
    mockDb.pendingAlerts = [];
    return HttpResponse.json(batch);
  }),
];

export const monitorHandlers = [
  route('get', '/v2/monitor/dashboard/main', OPERATE, () => ok(mainDashboard())),

  route('get', '/v2/monitor/dashboard/system-resources', OPERATE, () =>
    ok(
      [
        'Global',
        'Routine',
        'Lock',
        'GlobalBufferPool',
        'JournalBuffer',
        'DirectoryBlock',
        'PIDTable',
        'Shared memory heap',
      ].map((Name, i) => ({
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
      AppServer: {
        MaxConn: 0,
        ActConn: 0,
        GloRef: 0,
        ByteSent: 0,
        ByteRcvd: 0,
        BlockAdd: 0,
        BlockBuffPurge: 0,
        BlockSvrPurge: 0,
        GloRefLocal: 0,
        GloRefRemote: 0,
        GloUpdateLocal: 0,
        RoutineCallLocal: 0,
        RoutineCallRemote: 0,
        RoutineBuffLocal: 0,
        RoutineBuffRemote: 0,
      },
      DataServer: {
        GloUpdate: 0,
        ReqRcvd: 0,
        ReqBuff: 0,
        BlockSent: 0,
        LockGrant: 0,
        LockFail: 0,
        LockQueGrant: 0,
        LockQueFail: 0,
        SvrBlockPurge: 0,
        RoutinePurge: 0,
        BigKill: 0,
        BigString: 0,
        MaxConn: 0,
        ActConn: 0,
        ByteRcvd: 0,
        ByteSent: 0,
        GloRef: 0,
      },
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

  // Shapes exactly as the spec's LicenseUsage declares them (src/mocks/__tests__/contract.test.ts checks them).
  route('get', '/v2/monitor/license-usage', OPERATE, () => {
    const users = mockDb.processes.filter((p) => p.Username && p.IPAddress);
    const byUser = new Map<string, typeof users>();
    for (const p of users) {
      const id = `${p.Username}@${p.IPAddress}`;
      byUser.set(id, [...(byUser.get(id) ?? []), p]);
    }
    const used = String(byUser.size);
    return ok({
      Summary: [
        { LicenseUnitUse: 'Current License Units Used', Local: used, Distributed: used },
        { LicenseUnitUse: 'Maximum License Units Used', Local: '13', Distributed: '13' },
        { LicenseUnitUse: 'License Units Enforced', Local: '20', Distributed: '20' },
        { LicenseUnitUse: 'License Units Authorized', Local: '20', Distributed: '20' },
      ],
      UsageByUser: [...byUser.entries()].map(([id, ps]) => ({
        UserId: id,
        Type: 'User',
        Connects: ps.length,
        MaxCon: ps.length,
        CSPCon: 0,
        LU: 1,
        Active: 3_600,
        Grace: 0,
      })),
      UsageByProcess: users.map((p) => ({
        PID: Number(p.Pid),
        Process: 'User',
        LID: `${p.Username}@${p.IPAddress}`,
        Type: 'User',
        Con: 1,
        MaxCon: 1,
        CSPCon: 0,
        LU: 1,
        Active: 3_600,
        Grace: 0,
      })),
      ConnectionList: [...byUser.entries()].map(([id, ps]) => ({
        UserId: id,
        LicenseUnits: '1',
        Connections: String(ps.length),
        ServerIP: '127.0.0.1',
        Instance: 'IRIS',
      })),
    });
  }),
];
