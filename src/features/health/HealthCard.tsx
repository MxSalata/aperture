import { Badge, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { Link } from 'react-router';
import { SEVERITY_LABEL, type Severity } from './checks';
import { useHealthCheck } from './useHealthCheck';

const COLOR: Record<Severity, string> = { critical: 'red', warning: 'yellow', advice: 'blue' };

/** The dashboard's card: counts by severity, the top three findings, and the way to the screen. */
export function HealthCard() {
  const report = useHealthCheck();
  const data = report.data;
  return (
    <Paper p="md" h="100%">
      <Group justify="space-between" mb="xs">
        <Group gap={6}>
          <IconShieldCheck size={18} stroke={1.6} aria-hidden />
          <Text fw={600} size="sm">
            Health check
          </Text>
        </Group>
        <Button component={Link} to="/health" size="compact-xs" variant="subtle">
          All findings
        </Button>
      </Group>
      {report.isPending ? (
        <Group gap="xs" role="status">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Running the checks...
          </Text>
        </Group>
      ) : report.error ? (
        <Text size="sm" c="dimmed">
          The checks could not run: {report.error instanceof Error ? report.error.message : 'unknown error'}
        </Text>
      ) : data ? (
        <Stack gap="xs">
          <Group gap="xs" wrap="wrap">
            {(['critical', 'warning', 'advice'] as Severity[]).map((sev) => (
              <Badge
                key={sev}
                size="sm"
                variant={data.counts[sev] ? 'filled' : 'light'}
                color={data.counts[sev] ? COLOR[sev] : 'gray'}
                tt="none"
              >
                {data.counts[sev]} {SEVERITY_LABEL[sev].toLowerCase()}
                {sev === 'warning' && data.counts[sev] !== 1 ? 's' : ''}
              </Badge>
            ))}
            <Text size="xs" c="dimmed">
              {data.checked} checks run{data.notChecked ? `, ${data.notChecked} not checked` : ''}
            </Text>
          </Group>
          {data.findings.length ? (
            <Stack gap={4} component="ul" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {data.findings.slice(0, 3).map((x) => (
                <li key={x.id}>
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Badge
                      size="xs"
                      variant="filled"
                      color={COLOR[x.severity]}
                      tt="none"
                      style={{ flexShrink: 0 }}
                    >
                      {SEVERITY_LABEL[x.severity]}
                    </Badge>
                    <Text size="sm" lineClamp={1}>
                      {x.title}
                    </Text>
                  </Group>
                </li>
              ))}
            </Stack>
          ) : (
            <Text size="sm">Nothing to report from the checks that ran.</Text>
          )}
        </Stack>
      ) : null}
    </Paper>
  );
}
