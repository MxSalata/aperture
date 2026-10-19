import { Alert, Badge, Button, Group, Menu, Stack, Tabs, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconLockOpen,
  IconPlayerPlay,
  IconPlayerStop,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  fetchCapability,
  fetchEndpoint,
  fhirKeys,
  JOB_GONE,
  removeEndpoint,
  strategyName,
  updateEndpoint,
  waitForJob,
  type EndpointRemoval,
  type FhirJob,
} from '@/api/fhir';
import { useSession } from '@/stores/session';
import { confirmDanger } from '@/components/ConfirmDanger';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { KeyValueList } from '@/components/KeyValueList';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { RefreshControl } from '@/components/RefreshControl';
import { StatusBadge } from '@/components/StatusBadge';
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notify';
import { endpointState } from './FhirServersPage';

const REMOVALS: Record<EndpointRemoval, { label: string; what: string }> = {
  reset: { label: 'Reset', what: 'deletes every resource it stores and its history; the endpoint stays' },
  decommission: {
    label: 'Decommission',
    what: 'disables it for good and removes its search tables; only the resource and version tables stay',
  },
  delete: { label: 'Delete', what: 'removes the endpoint, its web application and its data' },
};

type Stat = { resourceType: string; count: number; reindex_count?: number };
const statColumns: ColumnDef<Stat, unknown>[] = [
  { accessorKey: 'resourceType', header: 'Resource type' },
  { accessorKey: 'count', header: 'Resources' },
  { accessorKey: 'reindex_count', header: 'Left to re-index' },
];
type Res = { type: string; interactions: string[]; searchParams: number };
const resColumns: ColumnDef<Res, unknown>[] = [
  { accessorKey: 'type', header: 'Resource type' },
  { id: 'interactions', accessorFn: (r) => r.interactions.join(', '), header: 'Interactions' },
  { accessorKey: 'searchParams', header: 'Search parameters' },
];
const jobColumns: ColumnDef<FhirJob, unknown>[] = [
  { accessorKey: 'method', header: 'Job' },
  { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge status={String(c.getValue())} /> },
  { accessorKey: 'start_time', header: 'Started (UTC)' },
  { accessorKey: 'end_time', header: 'Ended (UTC)' },
  { accessorKey: 'error', header: 'Error' },
];

