import { ActionIcon, Button, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlugConnected, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { newProfileId, normalizeBaseUrl, SAME_ORIGIN_ID, useConnections, type ConnectionProfile } from '@/stores/connections';
import { useSession } from '@/stores/session';
import { confirmDanger } from '@/components/ConfirmDanger';

export default function ConnectionsPage() {
  const profiles = useConnections((s) => s.profiles);
  const upsert = useConnections((s) => s.upsert);
  const remove = useConnections((s) => s.remove);
  const setLastUsed = useConnections((s) => s.setLastUsed);
  const current = useSession((s) => s.connectionId);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<ConnectionProfile | null>(null);
  const form = useForm({ initialValues: { name: '', baseUrl: 'http://localhost:52773', auth: 'auto' as ConnectionProfile['auth'], username: '_SYSTEM' }, validate: { name: (v) => (v.trim() ? null : 'Required'), baseUrl: (v) => (editing?.id === SAME_ORIGIN_ID || /^https?:\/\//.test(v) ? null : 'Enter a URL such as http://iris.lan:52773') } });

  const startEdit = (p: ConnectionProfile | null) => { setEditing(p); form.setValues({ name: p?.name ?? '', baseUrl: p?.baseUrl ?? 'http://localhost:52773', auth: p?.auth ?? 'auto', username: p?.username ?? '_SYSTEM' }); open(); };
  const save = form.onSubmit((v) => { const id = editing?.id ?? newProfileId(); upsert({ id, name: v.name.trim(), baseUrl: id === SAME_ORIGIN_ID ? '' : normalizeBaseUrl(v.baseUrl), auth: v.auth, username: v.username, color: editing?.color ?? 'cyan' }); close(); });
  // Switching instances is exactly when the old session should stop being valid server-side too.
  const connect = async (p: ConnectionProfile) => { setLastUsed(p.id); await logout(); navigate('/login'); };

  return (
    <>
      <PageHeader title="Connections" description="Saved IRIS instances. A base URL is the origin in front of /api/admin. Cross-origin instances need CORS enabled on their /api/admin web application (or put this portal behind the same reverse proxy)." actions={<Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => startEdit(null)}>Add connection</Button>} />
      <Paper p="md">
        <Table fz="sm">
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Base URL</Table.Th><Table.Th>Auth</Table.Th><Table.Th>User</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {profiles.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td><Group gap="xs"><b>{p.name}</b>{p.id === current ? <Text size="xs" c="teal">● connected</Text> : null}</Group></Table.Td>
                <Table.Td className="mono">{p.baseUrl || '(same origin)'}</Table.Td>
                <Table.Td>{p.auth}</Table.Td>
                <Table.Td>{p.username}</Table.Td>
                <Table.Td>
                  <Group gap={2} justify="flex-end" wrap="nowrap">
                    <Tooltip label="Connect"><ActionIcon size="sm" variant="subtle" aria-label="Connect" disabled={p.id === current} onClick={() => connect(p)}><IconPlugConnected size={14} /></ActionIcon></Tooltip>
                    <Tooltip label="Edit"><ActionIcon size="sm" variant="subtle" aria-label="Edit" onClick={() => startEdit(p)}><IconPencil size={14} /></ActionIcon></Tooltip>
                    <Tooltip label="Delete"><ActionIcon size="sm" variant="subtle" color="red" aria-label="Delete" disabled={p.id === SAME_ORIGIN_ID} onClick={() => confirmDanger({ title: 'Delete connection', message: `Forget ${p.name}?`, confirmLabel: 'Delete', onConfirm: () => remove(p.id) })}><IconTrash size={14} /></ActionIcon></Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Modal opened={opened} onClose={close} title={editing ? `Edit ${editing.name}` : 'Add connection'} centered>
        <form onSubmit={save}>
          <Stack gap="sm">
            <TextInput label="Name" data-autofocus {...form.getInputProps('name')} />
            <TextInput label="Base URL" disabled={editing?.id === SAME_ORIGIN_ID} description="e.g. http://iris.lan:52773 or https://gateway.example.org/iris" {...form.getInputProps('baseUrl')} />
            <Group grow><Select label="Authentication" data={[{ value: 'auto', label: 'Auto (JWT, then Basic)' }, { value: 'jwt', label: 'JWT only' }, { value: 'basic', label: 'Basic only' }]} {...form.getInputProps('auth')} /><TextInput label="Default user" {...form.getInputProps('username')} /></Group>
            <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button type="submit">Save</Button></Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
