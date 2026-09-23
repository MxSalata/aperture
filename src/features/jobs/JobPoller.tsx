import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { readAsyncResult } from '@/api/hooks';
import { isTerminal, selectActiveJobs, useJobs } from '@/stores/jobs';
import { notifications } from '@mantine/notifications';
import { isApiError } from '@/lib/errors';

/** Query families that must not be refetched just because a job finished. */
const UNTOUCHED_BY_JOBS = new Set(['async-result', 'session']);

/**
 * Polls `GET /v2/async-result?id=` for every job that is not finished yet.
 * Mounted once in the layout; renders nothing.
 */
export function JobPoller() {
  const active = useJobs(useShallow(selectActiveJobs));
  const update = useJobs((s) => s.update);
  const queryClient = useQueryClient();

  const queries = useQueries({
    queries: active.map((job) => ({
      queryKey: ['async-result', job.id],
      queryFn: () => readAsyncResult(job.id),
      refetchInterval: 1500,
      retry: (count: number, err: unknown) =>
        !(isApiError(err) && (err.isNotFound || err.isForbidden)) && count < 2,
      staleTime: 0,
    })),
  });

  // One primitive that only changes when something observable about a job changed, so the
  // reconciliation below does not re-run (and re-render) on every poll tick.
  const signature = queries
    .map(
      (q, i) =>
        `${active[i]?.id}:${q.data?.State ?? ''}:${q.data?.Console?.length ?? 0}:${q.isError ? 'E' : ''}`,
    )
    .join('|');

  useEffect(() => {
    queries.forEach((q, i) => {
      const job = active[i];
      if (!job) return;
      if (q.data) {
        const task = q.data;
        const state = task.State ?? 'Unknown';
        if (job.state !== state || job.task?.Console?.length !== task.Console?.length) {
          update(job.id, { state, task });
        }
        if (isTerminal(state) && !job.notified) {
          update(job.id, { notified: true });
          notifications.show({
            title: state === 'Finished' ? 'Job finished' : state === 'Failed' ? 'Job failed' : 'Job canceled',
            message: task.FailureReason || job.name,
            color: state === 'Finished' ? 'teal' : state === 'Failed' ? 'red' : 'gray',
          });
          // Data may have changed on the server (compact, truncate, purge…); the session
          // validation and the other job polls are not data and stay untouched.
          void queryClient.invalidateQueries({
            predicate: (query) => !UNTOUCHED_BY_JOBS.has(String(query.queryKey[0])),
          });
        }
      } else if (q.isError) {
        const forbidden = isApiError(q.error) && q.error.isForbidden;
        const gone = isApiError(q.error) && (q.error.isNotFound || forbidden);
        if (gone)
          update(job.id, {
            state: 'Missing',
            notified: true,
            error: forbidden
              ? 'Reading task results (GET /v2/async-result) needs %Admin_Operate, which this account does not hold. The task itself may still run.'
              : 'The server no longer reports this task (it may belong to another user or the instance restarted).',
          });
        else if (job.state === 'Unknown')
          update(job.id, { error: q.error instanceof Error ? q.error.message : 'Polling failed' });
      }
    });
    // `signature` captures every input the body reads from `queries`/`active`; keying on it
    // (rather than the fresh arrays) is what stops the effect from firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, update, queryClient]);

  return null;
}
