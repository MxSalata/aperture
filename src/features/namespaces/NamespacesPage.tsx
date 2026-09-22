import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { NamespaceList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { useConfigDatabases } from '@/features/databases/useDatabases';

type Row = NamespaceList[number];
export const nsKeys = { list: ['namespaces'] as const, one: (n: string) => ['namespaces', n] as const };

const mono = (c: { getValue: () => unknown }) => <span className="mono">{String(c.getValue() ?? '')}</span>;
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Name', header: 'Namespace', cell: (c) => <b>{String(c.getValue())}</b> },
  { accessorKey: 'Globals', header: 'Globals', cell: mono },
  { accessorKey: 'Routines', header: 'Routines', cell: mono },
  { accessorKey: 'TempGlobals', header: 'Temp globals', cell: mono },
  { accessorKey: 'SysGlobals', header: 'System globals', cell: mono },
  { accessorKey: 'SysRoutines', header: 'System routines', cell: mono },
  { accessorKey: 'Library', header: 'Library', cell: mono },
];

export default function NamespacesPage() {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: nsKeys.list, queryFn: () => result(api().GET('/v2/namespaces')) });
  const dbs = useConfigDatabases();
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: { Name: '', Globals: '', Routines: '', TempGlobals: 'IRISTEMP' },
    validate: { Name: (v) => (/^%?[A-Za-z][A-Za-z0-9_-]*$/.test(v) ? null : 'Invalid namespace name'), Globals: (v) => (v ? null : 'Choose a database') },
  });
  const create = useApiMutation(
    (v: typeof form.values) => run(api().PUT('/v2/namespace', { params: { query: { name: v.Name.toUpperCase() } }, body: { Globals: v.Globals, Routines: v.Routines || v.Globals, TempGlobals: v.TempGlobals } }), 'PUT'),
    { invalidate: [nsKeys.list], onSuccess: () => { close(); form.reset(); } },
  );
  const dbOptions = (dbs.data ?? []).map((d) => d.Name ?? '').filter(Boolean);

  return (
    <>
      <PageHeader
        title="Namespaces"
        description="Logical databases: where globals and routines live and how code and data are mapped across databases."
        privileges={['%Admin_Manage:U']}
        actions={
          <>
            <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => list.refetch()} loading={list.isFetching}>Refresh</Button>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>Create namespace</Button>
          </>
        }
      />
      <DataTable stateKey="namespaces" exportName="namespaces" getRowLabel={(r) => `Open namespace ${r.Name ?? ''}`} data={list.data} columns={columns} loading={list.isPending} error={list.error} onRowClick={(r) => navigate(`/namespaces/${encodeURIComponent(r.Name ?? '')}`)} getRowId={(r) => r.Name ?? ''} initialSorting={[{ id: 'Name', desc: false }]} />
      <Modal opened={opened} onClose={close} title="Create namespace" centered>
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Name" placeholder="MYAPP" data-autofocus {...form.getInputProps('Name')} />
            <Select label="Globals database" data={dbOptions} searchable {...form.getInputProps('Globals')} />
            <Select label="Routines database" placeholder="same as globals" data={dbOptions} searchable clearable {...form.getInputProps('Routines')} />
            <Select label="Temp globals database" data={dbOptions.includes('IRISTEMP') ? dbOptions : ['IRISTEMP', ...dbOptions]} searchable {...form.getInputProps('TempGlobals')} />
            <Group justify="flex-end" mt="xs"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={create.isPending}>Create</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
