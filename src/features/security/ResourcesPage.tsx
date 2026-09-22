import { ActionIcon, Button, Group, Modal, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPencil, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { ResourceList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { secKeys } from './keys';

type Row = ResourceList[number];
const PERMS = [{ value: '', label: 'none' }, { value: 'R', label: 'R' }, { value: 'W', label: 'W' }, { value: 'U', label: 'U' }, { value: 'RW', label: 'RW' }, { value: 'RWU', label: 'RWU' }];

export default function ResourcesPage() {
  const list = useQuery({ queryKey: secKeys.resources, queryFn: () => result(api().GET('/v2/security/resources')) });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [before, setBefore] = useState<Record<string, unknown> | undefined>(undefined);
  const form = useForm({ initialValues: { Name: '', Description: '', PublicPermission: '' }, validate: { Name: (v) => (/^[A-Za-z%][\w.-]*$/.test(v) ? null : 'Invalid resource name') } });
  const save = useApiMutation((v: typeof form.values) => run(api().PUT('/v2/security/resource', { params: { query: { name: v.Name } }, body: { Description: v.Description, PublicPermission: v.PublicPermission } }), 'PUT'), { invalidate: [secKeys.resources], onSuccess: () => { close(); form.reset(); setEditing(null); } });
  const remove = useApiMutation((name: string) => run(api().DELETE('/v2/security/resource', { params: { query: { name } } }), 'DELETE'), { invalidate: [secKeys.resources] });

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Name', header: 'Resource', cell: (c) => <b className="mono">{String(c.getValue())}</b> },
    { accessorKey: 'Description', header: 'Description' },
    { accessorKey: 'ResourceType', header: 'Type' },
    { accessorKey: 'PublicPermission', header: 'Public permission', cell: (c) => <span className="mono">{String(c.getValue() || '-')}</span> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (
      <Group gap={2} wrap="nowrap">
        <Tooltip label="Edit"><ActionIcon size="sm" variant="subtle" aria-label="Edit" onClick={(e) => { stop(e); setEditing(row.original.Name ?? ''); setBefore({ Description: row.original.Description ?? '', PublicPermission: row.original.PublicPermission ?? '' }); form.setValues({ Name: row.original.Name ?? '', Description: row.original.Description ?? '', PublicPermission: row.original.PublicPermission ?? '' }); open(); }}><IconPencil size={14} /></ActionIcon></Tooltip>
        <Tooltip label={row.original.AllowDelete ? 'Delete' : 'System resource'}><ActionIcon size="sm" variant="subtle" color="red" disabled={!row.original.AllowDelete} aria-label="Delete" onClick={(e) => { stop(e); confirmDanger({ title: 'Delete resource', message: <>Delete resource <b>{row.original.Name}</b>?</>, confirmLabel: 'Delete', onConfirm: () => remove.mutateAsync(row.original.Name ?? '') }); }}><IconTrash size={14} /></ActionIcon></Tooltip>
      </Group>
    ) },
  ];

  return (
    <>
      <PageHeader title="Resources" description="Protected assets (databases, services, applications, %Admin_* privileges) and the permissions granted to everyone." privileges={['%Admin_Secure:U']}
        actions={<><Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => list.refetch()} loading={list.isFetching}>Refresh</Button><Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => { setEditing(null); form.reset(); open(); }}>Create resource</Button></>} />
      <DataTable stateKey="resources" exportName="resources" data={list.data} columns={columns} loading={list.isPending} error={list.error} getRowId={(r) => r.Name ?? ''} initialSorting={[{ id: 'Name', desc: false }]} pageSize={50} dense />
      <Modal opened={opened} onClose={close} title={editing ? `Edit ${editing}` : 'Create resource'} centered>
        <form onSubmit={form.onSubmit((v) => (editing ? reviewChanges({ title: `Review changes to ${editing}`, before, after: { Description: v.Description, PublicPermission: v.PublicPermission }, refetch: () => result(api().GET('/v2/security/resource', { params: { query: { name: editing } } })) as Promise<Record<string, unknown>>, onConfirm: () => save.mutateAsync(v) }) : save.mutate(v)))}>
          <Stack gap="sm">
            <TextInput label="Name" disabled={!!editing} data-autofocus {...form.getInputProps('Name')} />
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <Select label="Public permission" data={PERMS} {...form.getInputProps('PublicPermission')} />
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={save.isPending}>{editing ? 'Save' : 'Create'}</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
