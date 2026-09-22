import { Alert, Badge, Button, Grid, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useMemo } from 'react';
import { metric, type AlertRow, type MetricSample } from '@/api/monitor';
import { useHostMetrics } from './useHostMetrics';
import { useAlertLog } from './useAlertLog';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Timestamp } from '@/components/Timestamp';
import { describeError } from '@/lib/errors';
import { formatCompact, formatNumber, formatPercent } from '@/lib/format';

const metricColumns: ColumnDef<MetricSample, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Metric',
    cell: (c) => <span className="mono">{String(c.getValue())}</span>,
  },
  {
    id: 'labels',
    header: 'Labels',
    accessorFn: (r) =>
      Object.entries(r.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    cell: (c) => <span className="mono muted">{String(c.getValue())}</span>,
  },
  {
    accessorKey: 'value',
    header: 'Value',
    cell: (c) => <span className="tabular">{formatNumber(c.getValue() as number)}</span>,
  },
  { accessorKey: 'help', header: 'Description' },
];
const alertColumns: ColumnDef<AlertRow, unknown>[] = [
  {
    accessorKey: 'time',
    header: 'Time',
    cell: (c) => <Timestamp value={c.getValue() as string} />,
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    cell: (c) => <StatusBadge status={String(c.getValue() || 'info')} />,
  },
  { accessorKey: 'process', header: 'Process' },
  { accessorKey: 'message', header: 'Message' },
];

export default function MonitorPage() {
  const metrics = useHostMetrics();
  const alerts = useAlertLog();
  const m = useMemo(() => metrics.data ?? [], [metrics.data]);
  const cpu = metric(m, 'iris_cpu_usage')?.value;
  const mem = metric(m, 'iris_phys_mem_percent_used')?.value;
  const license = metric(m, 'iris_license_percent_used')?.value;
  const processes = metric(m, 'iris_process_count')?.value;
  const alertsInLog = metric(m, 'iris_system_alerts_log')?.value;
  const alertsWaiting = metric(m, 'iris_system_alerts_new')?.value === 1;
  const diskRows = useMemo(
    () =>
      m.filter(
        (s) =>
          s.name === 'iris_disk_percent_full' ||
          s.name === 'iris_db_free_space' ||
          s.name === 'iris_db_size_mb',
      ),
    [m],
  );
  const worstDisk = diskRows
    .filter((s) => s.name === 'iris_disk_percent_full')
    .reduce((a, s) => Math.max(a, s.value), 0);

  return (
    <>
      <PageHeader
        title="Host monitor"
        description="Operating-system level signals the SysAdmin API does not expose, read from the native /api/monitor service: CPU, memory, disk, licence and the alerts log."
        actions={
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={() => metrics.refetch()}
            loading={metrics.isFetching}
          >
            Refresh
          </Button>
        }
      />
      {metrics.isError ? (
        <Alert
          color="yellow"
          variant="light"
          icon={<IconInfoCircle size={16} />}
          title="Host metrics unavailable"
          mb="md"
        >
          {describeError(metrics.error)} Enable the <code>/api/monitor</code> web application on the instance
          (Security → Web applications) or allow unauthenticated access to it; the SysAdmin screens keep
          working without it.
        </Alert>
      ) : null}
      <SimpleGrid cols={{ base: 2, md: 5 }} spacing="md" mb="md">
        <StatTile
          label="CPU usage"
          value={cpu === undefined ? '-' : formatPercent(cpu, 0)}
          hint="iris_cpu_usage"
          color={cpu !== undefined && cpu > 85 ? 'red' : 'indigo'}
        />
        <StatTile
          label="Physical memory used"
          value={mem === undefined ? '-' : formatPercent(mem, 0)}
          hint="iris_phys_mem_percent_used"
          color={mem !== undefined && mem > 90 ? 'red' : 'teal'}
        />
        <StatTile
          label="Fullest database disk"
          value={diskRows.length ? formatPercent(worstDisk, 0) : '-'}
          hint="max iris_disk_percent_full"
          color={worstDisk > 90 ? 'red' : 'orange'}
        />
        <StatTile
          label="Licence used"
          value={license === undefined ? '-' : formatPercent(license, 0)}
          hint="iris_license_percent_used"
        />
        <StatTile
          label="Processes"
          value={processes === undefined ? '-' : formatCompact(processes)}
          hint="iris_process_count"
        />
      </SimpleGrid>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper p="md" mb="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>All metrics</Title>
              <Text size="xs" c="dimmed">
                {m.length} samples · GET /api/monitor/metrics
              </Text>
            </Group>
            <DataTable
              stateKey="metrics"
              exportName="metrics"
              data={m}
              columns={metricColumns}
              loading={metrics.isPending}
              error={metrics.error}
              getRowId={(r) =>
                `${r.name}{${Object.entries(r.labels)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => `${k}=${v}`)
                  .join(',')}}`
              }
              dense
              pageSize={30}
              searchPlaceholder="Filter metrics…"
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="md">
            <Paper p="md">
              <Group justify="space-between" mb="xs">
                <Title order={5}>Database disks</Title>
                <Text size="xs" c="dimmed">
                  from metrics
                </Text>
              </Group>
              <DataTable
                data={diskRows}
                columns={metricColumns.slice(0, 3)}
                searchable={false}
                hideColumnMenu
                dense
                emptyMessage="No per-database metrics exposed"
              />
            </Paper>
            <Paper p="md">
              <Group justify="space-between" mb="xs">
                <Title order={5}>Alerts (alerts.log)</Title>
                <Group gap="xs">
                  {alertsInLog !== undefined ? (
                    <Text size="xs" c="dimmed">
                      {formatNumber(alertsInLog)} in the log
                    </Text>
                  ) : null}
                  {alertsWaiting ? (
                    <Badge size="sm" color="orange" variant="light">
                      new alerts waiting
                    </Badge>
                  ) : null}
                </Group>
              </Group>
              <Text size="xs" c="dimmed" mb="xs">
                GET /api/monitor/alerts hands out each alert once: it returns what was posted since the
                previous call from any client, so reading here hides those alerts from a Prometheus or SAM
                scraper of this instance. Alerts are therefore read only when you ask, and kept for this
                session.
              </Text>
              <Button
                size="xs"
                variant="light"
                mb="xs"
                loading={alerts.isFetching}
                onClick={() => void alerts.refetch()}
              >
                Read new alerts
              </Button>
              {alerts.isError ? (
                <Text size="sm" c="dimmed">
                  {describeError(alerts.error)}
                </Text>
              ) : (
                <DataTable
                  data={alerts.data ?? []}
                  columns={alertColumns}
                  searchable={false}
                  hideColumnMenu
                  dense
                  emptyMessage={
                    alerts.data
                      ? 'No alerts were posted since the previous read'
                      : 'Not read yet in this session'
                  }
                />
              )}
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}
