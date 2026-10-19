import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { resetFhirMock } from '@/mocks/handlers/fhir';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import FhirEndpointPage from '../FhirEndpointPage';
import FhirServersPage from '../FhirServersPage';

function mount(path = '/health/fhir/CLINICAL/1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider>
      <QueryClientProvider client={qc}>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/health/fhir" element={<FhirServersPage />} />
              <Route path="/health/fhir/:namespace/:id" element={<FhirEndpointPage />} />
            </Routes>
          </MemoryRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

const setMode = (systemMode: string) =>
  useSession.setState((s) => ({ info: { ...(s.info ?? {}), systemMode } as typeof s.info }));

describe('a FHIR server screen', () => {
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
    setMode('DEVELOPMENT');
  });

  it('does not call a server open whose resources ask for a sign-in', async () => {
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Serves' }));
    expect(await screen.findByText('FHIR 4.0.1, 5 resource types')).toBeInTheDocument();
    expect(screen.queryByText('Open to anyone')).toBeNull();
  });

  it('says a decommissioned server serves nothing instead of loading for ever', async () => {
    server.use(
      http.get('*/csp/fhir-management/api/endpoints/:id', () =>
        HttpResponse.json({
          endpoint: {
            serviceId: '1',
            name: 'Old R4',
            url: '/csp/healthshare/clinical/fhir/r4',
            enabled: false,
            decommissioned: true,
          },
        }),
      ),
    );
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Serves' }));
    expect(await screen.findByText('It is decommissioned: it serves nothing.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('asks for the URL to be typed before disabling on a LIVE instance, not elsewhere', async () => {
    setMode('LIVE');
    const { unmount } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    let dialog = await screen.findByRole('dialog', { name: 'Disable FHIR server' });
    expect(within(dialog).getByRole('button', { name: 'Disable' })).toBeDisabled();
    unmount();
    setMode('DEVELOPMENT');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    dialog = await screen.findByRole('dialog', { name: 'Disable FHIR server' });
    expect(within(dialog).getByRole('button', { name: 'Disable' })).toBeEnabled();
  });

  it('lists the packages of another FHIR-enabled namespace when it is picked', async () => {
    mount('/health/fhir');
    fireEvent.click(await screen.findByRole('tab', { name: 'Packages' }));
    expect(await screen.findByText('The packages loaded in CLINICAL.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'FHIRSTAGE' } });
    expect(await screen.findByText('The packages loaded in FHIRSTAGE.')).toBeInTheDocument();
  });

  it('explains a missing management API, whatever page the 404 carries', async () => {
    server.use(
      http.get(
        '*/csp/fhir-management/api/info',
        () =>
          new HttpResponse('<HTML><HEAD><TITLE>Not Found</TITLE></HEAD></HTML>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    mount('/health/fhir');
    expect(await screen.findByText('No FHIR server management here')).toBeInTheDocument();
    expect(screen.getByText(/it is not IRIS for Health or Health Connect/)).toBeInTheDocument();
  });
});
