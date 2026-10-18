import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import SqlPage from '../SqlPage';
import { basicCredentials } from '@/api/base';
import { resetClients } from '@/api/client';
import { resetDb } from '@/mocks/db';
import { resetSql } from '@/mocks/sql';
import { useAtelierAuth } from '@/stores/atelierAuth';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useReadOnly } from '@/stores/readOnly';
import { useSession } from '@/stores/session';

const signIn = (username: string, auth: 'jwt' | 'basic') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth });

function open(path = '/sql') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <ModalsProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <SqlPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe('the SQL screen', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetSql();
    useMgmntAuth.getState().clear();
    useAtelierAuth.getState().clear();
    useReadOnly.getState().setReadOnly(false);
    window.sessionStorage.clear();
  });

  it('asks a JWT session for another password once Atelier refused it, and leaves the shared one', async () => {
    await signIn('operator', 'jwt');
    const shared = basicCredentials('operator', 'SYS');
    useMgmntAuth.getState().set(shared);
    open();
    expect(await screen.findByText(/a wrong password, or the account lacks %Development:USE/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open the SQL explorer' })).toBeInTheDocument();
    expect(useMgmntAuth.getState().basic).toBe(shared);
  });
});
