import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { CopyButton } from '@/components/CopyButton';
import { useQuery } from '@tanstack/react-query';
import { IconCheck, IconChevronDown, IconCopy, IconDownload } from '@tabler/icons-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PasswordGate } from '@/components/PasswordGate';
import {
  fetchRestApps,
  fetchRoutes,
  fetchSpecClasses,
  mgmntCredentials,
  routeRequests,
  type RestApp,
  type Route,
  type SpecClass,
} from '@/api/mgmnt';
import {
  absoluteBaseUrl,
  curlCommand,
  fileStem,
  httpFile,
  postmanCollection,
  type ExportTarget,
} from '@/lib/requestExport';
import { downloadText } from '@/lib/download';
import { notifySuccess } from '@/lib/notify';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';

const webAppUrl = (name: string) => `/security/web-apps/detail?name=${encodeURIComponent(name)}`;

const METHOD_COLOR: Record<string, string> = {
  GET: 'blue',
  POST: 'teal',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'grape',
};

/** A described application, whichever list it came from. */
interface Described {
  title: string;
  swaggerSpec: string;
}

/** `{ns} ?filter* + body`: what a route takes, at a glance. */
function paramsSummary(r: Route): string {
  const parts = r.params.map((p) =>
    p.in === 'path'
      ? `{${p.name}}`
      : p.in === 'query'
        ? `?${p.name}${p.required ? '*' : ''}`
        : `${p.in}:${p.name}`,
  );
  if (r.body !== undefined) parts.push(parts.length ? '+ body' : 'body');
  return parts.join(' ');
}

