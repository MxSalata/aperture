import { Alert, Button, Grid, Group, Menu, Modal, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronDown,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { formatDateTime } from '@/lib/format';
import { taskKeys } from './TasksPage';

type HistoryRow = Record<string, unknown>;
const historyColumns: ColumnDef<HistoryRow, unknown>[] = [
  { accessorKey: 'LastStart', header: 'Started', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'Completed', header: 'Completed', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'Status', header: 'Status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  { accessorKey: 'Result', header: 'Result' },
  { accessorKey: 'Username', header: 'User' },
  {
    accessorKey: 'Pid',
    header: 'PID',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
];

export default function TaskDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tid = Number(id);
  const task = useQuery({
    queryKey: taskKeys.one(id),
    queryFn: () => result(api().GET('/v2/task', { params: { query: { id: tid } } })),
  });
  const info = useQuery({
    queryKey: [...taskKeys.one(id), 'info'],
    queryFn: () => result(api().GET('/v2/task/info', { params: { query: { id: tid } } })),
    refetchInterval: 10000,
  });
  const history = useQuery({
    queryKey: taskKeys.history(id),
    queryFn: () => result(api().GET('/v2/task/history', { params: { query: { taskId: tid } } })),
  });
  const params = { params: { query: { id: tid } } } as const;
  const invalidate = [taskKeys.list, taskKeys.one(id), taskKeys.upcoming, taskKeys.history(id)];
  const runNow = useApiMutation(
    () => run(api().POST('/v2/task/run', { ...params, body: { RunNow: true } })),
    { invalidate },
  );
  const runAt = useApiMutation(
    (Datetime: string) => run(api().POST('/v2/task/run', { ...params, body: { RunNow: false, Datetime } })),
    { invalidate, onSuccess: () => closeAt() },
  );
  // A suspend or resume is only as real as what the server reports afterwards: re-read the
  // task and keep a note when the read-back disagrees with the accepted request (on IRIS
  // 2026.2 the task list can lag behind %SYS.Task.Suspended; see lib/quirks.ts).
  const qc = useQueryClient();
  const [lastChange, setLastChange] = useState<{
    expected: boolean;
    at: number;
    listAgrees: boolean;
  } | null>(null);
  const verify = async (expected: boolean) => {
    // Both readings: the task object (/v2/task/info) and the row in the task list (/v2/tasks).
    // On IRIS 2026.2 the object reflects a suspend at once and the list does not (CI-confirmed).
    const [, list] = await Promise.all([
      info.refetch(),
      qc.fetchQuery({ queryKey: taskKeys.list, queryFn: () => result(api().GET('/v2/tasks')), staleTime: 0 }),
    ]);
    const row = list.find((x) => x.Id === tid);
    setLastChange({ expected, at: Date.now(), listAgrees: !row || !!row.Suspended === expected });
  };
  // Shown only while the task object itself still disagrees with the accepted request.
  const lag = lastChange && info.data && !!info.data.Suspended !== lastChange.expected ? lastChange : null;
  // The object agrees but the list has not caught up: the Tasks screen shows the old state for a while.
  const listLag = lastChange && !lag && !lastChange.listAgrees ? lastChange : null;
  // IRIS 2026.2 answers 415 to an operation that declares a body when none is sent, even
  // when every field is optional (lib/quirks.ts, optional-body-415): send an empty object.
  const suspend = useApiMutation(() => run(api().POST('/v2/task/suspend', { ...params, body: {} })), {
    invalidate,
    onSuccess: () => void verify(true),
  });
  const resume = useApiMutation(() => run(api().POST('/v2/task/resume', params)), {
    invalidate,
    onSuccess: () => void verify(false),
  });
  const remove = useApiMutation(() => run(api().DELETE('/v2/task', params), 'DELETE'), {
    invalidate: [taskKeys.list],
    onSuccess: () => navigate('/tasks'),
  });
  const [atOpen, { open: openAt, close: closeAt }] = useDisclosure(false);
  const atForm = useForm({
    initialValues: { Datetime: '' },
    validate: {
      Datetime: (v) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v) ? null : 'Use YYYY-MM-DD HH:MM:SS',
    },
  });
  const t = task.data;
  const i = info.data;

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/tasks"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Tasks
        </Button>
      </Group>
      <PageHeader
        title={
          <Group gap="sm">
            <span>{t?.Name ?? `Task ${id}`}</span>
            {i ? <StatusBadge status={i.Suspended ? 'Suspended' : i.Status} /> : null}
          </Group>
        }
        description={t?.Description}
        privileges={['%Admin_Operate:U', '%Admin_Task:U']}
        actions={
          <>
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => runNow.mutate()}
              loading={runNow.isPending}
            >
              Run now
            </Button>
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button size="xs" variant="default" rightSection={<IconChevronDown size={14} />}>
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={openAt}>Run at a specific time…</Menu.Item>
                {i?.Suspended ? (
                  <Menu.Item onClick={() => resume.mutate()}>Resume schedule</Menu.Item>
                ) : (
                  <Menu.Item onClick={() => suspend.mutate()}>Suspend schedule</Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() =>
                    confirmDanger({
                      title: 'Delete task',
                      message: (
                        <>
                          Delete task <b>{t?.Name}</b>?
                        </>
                      ),
                      confirmLabel: 'Delete',
                      onConfirm: () => remove.mutateAsync(),
                    })
                  }
                >
                  Delete…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        }
      />
      {task.isError ? <ErrorAlert error={task.error} onRetry={() => task.refetch()} /> : null}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Status
            </Title>
            {lag ? (
              <Alert
                color="yellow"
                variant="light"
                icon={<IconAlertTriangle size={16} />}
                title={`The ${lag.expected ? 'suspend' : 'resume'} was accepted, but IRIS still reports the task as ${lag.expected ? 'active' : 'suspended'}`}
                mb="sm"
              >
                <Text size="sm">
                  GET /v2/task/info re-read at {formatDateTime(lag.at)} disagrees with the request. On IRIS
                  2026.2 the task list can lag behind the task object. This page re-reads every 10 seconds and
                  shows what the server reports, never what was requested.
                </Text>
              </Alert>
            ) : null}
            {listLag ? (
              <Alert
                color="blue"
                variant="light"
                title="Confirmed by /v2/task/info; the task list has not caught up"
                withCloseButton
                onClose={() => setLastChange(null)}
                mb="sm"
              >
                <Text size="sm">
                  GET /v2/tasks still reports this task as {listLag.expected ? 'active' : 'suspended'}. On
                  IRIS 2026.2 the list lags behind the task object after a suspend or resume, so the Tasks
                  screen may show the old state for a while. Recorded as quirk task-suspended-lag.
                </Text>
              </Alert>
            ) : null}
            {i ? (
              <KeyValueList
                cols={3}
                items={[
                  { label: 'Type', value: i.Type },
                  { label: 'Status', value: <StatusBadge status={i.Status} /> },
                  { label: 'Suspended', value: i.Suspended ? 'Yes' : 'No' },
                  { label: 'Last started', value: formatDateTime(i.LastStarted) },
                  { label: 'Last finished', value: formatDateTime(i.LastFinished) },
                  { label: 'Next scheduled', value: formatDateTime(i.NextScheduled) },
                  {
                    label: 'Last error',
                    value: i.Error ? (
                      <Text size="sm" c="red">
                        {i.Error}
                      </Text>
                    ) : (
                      '-'
                    ),
                  },
                ]}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Definition
            </Title>
            {t ? (
              <KeyValueList
                cols={3}
                items={objectToItems(t as Record<string, unknown>, {
                  omit: ['Settings', 'Description', 'Name'],
                })}
              />
            ) : null}
            {t?.Settings && Object.keys(t.Settings).length ? (
              <Stack gap={4} mt="sm">
                <Text size="xs" c="dimmed" fw={500} tt="uppercase">
                  Task settings
                </Text>
                <KeyValueList cols={3} items={objectToItems(t.Settings as Record<string, unknown>)} />
              </Stack>
            ) : null}
          </Paper>
          <Paper p="md">
            <Title order={5} mb="xs">
              History
            </Title>
            <DataTable
              data={(history.data ?? []) as HistoryRow[]}
              columns={historyColumns}
              loading={history.isPending}
              error={history.error}
              initialSorting={[{ id: 'LastStart', desc: true }]}
              dense
              searchable={false}
              hideColumnMenu
              emptyMessage="No history for this task"
            />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="md">
            <JsonViewer value={{ task: t, info: i }} maxHeight={700} />
          </Paper>
        </Grid.Col>
      </Grid>
      <Modal opened={atOpen} onClose={closeAt} title="Run once at" centered>
        <form onSubmit={atForm.onSubmit((v) => runAt.mutate(v.Datetime))}>
          <Stack gap="sm">
            <TextInput
              label="Date and time"
              placeholder="2026-12-31 23:59:59"
              data-autofocus
              {...atForm.getInputProps('Datetime')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeAt}>
                Cancel
              </Button>
              <Button type="submit" loading={runAt.isPending}>
                Schedule
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
