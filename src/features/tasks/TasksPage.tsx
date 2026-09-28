import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQueries, useQuery } from '@tanstack/react-query';
import { IconPlayerPause, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { canUse } from '@/api/privileges';
import type { TaskList } from '@/api/types';
import { confirmDanger } from '@/components/ConfirmDanger';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge, BoolBadge } from '@/components/StatusBadge';
import { Timestamp } from '@/components/Timestamp';
import { createLimiter } from '@/lib/limiter';
import { useSession } from '@/stores/session';

/**
 * A task of the list with its real state. GET /v2/tasks answers Suspended false for every task,
 * suspended ones included (IRIS 2026.2, lib/quirks.ts task-list-suspended-false), so the state
 * comes from each task's GET /v2/task/info: undefined while it is read, null when this account may
 * not read it (%Admin_Operate:U) or the read failed.
 */
type Row = Omit<TaskList[number], 'Suspended'> & { Suspended?: boolean | null };

/** At most four task reads in flight: the API has no batch read of task states. */
const infoReads = createLimiter(4);
export const taskKeys = {
  list: ['tasks', 'list'] as const,
  one: (id: string) => ['tasks', 'detail', id] as const,
  manager: ['tasks', 'manager'] as const,
  upcoming: ['tasks', 'upcoming'] as const,
  history: (id?: string) => ['tasks', 'history', id ?? 'all'] as const,
};

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Id', header: 'Id', cell: (c) => <span className="tabular">{String(c.getValue())}</span> },
  { accessorKey: 'Name', header: 'Task', cell: (c) => <b>{String(c.getValue())}</b> },
  {
    accessorKey: 'Type',
    header: 'Type',
    cell: (c) => (
      <Badge size="xs" color={c.getValue() === 'User' ? 'indigo' : 'gray'}>
        {String(c.getValue())}
      </Badge>
    ),
  },
  { accessorKey: 'Namespace', header: 'Namespace' },
  {
    accessorKey: 'Suspended',
    header: 'Suspended',
    cell: (c) => {
      const value = c.getValue() as boolean | null | undefined;
      if (value === undefined)
        return (
          <Text size="xs" c="dimmed">
            reading…
          </Text>
        );
      if (value === null)
        return (
          <Tooltip label="Read from GET /v2/task/info, which needs %Admin_Operate:U; the task list itself reports every task as active">
            <Badge size="xs" color="gray" variant="light">
              Unknown
            </Badge>
          </Tooltip>
        );
      return <BoolBadge value={value} yes="Suspended" no="Active" color={value ? 'yellow' : 'teal'} />;
    },
  },
  {
    accessorKey: 'LastFinished',
    header: 'Last finished',
    cell: (c) => <Timestamp value={c.getValue() as string} mode="relative" />,
  },
  {
    accessorKey: 'NextScheduled',
    header: 'Next run',
    cell: (c) => <Timestamp value={c.getValue() as string} />,
  },
  { accessorKey: 'Description', header: 'Description' },
];

