import { Container } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/stores/session';
import { PageSkeleton } from '@/components/PageSkeleton';
import { ErrorAlert } from '@/components/ErrorAlert';
import { isApiError } from '@/lib/errors';

/** Only the server saying no ends a restored session; a network or gateway failure does not. */
function rejectsSession(error: unknown): boolean {
  return isApiError(error) && (error.isUnauthorized || error.isForbidden);
}

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
    if (validation.isError && rejectsSession(validation.error)) {
      void logout({ reason: 'Your session is no longer valid. Please sign in again.', remote: false });
    }
  }, [validation.isError, validation.error, logout]);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!info && validation.isPending) return <PageSkeleton label="Connecting…" />;
  // The instance is unreachable and nothing was restored to show: say so and keep the session.
  if (!info && validation.isError && !rejectsSession(validation.error))
    return (
      <Container size="sm" py={80}>
        <ErrorAlert
          title="Cannot reach the instance"
          error={validation.error}
          onRetry={() => void validation.refetch()}
        />
      </Container>
    );
  return <Outlet />;
}
