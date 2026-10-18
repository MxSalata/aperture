import { Alert, Anchor, Badge, Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  countByStatus,
  fetchInteropInfo,
  fetchProduction,
  fetchProductions,
  fetchProductionStatus,
  INTEROP_API_VERSION,
  interopKeys,
  productionState,
  type ProductionItem,
} from '@/api/interop';
import { ApiError } from '@/lib/errors';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { StatusBadge, statusColor } from '@/components/StatusBadge';

interface Row {
  namespace: string;
  production: string;
  state: string;
  /** The hosts, for a production that is running (a stopped one reports every host stopped). */
  items?: ProductionItem[];
}

const productionPath = (ns: string, production: string) =>
  `/interop/productions/${encodeURIComponent(ns)}/${encodeURIComponent(production)}`;

/** Host counts as badges, trouble first. */
export function HostCounts({ items }: { items: ProductionItem[] | undefined }) {
  if (!items)
    return (
      <Text size="xs" c="dimmed">
        -
      </Text>
    );
  return (
    <Group gap={4} wrap="wrap">
      {countByStatus(items).map(({ status, count }) => (
        <Badge
          key={status}
          size="sm"
          variant="light"
          color={statusColor(status)}
          style={{ textTransform: 'none' }}
        >
          {`${count} ${status}`}
        </Badge>
      ))}
    </Group>
  );
}

export default function ProductionsPage() {
  const info = useQuery({ queryKey: interopKeys.info, queryFn: fetchInteropInfo, staleTime: 60_000 });
  const namespaces = info.data?.namespaces.map((n) => n.name) ?? [];
  const lists = useQueries({
    queries: namespaces.map((ns) => ({
      queryKey: interopKeys.productions(ns),
      queryFn: () => fetchProductions(ns),
    })),
  });
  const statuses = useQueries({
    queries: namespaces.map((ns) => ({
      queryKey: interopKeys.status(ns),
      queryFn: () => fetchProductionStatus(ns),
    })),
  });
  const running = namespaces
    .map((ns, i) => ({ ns, name: statuses[i]?.data?.ProdRunning }))
    .filter((r): r is { ns: string; name: string } => !!r.name);
  const definitions = useQueries({
    queries: running.map((r) => ({
      queryKey: interopKeys.production(r.ns, r.name),
      queryFn: () => fetchProduction(r.ns, r.name),
    })),
  });

  const rows: Row[] = namespaces.flatMap((ns, i) =>
    (lists[i]?.data ?? []).map((production) => {
      const status = statuses[i]?.data;
      const d = running.findIndex((r) => r.ns === ns && r.name === production);
      return {
        namespace: ns,
        production,
        state: productionState(status, production),
        items: d >= 0 ? definitions[d]?.data?.Items : undefined,
      };
    }),
  );
  const failed = [...lists, ...statuses, ...definitions].find((q) => q.error)?.error;
  const loading = info.isPending || lists.some((q) => q.isPending) || statuses.some((q) => q.isPending);
  const refetch = () => {
    void info.refetch();
    for (const q of [...lists, ...statuses, ...definitions]) void q.refetch();
  };

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: 'namespace',
      header: 'Namespace',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
    {
      accessorKey: 'production',
      header: 'Production',
      cell: ({ row }) => (
        <Anchor
          component={Link}
          to={productionPath(row.original.namespace, row.original.production)}
          className="mono"
          onClick={stop}
        >
          {row.original.production}
        </Anchor>
      ),
    },
    { accessorKey: 'state', header: 'State', cell: (c) => <StatusBadge status={String(c.getValue())} /> },
    {
      id: 'hosts',
      header: 'Hosts',
      enableSorting: false,
      cell: ({ row }) => <HostCounts items={row.original.items} />,
    },
  ];

  const missing = info.error instanceof ApiError && info.error.status === 404;
  const older = info.data && info.data.apiVersion < INTEROP_API_VERSION;
  const noAccess = info.data && !info.data.privileges.production?.read;

  return (
    <>
      <PageHeader
        title="Productions"
        description="Interoperability productions in every namespace this account may use, with their state and their hosts by status. Read through /api/interop-editors, the API IRIS's own Interoperability UI uses, with this session's own sign-in."
        actions={<RefreshControl screen="productions" onRefresh={refetch} loading={info.isFetching} />}
      />
      {missing ? (
        <Alert color="gray" icon={<IconInfoCircle size={16} />} title="No interoperability API here">
          This instance does not serve /api/interop-editors, which ships with IRIS 2023.1 and later. The
          dashboard still charts message throughput and queues from /api/monitor.
        </Alert>
      ) : info.error ? (
        <ErrorAlert error={info.error} onRetry={() => info.refetch()} />
      ) : null}
      {older ? (
        <Alert color="yellow" icon={<IconInfoCircle size={16} />} mb="sm">
          IRIS reports version {info.data!.apiVersion} of its interoperability API; Aperture reads version{' '}
          {INTEROP_API_VERSION} (IRIS 2026.2). Some figures may be missing.
        </Alert>
      ) : null}
      {noAccess ? (
        <Alert color="gray" icon={<IconInfoCircle size={16} />} mb="sm">
          IRIS reports that {info.data!.username} may not read productions in any namespace.
        </Alert>
      ) : null}
      {!missing && !info.error ? (
        <DataTable
          stateKey="productions"
          exportName="productions"
          data={info.data ? rows : undefined}
          columns={columns}
          loading={loading}
          error={failed}
          getRowId={(r) => `${r.namespace}/${r.production}`}
          initialSorting={[{ id: 'namespace', desc: false }]}
          toolbar={
            info.data ? (
              <Group gap="xs">
                <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
                  {`${namespaces.length} namespaces with interoperability`}
                </Badge>
                <Text size="xs" c="dimmed">
                  {`${running.length} running`}
                </Text>
              </Group>
            ) : undefined
          }
          emptyMessage="No production in the namespaces this account may use."
        />
      ) : null}
    </>
  );
}
