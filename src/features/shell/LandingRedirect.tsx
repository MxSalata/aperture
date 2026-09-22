import { lazy } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/stores/session';
import { canUse } from '@/api/privileges';
import { ALL_NAV_ITEMS } from './nav';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));

/**
 * Index route. The Dashboard needs `%Admin_Operate`; an account without it (an auditor
 * holding `%Admin_Secure` only) is sent to the first screen it can actually use instead
 * of landing on a page whose every panel answers 403.
 */
export function LandingRedirect() {
  const info = useSession((s) => s.info);
  const location = useLocation();
  const dashboard = ALL_NAV_ITEMS.find((n) => n.to === '/');
  if (!dashboard || canUse(info, dashboard.privileges)) return <DashboardPage />;
  const usable = ALL_NAV_ITEMS.filter((n) => n.to !== '/' && canUse(info, n.privileges));
  // Prefer a screen the account is specifically entitled to over the always-available ones.
  const target = usable.find((n) => n.privileges.length > 0) ?? usable[0];
  // Keyed on the location so a bounce back to '/' always issues a fresh redirect, even when
  // React kept this instance mounted across an interrupted transition.
  return <Navigate key={location.key} to={target?.to ?? '/activity'} replace />;
}
