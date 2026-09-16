import { ActionIcon, Button, Checkbox, Group, Modal, Paper, Select, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useSearchParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { SQLPrivilegeList, Schemas } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { confirmDanger } from '@/components/ConfirmDanger';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';

type Row = SQLPrivilegeList[number];
type AdminRow = Schemas['SQLAdminPrivilegeList'][number];
const ACTIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'EXECUTE', 'USE', 'ALTER', '%ALTER', '*'];
const TYPES = ['TABLE', 'VIEW', 'STORED PROCEDURE', 'SCHEMA', 'CUBES', 'ML CONFIGURATION', 'FOREIGN SERVER'];
const ADMIN_PRIVS = ['%CREATE_TABLE', '%ALTER_TABLE', '%DROP_TABLE', '%CREATE_VIEW', '%ALTER_VIEW', '%DROP_VIEW', '%CREATE_PROCEDURE', '%DROP_PROCEDURE', '%CREATE_FUNCTION', '%DROP_FUNCTION', '%CREATE_METHOD', '%DROP_METHOD', '%CREATE_QUERY', '%DROP_QUERY', '%CREATE_TRIGGER', '%DROP_TRIGGER', '%BUILD_INDEX', '%CREATE_ML_CONFIGURATION', '%MANAGE_MODEL', '%NOCHECK', '%NOINDEX', '%NOLOCK', '%NOTRIGGER', '%NOJOURN'];

