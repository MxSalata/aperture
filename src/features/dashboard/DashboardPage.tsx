import {
  Badge,
  Button,
  Grid,
  Group,
  Menu,
  Paper,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { AreaChart, LineChart, Sparkline } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import {
  IconActivity,
  IconAlertTriangle,
  IconChartLine,
  IconCheck,
  IconClock,
  IconCpu,
  IconDatabase,
  IconDeviceFloppy,
  IconLicense,
  IconRefresh,
  IconWorld,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, result } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Timestamp } from '@/components/Timestamp';
import { StatTile } from '@/components/StatTile';
import { ErrorAlert } from '@/components/ErrorAlert';
import { StatusBadge } from '@/components/StatusBadge';
import { formatClock, formatCompact, formatNumber, formatPercent } from '@/lib/format';
import { useMetrics, type MetricSample } from '@/stores/metrics';
import { useSession } from '@/stores/session';
import { useSeriesColors } from './useSeriesColors';
import { busyProcesses, withRates } from './rates';
import { useReducedMotion } from '@mantine/hooks';
import { SERIES_DASH } from '@/lib/chartColors';
import { DASHBOARD_CHARTS, useDashboard, type DashboardChart } from '@/stores/dashboard';
import { interopByNamespace, interopNamespaces } from './interop';
import { useHostMetrics } from '@/features/monitor/useHostMetrics';
import { metric } from '@/api/monitor';
import { describeError } from '@/lib/errors';

