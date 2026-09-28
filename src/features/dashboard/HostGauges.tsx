import { Button, Group, Paper, RingProgress, SimpleGrid, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { metric } from '@/api/monitor';
import { describeError } from '@/lib/errors';
import { formatPercent } from '@/lib/format';
import type { useHostMetrics } from '@/features/monitor/useHostMetrics';

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

/** The host's CPU, memory and fullest database disk as rings, from /api/monitor. */
export function HostGauges({ host }: { host: ReturnType<typeof useHostMetrics> }) {
  const cpu = host.data ? metric(host.data, 'iris_cpu_usage')?.value : undefined;
  const mem = host.data ? metric(host.data, 'iris_phys_mem_percent_used')?.value : undefined;
  const diskFull = host.data
    ? host.data.filter((s) => s.name === 'iris_disk_percent_full').reduce((a, s) => Math.max(a, s.value), 0)
    : undefined;
  return (
    <>
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
    </>
  );
}