export default function SqlPrivilegesPage() {
  const info = useSession((s) => s.info);
  const [params, setParams] = useSearchParams();
  const namespace = params.get('namespace') ?? 'USER';
  const grantee = params.get('grantee') ?? '';
  const namespaces = info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? ['USER'];
  const form = useForm({ initialValues: { namespace, grantee } });
  const privs = useQuery({ queryKey: secKeys.sqlPrivs(namespace, grantee), enabled: !!grantee, queryFn: () => result(api().GET('/v2/security/sql-privileges', { params: { query: { namespace, grantee } } as never })) });
  const admin = useQuery({ queryKey: [...secKeys.sqlPrivs(namespace, grantee), 'admin'], enabled: !!grantee, queryFn: () => result(api().GET('/v2/security/sql-admin-privileges', { params: { query: { namespace, grantee } } as never })) });
  const invalidate = [secKeys.sqlPrivs(namespace, grantee)];
  const [opened, { open, close }] = useDisclosure(false);
  const [adminOpen, { open: openAdmin, close: closeAdmin }] = useDisclosure(false);
  const grantForm = useForm({ initialValues: { type: 'TABLE', object: '', action: 'SELECT', withGrant: false }, validate: { object: (v) => (v.trim() ? null : 'Required') } });
  const adminForm = useForm({ initialValues: { privilege: '%CREATE_TABLE', withGrant: false } });
  const grant = useApiMutation((v: typeof grantForm.values) => run(api().POST('/v2/security/sql-privilege/grant', { params: { query: { namespace, grantee, type: v.type, object: v.object, action: v.action, withGrant: v.withGrant } } as never })), { invalidate, onSuccess: () => close() });
  const revoke = useApiMutation((r: Row) => run(api().POST('/v2/security/sql-privilege/revoke', { params: { query: { namespace, grantee, type: r.Type ?? 'TABLE', object: r.Name ?? '', action: r.Privilege ?? 'SELECT' } } as never })), { invalidate });
  const grantAdmin = useApiMutation((v: typeof adminForm.values) => run(api().POST('/v2/security/sql-admin-privilege/grant', { params: { query: { namespace, grantee, privilege: v.privilege, withGrant: v.withGrant } } as never })), { invalidate, onSuccess: () => closeAdmin() });
  const revokeAdmin = useApiMutation((p: string) => run(api().POST('/v2/security/sql-admin-privilege/revoke', { params: { query: { namespace, grantee, privilege: p } } as never })), { invalidate });

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Type', header: 'Type' },
    { accessorKey: 'Name', header: 'Object', cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span> },
    { accessorKey: 'Privilege', header: 'Privilege' },
    { accessorKey: 'GrantedBy', header: 'Granted by' },
    { accessorKey: 'GrantedVia', header: 'Via role' },
    { accessorKey: 'GrantOption', header: 'Grant option', cell: (c) => <BoolBadge value={c.getValue() as boolean} /> },
    { accessorKey: 'HasColumnPriv', header: 'Column privs', cell: (c) => <BoolBadge value={c.getValue() as boolean} /> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <Tooltip label="Revoke"><ActionIcon size="sm" variant="subtle" color="red" aria-label="Revoke" onClick={(e) => { stop(e); confirmDanger({ title: 'Revoke privilege', message: <>Revoke {row.original.Privilege} on <code>{row.original.Name}</code> from {grantee}?</>, confirmLabel: 'Revoke', onConfirm: () => revoke.mutateAsync(row.original) }); }}><IconTrash size={14} /></ActionIcon></Tooltip> },
  ];
  const adminColumns: ColumnDef<AdminRow, unknown>[] = [
    { accessorKey: 'Privilege', header: 'Admin privilege', cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span> },
    { accessorKey: 'GrantOption', header: 'Grant option', cell: (c) => <BoolBadge value={c.getValue() as boolean} /> },
    { accessorKey: 'GrantedVia', header: 'Via role' },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <Tooltip label="Revoke"><ActionIcon size="sm" variant="subtle" color="red" aria-label="Revoke" onClick={(e) => { stop(e); revokeAdmin.mutate(row.original.Privilege ?? ''); }}><IconTrash size={14} /></ActionIcon></Tooltip> },
  ];

  return (
    <>
      <PageHeader title="SQL privileges" description="Object privileges (SELECT on a table, EXECUTE on a procedure…) and admin privileges (%CREATE_TABLE…) held by a user or role in a namespace." privileges={['%Admin_Secure:U']} />
      <Paper p="md" mb="md">
        <form onSubmit={form.onSubmit((v) => setParams({ namespace: v.namespace, grantee: v.grantee }))}>
          <Group align="flex-end" gap="sm">
            <Select label="Namespace" data={namespaces} w={200} searchable {...form.getInputProps('namespace')} />
            <TextInput label="User or role" placeholder="jdoe or %Developer" w={240} {...form.getInputProps('grantee')} />
            <Button type="submit" leftSection={<IconSearch size={14} />}>Show privileges</Button>
          </Group>
        </form>
      </Paper>
      {grantee ? (
        <Stack gap="md">
          <Paper p="md">
            <Group justify="space-between" mb="xs"><Title order={5}>Object privileges of {grantee} in {namespace}</Title><Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>Grant…</Button></Group>
            <DataTable data={privs.data} columns={columns} loading={privs.isPending} error={privs.error} dense emptyMessage="No object privileges" />
          </Paper>
          <Paper p="md">
            <Group justify="space-between" mb="xs"><Title order={5}>Admin privileges</Title><Button size="xs" leftSection={<IconPlus size={14} />} onClick={openAdmin}>Grant…</Button></Group>
            <DataTable data={admin.data} columns={adminColumns} loading={admin.isPending} error={admin.error} dense searchable={false} hideColumnMenu emptyMessage="No admin privileges" />
          </Paper>
        </Stack>
      ) : <Text c="dimmed" size="sm">Enter a user or role to see their privileges.</Text>}
      <Modal opened={opened} onClose={close} title={`Grant object privilege to ${grantee}`} centered>
        <form onSubmit={grantForm.onSubmit((v) => grant.mutate(v))}>
          <Stack gap="sm">
            <Group grow><Select label="Object type" data={TYPES} {...grantForm.getInputProps('type')} /><Select label="Action" data={ACTIONS} {...grantForm.getInputProps('action')} /></Group>
            <TextInput label="Object (schema.name)" placeholder="SQLUser.Person" data-autofocus {...grantForm.getInputProps('object')} />
            <Checkbox label="With grant option" {...grantForm.getInputProps('withGrant', { type: 'checkbox' })} />
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={grant.isPending}>Grant</Button></Group>
          </Stack>
        </form>
      </Modal>
      <Modal opened={adminOpen} onClose={closeAdmin} title={`Grant admin privilege to ${grantee}`} centered>
        <form onSubmit={adminForm.onSubmit((v) => grantAdmin.mutate(v))}>
          <Stack gap="sm">
            <Select label="Privilege" data={ADMIN_PRIVS} searchable {...adminForm.getInputProps('privilege')} />
            <Checkbox label="With grant option" {...adminForm.getInputProps('withGrant', { type: 'checkbox' })} />
            <Group justify="flex-end"><Button variant="default" onClick={closeAdmin}>Cancel</Button><Button type="submit" loading={grantAdmin.isPending}>Grant</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
