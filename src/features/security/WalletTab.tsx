import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  IconEye,
  IconInfoCircle,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { canUse } from '@/api/privileges';
import type { Schemas } from '@/api/types';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { PrivilegeBadge } from '@/components/PrivilegeBadge';
import { reviewChanges } from '@/components/ReviewChanges';
import { createLimiter } from '@/lib/limiter';
import { notifyError } from '@/lib/notify';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';
import { fullSecretName, shortSecretName } from './wallet';

const WALLET = ['%Admin_Wallet:U'] as const;

type CollectionRow = Schemas['WalletCollectionList'][number] & {
  secrets?: Schemas['WalletSecretList'];
  secretsError?: string;
};
type SecretType = NonNullable<Schemas['WalletSecret']['Type']>;

const SECRET_TYPES: { value: SecretType; label: string }[] = [
  { value: '%Wallet.KeyValue', label: 'Key/value (%Wallet.KeyValue): credentials, API keys' },
  { value: '%Wallet.SymmetricKey', label: 'Symmetric key (%Wallet.SymmetricKey)' },
  { value: '%Wallet.RSA', label: 'RSA key pair (%Wallet.RSA)' },
];
const USAGES = ['HTTP', 'SOAP', 'SQL'];

/** At most four secret lists in flight while the collections load (one request per collection). */
const secretReads = createLimiter(4);

const readCollection = (name: string) =>
  result(api().GET('/v2/wallet/collection', { params: { query: { name } } }));

function collectionRules(v: string): string | null {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(v) ? null : 'Letters, digits, _ and - ; starts with a letter';
}
function resourceRules(v: string): string | null {
  return /^%?[A-Za-z0-9_%]+(:[A-Za-z]+)?$/.test(v.trim())
    ? null
    : 'A resource, optionally with :USE, :READ or :WRITE';
}

