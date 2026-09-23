import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';
import type { AsyncTask, AsyncTaskState } from '@/api/types';

/**
 * Job Center state.
 *
 * Any API call that returns `202 Accepted` is registered here by the fetch
 * middleware (see `api/client.ts`). The `JobPoller` component then polls
 * `GET /v2/async-result?id=` until the task reaches a terminal state.
 */
export interface Job {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: AsyncTaskState | 'Unknown' | 'Missing';
  task?: AsyncTask;
  error?: string;
  /** Completion toast already shown. */
  notified?: boolean;
  /** Free-form context, e.g. the database directory the job targets. */
  subject?: string;
  /** The operation that queued it (`/v2/database-dir/compact`): decides what to refetch when it ends. */
  path?: string;
}

export const TERMINAL_STATES: ReadonlySet<string> = new Set(['Finished', 'Failed', 'Canceled', 'Missing']);

export function isTerminal(state: string | undefined): boolean {
  return !!state && TERMINAL_STATES.has(state);
}

interface JobsState {
  jobs: Record<string, Job>;
  order: string[];
  drawerOpen: boolean;
  track(job: Pick<Job, 'id' | 'name'> & Partial<Job>): void;
  /**
   * Follow a task picked from the server's list. It is polled once even when it already
   * ended, so its console and result arrive; a task that ended before it was followed
   * raises no completion toast.
   */
  follow(task: { id: string; name: string; state?: string }): void;
  update(id: string, patch: Partial<Job>): void;
  remove(id: string): void;
  clearFinished(): void;
  clearAll(): void;
  setDrawerOpen(open: boolean): void;
}

export const useJobs = create<JobsState>()(
  persist(
    (set) => ({
      jobs: {},
      order: [],
      drawerOpen: false,
      track: (job) =>
        set((s) => {
          if (s.jobs[job.id]) return s;
          const now = Date.now();
          return {
            jobs: {
              ...s.jobs,
              [job.id]: { state: 'Unknown', createdAt: now, updatedAt: now, ...job } as Job,
            },
            order: [job.id, ...s.order],
          };
        }),
      follow: ({ id, name, state }) =>
        set((s) => {
          if (s.jobs[id]) return s;
          const now = Date.now();
          const job: Job = {
            id,
            name,
            // The server names a task after its operation ("POST /v2/database-dir/compact").
            path: /^[A-Z]+ (\/\S+)/.exec(name)?.[1],
            state: 'Unknown',
            createdAt: now,
            updatedAt: now,
            notified: isTerminal(state),
          };
          return { jobs: { ...s.jobs, [id]: job }, order: [id, ...s.order] };
        }),
      update: (id, patch) =>
        set((s) => {
          const existing = s.jobs[id];
          if (!existing) return s;
          return { jobs: { ...s.jobs, [id]: { ...existing, ...patch, updatedAt: Date.now() } } };
        }),
      remove: (id) =>
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[id];
          return { jobs, order: s.order.filter((j) => j !== id) };
        }),
      clearFinished: () =>
        set((s) => {
          const jobs: Record<string, Job> = {};
          for (const [id, j] of Object.entries(s.jobs)) if (!isTerminal(j.state)) jobs[id] = j;
          return { jobs, order: s.order.filter((id) => jobs[id]) };
        }),
      clearAll: () => set({ jobs: {}, order: [] }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      name: 'aperture.jobs',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ jobs: s.jobs, order: s.order }) as JobsState,
    },
  ),
);

/** Extract the task GUID from a `Location` header such as `/iris/api/admin/v2/async-result?id=123`. */
export function jobIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, 'http://placeholder.local');
    return url.searchParams.get('id');
  } catch {
    const m = location.match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

export function selectActiveJobs(s: JobsState): Job[] {
  return s.order.map((id) => s.jobs[id]).filter((j) => j && !isTerminal(j.state));
}

export function selectAllJobs(s: JobsState): Job[] {
  return s.order.map((id) => s.jobs[id]).filter(Boolean);
}
