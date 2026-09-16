import { Badge, Button, Grid, Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Tooltip } from '@mantine/core';
import { AreaChart, LineChart, Sparkline } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import { IconActivity, IconAlertTriangle, IconClock, IconCpu, IconDatabase, IconDeviceFloppy, IconLicense, IconRefresh, IconWorld } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import dayjs from 'dayjs';
import { api, result } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { ErrorAlert } from '@/components/ErrorAlert';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCompact, formatDateTime, formatNumber, formatPercent, formatRelative } from '@/lib/format';
import { useMetrics, type MetricSample } from '@/stores/metrics';
import { useSession } from '@/stores/session';
import { useSeriesColors } from './useSeriesColors';

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

export default function DashboardPage() {
  const info = useSession((s) => s.info);
  const samples = useMetrics((s) => s.samples);
  const push = useMetrics((s) => s.push);
  const [paused, setPaused] = useState(false);
  const colors = useSeriesColors();

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

  useEffect(() => {
    const d = main.data;
    if (!d) return;
    push({
      t: Date.now(),
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
  }, [main.data, push]);

  const chartData = useMemo(
    () => samples.map((s: MetricSample) => ({ ...s, time: dayjs(s.t).format('HH:mm:ss') })),
    [samples],
  );
  const last = samples[samples.length - 1];
  const d = main.data;
  const spark = (key: keyof MetricSample) => samples.slice(-30).map((s) => num(s[key]));
  const licenseLimit = num(d?.Licensing?.LicenseLimit);
  const licenseUse = pct(d?.Licensing?.LicenseUse);
  const licenseHigh = pct(d?.Licensing?.LicenseUseHigh);
  const version = info?.serverVersion?.match(/\d{4}\.\d+(?:\.\d+)?/)?.[0];

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
            <Button size="xs" variant={paused ? 'filled' : 'default'} leftSection={<IconRefresh size={14} />} onClick={() => setPaused((p) => !p)}>
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
          footer={`${formatCompact(last?.logicalRequests)} logical requests/s`}
          aside={samples.length > 1 ? <Sparkline w={110} h={44} data={spark('globalRefsPerSec')} color={colors[0]} curveType="monotone" strokeWidth={1.5} fillOpacity={0.12} /> : <IconActivity size={22} />}
        />
        <StatTile
          label="Cache efficiency"
          value={last ? formatPercent(last.cacheEfficiency, 1) : '-'}
          hint="Logical block requests satisfied from the global buffer pool"
          footer={`${formatCompact(last?.diskReads)} reads/s · ${formatCompact(last?.diskWrites)} writes/s`}
          aside={samples.length > 1 ? <Sparkline w={110} h={44} data={spark('cacheEfficiency')} color={colors[1]} curveType="monotone" strokeWidth={1.5} fillOpacity={0.12} /> : <IconDeviceFloppy size={22} />}
        />
        <StatTile
          label="Processes"
          value={formatNumber(d?.SystemUsage?.Processes)}
          hint="SystemUsage.Processes"
          icon={<IconCpu size={20} />}
          color="teal"
          footer={`${d?.SystemUsage?.BusyProcesses?.length ?? 0} busy · ${formatNumber(d?.SystemUsage?.CSPSessions)} web sessions`}
        />
        <StatTile
          label="License units"
          value={licenseUse === null ? 'unlimited' : `${licenseUse}%`}
          hint="Licensing.LicenseUse (percentage of the license limit)"
          icon={<IconLicense size={20} />}
          color={licenseUse !== null && licenseUse > 85 ? 'red' : licenseUse !== null && licenseUse > 70 ? 'yellow' : 'indigo'}
          footer={licenseLimit ? `limit ${formatNumber(licenseLimit)} · peak ${licenseHigh ?? '-'}%` : 'no license limit'}
        />
      </SimpleGrid>

      <Grid gutter="md" mb="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Global references per second
              </Text>
              <Text size="xs" c="dimmed">
                last {Math.round((samples.length * POLL_MS) / 1000)}s
              </Text>
            </Group>
            {chartData.length > 1 ? (
              <LineChart
                h={220}
                data={chartData}
                dataKey="time"
                series={[{ name: 'globalRefsPerSec', label: 'Global refs/s', color: colors[0] }]}
                curveType="monotone"
                withDots={false}
                strokeWidth={2}
                gridAxis="y"
                tickLine="none"
                withLegend={false}
                valueFormatter={(v) => formatNumber(v)}
                xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 40 }}
                yAxisProps={{ width: 56 }}
              />
            ) : (
              <Text size="sm" c="dimmed" py="xl" ta="center">
                Collecting samples…
              </Text>
            )}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                Disk I/O per second
              </Text>
              <Text size="xs" c="dimmed">
                physical block reads and writes
              </Text>
            </Group>
            {chartData.length > 1 ? (
              <AreaChart
                h={220}
                data={chartData}
                dataKey="time"
                series={[
                  { name: 'diskReads', label: 'Reads', color: colors[1] },
                  { name: 'diskWrites', label: 'Writes', color: colors[2] },
                ]}
                curveType="monotone"
                withDots={false}
                strokeWidth={2}
                fillOpacity={0.1}
                gridAxis="y"
                tickLine="none"
                withLegend
                legendProps={{ verticalAlign: 'bottom', height: 28 }}
                valueFormatter={(v) => formatNumber(v)}
                xAxisProps={{ interval: 'preserveStartEnd', minTickGap: 40 }}
                yAxisProps={{ width: 48 }}
              />
            ) : (
              <Text size="sm" c="dimmed" py="xl" ta="center">
                Collecting samples…
              </Text>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

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
                    <Badge size="sm" variant="light" color={h === 'good' ? 'teal' : h === 'warning' ? 'yellow' : 'red'} style={{ textTransform: 'none' }}>
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
                <Badge size="sm" variant="light" color={num(d?.Alerts?.ApplicationErrors) ? 'yellow' : 'teal'}>
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
                <Tooltip label={formatDateTime(d?.Status?.LastBackup)}>
                  <Text size="sm">{d?.Status?.LastBackup ? formatRelative(d.Status.LastBackup) : 'never'}</Text>
                </Tooltip>
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
                        <Text size="xs" c="dimmed" className="tabular">
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
            {d?.SystemUsage?.BusyProcesses?.length ? (
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {(d.SystemUsage.BusyProcesses as Record<string, unknown>[]).slice(0, 8).map((p, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>
                        <Text size="sm" className="mono" component={Link} to={`/processes/${p.Pid}`} c="indigo">
                          {String(p.Pid ?? '')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{String(p.Username ?? '')}</Text>
                      </Table.Td>
                      <Table.Td style={{ maxWidth: 160 }}>
                        <Text size="xs" c="dimmed" truncate>
                          {String(p.Routine ?? '')}
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
                Globals and routines (per second)
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
                      <Progress size="xs" value={Math.max(ratio, 0.5)} color={ratio > 5 ? 'red' : ratio > 1 ? 'yellow' : 'indigo'} />
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