export function WalletTab() {
  const info = useSession((s) => s.info);
  const allowed = canUse(info, WALLET);
  const list = useQuery({
    queryKey: secKeys.walletCollections,
    queryFn: () => result(api().GET('/v2/wallet/collections')),
    enabled: allowed,
  });
  const names = (list.data ?? []).map((c) => c.Name ?? '').filter(Boolean);
  const secretLists = useQueries({
    queries: names.map((collection) => ({
      queryKey: secKeys.walletSecrets(collection),
      queryFn: () =>
        secretReads(() => result(api().GET('/v2/wallet/secrets', { params: { query: { collection } } }))),
      enabled: allowed,
    })),
  });
  const rows: CollectionRow[] = (list.data ?? []).map((c, i) => ({
    ...c,
    secrets: secretLists[i]?.data,
    secretsError: secretLists[i]?.error ? (secretLists[i].error as Error).message : undefined,
  }));

  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [before, setBefore] = useState<Record<string, unknown> | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [secretOpen, { open: openSecret, close: closeSecret }] = useDisclosure(false);
  const [secretTarget, setSecretTarget] = useState<{ collection: string; replace?: string } | null>(null);

  const form = useForm({
    initialValues: { Name: '', UseResource: '%Admin_Manage:USE', EditResource: '%Admin_Secure:USE' },
    validate: { Name: collectionRules, UseResource: resourceRules, EditResource: resourceRules },
  });
  const save = useApiMutation(
    (v: { Name: string; UseResource?: string; EditResource?: string }) =>
      run(
        api().PUT('/v2/wallet/collection', {
          params: { query: { name: v.Name } },
          body: {
            ...(v.UseResource !== undefined ? { UseResource: v.UseResource.trim() } : {}),
            ...(v.EditResource !== undefined ? { EditResource: v.EditResource.trim() } : {}),
          },
        }),
        'PUT',
      ),
    {
      success: (_d, v) => `Wallet collection ${v.Name} ${editing ? 'saved' : 'created'}`,
      invalidate: [secKeys.walletCollections],
      onSuccess: () => {
        close();
        form.reset();
        setEditing(null);
      },
    },
  );
  const removeCollection = useApiMutation(
    (name: string) => run(api().DELETE('/v2/wallet/collection', { params: { query: { name } } }), 'DELETE'),
    {
      success: (_d, name) => `Wallet collection ${name} deleted`,
      invalidate: [secKeys.walletCollections],
      onSuccess: (_d, name) => {
        if (selected === name) setSelected(null);
      },
    },
  );

  const secretForm = useForm({
    initialValues: {
      name: '',
      Type: '%Wallet.KeyValue' as SecretType,
      entries: [{ key: 'user', value: '' }] as { key: string; value: string }[],
      Usage: ['HTTP'] as string[],
      RequireTLS: true,
      AllowedHosts: [] as string[],
      configJson: '{\n  \n}',
    },
    validate: {
      name: (v) => (/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v) ? null : 'Letters, digits, _ . and -'),
      entries: {
        key: (v, values) => (values.Type !== '%Wallet.KeyValue' || v.trim() ? null : 'Required'),
      },
      configJson: (v, values) => {
        if (values.Type === '%Wallet.KeyValue') return null;
        try {
          const parsed = JSON.parse(v) as unknown;
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? null : 'A JSON object';
        } catch {
          return 'Not valid JSON';
        }
      },
    },
  });
  const putSecret = useApiMutation(
    (v: typeof secretForm.values & { collection: string }) => {
      const config: Record<string, unknown> =
        v.Type === '%Wallet.KeyValue'
          ? {
              Secret: Object.fromEntries(
                v.entries.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value]),
              ),
              Usage: v.Usage,
              RequireTLS: v.RequireTLS,
              AllowedHosts: v.AllowedHosts,
            }
          : (JSON.parse(v.configJson) as Record<string, unknown>);
      return run(
        api().PUT('/v2/wallet/secret', {
          params: { query: { name: fullSecretName(v.collection, v.name) } },
          body: { Type: v.Type, WalletSecretConfig: config as Schemas['WalletSecret']['WalletSecretConfig'] },
        }),
        'PUT',
      );
    },
    {
      success: (_d, v) =>
        `Wallet secret ${fullSecretName(v.collection, v.name)} ${secretTarget?.replace ? 'replaced' : 'created'}`,
      invalidate: [secKeys.walletCollections, ['security', 'wallet', 'secrets']],
      onSuccess: () => {
        closeSecret();
        secretForm.reset();
        setSecretTarget(null);
      },
    },
  );
  const removeSecret = useApiMutation(
    (name: string) => run(api().DELETE('/v2/wallet/secret', { params: { query: { name } } }), 'DELETE'),
    {
      success: (_d, name) => `Wallet secret ${name} deleted`,
      invalidate: [['security', 'wallet', 'secrets']],
    },
  );

  const startSecret = (collection: string, replace?: string) => {
    secretForm.reset();
    if (replace) secretForm.setFieldValue('name', replace);
    setSecretTarget({ collection, replace });
    openSecret();
  };
  const confirmDeleteCollection = (row: CollectionRow) =>
    confirmDanger({
      title: 'Delete wallet collection',
      message: (
        <>
          Delete <b>{row.Name}</b> and the {row.secrets?.length ?? 'unknown number of'} secret
          {row.secrets?.length === 1 ? '' : 's'} it holds? Configurations that use them stop working, and the
          values cannot be recovered.
        </>
      ),
      confirmText: row.Name ?? '',
      confirmLabel: 'Delete collection',
      onConfirm: () => removeCollection.mutateAsync(row.Name ?? ''),
    });

  const columns: ColumnDef<CollectionRow, unknown>[] = [
    { accessorKey: 'Name', header: 'Collection', cell: (c) => <b>{String(c.getValue())}</b> },
    {
      id: 'secrets',
      header: 'Secrets',
      accessorFn: (r) => r.secrets?.length ?? -1,
      cell: ({ row }) =>
        row.original.secretsError ? (
          <Text size="sm" c="red">
            {row.original.secretsError}
          </Text>
        ) : row.original.secrets ? (
          <Group gap={4} wrap="wrap">
            <Text size="sm">{row.original.secrets.length}</Text>
            {[...new Set(row.original.secrets.map((s) => (s.Type ?? '').replace(/^%Wallet\./, '')))]
              .filter(Boolean)
              .map((t) => (
                <Badge key={t} size="xs" variant="light" tt="none">
                  {t}
                </Badge>
              ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            reading…
          </Text>
        ),
    },
    {
      accessorKey: 'UseResource',
      header: 'To use a secret',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      accessorKey: 'EditResource',
      header: 'To edit secrets',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Open the collection">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Open"
              onClick={(e) => {
                stop(e);
                setSelected(row.original.Name ?? null);
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Add a secret">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Add secret"
              onClick={(e) => {
                stop(e);
                startSecret(row.original.Name ?? '');
              }}
            >
              <IconKey size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit resources">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Edit"
              onClick={async (e) => {
                stop(e);
                let d: Awaited<ReturnType<typeof readCollection>>;
                try {
                  d = await readCollection(row.original.Name ?? '');
                } catch (err) {
                  notifyError(err, 'Cannot open the collection');
                  return;
                }
                setBefore(d as Record<string, unknown>);
                setEditing(row.original.Name ?? '');
                form.setValues({
                  Name: row.original.Name ?? '',
                  UseResource: d.UseResource ?? '',
                  EditResource: d.EditResource ?? '',
                });
                open();
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete collection">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDeleteCollection(row.original);
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  const selectedRow = rows.find((r) => r.Name === selected) ?? null;
  const secretColumns: ColumnDef<Schemas['WalletSecretList'][number], unknown>[] = [
    {
      id: 'name',
      header: 'Secret',
      accessorFn: (r) => shortSecretName(r.Name, selected ?? ''),
      cell: (c) => <b className="mono">{String(c.getValue())}</b>,
    },
    {
      accessorKey: 'Type',
      header: 'Type',
      cell: (c) => (
        <Badge size="sm" variant="light" tt="none">
          {String(c.getValue() ?? '').replace(/^%Wallet\./, '')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Replace the value">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Replace"
              onClick={(e) => {
                stop(e);
                startSecret(selected ?? '', shortSecretName(row.original.Name, selected ?? ''));
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete secret">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete secret"
              onClick={(e) => {
                stop(e);
                const short = shortSecretName(row.original.Name, selected ?? '');
                confirmDanger({
                  title: 'Delete wallet secret',
                  message: (
                    <>
                      Delete <b>{row.original.Name}</b>? Whatever uses it (an HTTP adapter, a SQL gateway, a
                      signing key) stops working, and the value cannot be recovered.
                    </>
                  ),
                  confirmText: short,
                  confirmLabel: 'Delete secret',
                  onConfirm: () => removeSecret.mutateAsync(row.original.Name ?? ''),
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

  if (!allowed)
    return (
      <Alert
        color="gray"
        variant="light"
        icon={<IconInfoCircle size={18} />}
        title="Not readable with this account"
      >
        The wallet needs <span className="mono">%Admin_Wallet:U</span>, which this account does not hold.
      </Alert>
    );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="xs">
          <PrivilegeBadge resources={WALLET} />
          <Text size="sm" c="dimmed">
            A collection's <span className="mono">UseResource</span> gates reading a secret's value from code
            and its <span className="mono">EditResource</span> gates changing it. The API lists names and
            types only.
          </Text>
        </Group>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={() => list.refetch()}
            loading={list.isFetching}
          >
            Refresh
          </Button>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setEditing(null);
              form.reset();
              open();
            }}
          >
            Create collection
          </Button>
        </Group>
      </Group>
      <DataTable
        stateKey="wallet"
        exportName="wallet-collections"
        data={rows}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        getRowId={(r) => r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
        emptyMessage="No wallet collections on this instance"
        dense
      />

      <Drawer
        opened={!!selectedRow}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={
          <b>
            Wallet collection <span className="mono">{selectedRow?.Name}</span>
          </b>
        }
      >
        {selectedRow ? (
          <Stack gap="sm">
            <Group gap="lg" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  To use a secret
                </Text>
                <Text size="sm" className="mono">
                  {selectedRow.UseResource}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  To edit secrets
                </Text>
                <Text size="sm" className="mono">
                  {selectedRow.EditResource}
                </Text>
              </div>
            </Group>
            <Group justify="space-between">
              <Title order={5}>Secrets</Title>
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => startSecret(selectedRow.Name ?? '')}
              >
                Add secret
              </Button>
            </Group>
            <DataTable
              data={selectedRow.secrets}
              columns={secretColumns}
              loading={!selectedRow.secrets && !selectedRow.secretsError}
              error={selectedRow.secretsError ? new Error(selectedRow.secretsError) : undefined}
              getRowId={(r) => r.Name ?? ''}
              emptyMessage="This collection holds no secrets yet"
              hideColumnMenu
              dense
            />
            <Text size="xs" c="dimmed">
              Values are write-only: <span className="mono">GET /v2/wallet/secrets</span> answers names and
              types, nothing in the API returns a value, and Aperture never asks for one.
            </Text>
          </Stack>
        ) : null}
      </Drawer>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? `Edit ${editing}` : 'Create wallet collection'}
        centered
      >
        <form
          onSubmit={form.onSubmit((v) =>
            editing
              ? reviewChanges({
                  title: `Review changes to ${editing}`,
                  before,
                  after: { UseResource: v.UseResource.trim(), EditResource: v.EditResource.trim() },
                  refetch: () => readCollection(editing) as Promise<Record<string, unknown>>,
                  onConfirm: () => save.mutateAsync(v),
                })
              : save.mutate(v),
          )}
        >
          <Stack gap="sm">
            <TextInput label="Name" disabled={!!editing} data-autofocus {...form.getInputProps('Name')} />
            <TextInput
              label="Resource required to use a secret"
              description="resource:permission, e.g. %Admin_Manage:USE (READ when the permission is omitted)"
              {...form.getInputProps('UseResource')}
            />
            <TextInput
              label="Resource required to add, edit or remove secrets"
              description="e.g. %Admin_Secure:USE (WRITE when the permission is omitted)"
              {...form.getInputProps('EditResource')}
            />
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

      <Modal
        opened={secretOpen}
        onClose={closeSecret}
        title={
          secretTarget?.replace
            ? `Replace ${secretTarget.collection}.${secretTarget.replace}`
            : `Add a secret to ${secretTarget?.collection ?? ''}`
        }
        centered
        size="lg"
      >
        <form
          onSubmit={secretForm.onSubmit((v) =>
            putSecret.mutate({ ...v, collection: secretTarget?.collection ?? '' }),
          )}
        >
          <Stack gap="sm">
            <Group grow>
              <TextInput
                label="Secret name"
                description={`Stored as ${secretTarget?.collection ?? ''}.<name>`}
                disabled={!!secretTarget?.replace}
                data-autofocus
                {...secretForm.getInputProps('name')}
              />
              <Select
                label="Type"
                data={SECRET_TYPES}
                allowDeselect={false}
                {...secretForm.getInputProps('Type')}
              />
            </Group>
            {secretForm.values.Type === '%Wallet.KeyValue' ? (
              <>
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Values
                  </Text>
                  {secretForm.values.entries.map((_, i) => (
                    <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                      <TextInput
                        placeholder="key, e.g. user"
                        aria-label={`Key ${i + 1}`}
                        style={{ flex: 1 }}
                        {...secretForm.getInputProps(`entries.${i}.key`)}
                      />
                      <PasswordInput
                        placeholder="value"
                        aria-label={`Value ${i + 1}`}
                        autoComplete="new-password"
                        style={{ flex: 2 }}
                        {...secretForm.getInputProps(`entries.${i}.value`)}
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Remove entry"
                        disabled={secretForm.values.entries.length === 1}
                        onClick={() => secretForm.removeListItem('entries', i)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  ))}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconPlus size={12} />}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => secretForm.insertListItem('entries', { key: '', value: '' })}
                  >
                    Another entry
                  </Button>
                </Stack>
                <Group grow align="flex-start">
                  <MultiSelect label="Usage" data={USAGES} {...secretForm.getInputProps('Usage')} />
                  <TagsInput
                    label="Allowed hosts"
                    description="Hosts the secret may be sent to over HTTP"
                    placeholder="host, Enter"
                    {...secretForm.getInputProps('AllowedHosts')}
                  />
                </Group>
                <Checkbox
                  label="Require TLS when the secret is sent in an HTTP request"
                  {...secretForm.getInputProps('RequireTLS', { type: 'checkbox' })}
                />
              </>
            ) : (
              <Textarea
                label="WalletSecretConfig (JSON)"
                description="Passed as it is to the Create or Modify method of the secret's class"
                autosize
                minRows={4}
                className="mono"
                {...secretForm.getInputProps('configJson')}
              />
            )}
            <Text size="xs" c="dimmed">
              The value is sent once, over this session's connection, and never shown again anywhere in
              Aperture.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeSecret}>
                Cancel
              </Button>
              <Button type="submit" loading={putSecret.isPending}>
                {secretTarget?.replace ? 'Replace' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
