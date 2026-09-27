import type { AsyncTask, AsyncTaskState } from '@/api/types';
import { now } from './util';

/**
 * Simulated async task engine. Real IRIS queues long operations (compact,
 * integrity check, audit queries…) and exposes them under /v2/async-result.
 */
export interface MockAsyncTask extends AsyncTask {
  GUID: string;
  State: AsyncTaskState;
  owner: string;
  /** Console lines still to be emitted, one per tick. */
  pending: string[];
  finalResult: unknown;
  tickMs: number;
  timer?: ReturnType<typeof setTimeout>;
  progressUnits?: string;
  progressTotal?: number;
  totalSteps: number;
}

const tasks = new Map<string, MockAsyncTask>();
let counter = 84959504737;

export function resetAsyncTasks() {
  for (const t of tasks.values()) if (t.timer) clearTimeout(t.timer);
  tasks.clear();
}

export function listAsyncTasks(owner: string): AsyncTask[] {
  return [...tasks.values()].filter((t) => t.owner === owner).map(publicView);
}

export function getAsyncTask(id: string, owner: string): AsyncTask | null {
  const t = tasks.get(id);
  if (!t || t.owner !== owner) return null;
  return publicView(t);
}

function publicView(t: MockAsyncTask): AsyncTask {
  const { GUID, TaskName, State, FailureReason, TimeQueued, TimeStarted, TimeFinished, Console, Result } = t;
  return { GUID, TaskName, State, FailureReason, TimeQueued, TimeStarted, TimeFinished, Console, Result };
}

export interface StartOptions {
  name: string;
  owner: string;
  console: string[];
  result?: unknown;
  tickMs?: number;
  failWith?: string;
  progressUnits?: string;
  progressTotal?: number;
}

/** A task that ended before the demo was opened, so the Job Center has a history to follow. */
export function seedEndedTask(opts: {
  name: string;
  owner: string;
  console: string[];
  queued: string;
  started: string;
  finished: string;
  result?: unknown;
}): string {
  const id = String(++counter);
  tasks.set(id, {
    GUID: id,
    TaskName: opts.name,
    State: 'Finished',
    FailureReason: '',
    TimeQueued: opts.queued,
    TimeStarted: opts.started,
    TimeFinished: opts.finished,
    Console: [...opts.console],
    Result: (opts.result ?? {}) as MockAsyncTask['Result'],
    owner: opts.owner,
    pending: [],
    finalResult: opts.result ?? {},
    tickMs: 0,
    totalSteps: opts.console.length,
  });
  return id;
}

export function startAsyncTask(opts: StartOptions): string {
  const id = String(++counter);
  const task: MockAsyncTask = {
    GUID: id,
    TaskName: opts.name,
    State: 'Queued',
    FailureReason: '',
    TimeQueued: now(),
    TimeStarted: '',
    TimeFinished: '',
    Console: [],
    Result: {},
    owner: opts.owner,
    pending: [...opts.console],
    finalResult: opts.result ?? {},
    tickMs: opts.tickMs ?? 900,
    progressUnits: opts.progressUnits,
    progressTotal: opts.progressTotal,
    totalSteps: opts.console.length,
  };
  tasks.set(id, task);
  task.timer = setTimeout(
    () => {
      task.State = 'Running';
      task.TimeStarted = now();
      schedule(task, opts.failWith);
    },
    Math.min(600, task.tickMs),
  );
  return id;
}

function schedule(task: MockAsyncTask, failWith?: string) {
  task.timer = setTimeout(() => {
    if (task.State !== 'Running') return;
    const line = task.pending.shift();
    if (line !== undefined) {
      task.Console = [...(task.Console ?? []), line];
      if (task.progressTotal) {
        const done = task.totalSteps - task.pending.length;
        task.Result = {
          ProgressCurrent: Math.round((task.progressTotal * done) / task.totalSteps),
          ProgressTotal: task.progressTotal,
          ProgressUnits: task.progressUnits ?? '',
        } as AsyncTask['Result'];
      }
      schedule(task, failWith);
      return;
    }
    task.TimeFinished = now();
    if (failWith) {
      task.State = 'Failed';
      task.FailureReason = failWith;
    } else {
      task.State = 'Finished';
      task.Result = task.finalResult as AsyncTask['Result'];
    }
  }, task.tickMs);
}

export function controlAsyncTask(
  id: string,
  owner: string,
  action: 'pause' | 'resume' | 'cancel',
): AsyncTask | null {
  const t = tasks.get(id);
  if (!t || t.owner !== owner) return null;
  if (action === 'pause' && t.State === 'Running') {
    t.State = 'Paused';
    if (t.timer) clearTimeout(t.timer);
  } else if (action === 'resume' && t.State === 'Paused') {
    t.State = 'Running';
    schedule(t);
  } else if (action === 'cancel' && (t.State === 'Running' || t.State === 'Queued' || t.State === 'Paused')) {
    t.State = 'Canceled';
    t.TimeFinished = now();
    if (t.timer) clearTimeout(t.timer);
  }
  return publicView(t);
}
