import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { api, run } from '@/api/hooks';
import { useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge, BoolBadge } from '@/components/StatusBadge';
import { formatMB } from '@/lib/format';
import {
  dbKeys,
  joinDatabases,
  useConfigDatabases,
  useLocalDatabases,
  type DatabaseRow,
} from './useDatabases';

export function databaseDetailUrl(row: { Name?: string; Directory?: string }) {
  const q = new URLSearchParams();
  if (row.Directory) q.set('dir', row.Directory);
  if (row.Name) q.set('name', row.Name);
  return `/databases/detail?${q.toString()}`;
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

function CreateDatabaseModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
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
                form.setFieldValue('Directory', `/usr/irissys/mgr/${form.values.Name.toLowerCase()}/`);
            }}
          />
          <TextInput
            label="Directory"
            placeholder="/usr/irissys/mgr/myapp/"
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
  const rows = useMemo(() => joinDatabases(config.data, local.data), [config.data, local.data]);
  const totalMB = rows.reduce((a, r) => a + (r.SizeMB ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Databases"
        description="Config.Databases entries joined with the local database files behind them. Open a database for metrics, mount/dismount, compaction, defragmentation and integrity checks."
        privileges={['%Admin_Manage:U', '%Admin_Operate:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                config.refetch();
                local.refetch();
              }}
              loading={config.isFetching || local.isFetching}
            >
              Refresh
            </Button>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
              Create database
            </Button>
          </>
        }
      />
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
      <CreateDatabaseModal opened={opened} onClose={close} />
    </>
  );
}
