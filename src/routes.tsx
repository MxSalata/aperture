import { lazy } from 'react';
import { createBrowserRouter, createHashRouter, Navigate } from 'react-router';
import { AppLayout } from './features/shell/AppLayout';
import { RequireAuth } from './features/shell/RequireAuth';
import { RouteError } from './features/shell/RouteError';
import { LandingRedirect } from './features/shell/LandingRedirect';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const JobsPage = lazy(() => import('./features/jobs/JobsPage'));
const NotFoundPage = lazy(() => import('./features/shell/NotFoundPage'));
const ComingSoon = lazy(() => import('./features/shell/ComingSoon'));

const DatabasesPage = lazy(() => import('./features/databases/DatabasesPage'));
const DatabaseDetailPage = lazy(() => import('./features/databases/DatabaseDetailPage'));
const NamespacesPage = lazy(() => import('./features/namespaces/NamespacesPage'));
const NamespaceDetailPage = lazy(() => import('./features/namespaces/NamespaceDetailPage'));
const ProcessesPage = lazy(() => import('./features/processes/ProcessesPage'));
const ProcessDetailPage = lazy(() => import('./features/processes/ProcessDetailPage'));
const LocksPage = lazy(() => import('./features/locks/LocksPage'));
const JournalPage = lazy(() => import('./features/journal/JournalPage'));
const TasksPage = lazy(() => import('./features/tasks/TasksPage'));
const TaskDetailPage = lazy(() => import('./features/tasks/TaskDetailPage'));
const WebSessionsPage = lazy(() => import('./features/sessions/WebSessionsPage'));
const LicensePage = lazy(() => import('./features/license/LicensePage'));
const UsersPage = lazy(() => import('./features/security/UsersPage'));
const UserDetailPage = lazy(() => import('./features/security/UserDetailPage'));
const RolesPage = lazy(() => import('./features/security/RolesPage'));
const RoleDetailPage = lazy(() => import('./features/security/RoleDetailPage'));
const ResourcesPage = lazy(() => import('./features/security/ResourcesPage'));
const ServicesPage = lazy(() => import('./features/security/ServicesPage'));
const WebAppsPage = lazy(() => import('./features/security/WebAppsPage'));
const WebAppDetailPage = lazy(() => import('./features/security/WebAppDetailPage'));
const AuditPage = lazy(() => import('./features/security/AuditPage'));
const SslPage = lazy(() => import('./features/security/SslPage'));
const SqlPrivilegesPage = lazy(() => import('./features/security/SqlPrivilegesPage'));
const ExplorerPage = lazy(() => import('./features/explorer/ExplorerPage'));
const ConnectionsPage = lazy(() => import('./features/settings/ConnectionsPage'));
const AboutPage = lazy(() => import('./features/shell/AboutPage'));
const ActivityPage = lazy(() => import('./features/activity/ActivityPage'));
const MonitorPage = lazy(() => import('./features/monitor/MonitorPage'));

// Hash routing lets the same bundle run from any path without server-side rewrites
// (GitHub Pages, IRIS serving /aperture/); browser routing is used behind nginx / Vite.
const useHash = import.meta.env.VITE_HASH_ROUTER === '1';
const basename = useHash ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');
const createRouter = useHash ? createHashRouter : createBrowserRouter;

export const router = createRouter(
  [
    { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
    {
      element: <RequireAuth />,
      errorElement: <RouteError />,
      children: [
        {
          element: <AppLayout />,
          children: [
            { index: true, element: <LandingRedirect /> },
            { path: 'jobs', element: <JobsPage /> },
            { path: 'activity', element: <ActivityPage /> },
            { path: 'monitor', element: <MonitorPage /> },
            { path: 'databases', element: <DatabasesPage /> },
            { path: 'databases/detail', element: <DatabaseDetailPage /> },
            { path: 'namespaces', element: <NamespacesPage /> },
            { path: 'namespaces/:name', element: <NamespaceDetailPage /> },
            { path: 'processes', element: <ProcessesPage /> },
            { path: 'processes/:pid', element: <ProcessDetailPage /> },
            { path: 'locks', element: <LocksPage /> },
            { path: 'journal', element: <JournalPage /> },
            { path: 'tasks', element: <TasksPage /> },
            { path: 'tasks/:id', element: <TaskDetailPage /> },
            { path: 'web-sessions', element: <WebSessionsPage /> },
            { path: 'license', element: <LicensePage /> },
            { path: 'security', element: <Navigate to="/security/users" replace /> },
            { path: 'security/users', element: <UsersPage /> },
            { path: 'security/users/:name', element: <UserDetailPage /> },
            { path: 'security/roles', element: <RolesPage /> },
            { path: 'security/roles/:name', element: <RoleDetailPage /> },
            { path: 'security/resources', element: <ResourcesPage /> },
            { path: 'security/services', element: <ServicesPage /> },
            { path: 'security/web-apps', element: <WebAppsPage /> },
            { path: 'security/web-apps/detail', element: <WebAppDetailPage /> },
            { path: 'security/audit', element: <AuditPage /> },
            { path: 'security/ssl', element: <SslPage /> },
            { path: 'security/sql', element: <SqlPrivilegesPage /> },
            { path: 'explorer', element: <ExplorerPage /> },
            { path: 'explorer/:group', element: <ExplorerPage /> },
            { path: 'settings/connections', element: <ConnectionsPage /> },
            { path: 'about', element: <AboutPage /> },
            { path: 'coming-soon', element: <ComingSoon /> },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ],
  { basename: basename || undefined },
);
