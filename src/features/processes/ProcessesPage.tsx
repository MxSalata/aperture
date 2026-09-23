import { Button, Group, Modal, Stack, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { IconBroadcast, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { useLiveQuery } from '@/api/useLiveQuery';
import type { ProcessList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { elapsedSeconds, formatCompact } from '@/lib/format';

type Row = ProcessList[number];
export const procKeys = { list: ['processes'] as const, one: (pid: string) => ['processes', pid] as const };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Pid', header: 'PID', cell: (c) => <span className="mono">{String(c.getValue())}</span> },
  { accessorKey: 'Job', header: 'Job', cell: (c) => <span className="tabular">{String(c.getValue())}</span> },
  {
    accessorKey: 'Username',
    header: 'User',
    cell: (c) => (c.getValue() ? <b>{String(c.getValue())}</b> : <span className="muted">system</span>),
  },
  { accessorKey: 'Nspace', header: 'Namespace' },
  {
    accessorKey: 'Routine',
    header: 'Routine',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'State', header: 'State', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  {
    accessorKey: 'Device',
    header: 'Device',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'ClientName', header: 'Client' },
  { accessorKey: 'IPAddress', header: 'IP' },
  {
    // IRIS 2026.2 spells it EXEname; the spec (and so the generated type) says EXEName.
    id: 'Executable',
    accessorFn: (r) => (r as { EXEname?: string }).EXEname ?? r.EXEName ?? '',
    header: 'Executable',
  },
  {
    accessorKey: 'Commands',
    header: 'Commands',
    cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'Globals',
    header: 'Global refs',
    cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'CPUTime',
    header: 'CPU (ms)',
    cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'ElapsedTime',
    header: 'Elapsed',
    // "hh:mm:ss", hours unpadded past 99: sort by the duration, not the text.
    sortingFn: (a, b) => elapsedSeconds(a.original.ElapsedTime) - elapsedSeconds(b.original.ElapsedTime),
  },
  { accessorKey: 'OSUserName', header: 'OS user' },
];

export default function ProcessesPage() {
  const navigate = useNavigate();
  const { query: list, control: liveControl } = useLiveQuery(
    { queryKey: procKeys.list, queryFn: () => result(api().GET('/v2/processes')) },
    { defaultLive: true },
  );
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: { Message: '' },
    validate: { Message: (v) => (v.trim() ? null : 'Required') },
  });
  const broadcast = useApiMutation(
    async (v: typeof form.values) => {
      // Read the process table at send time: the table on screen can be seconds old, and a
      // process id that ended in between may already belong to someone else.
      const now = await result(api().GET('/v2/processes'));
      return run(
        api().POST('/v2/process/broadcast', {
          body: {
            Message: v.Message,
            PidList: now.filter((p) => p.CanReceiveBroadcast).map((p) => p.Pid),
          },
        }),
      );
    },
    {
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );
  const users = new Set((list.data ?? []).filter((p) => p.Username).map((p) => p.Username));

  return (
    <>
      <PageHeader
        title="Processes"
        description="Every IRIS process: system daemons, web gateway workers, terminals and client connections."
        privileges={['%Admin_Operate:U']}
        actions={
          <>
            {liveControl}
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => list.refetch()}
              loading={list.isFetching}
            >
              Refresh
            </Button>
            <Button size="xs" variant="light" leftSection={<IconBroadcast size={14} />} onClick={open}>
              Broadcast message
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="processes"
        exportName="processes"
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(`/processes/${r.Pid}`)}
        getRowLabel={(r) => `Open process ${r.Pid}${r.Username ? ` of ${r.Username}` : ''}`}
        getRowId={(r) => String(r.Pid)}
        initialSorting={[{ id: 'Pid', desc: false }]}
        pageSize={50}
        dense
        toolbar={
          <span className="muted" style={{ fontSize: 12 }}>
            {list.data?.length ?? 0} processes · {users.size} distinct users
          </span>
        }
      />
      <Modal
        opened={opened}
        onClose={close}
        title="Broadcast a message to all interactive processes"
        centered
      >
        <form onSubmit={form.onSubmit((v) => broadcast.mutate(v))}>
          <Stack gap="sm">
            <Textarea
              label="Message"
              placeholder="System going down for maintenance in 10 minutes."
              autosize
              minRows={3}
              data-autofocus
              {...form.getInputProps('Message')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={broadcast.isPending}>
                Send
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