function CopyCurl({ command, label }: { command: string; label: string }) {
  return (
    <CopyButton value={command}>
      {({ copied, failed, copy }) => (
        <Tooltip label={copied ? 'Copied to clipboard' : failed ? 'Copying failed' : 'Copy as curl'}>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label} onClick={copy}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function RoutesDrawer({ app, onClose }: { app: Described | null; onClose: () => void }) {
  const baseUrl = useSession((s) => s.baseUrl);
  const username = useSession((s) => s.username);
  const routes = useQuery({
    queryKey: ['mgmnt', 'routes', app?.swaggerSpec],
    queryFn: () => fetchRoutes(app!.swaggerSpec),
    enabled: !!app,
    retry: false,
    staleTime: 10 * 60_000,
  });
  const target = useMemo<ExportTarget>(
    () => ({
      baseUrl: absoluteBaseUrl(baseUrl),
      username: username ?? '_SYSTEM',
      name: app?.title ?? '',
      description: routes.data?.title
        ? `${routes.data.title}: the routes of ${app?.title}, as /api/mgmnt describes them.`
        : `The routes of ${app?.title}, as /api/mgmnt describes them.`,
      source: `${app?.swaggerSpec ?? '/api/mgmnt'} on ${absoluteBaseUrl(baseUrl)}`,
    }),
    [app, baseUrl, username, routes.data?.title],
  );
  const columns = useMemo<ColumnDef<Route, unknown>[]>(
    () => [
      {
        accessorKey: 'method',
        header: 'Method',
        cell: (c) => (
          <Badge size="xs" variant="light" color={METHOD_COLOR[String(c.getValue())] ?? 'gray'}>
            {String(c.getValue())}
          </Badge>
        ),
      },
      {
        accessorKey: 'path',
        header: 'Path',
        // A path wrapped at its hyphens reads as two paths.
        cell: (c) => (
          <span className="mono" style={{ whiteSpace: 'nowrap' }}>
            {String(c.getValue())}
          </span>
        ),
      },
      {
        id: 'takes',
        header: 'Takes',
        accessorFn: (r) => paramsSummary(r),
        cell: (c) => (
          <Text size="xs" c="dimmed" className="mono" style={{ whiteSpace: 'nowrap' }}>
            {String(c.getValue())}
          </Text>
        ),
      },
      { accessorKey: 'summary', header: 'Summary' },
      {
        id: 'curl',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const [request] = routeRequests({
            title: '',
            basePath: routes.data?.basePath ?? '',
            routes: [row.original],
          });
          return (
            <CopyCurl
              command={curlCommand(target, request)}
              label={`Copy ${row.original.method} ${row.original.path} as curl`}
            />
          );
        },
      },
    ],
    [routes.data?.basePath, target],
  );
  const save = (kind: 'postman' | 'http') => {
    if (!routes.data || !app) return;
    const requests = routeRequests(routes.data);
    const stem = fileStem(app.title);
    if (kind === 'postman') {
      const name = `${stem}.postman_collection.json`;
      downloadText(name, JSON.stringify(postmanCollection(target, requests), null, 2), 'application/json');
      notifySuccess(`${requests.length} requests in ${name}; import it into Postman.`, 'Collection saved');
    } else {
      const name = `${stem}.http`;
      downloadText(name, httpFile(target, requests));
      notifySuccess(
        `${requests.length} requests in ${name}; open it in VS Code or a JetBrains IDE.`,
        'File saved',
      );
    }
  };
  return (
    <Drawer
      opened={!!app}
      onClose={onClose}
      position="right"
      size="xl"
      title={<b className="mono">{app?.title}</b>}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {routes.data
              ? `${routes.data.routes.length} routes${routes.data.title ? ` · ${routes.data.title}` : ''}, as /api/mgmnt describes them from the dispatch class. Export writes every route as a ready request; the password stays in the browser.`
              : 'Reading the OpenAPI 2.0 description…'}
          </Text>
          <Menu shadow="md" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                rightSection={<IconChevronDown size={14} />}
                disabled={!routes.data}
              >
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Requests generated from the description</Menu.Label>
              <Menu.Item onClick={() => save('postman')}>Postman collection (.json)</Menu.Item>
              <Menu.Item onClick={() => save('http')}>HTTP file for VS Code and JetBrains (.http)</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <DataTable
          data={routes.data?.routes}
          columns={columns}
          loading={routes.isLoading}
          error={routes.error}
          searchable
          searchPlaceholder="Filter routes…"
          getRowId={(r) => `${r.method} ${r.path}`}
          emptyMessage="This application describes no routes."
          exportName="rest-routes"
          dense
        />
      </Stack>
    </Drawer>
  );
}

export default function RestServicesPage() {
  // Re-render when the password is given or forgotten.
  useMgmntAuth((s) => s.basic);
  const mode = useSession((s) => s.mode);
  const ready = !!mgmntCredentials();
  const [open, setOpen] = useState<Described | null>(null);

  const apps = useQuery({
    queryKey: ['mgmnt', 'apps'],
    queryFn: fetchRestApps,
    enabled: ready,
    // Never retry: a refused password counts toward the account's invalid-login limit.
    retry: false,
  });
  const classes = useQuery({
    queryKey: ['mgmnt', 'classes'],
    queryFn: fetchSpecClasses,
    enabled: ready && apps.isSuccess,
    retry: false,
  });

  const specFirst = new Set((classes.data ?? []).map((c) => c.dispatchClass.toLowerCase()));
  const notDeployed = (classes.data ?? []).filter((c) => !c.webApplications);

  const appColumns: ColumnDef<RestApp, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Web application',
      cell: ({ row }) => (
        <Group gap={6} wrap="nowrap">
          <b className="mono">{row.original.name}</b>
          {specFirst.has(row.original.dispatchClass.toLowerCase()) ? (
            <Badge size="xs" variant="light" color="cyan">
              spec-first
            </Badge>
          ) : null}
        </Group>
      ),
    },
    { accessorKey: 'namespace', header: 'Namespace' },
    {
      accessorKey: 'dispatchClass',
      header: 'Dispatch class',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      cell: (c) => <BoolBadge value={c.getValue() as boolean} yes="Enabled" no="Disabled" />,
    },
    {
      id: 'config',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Anchor
          component={Link}
          to={webAppUrl(row.original.name)}
          size="xs"
          onClick={(e) => e.stopPropagation()}
        >
          Settings
        </Anchor>
      ),
    },
  ];

  const classColumns: ColumnDef<SpecClass, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Application',
      cell: (c) => <b className="mono">{String(c.getValue())}</b>,
    },
    { accessorKey: 'namespace', header: 'Namespace' },
    {
      accessorKey: 'dispatchClass',
      header: 'Dispatch class',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
  ];

  const refused = apps.error && !ready;
  return (
    <>
      <PageHeader
        title="REST services"
        description="The REST applications of this instance and the routes each one serves, from /api/mgmnt (outside the SysAdmin API). Each application's routes export as a Postman collection or a .http file, and any route copies as curl."
        actions={
          ready ? (
            <RefreshControl
              screen="rest-services"
              onRefresh={() => {
                void apps.refetch();
                void classes.refetch();
              }}
            />
          ) : null
        }
      />
      <Stack gap="lg">
        {refused ? <ErrorAlert error={apps.error} /> : null}
        {!ready && mode === 'jwt' ? (
          <PasswordGate application="/api/mgmnt" action="Read REST services" resetKeys={[['mgmnt']]} />
        ) : null}
        {ready ? (
          <>
            <DataTable
              data={apps.data}
              columns={appColumns}
              loading={apps.isLoading}
              error={apps.error}
              searchable
              searchPlaceholder="Filter applications…"
              getRowId={(r) => r.name}
              getRowLabel={(r) => `Routes of ${r.name}`}
              onRowClick={(r) => setOpen({ title: r.name, swaggerSpec: r.swaggerSpec })}
              emptyMessage="No REST web applications on this instance."
              exportName="rest-services"
              stateKey="rest-services"
            />
            {notDeployed.length ? (
              <Stack gap="xs">
                <Title order={4}>Spec-first classes without a web application</Title>
                <Text size="sm" c="dimmed">
                  Their description exists, but no web application dispatches to them, so nothing serves these
                  routes.
                </Text>
                <DataTable
                  data={notDeployed}
                  columns={classColumns}
                  getRowId={(r) => `${r.namespace}/${r.name}`}
                  getRowLabel={(r) => `Routes of ${r.name}`}
                  onRowClick={(r) => setOpen({ title: r.name, swaggerSpec: r.swaggerSpec })}
                  dense
                />
              </Stack>
            ) : null}
          </>
        ) : null}
      </Stack>
      <RoutesDrawer app={open} onClose={() => setOpen(null)} />
    </>
  );
}
