import { Container } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/stores/session';
import { PageSkeleton } from '@/components/PageSkeleton';
import { ErrorAlert } from '@/components/ErrorAlert';
import { isApiError } from '@/lib/errors';
import { claimSession, DUPLICATE_TAB_REASON } from '@/stores/sessionLock';

/** A restored JWT session that another live tab already holds (this tab is a copy of it). */
class CopiedTabError extends Error {}

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
  const mode = useSession((s) => s.mode);
  const info = useSession((s) => s.info);
  const connectionId = useSession((s) => s.connectionId);
  const baseUrl = useSession((s) => s.baseUrl);
  const loadInfo = useSession((s) => s.loadInfo);
  const logout = useSession((s) => s.logout);
  const location = useLocation();

  const validation = useQuery({
    queryKey: ['session', 'validate', connectionId, baseUrl],
    enabled: status === 'authenticated',
    queryFn: async () => {
      const { mode, sessionKey } = useSession.getState();
      if (mode === 'jwt' && sessionKey && (await claimSession(sessionKey)) === 'taken')
        throw new CopiedTabError(DUPLICATE_TAB_REASON);
      return loadInfo();
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    // A copy gives up its tokens here only: a remote logout would end the original tab's session.
    if (validation.error instanceof CopiedTabError)
      void logout({ reason: DUPLICATE_TAB_REASON, remote: false });
    else if (validation.isError && rejectsSession(validation.error)) {
      void logout({ reason: 'Your session is no longer valid. Please sign in again.', remote: false });
    }
  }, [validation.isError, validation.error, logout]);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  // A restored JWT session is not used before this tab's claim on it is settled: a copied tab that
  // refreshed the token its original holds would get both sessions revoked. Basic has no such risk.
  const copied = validation.error instanceof CopiedTabError;
  if (copied || (validation.isPending && (!info || mode === 'jwt')))
    return <PageSkeleton label="Connecting…" />;
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
