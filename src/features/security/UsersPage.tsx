import {
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { UserList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';

type Row = UserList[number];
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Name', header: 'User', cell: (c) => <b>{String(c.getValue())}</b> },
  { accessorKey: 'FullName', header: 'Full name' },
  {
    accessorKey: 'Enabled',
    header: 'Enabled',
    cell: (c) => <BoolBadge value={c.getValue() as boolean} yes="Enabled" no="Disabled" />,
  },
  { accessorKey: 'Type', header: 'Type' },
  { accessorKey: 'Namespace', header: 'Default namespace' },
  {
    accessorKey: 'Routine',
    header: 'Startup routine',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
];

export function useRoleNames() {
  const q = useQuery({ queryKey: secKeys.roles, queryFn: () => result(api().GET('/v2/security/roles')) });
  return (q.data ?? []).map((r) => r.Name ?? '').filter(Boolean);
}

export default function UsersPage() {
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const list = useQuery({ queryKey: secKeys.users, queryFn: () => result(api().GET('/v2/security/users')) });
  const roles = useRoleNames();
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: {
      Name: '',
      Password: '',
      FullName: '',
      Roles: [] as string[],
      NameSpace: 'USER',
      EmailAddress: '',
      Comment: '',
      Enabled: true,
      ChangePassword: false,
    },
    validate: {
      Name: (v) => (/^[A-Za-z_%][\w.@-]*$/.test(v) ? null : 'Invalid user name'),
      Password: (v) => (v.length >= 3 ? null : 'Too short'),
    },
  });
  const create = useApiMutation(
    (v: typeof form.values) =>
      run(
        api().POST('/v2/security/user', {
          params: { query: { name: v.Name } } as never,
          body: {
            Password: v.Password,
            User: {
              FullName: v.FullName,
              Roles: v.Roles,
              NameSpace: v.NameSpace,
              EmailAddress: v.EmailAddress,
              Comment: v.Comment,
              Enabled: v.Enabled,
              ChangePassword: v.ChangePassword,
              Name: v.Name,
            } as never,
          },
        }),
      ),
    {
      invalidate: [secKeys.users],
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="User accounts on this instance."
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
              Create user
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="users"
        exportName="users"
        getRowLabel={(r) => `Open user ${r.Name ?? ''}`}
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(`/security/users/${encodeURIComponent(r.Name ?? '')}`)}
        getRowId={(r) => r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
      />
      <Modal opened={opened} onClose={close} title="Create user" centered>
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="User name" data-autofocus autoComplete="off" {...form.getInputProps('Name')} />
            <PasswordInput label="Password" autoComplete="new-password" {...form.getInputProps('Password')} />
            <TextInput label="Full name" {...form.getInputProps('FullName')} />
            <MultiSelect label="Roles" data={roles} searchable {...form.getInputProps('Roles')} />
            <Group grow>
              <Select
                label="Default namespace"
                data={info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? ['USER']}
                searchable
                {...form.getInputProps('NameSpace')}
              />
              <TextInput label="E-mail" {...form.getInputProps('EmailAddress')} />
            </Group>
            <TextInput label="Comment" {...form.getInputProps('Comment')} />
            <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
            <Checkbox
              label="Must change password at next login"
              {...form.getInputProps('ChangePassword', { type: 'checkbox' })}
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
