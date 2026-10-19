import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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
import { useSqlHistory } from '@/stores/sqlHistory';
import { server } from '@/mocks/node';

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
    useSqlHistory.getState().clear();
    // Floating UI asks every popover's ancestors whether they match `:modal` or `:popover-open`, and
    // jsdom's selector engine answers those through itself until the stack overflows: minutes a page.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':modal' || selector === ':popover-open' ? false : matches.call(this, selector);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks a JWT session for another password once Atelier refused it, and leaves the shared one', async () => {
    await signIn('operator', 'jwt');
    const shared = basicCredentials('operator', 'SYS');
    useMgmntAuth.getState().set(shared);
    open();
    expect(await screen.findByText(/a wrong password, or the account lacks %Development:USE/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open the SQL explorer' })).toBeInTheDocument();
    expect(useMgmntAuth.getState().basic).toBe(shared);
  });

  it("shows the result set a CALL returns, as IRIS's catalogue procedures do", async () => {
    await signIn('_SYSTEM', 'basic');
    // The demo's SQL has no procedures: the answer IRIS gave for this CALL (two of its rows).
    server.use(
      http.post('*/api/atelier/:version/:ns/action/query', () =>
        HttpResponse.json({
          status: { errors: [], summary: '' },
          console: [],
          result: [
            {
              columns: [
                { name: 'RELATION_NAME', type: 'VARCHAR(50)' },
                { name: 'TYPE', type: 'VARCHAR(50)' },
              ],
              content: [
                ['Ens.AlarmRequest', 'TABLE'],
                ['Ens.AlarmResponse', 'TABLE'],
              ],
            },
          ],
        }),
      ),
    );
    open();
    const statement = await screen.findByRole('textbox', { name: 'Statement' }, { timeout: 10_000 });
    fireEvent.change(statement, { target: { value: 'CALL %Library.SQLCatalog_SQLTables()' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run CALL' }));
    const dialog = await screen.findByRole('dialog', { name: 'Run a statement that changes data' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run CALL' }));
    expect(await screen.findByText('Ens.AlarmResponse', {}, { timeout: 10_000 })).toBeVisible();
    expect(screen.getByText(/CALL done: 2 rows in/)).toBeVisible();
  }, 30_000);
});
