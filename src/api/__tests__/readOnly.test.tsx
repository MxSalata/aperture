import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { api, call, result, resetClients } from '../client';
import { allowedWhenReadOnly, isReadOperation } from '../readOnly';
import { mockDb, resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { useJobs } from '@/stores/jobs';
import { useActivity } from '@/stores/activity';
import { useHealth } from '@/stores/health';
import { useReadOnly } from '@/stores/readOnly';
import { ApiError } from '@/lib/errors';
import { confirmDanger } from '@/components/ConfirmDanger';

describe('what a read-only tab may send', () => {
  const tasks: Record<string, string> = {
    check: '/v2/database-dir/integrity-check',
    compact: '/v2/database-dir/compact',
  };
  const taskPath = (id: string) => tasks[id];
  const allowed = (method: string, path: string, query = '') =>
    allowedWhenReadOnly(method, path, new URLSearchParams(query), taskPath);

  it('sends reads, including the reads the API takes as POST', () => {
    expect(allowed('GET', '/v2/security/users')).toBe(true);
    expect(allowed('POST', '/v2/security/audit/records')).toBe(true);
    expect(isReadOperation('POST', '/v2/database-dir/info')).toBe(true);
  });

  it('refuses every change', () => {
    expect(allowed('PUT', '/v2/security/user')).toBe(false);
    expect(allowed('DELETE', '/v2/lock')).toBe(false);
    expect(allowed('POST', '/v2/database-dir/compact')).toBe(false);
    expect(allowed('POST', '/v2/security/user/password')).toBe(false);
  });

  it('stops a task only when the task is itself a read this tab knows', () => {
    expect(allowed('POST', '/v2/async-result/cancel', 'id=check')).toBe(true);
    expect(allowed('POST', '/v2/async-result/pause', 'id=compact')).toBe(false);
    expect(allowed('POST', '/v2/async-result/cancel', 'id=someone-elses')).toBe(false);
  });
});

describe('a read-only tab', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    sessionStorage.clear();
    useJobs.setState({ jobs: {}, order: [] });
    useActivity.getState().clear();
    useReadOnly.getState().setReadOnly(false);
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
    useReadOnly.getState().setReadOnly(true);
    return () => useReadOnly.getState().setReadOnly(false);
  });

  it('does not send a change, and says why', async () => {
    const before = mockDb.users.find((u) => u.Name === '_SYSTEM')!.Comment;
    const write = call(
      api().PUT('/v2/security/user', {
        params: { query: { name: '_SYSTEM' } },
        body: { Comment: 'changed' } as never,
      }),
      'PUT',
    );
    await expect(write).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 0 && /read-only/.test(e.summary),
    );
    expect(mockDb.users.find((u) => u.Name === '_SYSTEM')!.Comment).toBe(before);
    // Never reached the network: no activity record, and the instance still counts as reachable.
    expect(useActivity.getState().entries).toHaveLength(0);
    expect(useHealth.getState().reachable).toBe(true);
  });

  it('still reads, including a read sent as POST', async () => {
    expect((await result(api().GET('/v2/security/users'))).length).toBeGreaterThan(0);
    await expect(
      call(api().POST('/v2/security/audit/records', { body: {} as never }), 'POST'),
    ).resolves.toBeDefined();
  });

  it('keeps the confirm button of a change disabled, but not of a local action', async () => {
    render(
      <MantineProvider>
        <ModalsProvider>
          <div />
        </ModalsProvider>
      </MantineProvider>,
    );
    act(() =>
      confirmDanger({
        title: 'Remove lock',
        message: 'Remove?',
        confirmLabel: 'Remove',
        onConfirm: () => {},
      }),
    );
    expect(await screen.findByText('This tab is read-only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    act(() =>
      confirmDanger({
        title: 'Delete connection',
        message: 'Forget it?',
        confirmLabel: 'Forget',
        changesInstance: false,
        onConfirm: () => {},
      }),
    );
    expect(await screen.findByRole('button', { name: 'Forget' })).toBeEnabled();
  });
});
