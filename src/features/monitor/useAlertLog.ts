import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAlerts, type AlertRow } from '@/api/monitor';

const ALERTS_KEY = ['monitor', 'alerts'] as const;

function newestFirst(rows: AlertRow[]): AlertRow[] {
  return [...rows].sort((a, b) => b.time.localeCompare(a.time));
}

/**
 * alerts.log through `/api/monitor/alerts`. That endpoint is a cursor shared by every client
 * of the instance: each call returns only the alerts posted since the previous call, by
 * anyone ("Monitoring InterSystems IRIS via REST"). A read therefore hides those alerts
 * from a Prometheus or SAM scraper polling the same instance, and a second read returns
 * nothing. So this query never runs by itself (`enabled: false`: no mount, poll or
 * invalidation fetches it), `refetch()` reads on request, and every batch is kept for
 * the session. Whether reading is worthwhile comes from `iris_system_alerts_new` in /metrics.
 */
export function useAlertLog() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: async () =>
      newestFirst([...(await fetchAlerts()), ...(queryClient.getQueryData<AlertRow[]>(ALERTS_KEY) ?? [])]),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
