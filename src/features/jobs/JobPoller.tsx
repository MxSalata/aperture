import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api, result } from '@/api/client';
import { isTerminal, selectActiveJobs, useJobs } from '@/stores/jobs';
import { notifications } from '@mantine/notifications';
import { queryClient } from '@/query';
import { isApiError } from '@/lib/errors';

/**
 * Polls `GET /v2/async-result?id=` for every job that is not finished yet.
 * Mounted once in the layout; renders nothing.
 */
export function JobPoller() {
  const active = useJobs(useShallow(selectActiveJobs));
  const update = useJobs((s) => s.update);

  const queries = useQueries({
    queries: active.map((job) => ({
      queryKey: ['async-result', job.id],
      queryFn: () => result(api().GET('/v2/async-result', { params: { query: { id: job.id } } })),
      refetchInterval: 1500,
      retry: (count: number, err: unknown) => !(isApiError(err) && (err.status === 404 || err.status === 403)) && count < 2,
      staleTime: 0,
    })),
  });

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
          // Data may have changed on the server (compact, truncate, purge…).
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'async-result' });
        }
      } else if (q.isError) {
        const gone = isApiError(q.error) && (q.error.status === 404 || q.error.status === 403);
        if (gone) update(job.id, { state: 'Missing', notified: true, error: 'The server no longer reports this task (it may belong to another user or the instance restarted).' });
        else if (job.state === 'Unknown') update(job.id, { error: q.error instanceof Error ? q.error.message : 'Polling failed' });
      }
    });
  }, [queries, active, update]);

  return null;
}
