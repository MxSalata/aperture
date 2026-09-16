import { Button, Checkbox, Grid, Group, Modal, MultiSelect, Paper, Stack, TagsInput, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { Role } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, renderValue } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { confirmDanger } from '@/components/ConfirmDanger';
import { secKeys } from './keys';
import { useResourceNames } from './RolesPage';
import { useRoleNames } from './UsersPage';

export default function RoleDetailPage() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: secKeys.role(name), queryFn: () => result(api().GET('/v2/security/role', { params: { query: { name } } })) });
  const owners = useQuery({ queryKey: [...secKeys.role(name), 'owners'], queryFn: () => result(api().GET('/v2/security/role/owners', { params: { query: { name } } })) });
  const resources = useResourceNames();
  const roleNames = useRoleNames();
  const params = { params: { query: { name } } } as const;
  const save = useApiMutation((body: Role) => run(api().PUT('/v2/security/role', { ...params, body }), 'PUT'), { invalidate: [secKeys.roles, secKeys.role(name)], onSuccess: () => close() });
  const remove = useApiMutation(() => run(api().DELETE('/v2/security/role', params), 'DELETE'), { invalidate: [secKeys.roles], onSuccess: () => navigate('/security/roles') });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm<Role>({ initialValues: {} });
  // Populate the form once the record arrives; the form object itself is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (q.data) form.setValues(q.data); }, [q.data]);
  const r = q.data;
  const o = owners.data as Record<string, unknown> | undefined;

  return (
    <>
      <Group gap="xs" mb="xs"><Button component={Link} to="/security/roles" variant="subtle" size="compact-sm" leftSection={<IconArrowLeft size={14} />}>Roles</Button></Group>
      <PageHeader title={name} description={r?.Description} privileges={['%Admin_Secure:U']}
        actions={<><Button size="xs" onClick={open}>Edit</Button><Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => confirmDanger({ title: 'Delete role', message: <>Delete role <b>{name}</b>? Users holding it lose its permissions.</>, confirmText: name, confirmLabel: 'Delete', onConfirm: () => remove.mutateAsync() })}>Delete</Button></>} />
      {q.isError ? <ErrorAlert error={q.error} onRetry={() => q.refetch()} /> : null}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" mb="md"><Title order={5} mb="xs">Definition</Title>{r ? <KeyValueList cols={1} items={[{ label: 'Description', value: r.Description || '-' }, { label: 'Escalation only', value: renderValue(!!r.EscalationOnly) }, { label: 'Resources', value: renderValue(r.Resources) }, { label: 'Granted roles', value: renderValue(r.GrantedRoles) }]} /> : <Text size="sm" c="dimmed">Loading…</Text>}</Paper>
          <Paper p="md"><Title order={5} mb="xs">Who holds this role</Title>{o ? <KeyValueList cols={1} items={Object.entries(o).map(([k, v]) => ({ label: k, value: renderValue(v) }))} /> : owners.isError ? <ErrorAlert error={owners.error} /> : <Text size="sm" c="dimmed">Loading…</Text>}</Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}><Paper p="md"><JsonViewer value={{ role: r, owners: o }} /></Paper></Grid.Col>
      </Grid>
      <Modal opened={opened} onClose={close} title={`Edit ${name}`} centered size="lg">
        <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <TagsInput label="Resources with permissions" data={resources.map((x) => `${x}:U`)} splitChars={[',', ' ']} {...form.getInputProps('Resources')} />
            <MultiSelect label="Granted roles" data={roleNames.filter((x) => x !== name)} searchable {...form.getInputProps('GrantedRoles')} />
            <Checkbox label="Escalation only" {...form.getInputProps('EscalationOnly', { type: 'checkbox' })} />
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
