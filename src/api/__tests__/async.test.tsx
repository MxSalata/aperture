import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { useHealth } from '@/stores/health';
import { selectActiveJobs, useJobs } from '@/stores/jobs';
import { api, call, resetClients, result } from '../client';
import { SILENT, useAsyncResult } from '../hooks';

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
