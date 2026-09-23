import { mockDb, type TaskRec } from '../db';
import {
  ok,
  created,
  notFound,
  badRequest,
  requireParam,
  jsonBody,
  filterRows,
  fail,
  now,
  inMinutes,
} from '../util';
import { route, OPERATE, OPERATE_OR_TASK, TASK } from '../secure';

function findTask(request: Request) {
  const id = Number(requireParam(request, 'id'));
  return mockDb.tasks.find((t) => t.Id === id);
}

const listShape = (t: TaskRec) => ({
  Name: t.Name,
  Type: t.Type,
  Namespace: t.Namespace,
  Description: t.Description,
  Id: t.Id,
  Suspended: t.Suspended,
  LastFinished: t.LastFinished,
  NextScheduled: t.NextScheduled,
});

/** GET /v2/task as IRIS 2026.2 answers it: Expires* are strings, TimePeriodEvery an integer. */
const detailShape = (t: TaskRec) => {
  const {
    Id: _i,
    Type: _t,
    Status: _s,
    Error: _e,
    LastFinished: _l,
    NextScheduled: _n,
    Namespace,
    Suspended: _u,
    ...rest
  } = t;
  return {
    ...rest,
    NameSpace: Namespace,
    TimePeriodEvery: Number(t.TimePeriodEvery) || 1,
    ExpiresDays: String(t.ExpiresDays),
    IsBatch: false,
    EmailOnCompletion: [],
    EmailOnError: t.Id === 12 ? ['ops@example.org'] : [],
    EmailOnExpiration: [],
    EmailOutput: false,
    OpenOutputFile: false,
    OutputFileIsBinary: false,
    SuspendTerminated: false,
    MirrorStatus: 'Any',
    TimePeriodDay: '',
    DailyFrequencyTime: '',
    DailyIncrement: '',
    RunAfterGUID: '',
    ExpiresHours: '0',
    ExpiresMinutes: '0',
  };
};

