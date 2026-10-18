import { Alert, Badge, Drawer, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  categoriesOf,
  fetchConnections,
  fetchHostLog,
  fetchHostMessages,
  fetchHostQueue,
  fetchHostSettings,
  fetchProduction,
  hostErrors,
  hostStatus,
  hostType,
  interopKeys,
  messageStatus,
  productionState,
  statusRank,
  utcInstant,
  type EventLogEntry,
  type HostErrors,
  type HostMessage,
  type ItemConnections,
  type ProductionItem,
  type ProductionSetting,
  type QueuedMessage,
} from '@/api/interop';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { KeyValueList } from '@/components/KeyValueList';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { RefreshControl } from '@/components/RefreshControl';
import { StatusBadge } from '@/components/StatusBadge';
import { Timestamp } from '@/components/Timestamp';
import { parseIrisDate } from '@/lib/format';
import { HostCounts } from './ProductionsPage';

type HostRow = ProductionItem & { errors?: HostErrors };

/** How many hosts' event logs the production screen reads for their errors (one request each). */
const LOG_SCAN_LIMIT = 60;
const DAY = 86_400_000;
const toMs = (time: string) => parseIrisDate(time)?.valueOf() ?? NaN;

const LOG_COLORS: Record<string, string> = {
  error: 'red',
  warning: 'yellow',
  alert: 'red',
  info: 'blue',
  trace: 'gray',
};

const logColumns: ColumnDef<EventLogEntry, unknown>[] = [
  {
    accessorKey: 'TimeLogged',
    header: 'Time',
    cell: (c) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        <Timestamp value={String(c.getValue())} />
      </span>
    ),
  },
  {
    accessorKey: 'Type',
    header: 'Type',
    cell: (c) => (
      <Badge
        size="sm"
        variant="light"
        color={LOG_COLORS[String(c.getValue()).toLowerCase()] ?? 'gray'}
        style={{ textTransform: 'none' }}
      >
        {String(c.getValue())}
      </Badge>
    ),
  },
  {
    accessorKey: 'Text',
    header: 'Text',
    cell: (c) => (
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {String(c.getValue())}
      </Text>
    ),
  },
  {
    accessorKey: 'Session',
    header: 'Session',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    accessorKey: 'Job',
    header: 'Job',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    accessorKey: 'Method',
    header: 'Method',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
];

