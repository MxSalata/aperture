import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/stores/session';
import { PageSkeleton } from '@/components/PageSkeleton';

/**
 * Gate for all authenticated routes. On a fresh page load with a persisted
 * session it re-validates the token by calling `GET /info`.
 */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const info = useSession((s) => s.info);
  const connectionId = useSession((s) => s.connectionId);
  const baseUrl = useSession((s) => s.baseUrl);
  const loadInfo = useSession((s) => s.loadInfo);
  const logout = useSession((s) => s.logout);
  const location = useLocation();

  const validation = useQuery({
    queryKey: ['session', 'validate', connectionId, baseUrl],
    enabled: status === 'authenticated',
    queryFn: () => loadInfo(),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    if (validation.isError) {
      void logout({ reason: 'Your session is no longer valid. Please sign in again.', remote: false });
    }
  }, [validation.isError, logout]);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!info && validation.isPending) return <PageSkeleton label="Connecting…" />;
  return <Outlet />;
}
