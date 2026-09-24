import { useState } from 'react';
import { Anchor, Badge, Button, Drawer, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PasswordGate } from '@/components/PasswordGate';
import {
  fetchRestApps,
  fetchRoutes,
  fetchSpecClasses,
  mgmntCredentials,
  type RestApp,
  type Route,
  type SpecClass,
} from '@/api/mgmnt';
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

const routeColumns: ColumnDef<Route, unknown>[] = [
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
  { accessorKey: 'summary', header: 'Summary' },
];

function RoutesDrawer({ app, onClose }: { app: Described | null; onClose: () => void }) {
  const routes = useQuery({
    queryKey: ['mgmnt', 'routes', app?.swaggerSpec],
    queryFn: () => fetchRoutes(app!.swaggerSpec),
    enabled: !!app,
    retry: false,
    staleTime: 10 * 60_000,
  });
  return (
    <Drawer
      opened={!!app}
      onClose={onClose}
      position="right"
      size="xl"
      title={<b className="mono">{app?.title}</b>}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {routes.data
            ? `${routes.data.routes.length} routes${routes.data.title ? ` · ${routes.data.title}` : ''}, as /api/mgmnt describes them from the dispatch class.`
            : 'Reading the OpenAPI 2.0 description…'}
        </Text>
        <DataTable
          data={routes.data?.routes}
          columns={routeColumns}
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
        description="The REST applications of this instance and the routes each one serves, from /api/mgmnt (outside the SysAdmin API)."
        actions={
          ready ? (
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                void apps.refetch();
                void classes.refetch();
              }}
            >
              Refresh
            </Button>
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