const messageColumns: ColumnDef<HostMessage, unknown>[] = [
  {
    accessorKey: 'Date',
    header: 'Created',
    cell: (c) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        <Timestamp value={utcInstant(String(c.getValue()))} />
      </span>
    ),
  },
  {
    accessorKey: 'Status',
    header: 'Status',
    cell: (c) => <StatusBadge status={messageStatus(Number(c.getValue()))} />,
  },
  {
    accessorKey: 'Source',
    header: 'From',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  { accessorKey: 'Target', header: 'To', cell: (c) => <span className="mono">{String(c.getValue())}</span> },
  {
    accessorKey: 'MessageBodyClassName',
    header: 'Body',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  {
    accessorKey: 'Header',
    header: 'Header',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
];

const queueColumns: ColumnDef<QueuedMessage, unknown>[] = [
  {
    accessorKey: 'TimeCreated',
    header: 'Waiting since',
    cell: (c) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        <Timestamp value={String(c.getValue())} />
      </span>
    ),
  },
  {
    accessorKey: 'Source',
    header: 'From',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  {
    accessorKey: 'BodyClass',
    header: 'Body',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  { accessorKey: 'Priority', header: 'Priority' },
  {
    accessorKey: 'HeaderId',
    header: 'Header',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
];

const settingColumns: ColumnDef<ProductionSetting, unknown>[] = [
  {
    accessorKey: 'Name',
    header: 'Setting',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  {
    accessorKey: 'Value',
    header: 'Value',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    accessorKey: 'DefaultValue',
    header: 'Default',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'Category', header: 'Group' },
];

/** Who this host sends to and hears from, by name. */
function HostConnections({ item, all }: { item: ProductionItem; all: ItemConnections[] | undefined }) {
  const mine = all?.find((c) => String(c.itemId) === String(item.itemId))?.connections ?? [];
  const to = mine.filter((c) => c.isTarget).map((c) => c.itemName);
  const from = mine.filter((c) => !c.isTarget).map((c) => c.itemName);
  const list = (names: string[]) =>
    names.length ? (
      <Group gap={4}>
        {names.map((n) => (
          <Badge key={n} variant="default" style={{ textTransform: 'none' }} className="mono">
            {n}
          </Badge>
        ))}
      </Group>
    ) : (
      <Text size="sm" c="dimmed">
        none
      </Text>
    );
  return (
    <KeyValueList
      cols={1}
      items={[
        { label: 'Sends to', value: list(to) },
        { label: 'Hears from', value: list(from) },
      ]}
    />
  );
}

function HostDrawer({
  ns,
  production,
  item,
  connections,
  onClose,
}: {
  ns: string;
  production: string;
  item: ProductionItem | null;
  connections: ItemConnections[] | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string | null>('log');
  const host = item?.name ?? '';
  const enabled = !!item;
  const log = useQuery({
    queryKey: interopKeys.host(ns, production, host, 'log'),
    queryFn: () => fetchHostLog(ns, production, host),
    enabled: enabled && tab === 'log',
  });
  const messages = useQuery({
    queryKey: interopKeys.host(ns, production, host, 'messages'),
    queryFn: () => fetchHostMessages(ns, production, host),
    enabled: enabled && tab === 'messages',
  });
  const queue = useQuery({
    queryKey: interopKeys.host(ns, production, host, 'queue'),
    queryFn: () => fetchHostQueue(ns, production, host),
    enabled: enabled && tab === 'queue',
  });
  const settings = useQuery({
    queryKey: interopKeys.host(ns, production, item?.itemId ?? '', 'settings'),
    queryFn: () => fetchHostSettings(ns, production, item!.itemId),
    enabled: enabled && tab === 'settings',
  });
  return (
    <Drawer
      opened={!!item}
      onClose={onClose}
      position="right"
      size="xl"
      title={<b className="mono">{host}</b>}
    >
      {item ? (
        <Stack gap="sm">
          <KeyValueList
            items={[
              { label: 'Type', value: hostType(item.type) },
              { label: 'Status', value: <StatusBadge status={hostStatus(item)} /> },
              { label: 'Class', value: item.classname, mono: true },
              { label: 'Categories', value: categoriesOf(item).join(', ') || '-' },
              { label: 'Pool size', value: String(item.poolsize) },
              { label: 'Comment', value: item.comment || '-' },
              ...(item.ipaddress || item.port
                ? [
                    {
                      label: 'Address',
                      value: [item.ipaddress, item.port].filter(Boolean).join(':'),
                      mono: true,
                    },
                  ]
                : []),
            ]}
          />
          <Tabs value={tab} onChange={setTab} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="log">Event log</Tabs.Tab>
              <Tabs.Tab value="messages">Messages</Tabs.Tab>
              <Tabs.Tab value="queue">Queue</Tabs.Tab>
              <Tabs.Tab value="connections">Connections</Tabs.Tab>
              <Tabs.Tab value="settings">Settings</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="log" pt="sm">
              <DataTable
                data={log.data}
                columns={logColumns}
                loading={log.isPending}
                error={log.error}
                getRowId={(r) => String(r.Id)}
                searchable
                searchPlaceholder="Filter the event log…"
                exportName={`event-log-${host}`}
                emptyMessage="Nothing in this host's event log."
                dense
              />
            </Tabs.Panel>
            <Tabs.Panel value="messages" pt="sm">
              <DataTable
                data={messages.data}
                columns={messageColumns}
                loading={messages.isPending}
                error={messages.error}
                getRowId={(r) => `${r.Header}-${r.Source}-${r.Target}`}
                exportName={`messages-${host}`}
                emptyMessage="No message sent or received lately."
                dense
              />
            </Tabs.Panel>
            <Tabs.Panel value="queue" pt="sm">
              <DataTable
                data={queue.data}
                columns={queueColumns}
                loading={queue.isPending}
                error={queue.error}
                getRowId={(r) => r.QId}
                exportName={`queue-${host}`}
                emptyMessage="Nothing waits for this host."
                dense
              />
            </Tabs.Panel>
            <Tabs.Panel value="connections" pt="sm">
              <HostConnections item={item} all={connections} />
            </Tabs.Panel>
            <Tabs.Panel value="settings" pt="sm">
              <DataTable
                data={settings.data}
                columns={settingColumns}
                loading={settings.isPending}
                error={settings.error}
                getRowId={(r) => r.Name}
                searchable
                searchPlaceholder="Filter settings…"
                exportName={`settings-${host}`}
                emptyMessage="IRIS reports no settings for this host."
                dense
              />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : null}
    </Drawer>
  );
}

export default function ProductionPage() {
  const { namespace = '', production = '' } = useParams();
  const [open, setOpen] = useState<ProductionItem | null>(null);
  const definition = useQuery({
    queryKey: interopKeys.production(namespace, production),
    queryFn: () => fetchProduction(namespace, production),
  });
  const connections = useQuery({
    queryKey: interopKeys.connections(namespace, production),
    queryFn: () => fetchConnections(namespace, production),
  });
  const d = definition.data;
  const state = d ? productionState({ State: d.State, ProdRunning: d.ProdRunning }, production) : undefined;
  const items = d?.Items ?? [];
  const scanned = state === 'Running' ? items.slice(0, LOG_SCAN_LIMIT) : [];
  const logs = useQueries({
    queries: scanned.map((it) => ({
      queryKey: interopKeys.host(namespace, production, it.name, 'log'),
      queryFn: () => fetchHostLog(namespace, production, it.name),
    })),
  });
  // The rows carry their errors, so the table sorts by them once the event logs arrive (it keeps the
  // values it read from a row object until it gets another). The window ends at the newest reading.
  const readAt = Math.max(0, ...logs.map((q) => q.dataUpdatedAt));
  const rows: HostRow[] = items.map((it, i) => {
    const entries = i < scanned.length ? logs[i]?.data : undefined;
    return { ...it, errors: entries ? hostErrors(entries, readAt - DAY, toMs) : undefined };
  });

  const columns: ColumnDef<HostRow, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Host',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
    { id: 'type', accessorFn: (r) => hostType(r.type), header: 'Type' },
    {
      id: 'status',
      accessorFn: (r) => hostStatus(r),
      header: 'Status',
      sortingFn: (a, b) => statusRank(hostStatus(a.original)) - statusRank(hostStatus(b.original)),
      cell: (c) => <StatusBadge status={String(c.getValue())} />,
    },
    {
      accessorKey: 'classname',
      header: 'Class',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
    { id: 'category', accessorFn: (r) => categoriesOf(r).join(', '), header: 'Categories' },
    {
      id: 'errors',
      accessorFn: (r) => r.errors?.count ?? -1,
      header: 'Errors (24 h)',
      cell: ({ row }) => {
        const e = row.original.errors;
        if (!e)
          return (
            <Text size="xs" c="dimmed">
              -
            </Text>
          );
        return e.count ? (
          <Badge size="sm" variant="light" color="red">
            {e.count}
          </Badge>
        ) : (
          <Text size="sm">0</Text>
        );
      },
    },
    {
      id: 'lastError',
      accessorFn: (r) => r.errors?.last?.Text ?? '',
      header: 'Last error',
      cell: ({ row }) => {
        const last = row.original.errors?.last;
        return last ? (
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              <Timestamp value={last.TimeLogged} mode="relative" />
            </Text>
            <Text size="sm" lineClamp={2}>
              {last.Text}
            </Text>
          </Stack>
        ) : null;
      },
    },
    { accessorKey: 'poolsize', header: 'Pool' },
    { accessorKey: 'comment', header: 'Comment' },
  ];

  if (definition.isPending) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        title={<span className="mono">{production}</span>}
        description={
          <>
            A production in <Link to="/interop/productions">{namespace}</Link>: its hosts and what IRIS
            reports about each one. Open a host for its event log, messages, queue, connections and settings.
          </>
        }
        actions={
          <RefreshControl
            screen="production"
            onRefresh={() => {
              void definition.refetch();
              void connections.refetch();
            }}
            loading={definition.isFetching}
          />
        }
      />
      {definition.error ? <ErrorAlert error={definition.error} onRetry={() => definition.refetch()} /> : null}
      {d ? (
        <Stack gap="md">
          <KeyValueList
            items={[
              { label: 'State', value: <StatusBadge status={state} /> },
              { label: 'Namespace', value: namespace, mono: true },
              { label: 'Hosts', value: <HostCounts items={items} /> },
              {
                label: 'Read-only',
                value: d.ReadOnly ? 'Yes (source control or a deployed production)' : 'No',
              },
            ]}
          />
          {state !== 'Running' ? (
            <Alert color="gray" icon={<IconInfoCircle size={16} />}>
              {d.ProdRunning
                ? `${d.ProdRunning} is the production running in ${namespace}; this one is stopped, so its hosts report stopped.`
                : `No production is running in ${namespace}.`}
            </Alert>
          ) : null}
          {items.length > LOG_SCAN_LIMIT && state === 'Running' ? (
            <Text size="xs" c="dimmed">
              {`Errors are counted from the event logs of the first ${LOG_SCAN_LIMIT} hosts; open any other host for its own.`}
            </Text>
          ) : null}
          <DataTable
            stateKey="production-hosts"
            exportName={`hosts-${production}`}
            data={rows}
            columns={columns}
            getRowId={(r) => r.itemId}
            getRowLabel={(r) => `Open ${r.name}`}
            onRowClick={(r) => setOpen(r)}
            searchable
            searchPlaceholder="Filter hosts by name, type, status, class or category…"
            initialSorting={[{ id: 'errors', desc: true }]}
            emptyMessage="This production has no hosts."
          />
        </Stack>
      ) : null}
      <HostDrawer
        ns={namespace}
        production={production}
        item={open}
        connections={connections.data}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
