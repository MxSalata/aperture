import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/mocks/node';
import { mockDb, resetDb } from '@/mocks/db';
import { resetInstanceState, useSession } from '@/stores/session';
import { useHealth } from '@/stores/health';
import { selectActiveJobs, useJobs } from '@/stores/jobs';
import { api, call, resetClients, result } from '../client';
import { readAsyncResult, SILENT, useAsyncResult } from '../hooks';

const BASE = 'http://iris.test';

beforeEach(() => {
  resetDb();
  resetClients();
  sessionStorage.clear();
  useHealth.getState().reset();
  useJobs.getState().clearAll();
  useSession.setState({ status: 'anonymous', mode: null, accessToken: null, refreshToken: null, info: null });
});

describe('useAsyncResult', () => {
  it('stops polling a task the account may not read (auditor: %Admin_Secure only)', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: 'auditor', password: 'SYS' });
    let polls = 0;
    const count = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.endsWith('/v2/async-result')) polls++;
    };
    server.events.on('request:start', count);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    try {
      const { result: hook } = renderHook(() => useAsyncResult({ queryKey: ['t'] }), { wrapper });
      await act(async () => {
        await hook.current.start(() =>
          call(
            api().POST('/v2/security/audit/records', { params: { query: { maxRows: 5 } }, headers: SILENT }),
            'POST',
          ),
        );
      });
      await waitFor(() => expect(hook.current.error).toBeTruthy());
      expect((hook.current.error as Error).message).toMatch(/%Admin_Operate/);
      const after = polls;
      await new Promise((r) => setTimeout(r, 2500));
      expect(polls).toBe(after);
    } finally {
      server.events.removeListener('request:start', count);
      qc.clear();
    }
  }, 10_000);
});

describe('reachability', () => {
  it('counts a gateway 502 as the instance being unreachable', async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
    server.use(
      http.get(
        `${BASE}/api/admin/v2/databases`,
        () =>
          new HttpResponse('<html><head><title>502 Bad Gateway</title></head></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    await expect(result(api().GET('/v2/databases'))).rejects.toThrow('502 Bad Gateway');
    expect(useHealth.getState().reachable).toBe(false);
    await result(api().GET('/v2/namespaces'));
    expect(useHealth.getState().reachable).toBe(true);
  });
});

describe('following a task from the server list', () => {
  it('polls a task that already ended once, without a completion toast', () => {
    useJobs.getState().follow({ id: 'g1', name: 'Compact', state: 'Finished' });
    useJobs.getState().follow({ id: 'g2', name: 'Check', state: 'Running' });
    const jobs = useJobs.getState().jobs;
    expect(selectActiveJobs(useJobs.getState()).map((j) => j.id)).toEqual(['g2', 'g1']);
    expect(jobs.g1.notified).toBe(true);
    expect(jobs.g2.notified).toBe(false);
  });
});

describe('an ended task is read once', () => {
  // IRIS 2026.2 logs a severity-2 alert for every read of a task after the one that first reported
  // it ended; the mock posts the same alert, so a second read shows up in mockDb.alertsPosted.
  async function startInfoTask(): Promise<string> {
    const dir = ((await result(api().GET('/v2/database-dirs'))) as { Directory: string }[])[0].Directory;
    const { response } = await call(
      api().POST('/v2/database-dir/info', { params: { query: { dir } }, headers: SILENT }),
      'POST',
    );
    return new URL(response.headers.get('Location')!, BASE).searchParams.get('id')!;
  }

  function countReads(id: string) {
    const reads = { n: 0 };
    const count = ({ request }: { request: Request }) => {
      const u = new URL(request.url);
      if (u.pathname.endsWith('/v2/async-result') && u.searchParams.get('id') === id) reads.n++;
    };
    server.events.on('request:start', count);
    return { reads, stop: () => server.events.removeListener('request:start', count) };
  }

  beforeEach(async () => {
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
  });

  it('serves every read after the end from the first final answer', async () => {
    const id = await startInfoTask();
    const { reads, stop } = countReads(id);
    try {
      let task = await readAsyncResult(id);
      while (task.State !== 'Finished') {
        await new Promise((r) => setTimeout(r, 200));
        task = await readAsyncResult(id);
      }
      const untilEnd = reads.n;
      const alerts = mockDb.alertsPosted;
      expect((await readAsyncResult(id)).State).toBe('Finished');
      expect((await readAsyncResult(id)).Result).toEqual(task.Result);
      expect(reads.n).toBe(untilEnd);
      expect(mockDb.alertsPosted).toBe(alerts);
    } finally {
      stop();
    }
  }, 15_000);

  it('does not read again when a finished lookup is refetched or invalidated', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const alerts = mockDb.alertsPosted;
    try {
      const { result: hook, unmount } = renderHook(
        () => useAsyncResult({ queryKey: ['databases', 'metrics'] }),
        {
          wrapper,
        },
      );
      let id = '';
      await act(async () => {
        id = await hook.current.start(async () => {
          const dir = ((await result(api().GET('/v2/database-dirs'))) as { Directory: string }[])[0]
            .Directory;
          return call(
            api().POST('/v2/database-dir/info', { params: { query: { dir } }, headers: SILENT }),
            'POST',
          );
        });
      });
      await waitFor(() => expect(hook.current.finished).toBe(true), { timeout: 10_000 });
      const { reads, stop } = countReads(id);
      try {
        // What JobPoller does when any other job finishes, and what a remount does.
        await act(async () => {
          await qc.invalidateQueries();
        });
        unmount();
        renderHook(() => useAsyncResult({ queryKey: ['databases', 'metrics'] }), { wrapper });
        await new Promise((r) => setTimeout(r, 300));
        expect(reads.n).toBe(0);
        expect(mockDb.alertsPosted).toBe(alerts);
      } finally {
        stop();
      }
    } finally {
      qc.clear();
    }
  }, 15_000);

  it('forgets the answers when the session ends', async () => {
    const id = await startInfoTask();
    let task = await readAsyncResult(id);
    while (task.State !== 'Finished') {
      await new Promise((r) => setTimeout(r, 200));
      task = await readAsyncResult(id);
    }
    resetInstanceState();
    const { reads, stop } = countReads(id);
    try {
      await readAsyncResult(id);
      expect(reads.n).toBe(1);
    } finally {
      stop();
    }
  }, 15_000);
});
