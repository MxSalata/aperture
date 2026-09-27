import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/lib/errors';
import { useNavigate } from 'react-router';
import { api, run } from '@/api/hooks';
import { useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge, BoolBadge } from '@/components/StatusBadge';
import { formatMB } from '@/lib/format';
import {
  dbKeys,
  dirKey,
  joinDatabases,
  suggestDirectory,
  useConfigDatabases,
  useDatabaseVolumes,
  useLocalDatabases,
  type DatabaseRow,
} from './useDatabases';
import { diskFreeOf, storageLocations, type SpaceLevel, type StorageLocation } from './storage';

export function databaseDetailUrl(row: { Name?: string; Directory?: string }) {
  const q = new URLSearchParams();
  if (row.Directory) q.set('dir', row.Directory);
  if (row.Name) q.set('name', row.Name);
  return `/databases/detail?${q.toString()}`;
}

/** Says in words, not colour alone, that a disk is running out of space. */
function SpaceBadge({ level }: { level?: SpaceLevel }) {
  if (level !== 'low' && level !== 'critical') return null;
  return (
    <Badge size="xs" color={level === 'critical' ? 'red' : 'orange'}>
      {level === 'critical' ? 'critical' : 'low'}
    </Badge>
  );
}

/** Where the database files live and how much room each disk has left. */
function DiskSpace({ locations }: { locations: StorageLocation[] }) {
  if (!locations.length) return null;
  return (
    <Paper p="sm" mb="md">
      <Group justify="space-between" mb="xs" gap="xs">
        <Text fw={600} size="sm">
          Disk space
        </Text>
        <Text size="xs" c="dimmed">
          Free space IRIS reports on the disks that hold the database files
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {locations.map((l) => (
          <Stack key={l.path} gap={2}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" className="mono" truncate title={l.path}>
                {l.path}
              </Text>
              <SpaceBadge level={l.level} />
            </Group>
            <Text size="lg" fw={650} className="tabular">
              {formatMB(l.freeMB)} free
            </Text>
            <Text size="xs" c="dimmed">
              {l.databases.length} database{l.databases.length === 1 ? '' : 's'} · {formatMB(l.usedMB)}:{' '}
              {l.databases.slice(0, 6).join(', ')}
              {l.databases.length > 6 ? ` and ${l.databases.length - 6} more` : ''}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

const columns: ColumnDef<DatabaseRow, unknown>[] = [
  {
    accessorKey: 'Name',
    header: 'Name',
    cell: (c) => (
      <Text fw={600} size="sm">
        {(c.getValue() as string) || (
          <Text span c="dimmed" fs="italic">
            no config entry
          </Text>
        )}
      </Text>
    ),
  },
  {
    accessorKey: 'Directory',
    header: 'Directory',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'Status', header: 'Status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  {
    accessorKey: 'SizeMB',
    header: 'Size',
    cell: (c) => <span className="tabular">{formatMB(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'MaxSize',
    header: 'Max size',
    cell: (c) => <span className="tabular">{formatMB(c.getValue() as string)}</span>,
  },
  {
    accessorKey: 'DiskFreeMB',
    header: 'Disk free',
    cell: ({ row }) => (
      <Group gap={6} wrap="nowrap">
        <span className="tabular">{formatMB(row.original.DiskFreeMB)}</span>
        <SpaceBadge level={row.original.DiskLevel} />
      </Group>
    ),
  },
  {
    accessorKey: 'Resource',
    header: 'Resource',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    id: 'flags',
    header: 'Flags',
    cell: ({ row }) => (
      <Group gap={4}>
        {row.original.Encrypted ? (
          <Badge size="xs" color="grape">
            encrypted
          </Badge>
        ) : null}
        {row.original.Mirrored ? (
          <Badge size="xs" color="cyan">
            mirrored
          </Badge>
        ) : null}
        {row.original.Server ? (
          <Badge size="xs" color="orange">
            remote: {row.original.Server}
          </Badge>
        ) : null}
        {row.original.MountRequired ? (
          <Badge size="xs" color="gray">
            mount required
          </Badge>
        ) : null}
      </Group>
    ),
  },
  {
    accessorKey: 'MountAtStartup',
    header: 'Mount at startup',
    cell: (c) => <BoolBadge value={c.getValue() as boolean} />,
  },
];

function CreateDatabaseModal({
  opened,
  onClose,
  rows,
}: {
  opened: boolean;
  onClose: () => void;
  rows: DatabaseRow[];
}) {
  const queryClient = useQueryClient();
  const userDir = rows.find((r) => r.Name === 'USER')?.Directory;
  const suggest = (name: string) =>
    suggestDirectory(
      rows.map((r) => r.Directory),
      name,
      userDir,
    );
  const form = useForm({
    initialValues: {
      Name: '',
      Directory: '',
      Size: 1,
      ResourceName: '',
      GlobalJournalState: true,
      Encrypted: false,
      BlockSize: '8192',
      createConfig: true,
      MountAtStartup: true,
    },
    validate: {
      Name: (v) => (/^[A-Za-z%][A-Za-z0-9_-]*$/.test(v) ? null : 'Letters, digits, - and _ only'),
      Directory: (v) => (v.trim() ? null : 'Directory is required'),
    },
  });
  const create = useApiMutation(
    async (v: typeof form.values) => {
      const local = await run(
        api().POST('/v2/database-dir', {
          body: {
            Directory: v.Directory,
            Size: v.Size,
            ResourceName: v.ResourceName || undefined,
            GlobalJournalState: v.GlobalJournalState,
            Encrypted: v.Encrypted,
            BlockSize: Number(v.BlockSize),
          },
        }),
      );
      if (v.createConfig) {
        // Two calls, no transaction: if the second fails, say that the file exists and what is missing.
        try {
          await run(
            api().PUT('/v2/database', {
              params: { query: { name: v.Name } },
              body: {
                Directory: v.Directory,
                MountAtStartup: v.MountAtStartup,
                MountRequired: false,
                ClusterMountMode: false,
              },
            }),
            'PUT',
          );
        } catch (e) {
          void queryClient.invalidateQueries({ queryKey: dbKeys.local });
          throw new Error(
            `The database file was created in ${v.Directory}, but registering it as ${v.Name.toUpperCase()} failed: ${describeError(e)}. It is listed as "no config entry".`,
          );
        }
      }
      return {
        summary: `Database ${v.Name.toUpperCase()} created${v.createConfig ? ' and registered' : ''}`,
        console: local.console,
      };
    },
    {
      invalidate: [dbKeys.config, dbKeys.local],
      onSuccess: () => {
        onClose();
        form.reset();
      },
    },
  );
  return (
    <Modal opened={opened} onClose={onClose} title="Create database" centered>
      <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="MYAPP"
            description="Config.Databases entry"
            data-autofocus
            {...form.getInputProps('Name')}
            onBlur={() => {
              if (!form.values.Directory && form.values.Name)
                form.setFieldValue('Directory', suggest(form.values.Name) ?? '');
            }}
          />
          <TextInput
            label="Directory"
            placeholder={suggest('myapp') ?? '/usr/irissys/mgr/myapp/'}
            description="Absolute path on the IRIS host; created if missing"
            {...form.getInputProps('Directory')}
          />
          <Group grow>
            <NumberInput label="Initial size (MB)" min={1} {...form.getInputProps('Size')} />
            <Select
              label="Block size"
              data={['8192', '16384', '32768', '65536']}
              {...form.getInputProps('BlockSize')}
            />
          </Group>
          <TextInput
            label="Resource"
            placeholder="%DB_MYAPP (created if missing)"
            {...form.getInputProps('ResourceName')}
          />
          <Checkbox
            label="Journal globals"
            {...form.getInputProps('GlobalJournalState', { type: 'checkbox' })}
          />
          <Checkbox
            label="Encrypt with the default key"
            {...form.getInputProps('Encrypted', { type: 'checkbox' })}
          />
          <Checkbox
            label="Also create the configuration entry (PUT /v2/database)"
            {...form.getInputProps('createConfig', { type: 'checkbox' })}
          />
          <Checkbox
            label="Mount at startup"
            disabled={!form.values.createConfig}
            {...form.getInputProps('MountAtStartup', { type: 'checkbox' })}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default function DatabasesPage() {
  const config = useConfigDatabases();
  const local = useLocalDatabases();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const joined = useMemo(() => joinDatabases(config.data, local.data), [config.data, local.data]);
  const dirs = useMemo(() => joined.flatMap((r) => (r.Directory && r.local ? [r.Directory] : [])), [joined]);
  const volumes = useDatabaseVolumes(dirs);
  const locations = useMemo(
    () =>
      storageLocations(
        joined.map((r) => ({
          name: r.Name || r.Directory || '',
          volumes: (r.Directory && volumes.data?.get(dirKey(r.Directory))) || [],
        })),
      ),
    [joined, volumes.data],
  );
  const rows = useMemo(
    () =>
      joined.map((r) => {
        const free = diskFreeOf(r.Directory ? volumes.data?.get(dirKey(r.Directory)) : undefined);
        const name = r.Name || r.Directory || '';
        return free === undefined
          ? r
          : { ...r, DiskFreeMB: free, DiskLevel: locations.find((l) => l.databases.includes(name))?.level };
      }),
    [joined, volumes.data, locations],
  );
  const totalMB = rows.reduce((a, r) => a + (r.SizeMB ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Databases"
        description="Config.Databases entries joined with the local database files behind them. Open a database for metrics, mount/dismount, compaction, defragmentation and integrity checks."
        privileges={['%Admin_Manage:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                config.refetch();
                local.refetch();
                volumes.refetch();
              }}
              loading={config.isFetching || local.isFetching || volumes.isFetching}
            >
              Refresh
            </Button>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
              Create database
            </Button>
          </>
        }
      />
      <DiskSpace locations={locations} />
      <DataTable
        stateKey="databases"
        exportName="databases"
        getRowLabel={(row) => `Open database ${row.Name ?? row.Directory ?? ''}`}
        data={rows}
        columns={columns}
        loading={config.isPending || local.isPending}
        error={config.error ?? local.error}
        onRowClick={(row) => navigate(databaseDetailUrl(row))}
        getRowId={(r) => r.Directory ?? r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
        toolbar={
          <Text size="xs" c="dimmed" className="tabular">
            {rows.length} databases · {formatMB(totalMB)} on disk
          </Text>
        }
      />
      <CreateDatabaseModal opened={opened} onClose={close} rows={rows} />
    </>
  );
}
