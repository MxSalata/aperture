import { mockDb } from '../db';
import { ok, notFound, badRequest, requireParam, jsonBody, filterRows, fail } from '../util';
import { route, OPERATE } from '../secure';

function findProcess(request: Request) {
  const id = Number(requireParam(request, 'id'));
  return mockDb.processes.find((p) => p.Pid === id);
}

export const processHandlers = [
  route('get', '/v2/processes', OPERATE, ({ request }) => {
    const rows = mockDb.processes.map((p) => {
      const {
        StartTimeUTC: _s,
        MemoryAllocated: _a,
        MemoryUsed: _u,
        MemoryPeak: _p,
        Roles: _r,
        OpenDevices: _d,
        InTransaction: _t,
        Location: _l,
        LastGlobalReference: _g,
        ...row
      } = p;
      return row;
    });
    return ok(filterRows(rows as unknown as Record<string, unknown>[], request));
  }),

  route('get', '/v2/process', OPERATE, ({ request }) => {
    const p = findProcess(request);
    if (!p) return notFound('Process');
    return ok({
      Pid: p.Pid,
      PidExternal: p.Pid,
      JobNumber: p.Job,
      JobType: p.Username ? 4 : 2,
      UserName: p.Username,
      OSUserName: p.OSUserName,
      NameSpace: p.Nspace,
      Routine: p.Routine,
      State: p.State,
      CurrentDevice: p.Device,
      PrincipalDevice: p.Device,
      ClientNodeName: p.ClientName,
      ClientIPAddress: p.IPAddress,
      ClientExecutableName: p.EXEname,
      StartupClientIPAddress: p.IPAddress,
      StartupClientNodeName: p.ClientName,
      CommandsExecuted: p.Commands,
      GlobalReferences: p.Globals,
      GlobalUpdates: Math.round(p.Globals * 0.12),
      GlobalDiskReads: Math.round(p.Globals * 0.01),
      GlobalBlocks: Math.round(p.Globals * 0.02),
      DataBlockWrites: Math.round(p.Globals * 0.005),
      PrivateGlobalBlockCount: p.PrvGblBlkCnt,
      PrivateGlobalReferences: p.PrvGblBlkCnt * 12,
      PrivateGlobalUpdates: p.PrvGblBlkCnt * 3,
      JournalEntries: Math.round(p.Globals * 0.03),
      CPUTime: p.CPUTime,
      ParentPid: p.ParentPid,
      Priority: 0,
      StartTimeUTC: p.StartTimeUTC,
      MemoryAllocated: p.MemoryAllocated,
      MemoryUsed: p.MemoryUsed,
      MemoryPeak: p.MemoryPeak,
      Roles: p.Roles,
      LoginRoles: p.Roles,
      EscalatedRoles: [],
      OpenDevices: p.Device ? [p.Device] : [],
      InTransaction: p.InTransaction,
      IsGhost: 0,
      Location: p.Location,
      CurrentLineAndRoutine: p.Location,
      CurrentSrcLine: '',
      LastGlobalReference: p.LastGlobalReference,
      LicenseUserId: p.Username ? `${p.Username}@${p.IPAddress || 'local'}` : '',
      CSPSessionID: '',
      UserInfo: '',
      CanBeSuspended: p.CanBeSuspended,
      CanBeTerminated: p.CanBeTerminated,
      CanReceiveBroadcast: p.CanReceiveBroadcast,
      Variables: p.Username
        ? [
            { Name: 'i', Value: '17' },
            { Name: 'batch', Value: '"nightly"' },
          ]
        : [],
    });
  }),

  route('post', '/v2/process/suspend', OPERATE, ({ request }) => {
    const p = findProcess(request);
    if (!p) return notFound('Process');
    if (!p.CanBeSuspended) return fail(409, 'This process cannot be suspended');
    if (p.State === 'SUSP') return fail(409, 'Process is already suspended');
    p.State = 'SUSP';
    return ok({}, { summary: `Process ${p.Pid} suspended` });
  }),

  route('post', '/v2/process/resume', OPERATE, ({ request }) => {
    const p = findProcess(request);
    if (!p) return notFound('Process');
    if (p.State !== 'SUSP') return fail(409, 'Process is not suspended');
    // Real IRIS reports a resumed process as HANG (waiting) until it runs again.
    p.State = 'HANG';
    return ok({}, { summary: `Process ${p.Pid} resumed` });
  }),

  route('post', '/v2/process/terminate', OPERATE, ({ request }) => {
    const p = findProcess(request);
    if (!p) return notFound('Process');
    if (!p.CanBeTerminated) return fail(409, 'System processes cannot be terminated');
    mockDb.processes = mockDb.processes.filter((x) => x.Pid !== p.Pid);
    mockDb.locks = mockDb.locks.filter((l) => l.Pid !== String(p.Pid));
    return ok({}, { summary: `Process ${p.Pid} terminated` });
  }),

  route('post', '/v2/process/broadcast', OPERATE, async ({ request }) => {
    const body = await jsonBody<{ Message?: string; message?: string; PidList?: number[] }>(request);
    const msg = body.Message ?? body.message;
    if (!msg) return badRequest('Message is required');
    mockDb.broadcasts.push(msg);
    const targets = body.PidList?.length
      ? mockDb.processes.filter((p) => body.PidList!.includes(p.Pid))
      : mockDb.processes;
    const n = targets.filter((p) => p.CanReceiveBroadcast).length;
    return ok({ Sent: n }, { summary: `Message broadcast to ${n} processes` });
  }),

  // ---- locks --------------------------------------------------------------
  route('get', '/v2/locks', OPERATE, ({ request }) =>
    ok(filterRows(mockDb.locks as unknown as Record<string, unknown>[], request)),
  ),

  route('delete', '/v2/lock', OPERATE, ({ request }) => {
    const id = requireParam(request, 'id');
    const i = mockDb.locks.findIndex((l) => l.DeleteID === id);
    if (i < 0) return notFound('Lock');
    if (!mockDb.locks[i].Removable) return fail(409, 'This lock cannot be removed');
    const checkTxn = requireParam(request, 'checkTxn') !== 'false';
    const owner = mockDb.processes.find((p) => String(p.Pid) === mockDb.locks[i].Pid);
    if (checkTxn && owner?.InTransaction) {
      return fail(
        409,
        `Process ${owner.Pid} is in a transaction. Remove the lock with checkTxn=false to override.`,
      );
    }
    mockDb.locks.splice(i, 1);
    return ok({}, { summary: 'Lock removed' });
  }),

  // ---- web sessions --------------------------------------------------------
  route('get', '/v2/web-sessions', OPERATE, ({ request }) =>
    ok(filterRows(mockDb.webSessions as unknown as Record<string, unknown>[], request)),
  ),

  route('delete', '/v2/web-session', OPERATE, ({ request }) => {
    const id = requireParam(request, 'id');
    const i = mockDb.webSessions.findIndex((s) => s.ID === id);
    if (i < 0) return notFound('Web session');
    if (!mockDb.webSessions[i].AllowEndSession) return fail(409, 'This session cannot be ended');
    mockDb.webSessions.splice(i, 1);
    return ok({}, { summary: 'Session ended' });
  }),
];
