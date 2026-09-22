import {
  Button,
  Checkbox,
  Grid,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconChevronDown, IconKey, IconTrash } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { User } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { BoolBadge } from '@/components/StatusBadge';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';
import { useRoleNames } from './UsersPage';

export default function UserDetailPage() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const q = useQuery({
    queryKey: secKeys.user(name),
    queryFn: () => result(api().GET('/v2/security/user', { params: { query: { name } } })),
  });
  const roles = useRoleNames();
  const params = { params: { query: { name } } } as const;
  const invalidate = [secKeys.users, secKeys.user(name)];
  const save = useApiMutation(
    (body: User) => run(api().PUT('/v2/security/user', { ...params, body }), 'PUT'),
    { invalidate, onSuccess: () => closeEdit() },
  );
  const password = useApiMutation(
    (pw: string) => run(api().POST('/v2/security/user/password', { ...params, body: { NewPassword: pw } })),
    { onSuccess: () => closePw() },
  );
  const remove = useApiMutation(() => run(api().DELETE('/v2/security/user', params), 'DELETE'), {
    invalidate: [secKeys.users],
    onSuccess: () => navigate('/security/users'),
  });
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  // The typed password is forgotten whenever the dialog closes (after a change or a cancel).
  const [pwOpen, { open: openPw, close: closePw }] = useDisclosure(false, { onClose: () => pwForm.reset() });
  const form = useForm<User>({ initialValues: {} });
  const pwForm = useForm({
    initialValues: { Password: '', Confirm: '' },
    validate: {
      Password: (v) => (v.length >= 3 ? null : 'Too short'),
      Confirm: (v, all) => (v === all.Password ? null : 'Passwords differ'),
    },
  });
  // Populate the form once the record arrives; the form object itself is stable.
  useEffect(() => {
    // Not while the dialog is open: a background refetch must not overwrite what is being typed.
    if (q.data && !editOpen) form.setValues(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, editOpen]);
  const u = q.data;

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/security/users"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Users
        </Button>
      </Group>
      <PageHeader
        title={
          <Group gap="sm">
            <span>{name}</span>
            {u ? <BoolBadge value={u.Enabled} yes="Enabled" no="Disabled" /> : null}
          </Group>
        }
        description={u?.FullName}
        privileges={['%Admin_Secure:U']}
        actions={
          <>
            <Button size="xs" onClick={openEdit}>
              Edit
            </Button>
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button size="xs" variant="default" rightSection={<IconChevronDown size={14} />}>
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconKey size={14} />} onClick={openPw}>
                  Change password…
                </Menu.Item>
                <Menu.Item onClick={() => u && save.mutate({ ...u, Enabled: !u.Enabled })}>
                  {u?.Enabled ? 'Disable account' : 'Enable account'}
                </Menu.Item>
                <Menu.Item component={Link} to={`/security/sql?grantee=${encodeURIComponent(name)}`}>
                  SQL privileges
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() =>
                    confirmDanger({
                      title: 'Delete user',
                      message: (
                        <>
                          Delete user <b>{name}</b>?
                        </>
                      ),
                      confirmText: name,
                      confirmLabel: 'Delete',
                      onConfirm: () => remove.mutateAsync(),
                    })
                  }
                >
                  Delete…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        }
      />
      {q.isError ? <ErrorAlert error={q.error} onRetry={() => q.refetch()} /> : null}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md">
            <Title order={5} mb="xs">
              Account
            </Title>
            {u ? (
              <KeyValueList
                items={objectToItems(u as Record<string, unknown>, {
                  labels: {
                    NameSpace: 'Default namespace',
                    AutheEnabled: 'Authentication flags',
                    HOTPKeyDisplay: 'Show HOTP key',
                  },
                })}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="md">
            <JsonViewer value={u} />
          </Paper>
        </Grid.Col>
      </Grid>
      <Modal opened={editOpen} onClose={closeEdit} title={`Edit ${name}`} centered size="lg">
        <form
          onSubmit={form.onSubmit((v) =>
            reviewChanges({
              title: `Review changes to ${name}`,
              before: q.data as Record<string, unknown>,
              after: v as Record<string, unknown>,
              refetch: () =>
                result(api().GET('/v2/security/user', params)) as Promise<Record<string, unknown>>,
              onConfirm: () => save.mutateAsync(v),
            }),
          )}
        >
          <Stack gap="sm">
            <TextInput label="Full name" {...form.getInputProps('FullName')} />
            <MultiSelect label="Roles" data={roles} searchable {...form.getInputProps('Roles')} />
            <MultiSelect
              label="Escalation roles"
              description="Roles the user may escalate to for a session"
              data={roles}
              searchable
              {...form.getInputProps('EscalationRoles')}
            />
            <Group grow>
              <Select
                label="Default namespace"
                data={info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? []}
                searchable
                {...form.getInputProps('NameSpace')}
              />
              <TextInput label="Startup routine" {...form.getInputProps('Routine')} />
            </Group>
            <Group grow>
              <TextInput label="E-mail" {...form.getInputProps('EmailAddress')} />
              <TextInput label="Expiration date (YYYY-MM-DD)" {...form.getInputProps('ExpirationDate')} />
            </Group>
            <TextInput label="Comment" {...form.getInputProps('Comment')} />
            <Group>
              <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
              <Checkbox
                label="Account never expires"
                {...form.getInputProps('AccountNeverExpires', { type: 'checkbox' })}
              />
              <Checkbox
                label="Password never expires"
                {...form.getInputProps('PasswordNeverExpires', { type: 'checkbox' })}
              />
              <Checkbox
                label="Change password at next login"
                {...form.getInputProps('ChangePassword', { type: 'checkbox' })}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeEdit}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal opened={pwOpen} onClose={closePw} title={`Change password for ${name}`} centered>
        <form onSubmit={pwForm.onSubmit((v) => password.mutate(v.Password))}>
          <Stack gap="sm">
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              data-autofocus
              {...pwForm.getInputProps('Password')}
            />
            <PasswordInput label="Confirm" autoComplete="new-password" {...pwForm.getInputProps('Confirm')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={closePw}>
                Cancel
              </Button>
              <Button type="submit" loading={password.isPending}>
                Change
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
