import { mockDb } from '../db';
import { ok, notFound, requireParam, badRequest } from '../util';
import { postAlert } from './monitor';
import { route, OPERATE, type SecuredResolver } from '../secure';
import { controlAsyncTask, getAsyncTask, listAsyncTasks } from '../async';

const readTask: SecuredResolver = ({ account, request }) => {
  const id = requireParam(request, 'id');
  if (!id) return badRequest('Missing id');
  const t = getAsyncTask(id, account.username);
  if (!t) return notFound(`Async task ${id}`);
  // IRIS 2026.2: every read of a task after the one that first reported it ended logs a
  // severity-2 alert (TryToKillQueue on a queue that is already gone). The answer is unchanged.
  if (['Finished', 'Failed', 'Canceled'].includes(t.State ?? '')) {
    if (mockDb.endedTasksRead.has(id))
      postAlert(
        '2',
        `ISCLOG: WorkMgr Detach Returning error ns=%SYS rtn=%SYS.WorkQueueMgr /* ERROR #7846: WQM attach passed invalid token. */ (task ${id} read again after it ended)`,
      );
    else mockDb.endedTasksRead.add(id);
  }
  return ok(t);
};

export const asyncHandlers = [
  route('get', '/v2/async-results', OPERATE, ({ account, request }) => {
    const q = new URL(request.url).searchParams;
    let list = listAsyncTasks(account.username);
    const state = q.get('state');
    if (state) list = list.filter((t) => t.State === state);
    return ok(list.map(({ Console: _c, Result: _r, ...rest }) => rest));
  }),
  route('get', '/v2/async-result', OPERATE, readTask),
  // The Location header of a 202 names the v1 path; IRIS answers both.
  route('get', '/v1/async-result', OPERATE, readTask),
  ...(['cancel', 'pause', 'resume'] as const).map((action) =>
    route('post', `/v2/async-result/${action}`, OPERATE, ({ account, request }) => {
      const id = requireParam(request, 'id');
      if (!id) return badRequest('Missing id');
      const t = controlAsyncTask(id, account.username, action);
      return t ? ok(t, { summary: `Task ${action} requested` }) : notFound(`Async task ${id}`);
    }),
  ),
];