export const taskHandlers = [
  route('get', '/v2/tasks', OPERATE_OR_TASK, ({ request }) =>
    ok(filterRows(mockDb.tasks.map(listShape) as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/task', OPERATE_OR_TASK, ({ request }) => {
    const t = findTask(request);
    return t ? ok(detailShape(t)) : notFound('Task');
  }),

  route('get', '/v2/task/info', OPERATE, ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    return ok({
      LastSchedule: t.NextScheduled,
      LastStarted: t.LastFinished,
      LastFinished: t.LastFinished,
      Status: t.Status,
      Error: t.Error,
      Type: t.Type,
      NextScheduled: t.NextScheduled,
      Suspended: t.Suspended,
    });
  }),

  route('post', '/v2/task', OPERATE_OR_TASK, async ({ request }) => {
    const body = await jsonBody<Record<string, unknown>>(request);
    if (!body.Name || !body.TaskClass) return badRequest('Name and TaskClass are required');
    const id = Math.max(...mockDb.tasks.map((t) => t.Id)) + 1;
    mockDb.tasks.push({
      Id: id,
      Name: String(body.Name),
      Type: 'User',
      Namespace: String(body.NameSpace ?? body.Namespace ?? 'USER'),
      Description: String(body.Description ?? ''),
      Suspended: false,
      LastFinished: '',
      NextScheduled: inMinutes(60),
      TaskClass: String(body.TaskClass),
      RunAsUser: String(body.RunAsUser ?? '_SYSTEM'),
      Priority: String(body.Priority ?? 'Normal'),
      TimePeriod: String(body.TimePeriod ?? 'Daily'),
      TimePeriodEvery: String(body.TimePeriodEvery ?? '1'),
      DailyFrequency: String(body.DailyFrequency ?? 'Once'),
      DailyStartTime: String(body.DailyStartTime ?? '00:00:00'),
      DailyEndTime: String(body.DailyEndTime ?? ''),
      StartDate: String(body.StartDate ?? now().slice(0, 10)),
      EndDate: String(body.EndDate ?? ''),
      Expires: !!body.Expires,
      ExpiresDays: Number(body.ExpiresDays ?? 0),
      SuspendOnError: !!body.SuspendOnError,
      RescheduleOnStart: !!body.RescheduleOnStart,
      OutputDirectory: String(body.OutputDirectory ?? ''),
      OutputFilename: String(body.OutputFilename ?? ''),
      Settings: (body.Settings as Record<string, unknown>) ?? {},
      Status: '',
      Error: '',
    });
    return created({ Id: id }, [`Task ${body.Name} created with id ${id}`]);
  }),

  route('put', '/v2/task', OPERATE_OR_TASK, async ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    const body = await jsonBody<Record<string, unknown>>(request);
    const { Id: _i, Type: _t, ...rest } = body;
    Object.assign(t, rest);
    if (body.NameSpace) t.Namespace = String(body.NameSpace);
    return ok({}, { summary: `Task ${t.Name} updated` });
  }),

  route('delete', '/v2/task', OPERATE_OR_TASK, ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    if (t.Type === 'System') return fail(400, 'System tasks cannot be deleted');
    mockDb.tasks = mockDb.tasks.filter((x) => x.Id !== t.Id);
    return ok({}, { summary: `Task ${t.Name} deleted` });
  }),

  route('post', '/v2/task/run', TASK, async ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    const body = await jsonBody<{ RunNow?: boolean; Datetime?: string }>(request);
    if (body.RunNow) {
      t.LastFinished = now();
      t.Status = 'Success';
      t.Error = '';
      mockDb.taskHistory.unshift({
        LastStart: now(),
        Completed: now(),
        Name: t.Name,
        Status: 'Success',
        Result: '',
        TaskId: t.Id,
        Namespace: t.Namespace,
        Routine: t.TaskClass,
        Pid: '7001',
        ErrDate: '',
        ErrNumber: 0,
        Username: t.RunAsUser,
        LogDatetime: now(),
      });
      return ok({}, { summary: `Task ${t.Name} queued to run now` });
    }
    if (!body.Datetime) return badRequest('Datetime is required unless RunNow is true');
    t.NextScheduled = body.Datetime;
    return ok({}, { summary: `Task ${t.Name} scheduled for ${body.Datetime}` });
  }),

  route('post', '/v2/task/suspend', TASK, ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    t.Suspended = true;
    t.Status = 'Suspended';
    return ok({}, { summary: `Task ${t.Name} suspended` });
  }),

  route('post', '/v2/task/resume', TASK, ({ request }) => {
    const t = findTask(request);
    if (!t) return notFound('Task');
    t.Suspended = false;
    t.Status = 'Success';
    return ok({}, { summary: `Task ${t.Name} resumed` });
  }),

  route('get', '/v2/task/history', OPERATE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const taskId = q.get('taskId');
    let rows = mockDb.taskHistory;
    if (taskId) rows = rows.filter((r) => String(r.TaskId) === taskId);
    return ok(filterRows(rows, request));
  }),

  // IRIS 2026.2 answers at most 100 runs unless maxRows asks for more (the spec says 1000).
  route('get', '/v2/task/upcoming', OPERATE, ({ request }) =>
    ok(
      mockDb.tasks
        .filter((t) => t.NextScheduled)
        .map((t) => ({
          Id: t.Id,
          Name: t.Name,
          Namespace: t.Namespace,
          Datetime: t.NextScheduled,
          Suspended: t.Suspended,
        }))
        .slice(0, Number(new URL(request.url).searchParams.get('maxRows') ?? 100) || 100),
    ),
  ),

  route('get', '/v2/task/manager', OPERATE_OR_TASK, () => ok({ Status: mockDb.taskManager })),
  route('post', '/v2/task/manager/suspend', OPERATE_OR_TASK, () => {
    mockDb.taskManager = 'Suspended';
    return ok({}, { summary: 'Task manager suspended' });
  }),
  route('post', '/v2/task/manager/resume', OPERATE_OR_TASK, () => {
    mockDb.taskManager = 'Running';
    return ok({}, { summary: 'Task manager resumed' });
  }),
  route('post', '/v2/task/manager/run', OPERATE_OR_TASK, () => {
    mockDb.taskManager = 'Running';
    return ok({}, { summary: 'Task manager started' });
  }),
];