const POLL_MS = 3000;

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function pct(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function healthColor(v: string | undefined): 'good' | 'warning' | 'critical' {
  const s = (v ?? '').toLowerCase();
  if (!s || s === 'normal' || s === 'ok') return 'good';
  if (s.includes('warn') || s.includes('attention')) return 'warning';
  return 'critical';
}

/** What each chart of the Charts menu shows; the ids are the dashboard store's. */
const CHART_META: Record<DashboardChart, { title: string; caption: string }> = {
  globalRefs: { title: 'Global references per second', caption: '' },
  diskIo: { title: 'Disk I/O per second', caption: 'physical block reads and writes' },
  interopMessages: {
    title: 'Message throughput per namespace',
    caption: 'interoperability messages processed per second',
  },
  interopQueued: { title: 'Queued messages per namespace', caption: "waiting in the productions' queues" },
  cacheEfficiency: { title: 'Cache efficiency', caption: 'global references per physical read or write' },
  logicalRequests: { title: 'Logical requests per second', caption: 'block requests, from memory or disk' },
  routineRefs: { title: 'Routine references per second', caption: 'routine loads and calls' },
  processes: { title: 'Processes and web sessions', caption: 'IRIS processes and active CSP sessions' },
  license: { title: 'License units in use', caption: 'per cent of the license limit' },
};

/** A chart's card: the title, a caption or note on the right, and the chart or a waiting line. */
function ChartCard({
  title,
  caption,
  ready,
  waiting = 'Collecting samples…',
  children,
}: {
  title: string;
  caption: ReactNode;
  ready: boolean;
  waiting?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper p="md" h="100%">
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {caption}
        </Text>
      </Group>
      {ready ? (
        children
      ) : (
        <Text size="sm" c="dimmed" py="xl" ta="center">
          {waiting}
        </Text>
      )}
    </Paper>
  );
}

/** Green up to 75 %, amber to 90 %, red above: the thresholds the Host monitor's alerts use. */
function gaugeColor(value: number | undefined) {
  if (value === undefined) return 'gray';
  return value >= 90 ? 'red' : value >= 75 ? 'yellow' : 'teal';
}

/**
 * A host figure as a ring and a number: how full, at a glance, and the colour says whether it
 * matters. The ring takes the filled token of its colour, which keeps 3:1 on the card; the number
 * carries the value for everyone else.
 */
function GaugeTile({ label, value, hint }: { label: string; value: number | undefined; hint: string }) {
  const color = gaugeColor(value);
  return (
    <Paper p="sm">
      <Group gap="sm" wrap="nowrap">
        <RingProgress
          size={58}
          thickness={6}
          roundCaps
          aria-hidden
          sections={[
            { value: Math.max(0, Math.min(100, value ?? 0)), color: `var(--mantine-color-${color}-filled)` },
          ]}
        />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.4 }}>
            {label}
          </Text>
          <Text fz={22} fw={650} lh={1.15} className="tabular">
            {value === undefined ? '-' : formatPercent(value, 0)}
          </Text>
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export default function DashboardPage() {
  const info = useSession((s) => s.info);
  const samples = useMetrics((s) => s.samples);
  const push = useMetrics((s) => s.push);
  const [paused, setPaused] = useState(false);
  const colors = useSeriesColors();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;

  const main = useQuery({
    queryKey: ['dashboard', 'main'],
    queryFn: () => result(api().GET('/v2/monitor/dashboard/main')),
    refetchInterval: paused ? false : POLL_MS,
  });
  const resources = useQuery({
    queryKey: ['dashboard', 'system-resources'],
    queryFn: () => result(api().GET('/v2/monitor/dashboard/system-resources')),
    refetchInterval: paused ? false : POLL_MS * 4,
  });
  const globals = useQuery({
    queryKey: ['dashboard', 'globals-and-routines'],
    queryFn: () => result(api().GET('/v2/monitor/dashboard/globals-and-routines')),
    refetchInterval: paused ? false : POLL_MS,
  });

  const host = useHostMetrics(POLL_MS * 3);
  const charts = useDashboard((s) => s.charts);
  const toggleChart = useDashboard((s) => s.toggle);
  const interopHistory = useMetrics((s) => s.interop);
  const pushInterop = useMetrics((s) => s.pushInterop);
  // One interop reading per host poll, keyed on its arrival like the dashboard samples above.
  const hostUpdatedAt = host.dataUpdatedAt;
  useEffect(() => {
    if (!host.data || !hostUpdatedAt) return;
    pushInterop(interopByNamespace(host.data, hostUpdatedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostUpdatedAt, pushInterop]);
  const interopSeries = useMemo(() => interopNamespaces(interopHistory), [interopHistory]);
  const interopRows = useMemo(
    () =>
      interopHistory.map((h) => {
        const row: Record<string, string | number> = { time: formatClock(h.t) };
        for (const [ns, v] of Object.entries(h.namespaces)) {
          row[`${ns} msgs`] = Math.round(v.messagesPerSec * 10) / 10;
          row[`${ns} queued`] = v.queued;
        }
        return row;
      }),
    [interopHistory],
  );
  const failed = [
    ['dashboard', main],
    ['system resources', resources],
    ['globals and routines', globals],
  ].filter(([, q]) => (q as { isError: boolean }).isError) as [string, unknown][];
  const cpu = host.data ? metric(host.data, 'iris_cpu_usage')?.value : undefined;
  const mem = host.data ? metric(host.data, 'iris_phys_mem_percent_used')?.value : undefined;
  const diskFull = host.data
    ? host.data.filter((s) => s.name === 'iris_disk_percent_full').reduce((a, s) => Math.max(a, s.value), 0)
    : undefined;

  // One sample per successful poll, stamped with its arrival. Keyed on dataUpdatedAt, not on the
  // data: two identical answers are still two samples (structural sharing keeps the object).
  const updatedAt = main.dataUpdatedAt;
  useEffect(() => {
    const d = main.data;
    if (!d || !updatedAt) return;
    push({
      t: updatedAt,
      globalRefsPerSec: num(d.Performance?.GlobalRefsPerSecond),
      globalSetKill: num(d.Performance?.GlobalSetKill),
      routineRefs: num(d.Performance?.RoutineRefs),
      logicalRequests: num(d.Performance?.LogicalRequests),
      diskReads: num(d.Performance?.DiskReads),
      diskWrites: num(d.Performance?.DiskWrites),
      cacheEfficiency: num(d.Performance?.CacheEfficiency),
      licenseUse: pct(d.Licensing?.LicenseUse),
      processes: num(d.SystemUsage?.Processes),
      cspSessions: num(d.SystemUsage?.CSPSessions),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt, push]);

  // DiskReads, LogicalRequests & co. are totals since startup: the screen shows their rates.
  const chartData = useMemo(
    // On the instance's clock, like every other time on the screen.
    () => withRates(samples).map((s) => ({ ...s, time: formatClock(s.t) })),
    [samples],
  );
  const last = chartData[chartData.length - 1];
  const d = main.data;
  const spark = (key: keyof MetricSample) => samples.slice(-30).map((s) => num(s[key]));
  const busy = busyProcesses(d?.SystemUsage?.BusyProcesses);
  const licenseLimit = num(d?.Licensing?.LicenseLimit);
  const licenseUse = pct(d?.Licensing?.LicenseUse);
  const licenseHigh = pct(d?.Licensing?.LicenseUseHigh);
  const version = info?.serverVersion?.match(/\d{4}\.\d+(?:\.\d+)?/)?.[0];

  const lineProps = { isAnimationActive: animate };
  const axes = {
    curveType: 'monotone' as const,
    withDots: false,
    strokeWidth: 2,
    gridAxis: 'y' as const,
    tickLine: 'none' as const,
    xAxisProps: { interval: 'preserveStartEnd' as const, minTickGap: 40 },
  };
  const legend = { withLegend: true, legendProps: { verticalAlign: 'bottom' as const, height: 28 } };
  const spanSeconds =
    samples.length > 1 ? Math.round((samples[samples.length - 1].t - samples[0].t) / 1000) : 0;
  const interopHint =
    'No production reports here. IRIS publishes these figures once ' +
    '##class(Ens.Util.Statistics).EnableSAMForNamespace() has been run in a namespace whose production is running.';
  const perNamespace = (suffix: 'msgs' | 'queued') =>
    interopSeries.map((ns, i) => ({
      name: `${ns} ${suffix}`,
      label: ns,
      color: colors[i % colors.length],
      strokeDasharray: SERIES_DASH[i % SERIES_DASH.length],
    }));

  /** One card per chart of the Charts menu; the rows are the six-minute history. */
  const renderChart = (id: DashboardChart) => {
    const meta = CHART_META[id];
    const ready = chartData.length > 1;
    switch (id) {
      case 'globalRefs':
        return (
          <ChartCard title={meta.title} caption={`last ${spanSeconds}s`} ready={ready}>
            <LineChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[{ name: 'globalRefsPerSec', label: 'Global refs/s', color: colors[0] }]}
              lineProps={lineProps}
              withLegend={false}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 56 }}
              {...axes}
            />
          </ChartCard>
        );
      case 'diskIo':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <AreaChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[
                {
                  name: 'diskReadsPerSec',
                  label: 'Reads',
                  color: colors[1],
                  strokeDasharray: SERIES_DASH[1],
                },
                {
                  name: 'diskWritesPerSec',
                  label: 'Writes',
                  color: colors[2],
                  strokeDasharray: SERIES_DASH[2],
                },
              ]}
              fillOpacity={0.1}
              areaProps={lineProps}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 48 }}
              {...axes}
              {...legend}
            />
          </ChartCard>
        );
      case 'interopMessages':
      case 'interopQueued': {
        const queued = id === 'interopQueued';
        return (
          <ChartCard
            title={meta.title}
            caption={meta.caption}
            ready={interopRows.length > 1 && interopSeries.length > 0}
            waiting={interopRows.length > 1 && !interopSeries.length ? interopHint : undefined}
          >
            <LineChart
              h={220}
              data={interopRows}
              dataKey="time"
              series={perNamespace(queued ? 'queued' : 'msgs')}
              lineProps={lineProps}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 48 }}
              {...axes}
              {...legend}
            />
          </ChartCard>
        );
      }
      case 'cacheEfficiency':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <LineChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[{ name: 'cacheEfficiency', label: 'Cache efficiency', color: colors[1] }]}
              lineProps={lineProps}
              withLegend={false}
              valueFormatter={(v) => `${formatNumber(v)} : 1`}
              yAxisProps={{ width: 56 }}
              {...axes}
            />
          </ChartCard>
        );
      case 'logicalRequests':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <LineChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[{ name: 'logicalRequestsPerSec', label: 'Logical requests/s', color: colors[3] }]}
              lineProps={lineProps}
              withLegend={false}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 56 }}
              {...axes}
            />
          </ChartCard>
        );
      case 'routineRefs':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <LineChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[{ name: 'routineRefsPerSec', label: 'Routine refs/s', color: colors[4] }]}
              lineProps={lineProps}
              withLegend={false}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 56 }}
              {...axes}
            />
          </ChartCard>
        );
      case 'processes':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <LineChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[
                { name: 'processes', label: 'Processes', color: colors[0] },
                {
                  name: 'cspSessions',
                  label: 'Web sessions',
                  color: colors[2],
                  strokeDasharray: SERIES_DASH[1],
                },
              ]}
              lineProps={lineProps}
              valueFormatter={(v) => formatNumber(v)}
              yAxisProps={{ width: 40 }}
              {...axes}
              {...legend}
            />
          </ChartCard>
        );
      case 'license':
        return (
          <ChartCard title={meta.title} caption={meta.caption} ready={ready}>
            <AreaChart
              h={220}
              data={chartData}
              dataKey="time"
              series={[{ name: 'licenseUse', label: 'License units', color: colors[3] }]}
              fillOpacity={0.1}
              areaProps={lineProps}
              withLegend={false}
              valueFormatter={(v) => `${v}%`}
              yAxisProps={{ width: 40, domain: [0, 100] }}
              {...axes}
            />
          </ChartCard>
        );
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          info
            ? `${info.product === 'irisforhealth' ? 'IRIS for Health' : 'InterSystems IRIS'} ${version ?? ''} · ${info.namespaces?.length ?? 0} namespaces · polling every ${POLL_MS / 1000}s`
            : 'Live system status from /v2/monitor'
        }
        privileges={['%Admin_Operate:U']}
        actions={
          <>
            {failed.length ? (
              <Tooltip label={`Failing: ${failed.map(([n]) => n).join(', ')}`}>
                <Badge color="yellow" variant="filled">
                  PARTIAL DATA
                </Badge>
              </Tooltip>
            ) : null}
            <Menu shadow="md" width={300} position="bottom-end" withinPortal closeOnItemClick={false}>
              <Menu.Target>
                <Button size="xs" variant="default" leftSection={<IconChartLine size={14} />}>
                  Charts
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Charts on this dashboard</Menu.Label>
                {DASHBOARD_CHARTS.map((id) => {
                  const on = charts.includes(id);
                  return (
                    <Menu.Item
                      key={id}
                      onClick={() => toggleChart(id)}
                      aria-label={`${CHART_META[id].title} (${on ? 'shown' : 'hidden'})`}
                      leftSection={<IconCheck size={14} style={{ visibility: on ? 'visible' : 'hidden' }} />}
                    >
                      {CHART_META[id].title}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
            <Button
              size="xs"
              variant={paused ? 'filled' : 'default'}
              leftSection={<IconRefresh size={14} />}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Resume polling' : 'Pause polling'}
            </Button>
          </>
        }
      />

      {main.isError ? <ErrorAlert error={main.error} onRetry={() => main.refetch()} /> : null}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md" mb="md">
        <StatTile
          label="Global refs / s"
          value={formatCompact(last?.globalRefsPerSec)}
          hint="Performance.GlobalRefsPerSecond"
          footer={`${formatCompact(last?.logicalRequestsPerSec)} logical requests/s`}
          aside={
            samples.length > 1 ? (
              <Sparkline
                w={110}
                h={44}
                data={spark('globalRefsPerSec')}
                color={colors[0]}
                curveType="monotone"
                strokeWidth={1.5}
                fillOpacity={0.12}
                areaProps={{ isAnimationActive: false }}
              />
            ) : (
              <IconActivity size={22} />
            )
          }
        />
        <StatTile
          label="Cache efficiency"
          value={last ? `${formatCompact(last.cacheEfficiency)} : 1` : '-'}
          hint="Global references per physical block read or write (Performance.CacheEfficiency, a ratio)"
          footer={`${formatCompact(last?.diskReadsPerSec)} reads/s · ${formatCompact(last?.diskWritesPerSec)} writes/s`}
          aside={
            samples.length > 1 ? (
              <Sparkline
                w={110}
                h={44}
                data={spark('cacheEfficiency')}
                color={colors[1]}
                curveType="monotone"
                strokeWidth={1.5}
                fillOpacity={0.12}
                areaProps={{ isAnimationActive: false }}
              />
            ) : (
              <IconDeviceFloppy size={22} />
            )
          }
        />
        <StatTile
          label="Processes"
          value={formatNumber(d?.SystemUsage?.Processes)}
          hint="SystemUsage.Processes"
          icon={<IconCpu size={20} />}
          color="teal"
          footer={`${busy.length} busy · ${formatNumber(d?.SystemUsage?.CSPSessions)} web sessions`}
        />
        <StatTile
          label="License units"
          value={!d ? '-' : licenseUse === null ? 'unlimited' : `${licenseUse}%`}
          hint="Licensing.LicenseUse (percentage of the license limit)"
          icon={<IconLicense size={20} />}
          color={
            licenseUse !== null && licenseUse > 85
              ? 'red'
              : licenseUse !== null && licenseUse > 70
                ? 'yellow'
                : 'indigo'
          }
          footer={
            !d
              ? ' '
              : licenseLimit
                ? `limit ${formatNumber(licenseLimit)} · peak ${licenseHigh ?? '-'}%`
                : 'no license limit'
          }
        />
      </SimpleGrid>

      <Group justify="space-between" mb={6}>
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: 0.4 }}>
          Host
        </Text>
        <Button component={Link} to="/monitor" size="compact-xs" variant="subtle">
          Host monitor
        </Button>
      </Group>
      {host.isError ? (
        <Paper p="sm" mb="md">
          <Text size="xs" c="dimmed">
            metrics unavailable - {describeError(host.error)}
          </Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
          <GaugeTile label="CPU" value={cpu} hint="of the host's CPU in use" />
          <GaugeTile label="Memory" value={mem} hint="of physical memory in use" />
          <GaugeTile
            label="Fullest DB disk"
            value={diskFull === undefined || !host.data?.length ? undefined : diskFull}
            hint="of the fullest database volume in use"
          />
        </SimpleGrid>
      )}

      {charts.length ? (
        <Grid gutter="md" mb="md">
          {charts.map((id) => (
            <Grid.Col key={id} span={{ base: 12, lg: charts.length === 1 ? 12 : 6 }}>
              {renderChart(id)}
            </Grid.Col>
          ))}
        </Grid>
      ) : (
        <Paper p="md" mb="md">
          <Text size="sm" c="dimmed" ta="center">
            No charts shown: pick some under Charts.
          </Text>
        </Paper>
      )}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" h="100%">
            <Text fw={600} size="sm" mb="xs">
              System health
            </Text>
            <Stack gap={6}>
              {(
                [
                  ['Database space', d?.SystemUsage?.DatabaseSpace],
                  ['Database journal', d?.SystemUsage?.DatabaseJournal],
                  ['Journal space', d?.SystemUsage?.JournalSpace],
                  ['Lock table', d?.SystemUsage?.LockTable],
                  ['Write daemon', d?.SystemUsage?.WriteDaemon],
                ] as [string, string | undefined][]
              ).map(([label, value]) => {
                const h = healthColor(value);
                return (
                  <Group key={label} justify="space-between">
                    <Text size="sm">{label}</Text>
                    <Badge
                      size="sm"
                      variant="light"
                      color={h === 'good' ? 'teal' : h === 'warning' ? 'yellow' : 'red'}
                      style={{ textTransform: 'none' }}
                    >
                      {value ?? '-'}
                    </Badge>
                  </Group>
                );
              })}
              <Group justify="space-between">
                <Text size="sm">System monitor</Text>
                <Badge size="sm" variant="light" color={d?.Status?.SystemMonitor ? 'teal' : 'red'}>
                  {d?.Status?.SystemMonitor ? 'Running' : 'Stopped'}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Group gap={6}>
                  <IconAlertTriangle size={14} />
                  <Text size="sm">Serious alerts</Text>
                </Group>
                <Badge size="sm" variant="light" color={num(d?.Alerts?.SeriousAlerts) ? 'red' : 'teal'}>
                  {formatNumber(d?.Alerts?.SeriousAlerts)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Application errors</Text>
                <Badge
                  size="sm"
                  variant="light"
                  color={num(d?.Alerts?.ApplicationErrors) ? 'yellow' : 'teal'}
                >
                  {formatNumber(d?.Alerts?.ApplicationErrors)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Group gap={6}>
                  <IconClock size={14} />
                  <Text size="sm">Up time</Text>
                </Group>
                <Text size="sm" className="tabular">
                  {d?.Status?.UpTime ?? '-'}
                </Text>
              </Group>
              <Group justify="space-between">
                <Group gap={6}>
                  <IconDatabase size={14} />
                  <Text size="sm">Last backup</Text>
                </Group>
                <Text size="sm">
                  {d?.Status?.LastBackup ? (
                    <Timestamp value={d.Status.LastBackup} mode="relative" className="" />
                  ) : (
                    'never'
                  )}
                </Text>
              </Group>
              <Group justify="space-between">
                <Group gap={6}>
                  <IconWorld size={14} />
                  <Text size="sm">Journal entries</Text>
                </Group>
                <Text size="sm" className="tabular">
                  {formatCompact(num(d?.SystemUsage?.JournalEntries))}
                </Text>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Upcoming tasks
              </Text>
              <Button component={Link} to="/tasks" size="compact-xs" variant="subtle">
                All tasks
              </Button>
            </Group>
            {d?.UpcomingTasks?.length ? (
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {d.UpcomingTasks.slice(0, 8).map((t, i) => (
                    <Table.Tr key={i}>
                      <Table.Td style={{ maxWidth: 180 }}>
                        <Text size="sm" truncate>
                          {t.Task}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" className="tabular" style={{ whiteSpace: 'nowrap' }}>
                          {t.Time}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge status={t.Status} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed">
                No scheduled tasks
              </Text>
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Busy processes
              </Text>
              <Button component={Link} to="/processes" size="compact-xs" variant="subtle">
                All processes
              </Button>
            </Group>
            {busy.length ? (
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {busy.slice(0, 8).map((p) => (
                    <Table.Tr key={p.pid}>
                      <Table.Td>
                        <Text
                          size="sm"
                          className="mono"
                          component={Link}
                          to={`/processes/${p.pid}`}
                          c="indigo"
                        >
                          {p.pid}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" className="tabular">
                          {formatCompact(p.commands)} commands
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed">
                No busy user processes
              </Text>
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Globals and routines (totals since startup)
              </Text>
              <Text size="xs" c="dimmed">
                /v2/monitor/dashboard/globals-and-routines
              </Text>
            </Group>
            {globals.data ? (
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                {(
                  [
                    ['Global refs (local)', globals.data.Globals?.RefLocal],
                    ['Global updates', globals.data.Globals?.RefUpdateLocal],
                    ['Logical blocks', globals.data.Globals?.LogicalBlocks],
                    ['Block reads', globals.data.Globals?.PhysBlockReads],
                    ['Block writes', globals.data.Globals?.PhysBlockWrites],
                    ['Journal entries', globals.data.Globals?.JrnEntries],
                    ['Routine calls', globals.data.Routines?.RtnCallsLocal],
                    ['Routine commands', globals.data.Routines?.RtnCommands],
                    ['Routine loads', globals.data.Routines?.RtnFetchLocal],
                  ] as [string, number | undefined][]
                ).map(([label, value]) => (
                  <Stack key={label} gap={0}>
                    <Text size="xs" c="dimmed">
                      {label}
                    </Text>
                    <Text fw={600} className="tabular">
                      {formatCompact(value)}
                    </Text>
                  </Stack>
                ))}
              </SimpleGrid>
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Resource seizes
              </Text>
              <Text size="xs" c="dimmed">
                contention on shared structures
              </Text>
            </Group>
            {resources.data ? (
              <Stack gap={6}>
                {resources.data.slice(0, 6).map((r) => {
                  const seize = num(r.Seize);
                  const waits = num(r.Nseize) + num(r.Aseize) + num(r.Bseize);
                  const ratio = seize ? Math.min(100, (waits / seize) * 100) : 0;
                  return (
                    <div key={r.Name}>
                      <Group justify="space-between" mb={2}>
                        <Text size="xs">{r.Name}</Text>
                        <Text size="xs" c="dimmed" className="tabular">
                          {formatCompact(seize)} seizes · {ratio.toFixed(2)}% waits
                        </Text>
                      </Group>
                      <Progress
                        size="xs"
                        value={Math.max(ratio, 0.5)}
                        color={ratio > 5 ? 'red' : ratio > 1 ? 'yellow' : 'aperture'}
                        aria-label={`${r.Name} seize waits`}
                      />
                    </div>
                  );
                })}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}
