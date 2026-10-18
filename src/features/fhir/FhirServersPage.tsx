import { Alert, Anchor, Badge, Tabs, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  fetchFhirInfo,
  fetchFhirNamespaces,
  fetchPackages,
  fhirKeys,
  strategyName,
  type FhirEndpoint,
  type FhirPackage,
} from '@/api/fhir';
import { ApiError } from '@/lib/errors';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { StatusBadge } from '@/components/StatusBadge';

interface Row {
  namespace: string;
  endpoint: FhirEndpoint;
  resources?: number;
}

/** What an endpoint's state reads as. */
export const endpointState = (e: FhirEndpoint) =>
  e.decommissioned ? 'Decommissioned' : e.reindexing ? 'Reindexing' : e.enabled ? 'Enabled' : 'Disabled';

export const endpointPath = (ns: string, id: number | string) =>
  `/health/fhir/${encodeURIComponent(ns)}/${encodeURIComponent(String(id))}`;

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'namespace',
    header: 'Namespace',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  {
    id: 'name',
    accessorFn: (r) => r.endpoint.name,
    header: 'Server',
    cell: ({ row }) => (
      <Anchor
        component={Link}
        to={endpointPath(row.original.namespace, row.original.endpoint.serviceId)}
        onClick={stop}
      >
        {row.original.endpoint.name || row.original.endpoint.url}
      </Anchor>
    ),
  },
  {
    id: 'url',
    accessorFn: (r) => r.endpoint.url,
    header: 'URL',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  { id: 'version', accessorFn: (r) => r.endpoint.service_config_data?.fhir_version ?? '', header: 'FHIR' },
  {
    id: 'strategy',
    accessorFn: (r) => strategyName(r.endpoint.service_config_data?.interactions_strategy_class),
    header: 'Storage',
  },
  {
    id: 'state',
    accessorFn: (r) => endpointState(r.endpoint),
    header: 'State',
    cell: (c) => <StatusBadge status={String(c.getValue())} />,
  },
  { accessorKey: 'resources', header: 'Resources' },
];

const packageColumns: ColumnDef<FhirPackage, unknown>[] = [
  { accessorKey: 'id', header: 'Package', cell: (c) => <span className="mono">{String(c.getValue())}</span> },
  { accessorKey: 'type', header: 'Kind' },
  { accessorKey: 'core_version', header: 'FHIR' },
  {
    accessorKey: 'inUse',
    header: 'In use',
    cell: (c) =>
      c.getValue() ? (
        <Badge size="sm" variant="light">
          in use
        </Badge>
      ) : (
        <Text size="sm" c="dimmed">
          no
        </Text>
      ),
  },
  { id: 'deps', accessorFn: (p) => (p.dependencies ?? []).join(', '), header: 'Depends on' },
];

export default function FhirServersPage() {
  const [tab, setTab] = useState<string | null>('servers');
  const info = useQuery({ queryKey: fhirKeys.info, queryFn: fetchFhirInfo, retry: false });
  const list = useQuery({
    queryKey: fhirKeys.namespaces,
    queryFn: fetchFhirNamespaces,
    enabled: !!info.data,
  });
  const firstNs = list.data?.[0]?.name ?? '';
  const packages = useQuery({
    queryKey: fhirKeys.packages(firstNs),
    queryFn: () => fetchPackages(firstNs),
    enabled: !!firstNs && tab === 'packages',
  });
  const rows: Row[] = (list.data ?? []).flatMap((ns) =>
    (ns.endpoints ?? []).map((e) => ({
      namespace: ns.name,
      endpoint: e.endpoint,
      resources: e.metrics?.rsrc_count,
    })),
  );
  const missing = info.error instanceof ApiError && info.error.status === 404;
  const mode = info.data?.instance_info?.system_mode;
  return (
    <>
      <PageHeader
        title="FHIR servers"
        description="The FHIR servers of this IRIS for Health instance, namespace by namespace, with what they store; the FHIR packages they are built from. Through InterSystems' FHIR Server Management API, with this session's own sign-in."
        actions={
          <RefreshControl
            screen="fhir"
            onRefresh={() => {
              void info.refetch();
              void list.refetch();
            }}
            loading={list.isFetching}
          />
        }
      />
      {missing ? (
        <Alert color="gray" icon={<IconInfoCircle size={16} />} title="No FHIR server management here">
          {info.error instanceof ApiError ? info.error.summary : ''}
        </Alert>
      ) : info.error ? (
        <ErrorAlert error={info.error} onRetry={() => info.refetch()} />
      ) : null}
      {mode ? (
        <Text size="sm" c="dimmed" mb="xs">
          {`IRIS reports this instance's system mode as ${mode}.`}
        </Text>
      ) : null}
      {info.data ? (
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="servers">Servers</Tabs.Tab>
            <Tabs.Tab value="packages">Packages</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="servers">
            <DataTable
              stateKey="fhir-servers"
              exportName="fhir-servers"
              data={list.data ? rows : undefined}
              columns={columns}
              loading={list.isPending}
              error={list.error}
              getRowId={(r) => `${r.namespace}/${r.endpoint.serviceId}`}
              emptyMessage={`No FHIR server in the ${list.data?.length ?? 0} FHIR-enabled namespaces.`}
            />
          </Tabs.Panel>
          <Tabs.Panel value="packages">
            <Text size="sm" c="dimmed" mb="xs">
              {firstNs ? `The packages loaded in ${firstNs}.` : 'No FHIR-enabled namespace.'}
            </Text>
            <DataTable
              data={packages.data}
              columns={packageColumns}
              loading={!!firstNs && packages.isPending}
              error={packages.error}
              getRowId={(p) => p.id}
              exportName="fhir-packages"
              emptyMessage="No package."
            />
          </Tabs.Panel>
        </Tabs>
      ) : null}
    </>
  );
}
