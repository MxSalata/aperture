import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import ProductionPage from '../ProductionPage';
import { resetClients } from '@/api/client';
import { resetDb } from '@/mocks/db';
import { resetInteropMock, setInteropPrivileges, troubleInteropMock } from '@/mocks/handlers/interop';
import { server } from '@/mocks/node';
import { useSession } from '@/stores/session';

/** The production screen of the demo instance, signed in as `username`. */
async function open(username: string, production = 'HL7.Production') {
  await useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth: 'jwt' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <ModalsProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/interop/productions/INTEROP/${production}`]}>
            <Routes>
              <Route path="/interop/productions/:namespace/:production" element={<ProductionPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
  await screen.findByRole('heading', { name: production });
}

const failingRow = () => screen.findByRole('button', { name: 'Open HL7.Out.Results.TCP' });

describe('the production screen', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetInteropMock();
  });

  it("counts a busy host's errors as a lower bound, since IRIS returns its newest 50 log entries", async () => {
    await open('_SYSTEM');
    const row = await failingRow();
    await waitFor(() => expect(within(row).getByText(/^\d+\+$/)).toBeInTheDocument());
    expect(screen.getByText(/newest 50 event log entries/)).toBeInTheDocument();
    // HL7.Production shares its namespace with HL7.TestProduction, whose host names IRIS would mix in.
    expect(await screen.findByText(/a host of the same name in another production/)).toBeInTheDocument();
  });

  it('shows a plain 0+ for a busy host whose newest entries hold no error', async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`;
    const entry = (i: number) => ({
      Id: i + 1,
      Seq: i + 1,
      TimeLogged: now,
      TraceCat: '',
      Type: 'Info',
      Job: '1400',
      Session: '',
      Source: 'HL7.Router.ADT',
      Method: '',
      Stack: '',
      MessageId: 1,
      Text: 'Routed',
    });
    server.use(
      http.get('*/api/interop-editors/v7/:ns/productions/:production/HL7.Router.ADT/log', () =>
        HttpResponse.json({
          children: [...Array.from({ length: 50 }, (_, i) => entry(i)), { Id: 'more...' }],
        }),
      ),
    );
    await open('_SYSTEM');
    const row = await screen.findByRole('button', { name: 'Open HL7.Router.ADT' });
    const cell = await within(row).findByText('0+');
    expect(cell.closest('.mantine-Badge-root')).toBeNull();
    expect(
      within(await failingRow())
        .getByText(/^\d+\+$/)
        .closest('.mantine-Badge-root'),
    ).not.toBeNull();
  });

  it('reads the event logs again on a refresh once they are 30 s old', async () => {
    await open('_SYSTEM');
    await waitFor(async () => expect(within(await failingRow()).getByText(/^\d+\+$/)).toBeInTheDocument());
    const logReads: string[] = [];
    const count = ({ request }: { request: Request }) => {
      if (request.url.endsWith('/log')) logReads.push(request.url);
    };
    server.events.on('request:start', count);
    try {
      const refresh = screen.getByRole('button', { name: 'Refresh' });
      fireEvent.click(refresh);
      await waitFor(() => expect(refresh).not.toHaveAttribute('data-loading'));
      expect(logReads).toEqual([]);
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
      fireEvent.click(refresh);
      await waitFor(() => expect(logReads.length).toBe(15));
    } finally {
      vi.restoreAllMocks();
      server.events.removeListener('request:start', count);
    }
  });

  it("offers only Recover for a troubled production, and scans its hosts' event logs", async () => {
    troubleInteropMock('INTEROP', 'HL7.Production');
    await open('_SYSTEM');
    expect(await screen.findByText(/did not shut down cleanly/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recover production' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Start production|Stop production/ })).toBeNull();
    const row = await failingRow();
    await waitFor(() => expect(within(row).getByText(/^\d+\+$/)).toBeInTheDocument());
  });

  it('says when a troubled production of the namespace keeps this one from starting', async () => {
    troubleInteropMock('INTEROP', 'HL7.Production');
    await open('_SYSTEM', 'HL7.TestProduction');
    expect(
      await screen.findByText(
        /^HL7\.Production is troubled in INTEROP, and IRIS starts no other production until it is recovered\./,
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start production' })).toBeDisabled());
  });

  it('disables Stop for an account with run but not runItem, and says why', async () => {
    setInteropPrivileges('operator', {
      production: { read: true, write: false, run: true, runItem: false },
      readEventLog: true,
      readMessages: true,
      readQueue: true,
    });
    await open('operator');
    const stop = await screen.findByRole('button', { name: 'Stop production' });
    await waitFor(() => expect(stop).toBeDisabled());
    // Without the write privilege IRIS reads the production as read-only: the row says so.
    expect(screen.getByText('Yes (this account may not edit productions)')).toBeInTheDocument();
  });

  it('does not read the event logs of an account IRIS does not let read them', async () => {
    setInteropPrivileges('operator', {
      production: { read: true },
      readEventLog: false,
      readMessages: true,
      readQueue: true,
    });
    await open('operator');
    expect(await screen.findByText(/may not read event logs, so no errors are counted/)).toBeInTheDocument();
    fireEvent.click(await failingRow());
    expect(
      await screen.findByText('IRIS reports that this account may not read the event log.'),
    ).toBeInTheDocument();
  });

  it("labels the Messages tab's ids as body ids", async () => {
    await open('_SYSTEM');
    fireEvent.click(await screen.findByRole('button', { name: 'Open HL7.Router.ADT' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Messages' }));
    expect(await screen.findByRole('columnheader', { name: /Body id/ })).toBeInTheDocument();
  });
});
