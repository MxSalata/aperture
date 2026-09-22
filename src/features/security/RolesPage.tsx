import { Button, Checkbox, Group, Modal, MultiSelect, Stack, TagsInput, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { RoleList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { secKeys } from './keys';

type Row = RoleList[number];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Name', header: 'Role', cell: (c) => <b>{String(c.getValue())}</b> },
  { accessorKey: 'Description', header: 'Description' },
  { accessorKey: 'CreatedBy', header: 'Created by' },
  {
    accessorKey: 'EscalationOnly',
    header: 'Escalation only',
    cell: (c) => <BoolBadge value={c.getValue() as boolean} />,
  },
];

export function useResourceNames() {
  const q = useQuery({
    queryKey: secKeys.resources,
    queryFn: () => result(api().GET('/v2/security/resources')),
  });
  return (q.data ?? []).map((r) => r.Name ?? '').filter(Boolean);
}

export default function RolesPage() {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: secKeys.roles, queryFn: () => result(api().GET('/v2/security/roles')) });
  const resources = useResourceNames();
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: {
      Name: '',
      Description: '',
      Resources: [] as string[],
      GrantedRoles: [] as string[],
      EscalationOnly: false,
    },
    validate: { Name: (v) => (/^[A-Za-z%][\w-]*$/.test(v) ? null : 'Invalid role name') },
  });
  const create = useApiMutation(
    (v: typeof form.values) =>
      run(
        api().PUT('/v2/security/role', {
          params: { query: { name: v.Name } },
          body: {
            Description: v.Description,
            Resources: v.Resources,
            GrantedRoles: v.GrantedRoles,
            EscalationOnly: v.EscalationOnly,
          },
        }),
        'PUT',
      ),
    {
      invalidate: [secKeys.roles],
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );
  const roleNames = (list.data ?? []).map((r) => r.Name ?? '').filter(Boolean);

  return (
    <>
      <PageHeader
        title="Roles"
        description="Roles bundle resource permissions (e.g. %DB_USER:RW) and can grant other roles."
        privileges={['%Admin_Secure:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => list.refetch()}
              loading={list.isFetching}
            >
              Refresh
            </Button>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
              Create role
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="roles"
        exportName="roles"
        getRowLabel={(r) => `Open role ${r.Name ?? ''}`}
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(`/security/roles/${encodeURIComponent(r.Name ?? '')}`)}
        getRowId={(r) => r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
      />
      <Modal opened={opened} onClose={close} title="Create role" centered size="lg">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Role name" data-autofocus {...form.getInputProps('Name')} />
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <TagsInput
              label="Resources with permissions"
              description="Format Resource:Permissions, e.g. %DB_USER:RW or %Admin_Operate:U"
              data={resources.map((r) => `${r}:U`)}
              splitChars={[',', ' ']}
              {...form.getInputProps('Resources')}
            />
            <MultiSelect
              label="Granted roles"
              data={roleNames}
              searchable
              {...form.getInputProps('GrantedRoles')}
            />
            <Checkbox
              label="Escalation only (cannot be assigned directly, only escalated to)"
              {...form.getInputProps('EscalationOnly', { type: 'checkbox' })}
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