export default function FhirEndpointPage() {
  const { namespace = '', id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);
  // The removal whose job is being followed, kept apart from the toggle so one cannot clear the other.
  const [following, setFollowing] = useState<EndpointRemoval | null>(null);
  const live = useSession((s) => s.info?.systemMode === 'LIVE');
  // Jobs are followed after their dialog closes; leaving the page, or this server for another, stops
  // following them.
  const followCtl = useRef<AbortController | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    followCtl.current = ctl;
    return () => {
      ctl.abort();
      setFollowing(null);
    };
  }, [namespace, id]);
  const q = useQuery({
    queryKey: fhirKeys.endpoint(namespace, id),
    queryFn: () => fetchEndpoint(namespace, id),
  });
  const e = q.data?.endpoint;
  const cap = useQuery({
    queryKey: fhirKeys.capability(e?.url ?? ''),
    queryFn: () => fetchCapability(e!.url),
    enabled: !!e && !e.decommissioned,
  });
  if (q.isPending) return <PageSkeleton />;

  const refresh = () => qc.invalidateQueries({ queryKey: fhirKeys.all });

  const toggle = () => {
    if (!e) return;
    const enable = !e.enabled;
    confirmDanger({
      title: enable ? 'Enable FHIR server' : 'Disable FHIR server',
      message: enable
        ? `Enable ${e.name} (${e.url})? It answers FHIR requests again.`
        : `Disable ${e.name} (${e.url})? Every FHIR request to it is refused (503) until it is enabled again; its data stays.${live ? " This instance is LIVE: type the server's URL to confirm." : ''}`,
      confirmText: !enable && live ? e.url : undefined,
      confirmLabel: enable ? 'Enable' : 'Disable',
      color: enable ? 'teal' : 'red',
      onConfirm: async () => {
        setToggling(true);
        try {
          await updateEndpoint(namespace, id, { enabled: enable });
          // The answer is the endpoint; read it again to be sure of what IRIS now holds.
          const after = await fetchEndpoint(namespace, id);
          if (after.endpoint.enabled !== enable)
            throw new Error(
              `IRIS still reports ${e.name} ${after.endpoint.enabled ? 'enabled' : 'disabled'}.`,
            );
          notifySuccess(
            `${e.name}: IRIS now reports it ${enable ? 'enabled' : 'disabled'}.`,
            enable ? 'Enabled' : 'Disabled',
          );
        } catch (err) {
          notifyError(err, enable ? 'Enable FHIR server' : 'Disable FHIR server');
        } finally {
          setToggling(false);
          void refresh();
        }
      },
    });
  };

  const remove = (action: EndpointRemoval) => {
    if (!e) return;
    confirmDanger({
      title: `${REMOVALS[action].label} FHIR server`,
      message: `${REMOVALS[action].label} ${e.name} (${e.url}) in ${namespace}? This ${REMOVALS[action].what}. It cannot be undone. Type the server's URL to confirm.`,
      confirmText: e.url,
      confirmLabel: REMOVALS[action].label,
      onConfirm: async () => {
        // The dialog waits only for IRIS to accept the job; the job is followed after it closes.
        let job: FhirJob;
        try {
          job = await removeEndpoint(namespace, id, action);
        } catch (err) {
          notifyError(err, `${REMOVALS[action].label} FHIR server`);
          return;
        }
        void follow(action, job.job_key);
      },
    });
  };

  const follow = async (action: EndpointRemoval, key: string) => {
    if (!e) return;
    const label = REMOVALS[action].label;
    const signal = followCtl.current?.signal;
    setFollowing(action);
    try {
      const out = await waitForJob(key, { signal });
      if (out.kind === 'aborted') return;
      if (out.kind === 'gone') notifyInfo(`${e.name}: ${JOB_GONE}`, label);
      else if (out.kind === 'running')
        notifyInfo(
          `${e.name}: the ${label.toLowerCase()} job is still ${out.job.status}; its Jobs tab shows when it ends.`,
          label,
        );
      else if (out.job.status !== 'complete')
        throw new Error(
          `The ${label.toLowerCase()} job ended ${out.job.status}${out.job.error ? `: ${out.job.error}` : ''}.`,
        );
      else {
        notifySuccess(`${e.name}: the ${label.toLowerCase()} job is complete.`, label);
        if (action === 'delete' && !signal?.aborted) navigate('/health/fhir');
      }
    } catch (err) {
      if (!signal?.aborted) notifyError(err, `${label} FHIR server`);
    } finally {
      if (!signal?.aborted) setFollowing(null);
      void refresh();
    }
  };

  const c = e?.service_config_data ?? {};
  const debugOnLive = !!c.debug_mode;
  return (
    <>
      <PageHeader
        title={e?.name || id}
        description={
          <>
            A FHIR server in <Link to="/health/fhir">{namespace}</Link>: what it is built from, what it
            stores, what it serves.
          </>
        }
        actions={
          e ? (
            <>
              {!e.decommissioned ? (
                <Button
                  size="xs"
                  variant="light"
                  color={e.enabled ? 'red' : 'teal'}
                  loading={toggling}
                  leftSection={e.enabled ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                  onClick={toggle}
                >
                  {e.enabled ? 'Disable' : 'Enable'}
                </Button>
              ) : null}
              <Menu withinPortal>
                <Menu.Target>
                  <Button
                    size="xs"
                    variant="default"
                    color="red"
                    rightSection={<IconChevronDown size={14} />}
                    loading={!!following}
                  >
                    Remove
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {(Object.keys(REMOVALS) as EndpointRemoval[])
                    .filter((a) => !(a === 'decommission' && e.decommissioned))
                    .map((a) => (
                      <Menu.Item key={a} color="red" onClick={() => remove(a)}>
                        {`${REMOVALS[a].label}…`}
                      </Menu.Item>
                    ))}
                </Menu.Dropdown>
              </Menu>
              <RefreshControl screen="fhir-endpoint" onRefresh={() => q.refetch()} loading={q.isFetching} />
            </>
          ) : null
        }
      />
      {q.error ? <ErrorAlert error={q.error} onRetry={() => q.refetch()} /> : null}
      {e ? (
        <Stack gap="md">
          {cap.data?.open ? (
            <Alert color="yellow" icon={<IconLockOpen size={16} />} title="Open to anyone">
              It answered a search without credentials: anyone who reaches {e.url} may read and write through
              it. Its web application's authentication (Security, Web applications) sets that.
            </Alert>
          ) : null}
          {debugOnLive ? (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              Debug mode is on: answers carry internal details. Turn it off outside development.
            </Alert>
          ) : null}
          <KeyValueList
            items={[
              { label: 'State', value: <StatusBadge status={endpointState(e)} /> },
              { label: 'URL', value: e.url, mono: true },
              { label: 'FHIR version', value: c.fhir_version ?? '-' },
              { label: 'Packages', value: c.fhir_metadata_set ?? '-', mono: true },
              {
                label: 'Storage',
                value: `${strategyName(c.interactions_strategy_class)} (${c.interactions_strategy_class ?? ''})`,
              },
              { label: 'Resources stored', value: String(q.data?.metrics?.rsrc_count ?? '-') },
              {
                label: 'Search pages',
                value: `${c.default_search_page_size ?? '-'} by default, ${c.max_search_page_size ?? '-'} at most; ${c.max_search_results ?? '-'} results at most`,
              },
              { label: 'Prefer handling', value: c.default_prefer_handling ?? '-' },
              { label: 'Validation', value: String(c.resource_validation ?? '-') },
              { label: 'Debug mode', value: c.debug_mode ? 'On' : 'Off' },
              { label: 'OAuth client', value: e.csp_config?.oauth_client_name || 'none' },
              {
                label: 'Databases',
                value:
                  e.rsrc_db || e.ver_db
                    ? `${e.rsrc_db} (resources), ${e.ver_db} (versions)`
                    : "the namespace's own",
              },
            ]}
          />
          <Tabs defaultValue="stored">
            <Tabs.List>
              <Tabs.Tab value="stored">Stored</Tabs.Tab>
              <Tabs.Tab value="serves">Serves</Tabs.Tab>
              <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="stored" pt="sm">
              <DataTable
                data={q.data?.metrics?.table_stats ?? []}
                columns={statColumns}
                getRowId={(r) => r.resourceType}
                exportName="fhir-resources"
                emptyMessage="It stores nothing yet."
                dense
              />
            </Tabs.Panel>
            <Tabs.Panel value="serves" pt="sm">
              {e.decommissioned ? (
                <Text size="sm" c="dimmed">
                  It is decommissioned: it serves nothing.
                </Text>
              ) : cap.data && cap.data.status !== 200 ? (
                <Text size="sm" c="dimmed">
                  {cap.data.status === 401
                    ? 'Its CapabilityStatement needs a sign-in of its own.'
                    : cap.data.status === 503
                      ? `It is disabled: ${cap.data.issue ?? 'the service is currently disabled'}.`
                      : `Its CapabilityStatement answered HTTP ${cap.data.status}.`}
                </Text>
              ) : (
                <Stack gap={4}>
                  {cap.data ? (
                    <Group gap="xs">
                      <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
                        {`FHIR ${cap.data.fhirVersion ?? '?'}, ${cap.data.resources.length} resource types`}
                      </Badge>
                    </Group>
                  ) : null}
                  <DataTable
                    data={cap.data?.resources}
                    columns={resColumns}
                    loading={cap.isLoading}
                    error={cap.error}
                    getRowId={(r) => r.type}
                    searchable
                    exportName="fhir-capability"
                    emptyMessage="No resource type."
                    dense
                  />
                </Stack>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="jobs" pt="sm">
              <DataTable
                data={q.data?.endpoint_jobs ?? []}
                columns={jobColumns}
                getRowId={(j) => j.job_key}
                exportName="fhir-jobs"
                emptyMessage="No job for this server."
                dense
              />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : null}
    </>
  );
}
