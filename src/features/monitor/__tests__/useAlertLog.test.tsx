import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/mocks/node';
import { resetDb } from '@/mocks/db';
import { fetchAlerts } from '@/api/monitor';
import { useSession } from '@/stores/session';
import { useAlertLog } from '../useAlertLog';

beforeEach(() => {
  resetDb();
  useSession.setState({ baseUrl: 'http://iris.test', mode: null, basicCredentials: null });
});

describe('alerts.log', () => {
  it('is a cursor in the mock, as on IRIS: a second read returns nothing', async () => {
    expect(await fetchAlerts()).toHaveLength(2);
    expect(await fetchAlerts()).toHaveLength(0);
  });

  it('is never read by mounting or invalidating, and keeps what it read', async () => {
    let reads = 0;
    const count = ({ request }: { request: Request }) => {
      if (request.url.endsWith('/api/monitor/alerts')) reads++;
    };
    server.events.on('request:start', count);
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    try {
      const { result } = renderHook(() => useAlertLog(), { wrapper });
      await act(() => qc.invalidateQueries());
      expect(reads).toBe(0);
      expect(result.current.data).toBeUndefined();

      await act(async () => void (await result.current.refetch()));
      // Newest first. TanStack notifies observers on a timer, hence waitFor.
      await waitFor(() => expect(result.current.data?.map((a) => a.severity)).toEqual(['2', '1']));

      await act(async () => void (await result.current.refetch()));
      expect(reads).toBe(2);
      // The second read returned nothing new; what the first one read is kept.
      await waitFor(() => expect(result.current.isFetching).toBe(false));
      expect(result.current.data).toHaveLength(2);
    } finally {
      server.events.removeListener('request:start', count);
      qc.clear();
    }
  });
});
