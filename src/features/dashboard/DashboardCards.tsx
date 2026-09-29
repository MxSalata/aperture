import { Badge, Button, Group, Paper, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconAlertTriangle, IconClock, IconDatabase, IconWorld } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { Schemas } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { Timestamp } from '@/components/Timestamp';
import { formatCompact, formatNumber } from '@/lib/format';
import { num } from './values';

/** The answer of /v2/monitor/dashboard/main, which most of these cards read. */
type MainStats = Schemas['MainDashboardStats'];

function healthColor(v: string | undefined): 'good' | 'warning' | 'critical' {
  const s = (v ?? '').toLowerCase();
  if (!s || s === 'normal' || s === 'ok') return 'good';
  if (s.includes('warn') || s.includes('attention')) return 'warning';
  return 'critical';
}

/** The instance's health figures and status (dashboard/main). */
export function SystemHealthCard({ d }: { d: MainStats | undefined }) {
  return (
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
  );
}

/** The next scheduled task runs (dashboard/main). */
export function UpcomingTasksCard({ d }: { d: MainStats | undefined }) {
  return (
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
        // Fixed layout, so a long name is cut to its column rather than widening the table past the
        // card (a cell's max-width is ignored in automatic layout); the card is narrow at most widths,
        // so the time sits under the name and the status keeps its column.
        <Table verticalSpacing={4} fz="sm" layout="fixed">
          <Table.Tbody>
            {d.UpcomingTasks.slice(0, 8).map((t, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Text size="sm" truncate title={t.Task}>
                    {t.Task}
                  </Text>
                  <Text size="xs" c="dimmed" className="tabular">
                    {t.Time}
                  </Text>
                </Table.Td>
                <Table.Td w={92} ta="right">
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
  );
}

/** The user processes executing the most commands (dashboard/main, padding removed). */
export function BusyProcessesCard({ busy }: { busy: { pid: number; commands: number }[] }) {
  return (
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
                  <Text size="sm" className="mono" component={Link} to={`/processes/${p.pid}`} c="indigo">
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
  );
}

/** Global and routine activity since startup (dashboard/globals-and-routines). */
export function GlobalsCard({ data }: { data: Schemas['GlobalsAndRoutinesStats'] | undefined }) {
  return (
    <Paper p="md" h="100%">
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">
          Globals and routines (totals since startup)
        </Text>
        <Text size="xs" c="dimmed">
          /v2/monitor/dashboard/globals-and-routines
        </Text>
      </Group>
      {data ? (
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
          {(
            [
              ['Global refs (local)', data.Globals?.RefLocal],
              ['Global updates', data.Globals?.RefUpdateLocal],
              ['Logical blocks', data.Globals?.LogicalBlocks],
              ['Block reads', data.Globals?.PhysBlockReads],
              ['Block writes', data.Globals?.PhysBlockWrites],
              ['Journal entries', data.Globals?.JrnEntries],
              ['Routine calls', data.Routines?.RtnCallsLocal],
              ['Routine commands', data.Routines?.RtnCommands],
              ['Routine loads', data.Routines?.RtnFetchLocal],
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
  );
}

/** Contention on shared structures (dashboard/system-resources). */
export function ResourceSeizesCard({ data }: { data: Schemas['SystemResourcesStats'] | undefined }) {
  return (
    <Paper p="md" h="100%">
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">
          Resource seizes
        </Text>
        <Text size="xs" c="dimmed">
          contention on shared structures
        </Text>
      </Group>
      {data ? (
        <Stack gap={6}>
          {data.slice(0, 6).map((r) => {
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
  );
}
