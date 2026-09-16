import { ok, notFound, requireParam, badRequest } from '../util';
import { route, OPERATE } from '../secure';
import { controlAsyncTask, getAsyncTask, listAsyncTasks } from '../async';

export const asyncHandlers = [
  route('get', '/v2/async-results', OPERATE, ({ account, request }) => {
    const q = new URL(request.url).searchParams;
    let list = listAsyncTasks(account.username);
    const state = q.get('state');
    if (state) list = list.filter((t) => t.State === state);
    return ok(list.map(({ Console: _c, Result: _r, ...rest }) => rest));
  }),
  route('get', '/v2/async-result', OPERATE, ({ account, request }) => {
    const id = requireParam(request, 'id');
    if (!id) return badRequest('Missing id');
    const t = getAsyncTask(id, account.username);
    return t ? ok(t) : notFound(`Async task ${id}`);
  }),
  ...(['cancel', 'pause', 'resume'] as const).map((action) =>
    route('post', `/v2/async-result/${action}`, OPERATE, ({ account, request }) => {
      const id = requireParam(request, 'id');
      if (!id) return badRequest('Missing id');
      const t = controlAsyncTask(id, account.username, action);
      return t ? ok(t, { summary: `Task ${action} requested` }) : notFound(`Async task ${id}`);
    }),
  ),
];
