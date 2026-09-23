import type { AsyncTask } from './types';

/**
 * The final answer of every async task this tab has seen end, so that no task is read again after
 * it ended. IRIS 2026.2 logs a severity-2 alert for each read of a task after the one that first
 * reported it ended ("WQM attach passed invalid token", from TryToKillQueue in
 * %Api.Admin.Util.AsyncTask; quirk async-result-reread-alert). A client that re-reads finished
 * tasks (a refetch on remount, an invalidation after another job) turns the instance's system
 * state to Warning and fills /api/monitor/alerts for every monitor watching it.
 *
 * A module of its own, without imports, so the session can forget the answers on sign-out
 * without importing the API client.
 */
const ended = new Map<string, AsyncTask>();
const MAX = 500;

export function endedTask(id: string): AsyncTask | undefined {
  return ended.get(id);
}

export function keepEndedTask(id: string, task: AsyncTask): void {
  ended.delete(id);
  ended.set(id, task);
  if (ended.size > MAX) ended.delete(ended.keys().next().value!);
}

export function forgetEndedTasks(): void {
  ended.clear();
}
