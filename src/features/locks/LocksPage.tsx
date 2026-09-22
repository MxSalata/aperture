import { ActionIcon, Button, Checkbox, Group, Text, Tooltip } from '@mantine/core';
import { IconRefresh, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { useLiveQuery } from '@/api/useLiveQuery';
import type { LockList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { confirmDanger } from '@/components/ConfirmDanger';

type Row = LockList[number];

export default function LocksPage() {
  const [checkTxn, setCheckTxn] = useState(true);
  const { query: list, control: liveControl } = useLiveQuery({
    queryKey: ['locks'],
    queryFn: () => result(api().GET('/v2/locks')),
  });
  const del = useApiMutation(
    (id: string) =>
      run(api().DELETE('/v2/lock', { params: { query: { id, checkTxn: checkTxn ? 1 : 0 } } }), 'DELETE'),
    { invalidate: [['locks']] },
  );

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: 'Pid',
      header: 'PID',
      cell: (c) => (
        <Link to={`/processes/${c.getValue()}`} className="mono" onClick={stop}>
          {String(c.getValue())}
        </Link>
      ),
    },
    {
      accessorKey: 'Reference',
      header: 'Reference',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    { accessorKey: 'ModeCount', header: 'Mode' },
    {
      accessorKey: 'Directory',
      header: 'Database',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      accessorKey: 'RoutineInfo',
      header: 'Routine',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    { accessorKey: 'OSUserName', header: 'OS user' },
    { accessorKey: 'System', header: 'System' },
    {
      accessorKey: 'RemoteOwner',
      header: 'Remote',
      cell: (c) => <BoolBadge value={c.getValue() as boolean} />,
    },
    {
      accessorKey: 'Removable',
      header: 'Removable',
      cell: (c) => <BoolBadge value={c.getValue() as boolean} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Tooltip label={row.original.Removable && row.original.DeleteID ? 'Remove lock' : 'Not removable'}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            disabled={!row.original.Removable || !row.original.DeleteID}
            aria-label="Remove lock"
            onClick={(e) => {
              stop(e);
              confirmDanger({
                title: 'Remove lock',
                message: (
                  <>
                    Remove the lock on <code>{row.original.Reference}</code> held by process{' '}
                    {row.original.Pid}? The owning process may fail with an error.
                  </>
                ),
                confirmLabel: 'Remove',
                onConfirm: () => del.mutateAsync(row.original.DeleteID!),
              });
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Locks"
        description="The lock table. Removing a lock owned by a process inside a transaction is refused unless transaction checking is turned off."
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
          </>
        }
      />
      <DataTable
        stateKey="locks"
        exportName="locks"
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        getRowId={(r) => r.DeleteID ?? `${r.Pid}-${r.Reference}`}
        dense
        toolbar={
          <Group gap="xs">
            <Checkbox
              size="xs"
              label="Check transactions before removing (checkTxn)"
              checked={checkTxn}
              onChange={(e) => setCheckTxn(e.currentTarget.checked)}
            />
            <Text size="xs" c="dimmed">
              {list.data?.length ?? 0} locks
            </Text>
          </Group>
        }
        emptyMessage="The lock table is empty"
      />
    </>
  );
}
