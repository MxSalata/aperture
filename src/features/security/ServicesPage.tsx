import { ActionIcon, Button, Checkbox, Group, Modal, Stack, Switch, TagsInput, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPencil, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { ServiceList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { renderValue } from '@/components/KeyValueList';
import { AUTHE_FLAGS, bitsToFlags, flagsToBits, secKeys } from './keys';

type Row = ServiceList[number];

export default function ServicesPage() {
  const list = useQuery({ queryKey: secKeys.services, queryFn: () => result(api().GET('/v2/security/services')) });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<string | null>(null);
  const form = useForm({ initialValues: { Description: '', Enabled: true, flags: [] as string[], ClientSystems: [] as string[] } });
  const toggle = useApiMutation((v: { name: string; enabled: boolean }) => run(api().PUT('/v2/security/service', { params: { query: { name: v.name } }, body: { Enabled: v.enabled } }), 'PUT'), { invalidate: [secKeys.services], success: (_d, v) => `${v.name} ${v.enabled ? 'enabled' : 'disabled'}` });
  const save = useApiMutation((v: typeof form.values) => run(api().PUT('/v2/security/service', { params: { query: { name: editing ?? '' } }, body: { Description: v.Description, Enabled: v.Enabled, AutheEnabled: flagsToBits(v.flags.map(Number)), ClientSystems: v.ClientSystems } }), 'PUT'), { invalidate: [secKeys.services], onSuccess: close });

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Name', header: 'Service', cell: (c) => <b className="mono">{String(c.getValue())}</b> },
    { accessorKey: 'EnabledBoolean', header: 'Enabled', cell: ({ row }) => <Switch size="xs" checked={!!row.original.EnabledBoolean} onClick={stop} onChange={(e) => toggle.mutate({ name: row.original.Name ?? '', enabled: e.currentTarget.checked })} aria-label="Toggle service" /> },
    { accessorKey: 'Description', header: 'Description' },
    { accessorKey: 'AuthenticationMethods', header: 'Authentication', cell: (c) => renderValue(c.getValue()) },
    { accessorKey: 'AllowedConnections', header: 'Allowed connections', cell: (c) => renderValue(c.getValue()) },
    { accessorKey: 'Public', header: 'Public' },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (
      <Tooltip label="Edit"><ActionIcon size="sm" variant="subtle" aria-label="Edit" onClick={async (e) => { stop(e); setEditing(row.original.Name ?? ''); const d = await result(api().GET('/v2/security/service', { params: { query: { name: row.original.Name ?? '' } } })); form.setValues({ Description: d.Description ?? '', Enabled: !!d.Enabled, flags: bitsToFlags(d.AutheEnabled).map(String), ClientSystems: d.ClientSystems ?? [] }); open(); }}><IconPencil size={14} /></ActionIcon></Tooltip>
    ) },
  ];

  return (
    <>
      <PageHeader title="Services" description="Entry points into the instance (%Service_Bindings, %Service_WebGateway, …), how they authenticate and which client IPs may use them." privileges={['%Admin_Secure:U']}
        actions={<Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => list.refetch()} loading={list.isFetching}>Refresh</Button>} />
      <DataTable data={list.data} columns={columns} loading={list.isPending} error={list.error} getRowId={(r) => r.Name ?? ''} initialSorting={[{ id: 'Name', desc: false }]} dense />
      <Modal opened={opened} onClose={close} title={`Edit ${editing}`} centered>
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
            <Checkbox.Group label="Allowed authentication methods (AutheEnabled bits)" {...form.getInputProps('flags')}>
              <Stack gap={4} mt={4}>{AUTHE_FLAGS.map((f) => <Checkbox key={f.bit} value={String(f.bit)} label={`${f.label} (${f.bit})`} description={f.hint} />)}</Stack>
            </Checkbox.Group>
            <TagsInput label="Allowed client IPs / CIDRs" placeholder="10.0.0.0/8" {...form.getInputProps('ClientSystems')} />
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
