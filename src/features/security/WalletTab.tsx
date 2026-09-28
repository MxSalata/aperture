import { RefreshControl } from '@/components/RefreshControl';
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQueries, useQuery } from '@tanstack/react-query';
import { IconEye, IconInfoCircle, IconKey, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { canUse } from '@/api/privileges';
import type { Schemas } from '@/api/types';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { PrivilegeBadge } from '@/components/PrivilegeBadge';
import { createLimiter } from '@/lib/limiter';
import { notifyError } from '@/lib/notify';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';
import { readCollection, shortSecretName } from './wallet';
import { WalletCollectionDialog, type CollectionEdit } from './WalletCollectionDialog';
import { WalletSecretDialog, type SecretTarget } from './WalletSecretDialog';

const WALLET = ['%Admin_Wallet:U'] as const;

type CollectionRow = Schemas['WalletCollectionList'][number] & {
  secrets?: Schemas['WalletSecretList'];
  secretsError?: string;
};

/** At most four secret lists in flight while the collections load (one request per collection). */
const secretReads = createLimiter(4);

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
  // Each opening of a dialog mounts it afresh (`run` is its key), so its form starts from what it is given.
  const [collectionDialog, setCollectionDialog] = useState<{ run: number; edit: CollectionEdit | null }>({
    run: 0,
    edit: null,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [secretOpen, { open: openSecret, close: closeSecret }] = useDisclosure(false);
  const [secretDialog, setSecretDialog] = useState<{ run: number; target: SecretTarget | null }>({
    run: 0,
    target: null,
  });

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

  const removeSecret = useApiMutation(
    (name: string) => run(api().DELETE('/v2/wallet/secret', { params: { query: { name } } }), 'DELETE'),
    {
      success: (_d, name) => `Wallet secret ${name} deleted`,
      invalidate: [['security', 'wallet', 'secrets']],
    },
  );

  const startSecret = (collection: string, replace?: string) => {
    setSecretDialog((s) => ({ run: s.run + 1, target: { collection, replace } }));
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
                setCollectionDialog((c) => ({
                  run: c.run + 1,
                  edit: {
                    name: row.original.Name ?? '',
                    UseResource: d.UseResource ?? '',
                    EditResource: d.EditResource ?? '',
                    before: d as Record<string, unknown>,
                  },
                }));
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
          <RefreshControl screen="wallet" onRefresh={() => list.refetch()} loading={list.isFetching} />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setCollectionDialog((c) => ({ run: c.run + 1, edit: null }));
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

      <WalletCollectionDialog
        key={collectionDialog.run}
        opened={opened}
        onClose={close}
        edit={collectionDialog.edit}
      />
      <WalletSecretDialog
        key={secretDialog.run}
        opened={secretOpen}
        onClose={closeSecret}
        target={secretDialog.target}
      />
    </Stack>
  );
}
