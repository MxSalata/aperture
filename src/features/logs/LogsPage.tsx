import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowRight } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { api, result } from '@/api/hooks';
import { metric } from '@/api/monitor';
import { canUse } from '@/api/privileges';
import { PageHeader } from '@/components/PageHeader';
import { Timestamp } from '@/components/Timestamp';
import { formatBytes, formatNumber, parseIrisDate } from '@/lib/format';
import { useHostMetrics } from '@/features/monitor/useHostMetrics';
import { useAlertLog } from '@/features/monitor/useAlertLog';
import { useActivity } from '@/stores/activity';
import { useSession } from '@/stores/session';
import { secKeys } from '@/features/security/keys';

interface CardProps {
  title: string;
  /** Where the entries come from, named for the reader who wants to verify. */
  source: string;
  to: string;
  privileges: readonly string[];
  children: ReactNode;
}

function LogCard({ title, source, to, privileges, children }: CardProps) {
  const info = useSession((s) => s.info);
  const allowed = canUse(info, privileges);
  return (
    <Paper p="md" withBorder h="100%">
      <Stack gap="xs" h="100%" justify="space-between">
        <div>
          <Group justify="space-between" align="flex-start" mb={4}>
            <Title order={5}>{title}</Title>
            {!allowed ? (
              <Badge size="xs" color="gray" variant="light">
                needs {privileges.join(' or ')}
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed" className="mono" mb="sm">
            {source}
          </Text>
          {allowed ? (
            children
          ) : (
            <Text size="sm" c="dimmed">
              Not readable with this account's privileges.
            </Text>
          )}
        </div>
        <Button
          component={Link}
          to={to}
          variant="light"
          size="xs"
          rightSection={<IconArrowRight size={14} />}
          style={{ alignSelf: 'flex-start' }}
          disabled={!allowed}
        >
          Open
        </Button>
      </Stack>
    </Paper>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: 0.3 }}>
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

function Pending({ error, children }: { error?: unknown; children: ReactNode }) {
  if (error)
    return (
      <Text size="sm" c="red">
        Unavailable: {(error as Error).message}
      </Text>
    );
  return <>{children}</>;
}

function AuditCard() {
  const enabled = useQuery({
    queryKey: secKeys.auditEnabled,
    queryFn: () => result(api().GET('/v2/security/audit/enabled')),
  });
  const events = useQuery({
    queryKey: secKeys.auditEvents,
    queryFn: () => result(api().GET('/v2/security/audit/events')),
  });
  const on = (enabled.data as { Enabled?: boolean } | undefined)?.Enabled;
  const list = events.data ?? [];
  const written = list.reduce((a, e) => a + (e.Written ?? 0), 0);
  const lost = list.reduce((a, e) => a + (e.Lost ?? 0), 0);
  const active = list.filter((e) => e.Enabled).length;
  return (
    <LogCard
      title="Audit log"
      source="POST /v2/security/audit/records → 202 · GET /v2/security/audit/events"
      to="/security/audit"
      privileges={['%Admin_Secure:U']}
    >
      <Pending error={enabled.error ?? events.error}>
        <Group gap="lg" wrap="wrap">
          <Stat
            label="Auditing"
            value={
              enabled.isPending ? (
                '…'
              ) : (
                <Badge size="sm" color={on ? 'teal' : 'red'} variant="light">
                  {on ? 'On' : 'Off'}
                </Badge>
              )
            }
          />
          <Stat label="Events enabled" value={events.isPending ? '…' : `${active} of ${list.length}`} />
          <Stat label="Records written" value={events.isPending ? '…' : formatNumber(written)} />
          <Stat
            label="Lost"
            value={
              events.isPending ? (
                '…'
              ) : lost ? (
                <Text span c="red" size="sm">
                  {formatNumber(lost)}
                </Text>
              ) : (
                '0'
              )
            }
          />
        </Group>
      </Pending>
    </LogCard>
  );
}

function JournalCard() {
  const files = useQuery({
    queryKey: ['journal', 'files'],
    queryFn: () => result(api().GET('/v2/journal/files')),
  });
  const list = (files.data ?? []) as { Name?: string; Size?: number; DataSize?: number }[];
  const current = list.length ? list[list.length - 1] : null;
  const bytes = list.reduce((a, f) => a + (f.Size ?? 0), 0);
  return (
    <LogCard
      title="Journal"
      source="GET /v2/journal/files · POST /v2/journal/file/records → 202"
      to="/journal"
      privileges={['%Admin_Operate:U', '%Admin_Journal:U']}
    >
      <Pending error={files.error}>
        <Group gap="lg" wrap="wrap">
          <Stat label="Files" value={files.isPending ? '…' : formatNumber(list.length)} />
          <Stat label="On disk" value={files.isPending ? '…' : formatBytes(bytes)} />
          <Stat
            label="Current file"
            value={files.isPending ? '…' : current?.Name ? <span className="mono">{current.Name}</span> : '-'}
          />
        </Group>
      </Pending>
    </LogCard>
  );
}

function AlertsCard() {
  // Counts come from /metrics: reading /api/monitor/alerts would consume the alerts (see useAlertLog).
  const metrics = useHostMetrics();
  const alerts = useAlertLog();
  const inLog = metrics.data ? metric(metrics.data, 'iris_system_alerts_log')?.value : undefined;
  const waiting = metrics.data ? metric(metrics.data, 'iris_system_alerts_new')?.value === 1 : undefined;
  const latest = alerts.data?.[0];
  return (
    <LogCard
      title="alerts.log"
      source="iris_system_alerts_log / _new in GET /api/monitor/metrics · read on request on the Host monitor"
      to="/monitor"
      privileges={[]}
    >
      <Pending error={metrics.error}>
        <Group gap="lg" wrap="wrap">
          <Stat label="Entries" value={metrics.isPending ? '…' : formatNumber(inLog)} />
          <Stat
            label="New since last read"
            value={
              metrics.isPending ? (
                '…'
              ) : waiting ? (
                <Text span c="orange" size="sm">
                  yes
                </Text>
              ) : waiting === false ? (
                'no'
              ) : (
                '-'
              )
            }
          />
          <Stat
            label="Latest read here"
            value={
              latest ? (
                <>
                  {latest.time ? <Timestamp value={latest.time} mode="relative" /> : null}{' '}
                  <Text span size="sm" c="dimmed">
                    {latest.severity ? `[${latest.severity}] ` : ''}
                    {latest.message.slice(0, 80)}
                  </Text>
                </>
              ) : (
                'not read yet'
              )
            }
          />
        </Group>
      </Pending>
    </LogCard>
  );
}

function TaskHistoryCard() {
  const history = useQuery({
    queryKey: ['tasks', 'history', 'all'],
    queryFn: () => result(api().GET('/v2/task/history')),
  });
  // The 24-hour cutoff is fixed when the card mounts; the query refetches, the clock does not need to.
  const [openedAt] = useState(() => Date.now());
  const { recent, failed, latest } = useMemo(() => {
    const rows = (history.data ?? []) as { LastStart?: string; Status?: string; Name?: string }[];
    const dayAgo = openedAt - 86_400_000;
    const recent = rows.filter((r) => (parseIrisDate(r.LastStart)?.valueOf() ?? 0) >= dayAgo);
    return {
      recent,
      failed: recent.filter((r) => r.Status && r.Status !== 'Success'),
      latest: [...rows].sort((a, b) => (b.LastStart ?? '').localeCompare(a.LastStart ?? ''))[0],
    };
  }, [history.data, openedAt]);
  return (
    <LogCard
      title="Task history"
      source="GET /v2/task/history"
      to="/tasks"
      privileges={['%Admin_Operate:U', '%Admin_Task:U']}
    >
      <Pending error={history.error}>
        <Group gap="lg" wrap="wrap">
          <Stat label="Runs, last 24 h" value={history.isPending ? '…' : formatNumber(recent.length)} />
          <Stat
            label="Not successful"
            value={
              history.isPending ? (
                '…'
              ) : failed.length ? (
                <Text span c="red" size="sm">
                  {formatNumber(failed.length)}
                </Text>
              ) : (
                '0'
              )
            }
          />
          <Stat
            label="Latest run"
            value={
              history.isPending ? (
                '…'
              ) : latest ? (
                <>
                  {latest.Name} · <Timestamp value={latest.LastStart} mode="relative" />
                </>
              ) : (
                '-'
              )
            }
          />
        </Group>
      </Pending>
    </LogCard>
  );
}

function ActivityCard() {
  const entries = useActivity(useShallow((s) => s.entries));
  const last = entries[0];
  return (
    <LogCard
      title="Changes from this tab"
      source="recorded by the API client middleware"
      to="/activity"
      privileges={[]}
    >
      <Group gap="lg" wrap="wrap">
        <Stat label="Changes" value={formatNumber(entries.length)} />
        <Stat
          label="Last"
          value={
            last ? (
              <>
                <span className="mono">
                  {last.method} {last.path}
                </span>{' '}
                · <Timestamp value={new Date(last.at).toISOString()} mode="relative" />
              </>
            ) : (
              'none yet'
            )
          }
        />
      </Group>
    </LogCard>
  );
}

/**
 * The contest's sixth area, "all the logs": one screen listing every log the SysAdmin API
 * and the native monitor service expose, with a count and the latest entry, and an honest
 * note about the ones no API route reaches.
 */
export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Logs"
        description="Every log reachable through the API, in one place: the audit database, journal records, alerts.log, task history and the changes this tab sent."
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <AuditCard />
        <JournalCard />
        <AlertsCard />
        <TaskHistoryCard />
        <ActivityCard />
        <Paper p="md" withBorder h="100%">
          <Title order={5} mb={4}>
            Not reachable through the API
          </Title>
          <Text size="sm" c="dimmed">
            <span className="mono">messages.log</span>, the application error log (
            <span className="mono">^ERRORS</span>) and the SQL diagnostics log have no route in the SysAdmin
            API v2. Read them on the host under the instance's <span className="mono">mgr/</span> directory or
            in the classic portal; Aperture does not add server-side code to fetch them.
          </Text>
        </Paper>
      </SimpleGrid>
    </>
  );
}
