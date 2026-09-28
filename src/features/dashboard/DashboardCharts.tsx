import { Group, Paper, Text } from '@mantine/core';
import { AreaChart, LineChart } from '@mantine/charts';
import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import { SERIES_DASH } from '@/lib/chartColors';
import { CHART_TITLES, type DashboardChart } from '@/stores/dashboard';
import type { MetricSample } from '@/stores/metrics';
import type { Rates } from './rates';
import { useSeriesColors } from './useSeriesColors';

/** What each chart of the Charts menu shows, under the title the dashboard store gives it. */
const CHART_CAPTIONS: Record<DashboardChart, string> = {
  globalRefs: '',
  diskIo: 'physical block reads and writes',
  interopMessages: 'interoperability messages processed per second',
  interopQueued: "waiting in the productions' queues",
  cacheEfficiency: 'global references per physical read or write',
  logicalRequests: 'block requests, from memory or disk',
  routineRefs: 'routine loads and calls',
  processes: 'IRIS processes and active CSP sessions',
  license: 'per cent of the license limit',
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

/** A row of the six-minute history: a sample, its rates, and its time on the instance's clock. */
export type ChartRow = MetricSample & Rates & { time: string };

/** One card per chart of the Charts menu; the rows are the six-minute history. */
export function DashboardChartCard({
  id,
  chartData,
  interopRows,
  interopSeries,
  spanSeconds,
  animate,
}: {
  id: DashboardChart;
  chartData: ChartRow[];
  interopRows: Record<string, string | number>[];
  interopSeries: string[];
  spanSeconds: number;
  animate: boolean;
}) {
  const colors = useSeriesColors();
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
  const meta = { title: CHART_TITLES[id], caption: CHART_CAPTIONS[id] };
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
}
