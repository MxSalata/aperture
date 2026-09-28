import { useQuery } from '@tanstack/react-query';
import { mgmntCredentials } from '@/api/mgmnt';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';
import { runHealthCheck } from './runner';

export const HEALTH_KEY = ['health', 'run'] as const;

/** The health check of this instance, run with the signed-in account's access and kept for five minutes. */
export function useHealthCheck(enabled = true) {
  const info = useSession((s) => s.info);
  const account = useSession((s) => s.username) ?? '';
  useMgmntAuth((s) => s.basic); // re-run when the log reader's password is given
  const logsReady = !!mgmntCredentials();
  return useQuery({
    queryKey: [...HEALTH_KEY, account, logsReady],
    queryFn: () => runHealthCheck({ info, account, logsReady }),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });
}
