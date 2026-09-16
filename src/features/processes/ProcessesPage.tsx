import { Button, Group, Modal, Stack, Switch, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconBroadcast, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { ProcessList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCompact } from '@/lib/format';

type Row = ProcessList[number];
export const procKeys = { list: ['processes'] as const, one: (pid: string) => ['processes', pid] as const };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Pid', header: 'PID', cell: (c) => <span className="mono">{String(c.getValue())}</span> },
  { accessorKey: 'Job', header: 'Job', cell: (c) => <span className="tabular">{String(c.getValue())}</span> },
  { accessorKey: 'Username', header: 'User', cell: (c) => (c.getValue() ? <b>{String(c.getValue())}</b> : <span style={{ opacity: 0.5 }}>system</span>) },
  { accessorKey: 'Nspace', header: 'Namespace' },
  { accessorKey: 'Routine', header: 'Routine', cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span> },
  { accessorKey: 'State', header: 'State', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  { accessorKey: 'Device', header: 'Device', cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span> },
  { accessorKey: 'ClientName', header: 'Client' },
  { accessorKey: 'IPAddress', header: 'IP' },
  { accessorKey: 'EXEName', header: 'Executable' },
  { accessorKey: 'Commands', header: 'Commands', cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span> },
  { accessorKey: 'Globals', header: 'Global refs', cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span> },
  { accessorKey: 'CPUTime', header: 'CPU (ms)', cell: (c) => <span className="tabular">{formatCompact(c.getValue() as number)}</span> },
  { accessorKey: 'ElapsedTime', header: 'Elapsed' },
  { accessorKey: 'OSUserName', header: 'OS user' },
];

export default function ProcessesPage() {
  const navigate = useNavigate();
  const [live, setLive] = useState(true);
  const list = useQuery({ queryKey: procKeys.list, queryFn: () => result(api().GET('/v2/processes')), refetchInterval: live ? 5000 : false });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({ initialValues: { Message: '' }, validate: { Message: (v) => (v.trim() ? null : 'Required') } });
  const broadcast = useApiMutation((v: typeof form.values) => run(api().POST('/v2/process/broadcast', { body: { Message: v.Message, PidList: (list.data ?? []).filter((p) => p.CanReceiveBroadcast).map((p) => p.Pid) } as never })), { onSuccess: () => { close(); form.reset(); } });
  const users = new Set((list.data ?? []).filter((p) => p.Username).map((p) => p.Username));

  return (
    <>
      <PageHeader
        title="Processes"
        description="Every IRIS process: system daemons, web gateway workers, terminals and client connections."
        privileges={['%Admin_Operate:U']}
        actions={
          <>
            <Switch size="xs" label="Live (5s)" checked={live} onChange={(e) => setLive(e.currentTarget.checked)} />
            <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => list.refetch()} loading={list.isFetching}>Refresh</Button>
            <Button size="xs" variant="light" leftSection={<IconBroadcast size={14} />} onClick={open}>Broadcast message</Button>
          </>
        }
      />
      <DataTable
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(`/processes/${r.Pid}`)}
        getRowId={(r) => String(r.Pid)}
        initialSorting={[{ id: 'Pid', desc: false }]}
        pageSize={50}
        dense
        toolbar={<span style={{ fontSize: 12, opacity: 0.7 }}>{list.data?.length ?? 0} processes · {users.size} distinct users</span>}
      />
      <Modal opened={opened} onClose={close} title="Broadcast a message to all interactive processes" centered>
        <form onSubmit={form.onSubmit((v) => broadcast.mutate(v))}>
          <Stack gap="sm">
            <Textarea label="Message" placeholder="System going down for maintenance in 10 minutes." autosize minRows={3} data-autofocus {...form.getInputProps('Message')} />
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={broadcast.isPending}>Send</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
