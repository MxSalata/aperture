import { ActionIcon, Button, Switch, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { WebSessionList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { confirmDanger } from '@/components/ConfirmDanger';
import { formatDateTime } from '@/lib/format';

type Row = WebSessionList[number];

export default function WebSessionsPage() {
  const [live, setLive] = useState(false);
  const list = useQuery({ queryKey: ['web-sessions'], queryFn: () => result(api().GET('/v2/web-sessions')), refetchInterval: live ? 5000 : false });
  const end = useApiMutation((id: string) => run(api().DELETE('/v2/web-session', { params: { query: { id } } }), 'DELETE'), { invalidate: [['web-sessions']] });
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'ID', header: 'Session', cell: (c) => <span className="mono">{String(c.getValue())}</span> },
    { accessorKey: 'Username', header: 'User', cell: (c) => <b>{String(c.getValue() ?? '')}</b> },
    { accessorKey: 'Application', header: 'Application', cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span> },
    { accessorKey: 'LicenseId', header: 'License id' },
    { accessorKey: 'Timeout', header: 'Expires', cell: (c) => formatDateTime(c.getValue() as string) },
    { accessorKey: 'Preserve', header: 'Preserve', cell: (c) => <BoolBadge value={!!c.getValue()} /> },
    { accessorKey: 'SesProcessId', header: 'Process' },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (
      <Tooltip label={row.original.AllowEndSession ? 'End session' : 'Cannot end this session'}>
        <ActionIcon size="sm" variant="subtle" color="red" disabled={!row.original.AllowEndSession} aria-label="End session" onClick={(e) => { stop(e); confirmDanger({ title: 'End web session', message: <>End session <code>{row.original.ID}</code> of {row.original.Username}?</>, confirmLabel: 'End session', onConfirm: () => end.mutateAsync(row.original.ID ?? '') }); }}><IconX size={14} /></ActionIcon>
      </Tooltip>
    ) },
  ];
  return (
    <>
      <PageHeader title="Web sessions" description="Active CSP and REST sessions and the license units they hold." privileges={['%Admin_Operate:U']}
        actions={<><Switch size="xs" label="Live (5s)" checked={live} onChange={(e) => setLive(e.currentTarget.checked)} /><Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => list.refetch()} loading={list.isFetching}>Refresh</Button></>} />
      <DataTable data={list.data} columns={columns} loading={list.isPending} error={list.error} getRowId={(r) => r.ID ?? ''} dense emptyMessage="No active web sessions" />
    </>
  );
}
