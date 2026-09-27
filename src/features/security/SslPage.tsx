import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Tabs,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPencil, IconPlugConnected, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { putBody, sendsOnlyChanges } from '@/api/partialPut';
import type { SSLConfigurationList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { notifyError } from '@/lib/notify';
import { secKeys } from './keys';
import { X509Tab } from './X509Tab';

type Row = SSLConfigurationList[number];

/** VerifyPeer as the spec defines it per configuration type (3 = mutual TLS, servers only). */
const VERIFY_PEER: Record<string, { value: string; label: string }[]> = {
  '0': [
    { value: '0', label: 'None (continue if verification fails)' },
    { value: '1', label: 'Require server certificate' },
  ],
  '1': [
    { value: '0', label: 'None (no client certificate)' },
    { value: '1', label: 'Request client certificate' },
    { value: '3', label: 'Require client certificate' },
  ],
};

/** `ALL:!aNULL` ⇄ `["ALL", "!aNULL"]`: the API lists the cipher specifications one per item. */
const joinCiphers = (list: unknown) => (Array.isArray(list) ? list.join(':') : '');
const splitCiphers = (text: string) =>
  text
    .split(':')
    .map((c) => c.trim())
    .filter(Boolean);
const TLS = [
  { value: '2', label: 'SSLv3 (insecure)' },
  { value: '4', label: 'TLS 1.0' },
  { value: '8', label: 'TLS 1.1' },
  { value: '16', label: 'TLS 1.2' },
  { value: '32', label: 'TLS 1.3' },
];

const readConfig = (name: string) =>
  result(api().GET('/v2/security/ssl-configuration', { params: { query: { name } } }));

export default function SslPage() {
  const list = useQuery({
    queryKey: secKeys.ssl,
    queryFn: () => result(api().GET('/v2/security/ssl-configurations')),
  });
  const [opened, { open, close }] = useDisclosure(false);
  const [testOpen, { open: openTest, close: closeTest }] = useDisclosure(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [before, setBefore] = useState<Record<string, unknown> | undefined>(undefined);
  const [testing, setTesting] = useState<string>('');
  const form = useForm({
    initialValues: {
      Name: '',
      Description: '',
      Enabled: true,
      Type: '0',
      CAFile: '',
      CertificateFile: '',
      PrivateKeyFile: '',
      TLSMinVersion: '16',
      TLSMaxVersion: '32',
      VerifyPeer: '0',
      CipherList: 'ALL:!aNULL:!eNULL:!EXP:!SSLv2',
    },
    validate: { Name: (v) => (v.trim() ? null : 'Required') },
  });
  const testForm = useForm({ initialValues: { Host: 'localhost', Port: 443 } });
  const toBody = (v: typeof form.values) => ({
    Description: v.Description,
    Enabled: v.Enabled,
    Type: Number(v.Type),
    CAFile: v.CAFile,
    CertificateFile: v.CertificateFile,
    PrivateKeyFile: v.PrivateKeyFile,
    TLSMinVersion: Number(v.TLSMinVersion),
    TLSMaxVersion: Number(v.TLSMaxVersion),
    VerifyPeer: Number(v.VerifyPeer),
    // Sent only when it changed: re-sending a list the server keeps in its own format could rewrite it.
    ...(editing && v.CipherList === joinCiphers(before?.CipherList)
      ? {}
      : { CipherList: splitCiphers(v.CipherList) }),
  });
  const save = useApiMutation(
    ({ name, body }: { name: string; body: Partial<ReturnType<typeof toBody>> }) =>
      run(api().PUT('/v2/security/ssl-configuration', { params: { query: { name } }, body }), 'PUT'),
    {
      invalidate: [secKeys.ssl],
      onSuccess: () => {
        close();
        form.reset();
        setEditing(null);
      },
    },
  );
  const remove = useApiMutation(
    (name: string) =>
      run(api().DELETE('/v2/security/ssl-configuration', { params: { query: { name } } }), 'DELETE'),
    { invalidate: [secKeys.ssl] },
  );
  const test = useApiMutation(
    (v: typeof testForm.values) =>
      run(
        api().POST('/v2/security/ssl-configuration/test', {
          params: { query: { name: testing } },
          body: { Host: v.Host, Port: v.Port },
        }),
      ),
    {
      success: (d) =>
        `${d.summary || 'Test completed'}${d.console.length ? ` - ${d.console.join(' · ')}` : ''}`,
    },
  );

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Name', header: 'Configuration', cell: (c) => <b>{String(c.getValue())}</b> },
    { accessorKey: 'Description', header: 'Description' },
    {
      accessorKey: 'Type',
      header: 'Type',
      cell: (c) =>
        c.getValue() === 1 ? 'Server' : c.getValue() === 0 ? 'Client' : String(c.getValue() ?? ''),
    },
    {
      accessorKey: 'Enabled',
      header: 'Enabled',
      cell: (c) => <BoolBadge value={c.getValue() as boolean} yes="Enabled" no="Disabled" />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Test connection">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Test"
              onClick={(e) => {
                stop(e);
                setTesting(row.original.Name ?? '');
                openTest();
              }}
            >
              <IconPlugConnected size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Edit"
              onClick={async (e) => {
                stop(e);
                let d: Awaited<ReturnType<typeof readConfig>>;
                try {
                  d = await readConfig(row.original.Name ?? '');
                } catch (err) {
                  notifyError(err, 'Cannot open the configuration');
                  return;
                }
                setBefore(d as Record<string, unknown>);
                setEditing(row.original.Name ?? '');
                form.setValues({
                  Name: row.original.Name ?? '',
                  Description: d.Description ?? '',
                  Enabled: !!d.Enabled,
                  Type: String(d.Type ?? 0),
                  CAFile: d.CAFile ?? '',
                  CertificateFile: d.CertificateFile ?? '',
                  PrivateKeyFile: d.PrivateKeyFile ?? '',
                  TLSMinVersion: String(d.TLSMinVersion ?? 16),
                  TLSMaxVersion: String(d.TLSMaxVersion ?? 32),
                  VerifyPeer: String(d.VerifyPeer ?? 0),
                  CipherList: joinCiphers(d.CipherList),
                });
                open();
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete SSL configuration',
                  message: (
                    <>
                      Delete <b>{row.original.Name}</b>?
                    </>
                  ),
                  confirmLabel: 'Delete',
                  onConfirm: () => remove.mutateAsync(row.original.Name ?? ''),
                });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="TLS & certificates"
        description="Client and server TLS configurations used by the superserver, mirroring, LDAP, HTTP outbound and interoperability adapters, and the X.509 credentials with the expiry of each certificate."
        privileges={['%Admin_Secure:U']}
        actions={
          <>
            <RefreshControl screen="tls" onRefresh={() => list.refetch()} loading={list.isFetching} />
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setEditing(null);
                form.reset();
                open();
              }}
            >
              Create configuration
            </Button>
          </>
        }
      />
      <Tabs defaultValue="tls" keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="tls">TLS configurations</Tabs.Tab>
          <Tabs.Tab value="x509">X.509 credentials</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tls">
          <DataTable
            stateKey="ssl"
            exportName="ssl"
            data={list.data}
            columns={columns}
            loading={list.isPending}
            error={list.error}
            getRowId={(r) => r.Name ?? ''}
            initialSorting={[{ id: 'Name', desc: false }]}
            dense
          />
        </Tabs.Panel>
        <Tabs.Panel value="x509">
          <X509Tab />
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={opened}
        onClose={close}
        title={editing ? `Edit ${editing}` : 'Create SSL configuration'}
        centered
        size="lg"
      >
        <form
          onSubmit={form.onSubmit((v) =>
            editing
              ? reviewChanges({
                  title: `Review changes to ${editing}`,
                  before,
                  after: toBody(v) as Record<string, unknown>,
                  refetch: () =>
                    result(
                      api().GET('/v2/security/ssl-configuration', { params: { query: { name: editing } } }),
                    ) as Promise<Record<string, unknown>>,
                  onlyChanges: sendsOnlyChanges('/v2/security/ssl-configuration'),
                  onConfirm: (changed) =>
                    save.mutateAsync({
                      name: v.Name,
                      body: putBody(
                        '/v2/security/ssl-configuration',
                        toBody(v),
                        changed as Partial<ReturnType<typeof toBody>>,
                      ),
                    }),
                })
              : save.mutate({ name: v.Name, body: toBody(v) }),
          )}
        >
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Name" disabled={!!editing} data-autofocus {...form.getInputProps('Name')} />
              <Select
                label="Type"
                data={[
                  { value: '0', label: 'Client' },
                  { value: '1', label: 'Server' },
                ]}
                {...form.getInputProps('Type')}
              />
            </Group>
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <TextInput
              label="CA certificate file"
              placeholder="/path/ca.pem"
              {...form.getInputProps('CAFile')}
            />
            <Group grow>
              <TextInput label="Certificate file" {...form.getInputProps('CertificateFile')} />
              <TextInput label="Private key file" {...form.getInputProps('PrivateKeyFile')} />
            </Group>
            <Group grow>
              <Select label="Min TLS version" data={TLS} {...form.getInputProps('TLSMinVersion')} />
              <Select label="Max TLS version" data={TLS} {...form.getInputProps('TLSMaxVersion')} />
              <Select
                label="Verify peer"
                data={VERIFY_PEER[form.values.Type] ?? VERIFY_PEER['0']}
                allowDeselect={false}
                {...form.getInputProps('VerifyPeer')}
              />
            </Group>
            <TextInput label="Cipher list (TLS ≤1.2)" {...form.getInputProps('CipherList')} />
            <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal opened={testOpen} onClose={closeTest} title={`Test ${testing}`} centered>
        <form onSubmit={testForm.onSubmit((v) => test.mutate(v))}>
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Host" data-autofocus {...testForm.getInputProps('Host')} />
              <NumberInput label="Port" min={1} max={65535} {...testForm.getInputProps('Port')} />
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeTest}>
                Close
              </Button>
              <Button type="submit" loading={test.isPending}>
                Connect
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
