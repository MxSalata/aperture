import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '@/api/monitor';

/** OpenMetrics samples from the native /api/monitor service; shared by the Dashboard and the Host monitor screen. */
export function useHostMetrics(intervalMs = 10_000) {
  return useQuery({
    queryKey: ['monitor', 'metrics'],
    queryFn: fetchMetrics,
    refetchInterval: intervalMs,
    retry: false,
    staleTime: 5_000,
  });
}