export default function TasksPage() {
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const list = useQuery({ queryKey: taskKeys.list, queryFn: () => result(api().GET('/v2/tasks')) });
  // Each task's state from its own read (the task detail page shares the cache).
  const canReadState = canUse(info, ['%Admin_Operate:U']);
  const suspended = useQueries({
    queries: (list.data ?? []).map((task) => ({
      queryKey: [...taskKeys.one(String(task.Id)), 'info'],
      queryFn: () =>
        infoReads(() => result(api().GET('/v2/task/info', { params: { query: { id: Number(task.Id) } } }))),
      enabled: canReadState,
      // A suspend or resume invalidates the task's reads, so a minute costs nothing in accuracy
      // and spares a large instance a read per task on every visit.
      staleTime: 60_000,
      retry: false,
    })),
    combine: (results) => results.map((r) => (r.isError ? null : r.data ? !!r.data.Suspended : undefined)),
  });
  const rows = useMemo<Row[] | undefined>(
    () => list.data?.map((task, i) => ({ ...task, Suspended: canReadState ? suspended[i] : null })),
    [list.data, suspended, canReadState],
  );
  const manager = useQuery({
    queryKey: taskKeys.manager,
    queryFn: () => result(api().GET('/v2/task/manager')),
    refetchInterval: 10000,
  });
  const upcoming = useQuery({
    queryKey: taskKeys.upcoming,
    queryFn: () => result(api().GET('/v2/task/upcoming')),
  });
  const mgr = (action: 'suspend' | 'resume' | 'run') => run(api().POST(`/v2/task/manager/${action}`));
  const suspendMgr = useApiMutation(() => mgr('suspend'), { invalidate: [taskKeys.manager] });
  const resumeMgr = useApiMutation(() => mgr('resume'), { invalidate: [taskKeys.manager] });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: {
      Name: '',
      Description: '',
      TaskClass: '',
      NameSpace: 'USER',
      RunAsUser: '',
      TimePeriod: 'Daily',
      DailyStartTime: '02:00:00',
      Settings: '{}',
    },
    validate: {
      Name: (v) => (v.trim() ? null : 'Required'),
      TaskClass: (v) => (/^[%A-Za-z][\w.]*$/.test(v) ? null : 'Class name such as %SYS.Task.PurgeAudit'),
      Settings: (v) => {
        try {
          JSON.parse(v || '{}');
          return null;
        } catch {
          return 'Must be valid JSON';
        }
      },
    },
  });
  const create = useApiMutation(
    (v: typeof form.values) =>
      run(
        api().POST('/v2/task', {
          body: {
            Name: v.Name,
            Description: v.Description,
            TaskClass: v.TaskClass,
            NameSpace: v.NameSpace,
            RunAsUser: v.RunAsUser || undefined,
            TimePeriod: v.TimePeriod as
              'Daily' | 'Weekly' | 'Monthly' | 'Monthly Special' | 'Run After' | 'On Demand',
            DailyStartTime: v.DailyStartTime,
            DailyFrequency: 'Once',
            Settings: JSON.parse(v.Settings || '{}'),
          },
        }),
      ),
    {
      invalidate: [taskKeys.list, taskKeys.upcoming],
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );
  const status = manager.data?.Status;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Task Manager schedules: system maintenance tasks and your own task classes."
        privileges={['%Admin_Operate:U', '%Admin_Task:U']}
        actions={
          <>
            <RefreshControl
              screen="tasks"
              onRefresh={() => {
                list.refetch();
                upcoming.refetch();
              }}
              loading={list.isFetching}
            />
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
              New task
            </Button>
          </>
        }
      />
      <Grid gutter="md" mb="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Title order={5}>Task manager</Title>
              <StatusBadge status={status} />
            </Group>
            <Text size="sm" c="dimmed" mb="sm">
              The daemon that runs scheduled tasks. Suspending it pauses every schedule.
            </Text>
            <Group gap="xs">
              {status === 'Suspended' || status === 'Not running' ? (
                <Button
                  size="xs"
                  color="teal"
                  variant="light"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() =>
                    confirmDanger({
                      title: 'Resume the task manager',
                      message:
                        'Scheduled tasks run on their schedules again, in every namespace, from the next due time.',
                      confirmLabel: 'Resume',
                      color: 'aperture',
                      onConfirm: () => resumeMgr.mutateAsync(),
                    })
                  }
                  loading={resumeMgr.isPending}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  size="xs"
                  color="yellow"
                  variant="light"
                  leftSection={<IconPlayerPause size={14} />}
                  onClick={() =>
                    confirmDanger({
                      title: 'Suspend the task manager',
                      message:
                        'No scheduled task runs, in any namespace, until the task manager is resumed: purges, journal switches, backups and integrity checks included.',
                      confirmLabel: 'Suspend',
                      color: 'aperture',
                      onConfirm: () => suspendMgr.mutateAsync(),
                    })
                  }
                  loading={suspendMgr.isPending}
                >
                  Suspend
                </Button>
              )}
            </Group>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper p="md" h="100%">
            <Title order={5} mb="xs">
              Upcoming
            </Title>
            {upcoming.data?.length ? (
              <Stack gap={4}>
                {upcoming.data.slice(0, 6).map((t) => (
                  <Group key={`${t.Id}-${t.Datetime}`} justify="space-between" wrap="nowrap">
                    <Text
                      size="sm"
                      truncate
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/tasks/${t.Id}`)}
                    >
                      {t.Name}{' '}
                      <Text span c="dimmed" size="xs">
                        ({t.Namespace})
                      </Text>
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed" className="tabular">
                        {t.Datetime}
                      </Text>
                      {t.Suspended ? (
                        <Badge size="xs" color="yellow">
                          suspended
                        </Badge>
                      ) : null}
                    </Group>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Nothing scheduled
              </Text>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
      <DataTable
        stateKey="tasks"
        exportName="tasks"
        getRowLabel={(r) => `Open task ${r.Name ?? ''}`}
        data={rows}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(`/tasks/${r.Id}`)}
        getRowId={(r) => String(r.Id)}
        initialSorting={[{ id: 'NextScheduled', desc: false }]}
      />
      <Modal opened={opened} onClose={close} title="New task" centered size="lg">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Name" data-autofocus {...form.getInputProps('Name')} />
            <TextInput
              label="Task class"
              placeholder="%SYS.Task.PurgeAudit or MyApp.Tasks.Nightly"
              description="A subclass of %SYS.Task.Definition"
              {...form.getInputProps('TaskClass')}
            />
            <Textarea label="Description" autosize minRows={2} {...form.getInputProps('Description')} />
            <Group grow>
              <Select
                label="Namespace"
                data={info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? ['USER']}
                searchable
                {...form.getInputProps('NameSpace')}
              />
              <TextInput label="Run as user" placeholder="_SYSTEM" {...form.getInputProps('RunAsUser')} />
            </Group>
            <Group grow>
              <Select
                label="Period"
                data={['Daily', 'Weekly', 'Monthly', 'Monthly Special', 'On Demand', 'Run After']}
                {...form.getInputProps('TimePeriod')}
              />
              <TextInput label="Start time (HH:MM:SS)" {...form.getInputProps('DailyStartTime')} />
            </Group>
            <Textarea
              label="Settings (JSON, task class properties)"
              autosize
              minRows={2}
              styles={{ input: { fontFamily: 'var(--aperture-mono)' } }}
              {...form.getInputProps('Settings')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
