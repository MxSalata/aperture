import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api, call, envelope, result, jobIdFromResponse } from './client';
import { notifyError, notifySuccess } from '@/lib/notify';
import { isTerminal } from '@/stores/jobs';
import type { AsyncTask } from './types';

interface MutationOptions<TVars, TData> {
  /** Toast shown on success; defaults to the API's `status.summary`. */
  success?: string | ((data: TData, vars: TVars) => string);
  /** Query keys (prefixes) to invalidate after success. */
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
  silent?: boolean;
}

/**
 * `useMutation` with the house conventions: success toast from the envelope's
 * summary, error toast from `ApiError`, and cache invalidation.
 */
export function useApiMutation<TVars, TData extends { summary?: string } = { summary?: string }>(
  fn: (vars: TVars) => Promise<TData>,
  opts: MutationOptions<TVars, TData> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (!opts.silent) {
        const msg =
          typeof opts.success === 'function'
            ? opts.success(data, vars)
            : (opts.success ?? data?.summary ?? 'Done');
        notifySuccess(msg);
      }
      for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
      opts.onSuccess?.(data, vars);
    },
    onError: (e) => notifyError(e),
  });
}

/** Shorthand for mutations that just need the envelope (`{summary, console}`) back. */
export const run = envelope;
export { api, call, result };

/**
 * Start an async operation (any endpoint that answers `202 Accepted`) and follow
 * it to completion. Returns the final `Result` once the task is `Finished`.
 *
 * Set `silent` to keep the job out of the global Job Center (e.g. metric lookups).
 */
export function useAsyncResult<TResult = unknown>(
  opts: { queryKey: QueryKey; silent?: boolean } = { queryKey: ['async-local'] },
) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const poll = useQuery({
    queryKey: [...opts.queryKey, 'async-result', jobId],
    enabled: !!jobId,
    queryFn: () =>
      result(
        api().GET('/v2/async-result', {
          params: { query: { id: jobId! } },
          headers: { 'x-aperture-silent': '1' },
        }),
      ),
    refetchInterval: (q) => (isTerminal(q.state.data?.State) ? false : 1000),
    staleTime: 0,
  });

  const start = useCallback(async (starter: () => Promise<{ data?: unknown; response: Response }>) => {
    setStartError(null);
    setJobId(null);
    try {
      const { data, response } = await starter();
      const id = await jobIdFromResponse(response, data);
      if (!id)
        throw new Error(
          'The server accepted the request but returned neither a Location header nor a task GUID.',
        );
      setJobId(id);
      return id;
    } catch (e) {
      setStartError(e);
      throw e;
    }
  }, []);

  const task: AsyncTask | undefined = poll.data;
  const state = task?.State;
  return {
    start,
    reset: () => {
      setJobId(null);
      setStartError(null);
    },
    jobId,
    task,
    state,
    running: !!jobId && !isTerminal(state),
    finished: state === 'Finished',
    failed: state === 'Failed' || state === 'Canceled',
    result: (state === 'Finished' ? (task?.Result as TResult) : undefined) as TResult | undefined,
    error:
      startError ??
      poll.error ??
      (state === 'Failed' ? new Error(task?.FailureReason || 'Task failed') : null),
  };
}

/**
 * Wait for a `202` job outside React state: for lookups started from an event handler that
 * want the result as a value (the Activity screen's audit evidence). Polls quietly, so the
 * job stays out of the Job Center.
 */
export async function awaitAsyncResult<T>(
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const task = await result(
      api().GET('/v2/async-result', { params: { query: { id: jobId } }, headers: SILENT }),
    );
    if (task.State === 'Finished') return task.Result as T;
    if (task.State === 'Failed' || task.State === 'Canceled')
      throw new Error(task.FailureReason || `Task ${task.State}`);
    if (Date.now() - started > (opts.timeoutMs ?? 60_000))
      throw new Error(`Task ${jobId} did not finish within ${(opts.timeoutMs ?? 60_000) / 1000} s`);
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1000));
  }
}

/** Headers that make a 202 job show up in the Job Center with a readable name. */
export function jobHeaders(name: string, subject?: string): Record<string, string> {
  const h: Record<string, string> = { 'x-aperture-job': name };
  if (subject) h['x-aperture-subject'] = subject;
  return h;
}

export const SILENT = { 'x-aperture-silent': '1' } as const;
