import { beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDb } from '@/mocks/db';
import { api, call, resetClients, result } from '@/api/client';
import { useSession } from '@/stores/session';
import { useJobs } from '@/stores/jobs';
import { JobPoller } from '../JobPoller';
import { affectedBy } from '../jobEffects';

describe('what a finished task may have changed', () => {
  it('is nothing for reads, their data for writes, everything for the unknown', () => {
    expect(affectedBy('/v2/database-dir/info')).toEqual([]);
    expect(affectedBy('/v2/security/audit/records')).toEqual([]);
    expect(affectedBy('/v2/database-dir/compact')).toEqual([['databases'], ['dashboard']]);
    expect(affectedBy('/v2/security/audit/record/purge')).toEqual([['security', 'audit'], ['audit']]);
    expect(affectedBy('/v2/ecp/data-server/action')).toBe('all');
    expect(affectedBy(undefined)).toBe('all');
  });

  it('knows the operation of a task followed from the server list by its name', () => {
    useJobs.getState().clearAll();
    useJobs.getState().follow({ id: 'x', name: 'POST /v2/database-dir/compact', state: 'Finished' });
    expect(useJobs.getState().jobs.x.path).toBe('/v2/database-dir/compact');
  });
});

describe('the Job Center when a task ends', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    useJobs.getState().clearAll();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
  });

  it('refetches the databases after a compact, and not the processes', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['databases', 'local'], []);
    qc.setQueryData(['processes'], []);
    render(
      <QueryClientProvider client={qc}>
        <JobPoller />
      </QueryClientProvider>,
    );
    const dir = ((await result(api().GET('/v2/database-dirs'))) as { Directory: string }[])[0].Directory;
    await call(
      api().POST('/v2/database-dir/compact', { params: { query: { dir } }, body: { TargetFreeSpace: 10 } }),
      'POST',
    );
    const [job] = Object.values(useJobs.getState().jobs);
    expect(job.path).toBe('/v2/database-dir/compact');
    await waitFor(() => expect(useJobs.getState().jobs[job.id].state).toBe('Finished'), { timeout: 20_000 });
    await waitFor(() => expect(qc.getQueryState(['databases', 'local'])?.isInvalidated).toBe(true));
    expect(qc.getQueryState(['processes'])?.isInvalidated).toBe(false);
    qc.clear();
  }, 30_000);
});
