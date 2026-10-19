import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { resetFhirMock } from '@/mocks/handlers/fhir';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import FhirEndpointPage from '../FhirEndpointPage';

// Mantine's Menu takes half a minute to open under jsdom, so its items are rendered as plain buttons.
vi.mock('@mantine/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@mantine/core')>();
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  const Menu = Object.assign(Pass, {
    Target: Pass,
    Dropdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Label: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Item: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
  });
  return { ...core, Menu };
});

const URL = '/csp/healthshare/clinical/fhir/r4';

/** Moves to another server in place, as Back or Forward does, without remounting the page. */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>{`go ${to}`}</button>;
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <QueryClientProvider client={qc}>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={['/health/fhir/CLINICAL/1']}>
            <GoTo to="/health/fhir/CLINICAL/2" />
            <Routes>
              <Route path="/health/fhir" element={<p>All servers</p>} />
              <Route path="/health/fhir/:namespace/:id" element={<FhirEndpointPage />} />
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

const startRemoval = async (label: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `${label}…` }));
  const dialog = await screen.findByRole('dialog', { name: `${label} FHIR server` });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: URL } });
  fireEvent.click(within(dialog).getByRole('button', { name: label }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const removeBusy = () => screen.getByRole('button', { name: 'Remove' }).hasAttribute('data-loading');

describe('a FHIR server job followed after its dialog closes', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    resetFhirMock();
    await useSession.getState().login({
      connectionId: 't',
      baseUrl: 'http://iris.test',
      username: '_SYSTEM',
      password: 'SYS',
      auth: 'jwt',
    });
    // Jobs that never end, and every server id answered as a server of its own at the seeded URL.
    server.use(
      http.get('*/csp/fhir-management/api/jobs/:key', ({ params }) =>
        HttpResponse.json({ job_key: String(params.key), status: 'running', method: 'Reset' }),
      ),
      http.get('*/csp/fhir-management/api/endpoints/:id', ({ params }) =>
        HttpResponse.json({
          endpoint: {
            serviceId: String(params.id),
            name: `Server ${String(params.id)}`,
            url: URL,
            enabled: true,
            decommissioned: false,
          },
        }),
      ),
    );
  });

  it('stays busy when the server is disabled or enabled meanwhile', async () => {
    mount();
    await startRemoval('Reset');
    await waitFor(() => expect(removeBusy()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    const dialog = await screen.findByRole('dialog', { name: 'Disable FHIR server' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disable' })).not.toHaveAttribute('data-loading'),
    );
    expect(removeBusy()).toBe(true);
  });

  it('is no longer followed once the route moves to another server', async () => {
    mount();
    await startRemoval('Delete');
    await waitFor(() => expect(removeBusy()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'go /health/fhir/CLINICAL/2' }));
    expect(await screen.findByRole('heading', { name: 'Server 2' })).toBeInTheDocument();
    await waitFor(() => expect(removeBusy()).toBe(false));
    expect(screen.queryByText('All servers')).toBeNull();
  });
});
