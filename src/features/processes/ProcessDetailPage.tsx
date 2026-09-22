import { Badge, Button, Grid, Group, Paper, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconPlayerPause, IconPlayerPlay, IconRefresh, IconSkull } from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, renderValue } from '@/components/KeyValueList';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { confirmDanger } from '@/components/ConfirmDanger';
import { formatBytes, formatNumber } from '@/lib/format';
import { redactDeep } from '@/lib/redact';
import { procKeys } from './ProcessesPage';

export default function ProcessDetailPage() {
  const { pid = '' } = useParams();
  const navigate = useNavigate();
  const id = Number(pid);
  const q = useQuery({
    queryKey: procKeys.one(pid),
    queryFn: () => result(api().GET('/v2/process', { params: { query: { id } } })),
    refetchInterval: 5000,
  });
  const params = { params: { query: { id } } } as const;
  const invalidate = [procKeys.list, procKeys.one(pid)];
  const suspend = useApiMutation(() => run(api().POST('/v2/process/suspend', params)), { invalidate });
  const resume = useApiMutation(() => run(api().POST('/v2/process/resume', params)), { invalidate });
  const terminate = useApiMutation(() => run(api().POST('/v2/process/terminate', params)), {
    invalidate,
    onSuccess: () => navigate('/processes'),
  });
  const p = q.data;
  const suspended = p?.State === 'SUSP';

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/processes"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Processes
        </Button>
      </Group>
      <PageHeader
        title={
          <Group gap="sm">
            <span>Process {pid}</span>
            {p ? <StatusBadge status={p.State} /> : null}
            {p?.InTransaction ? <Badge color="orange">in transaction</Badge> : null}
          </Group>
        }
        description={p ? `${p.UserName || 'system'} · ${p.NameSpace} · ${p.Routine || '-'}` : undefined}
        privileges={['%Admin_Operate:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => q.refetch()}
              loading={q.isFetching}
            >
              Refresh
            </Button>
            {suspended ? (
              <Button
                size="xs"
                variant="light"
                color="teal"
                leftSection={<IconPlayerPlay size={14} />}
                onClick={() => resume.mutate()}
                loading={resume.isPending}
              >
                Resume
              </Button>
            ) : (
              <Button
                size="xs"
                variant="light"
                color="yellow"
                leftSection={<IconPlayerPause size={14} />}
                disabled={p?.CanBeSuspended === false}
                onClick={() => suspend.mutate()}
                loading={suspend.isPending}
              >
                Suspend
              </Button>
            )}
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconSkull size={14} />}
              disabled={p?.CanBeTerminated === false}
              onClick={() =>
                confirmDanger({
                  title: 'Terminate process',
                  message: (
                    <>
                      Terminate process <b>{pid}</b> ({p?.UserName || 'system'})? Open transactions are rolled
                      back.
                    </>
                  ),
                  confirmLabel: 'Terminate',
                  onConfirm: () => terminate.mutateAsync(),
                })
              }
            >
              Terminate
            </Button>
          </>
        }
      />
      {q.isError ? <ErrorAlert error={q.error} onRetry={() => q.refetch()} /> : null}
      {p ? (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Paper p="md" mb="md">
              <Title order={5} mb="xs">
                Identity
              </Title>
              <KeyValueList
                cols={3}
                items={[
                  { label: 'PID', value: <span className="mono">{p.Pid}</span> },
                  { label: 'Job number', value: formatNumber(p.JobNumber) },
                  { label: 'Job type', value: formatNumber(p.JobType) },
                  { label: 'User', value: p.UserName || 'system' },
                  { label: 'OS user', value: p.OSUserName || '-' },
                  { label: 'Namespace', value: p.NameSpace },
                  { label: 'Routine', value: <span className="mono">{p.Routine || '-'}</span> },
                  {
                    label: 'Location',
                    value: <span className="mono">{p.CurrentLineAndRoutine || p.Location || '-'}</span>,
                  },
                  { label: 'Started (UTC)', value: p.StartTimeUTC },
                  {
                    label: 'Parent PID',
                    value: p.ParentPid ? <Link to={`/processes/${p.ParentPid}`}>{p.ParentPid}</Link> : '-',
                  },
                  { label: 'Priority', value: formatNumber(p.Priority) },
                  { label: 'License user id', value: p.LicenseUserId || '-' },
                ]}
              />
            </Paper>
            <Paper p="md" mb="md">
              <Title order={5} mb="xs">
                Client
              </Title>
              <KeyValueList
                cols={3}
                items={[
                  { label: 'Client node', value: p.ClientNodeName || '-' },
                  { label: 'Client IP', value: p.ClientIPAddress || '-' },
                  { label: 'Executable', value: p.ClientExecutableName || '-' },
                  {
                    label: 'Principal device',
                    value: <span className="mono">{p.PrincipalDevice || '-'}</span>,
                  },
                  { label: 'Current device', value: <span className="mono">{p.CurrentDevice || '-'}</span> },
                  { label: 'Open devices', value: renderValue(p.OpenDevices) },
                  { label: 'CSP session', value: p.CSPSessionID || '-' },
                  { label: 'Startup client IP', value: p.StartupClientIPAddress || '-' },
                ]}
              />
            </Paper>
            <Paper p="md" mb="md">
              <Title order={5} mb="xs">
                Activity
              </Title>
              <KeyValueList
                cols={3}
                items={[
                  { label: 'Commands executed', value: formatNumber(p.CommandsExecuted) },
                  { label: 'Global references', value: formatNumber(p.GlobalReferences) },
                  { label: 'Global updates', value: formatNumber(p.GlobalUpdates) },
                  { label: 'Disk reads', value: formatNumber(p.GlobalDiskReads) },
                  { label: 'Data block writes', value: formatNumber(p.DataBlockWrites) },
                  { label: 'Journal entries', value: formatNumber(p.JournalEntries) },
                  { label: 'CPU time', value: `${formatNumber(p.CPUTime)} ms` },
                  {
                    label: 'Last global reference',
                    value: <span className="mono">{p.LastGlobalReference || '-'}</span>,
                  },
                  { label: 'In transaction', value: renderValue(!!p.InTransaction) },
                  { label: 'Private global blocks', value: formatNumber(p.PrivateGlobalBlockCount) },
                  {
                    label: 'Memory used / peak / allocated',
                    value: `${formatBytes((p.MemoryUsed ?? 0) * 1024)} / ${formatBytes((p.MemoryPeak ?? 0) * 1024)} / ${formatBytes((p.MemoryAllocated ?? 0) * 1024)}`,
                  },
                ]}
              />
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Paper p="md" mb="md">
              <Title order={5} mb="xs">
                Roles
              </Title>
              <KeyValueList
                cols={1}
                items={[
                  { label: 'Roles', value: renderValue(p.Roles) },
                  { label: 'Login roles', value: renderValue(p.LoginRoles) },
                  { label: 'Escalated roles', value: renderValue(p.EscalatedRoles) },
                ]}
              />
            </Paper>
            {p.Variables?.length ? (
              <Paper p="md" mb="md">
                <Title order={5} mb="xs">
                  Variables
                </Title>
                <Table fz="sm" verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Value</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(redactDeep(p.Variables).value as { Name?: string; Value?: string }[]).map((v, i) => (
                      <Table.Tr key={i}>
                        <Table.Td className="mono">{v.Name}</Table.Td>
                        <Table.Td className="mono">{v.Value}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            ) : null}
            <Paper p="md">
              <JsonViewer value={p} />
            </Paper>
          </Grid.Col>
        </Grid>
      ) : q.isPending ? (
        <Text c="dimmed" size="sm">
          Loading…
        </Text>
      ) : null}
    </>
  );
}
