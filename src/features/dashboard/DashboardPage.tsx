import { Badge, Box, Button, Grid, Group, Paper, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { Sparkline } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import { IconActivity, IconCpu, IconDeviceFloppy, IconLicense, IconRefresh } from '@tabler/icons-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { api, result } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { ErrorAlert } from '@/components/ErrorAlert';
import { formatClock, formatCompact, formatNumber } from '@/lib/format';
import { useMetrics, type MetricSample } from '@/stores/metrics';
import { useSession } from '@/stores/session';
import { useSeriesColors } from './useSeriesColors';
import { busyProcesses, withRates } from './rates';
import { useReducedMotion } from '@mantine/hooks';
import { orderCharts, useDashboard } from '@/stores/dashboard';
import { ChartPicker } from './ChartPicker';
import { interopByNamespace, interopNamespaces } from './interop';
import { HealthCard } from '@/features/health/HealthCard';
import { useHostMetrics } from '@/features/monitor/useHostMetrics';
import { DashboardChartCard } from './DashboardCharts';
import { HostGauges } from './HostGauges';
import {
  BusyProcessesCard,
  GlobalsCard,
  ResourceSeizesCard,
  SystemHealthCard,
  UpcomingTasksCard,
} from './DashboardCards';
import { num, pct } from './values';

const POLL_MS = 3000;

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
  const chartOrder = useDashboard((s) => s.order);
  // The charts ticked in the Charts menu, in the order arranged there.
  const shown = useMemo(
    () => orderCharts(chartOrder).filter((id) => charts.includes(id)),
    [chartOrder, charts],
  );
  const interopHistory = useMetrics((s) => s.interop);
  const pushInterop = useMetrics((s) => s.pushInterop);
  // One interop reading per host poll, keyed on its arrival like the dashboard samples above.
  const hostUpdatedAt = host.dataUpdatedAt;
  const recordInterop = useEffectEvent((at: number) => {
    if (host.data) pushInterop(interopByNamespace(host.data, at));
  });
  useEffect(() => {
    if (hostUpdatedAt) recordInterop(hostUpdatedAt);
  }, [hostUpdatedAt]);
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

  // One sample per successful poll, stamped with its arrival. Keyed on dataUpdatedAt, not on the
  // data: two identical answers are still two samples (structural sharing keeps the object).
  const updatedAt = main.dataUpdatedAt;
  const recordSample = useEffectEvent((at: number) => {
    const d = main.data;
    if (!d) return;
    push({
      t: at,
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
  });
  useEffect(() => {
    if (updatedAt) recordSample(updatedAt);
  }, [updatedAt]);

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

  const spanSeconds =
    samples.length > 1 ? Math.round((samples[samples.length - 1].t - samples[0].t) / 1000) : 0;

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

      <HostGauges host={host} />

      <Box mb="md">
        <HealthCard />
      </Box>

      <Group justify="space-between" mb={6}>
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: 0.4 }}>
          Charts
        </Text>
        <ChartPicker />
      </Group>
      {shown.length ? (
        <Grid gutter="md" mb="md">
          {shown.map((id) => (
            <Grid.Col key={id} span={{ base: 12, lg: shown.length === 1 ? 12 : 6 }}>
              <DashboardChartCard
                id={id}
                chartData={chartData}
                interopRows={interopRows}
                interopSeries={interopSeries}
                spanSeconds={spanSeconds}
                animate={animate}
              />
            </Grid.Col>
          ))}
        </Grid>
      ) : (
        <Paper p="md" mb="md">
          <Text size="sm" c="dimmed" ta="center">
            No charts shown: pick some with Choose charts.
          </Text>
        </Paper>
      )}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <SystemHealthCard d={d} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <UpcomingTasksCard d={d} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <BusyProcessesCard busy={busy} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 7 }}>
          <GlobalsCard data={globals.data} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <ResourceSeizesCard data={resources.data} />
        </Grid.Col>
      </Grid>
    </>
  );
}
