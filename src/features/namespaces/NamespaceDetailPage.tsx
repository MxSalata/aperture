import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { ErrorAlert } from '@/components/ErrorAlert';
import { useConfigDatabases } from '@/features/databases/useDatabases';
import { nsKeys } from './NamespacesPage';

type Kind = 'global' | 'package' | 'routine';
const KINDS: {
  kind: Kind;
  label: string;
  list: '/v2/namespace/global-mappings' | '/v2/namespace/package-mappings' | '/v2/namespace/routine-mappings';
  one: '/v2/namespace/global-mapping' | '/v2/namespace/package-mapping' | '/v2/namespace/routine-mapping';
  hint: string;
}[] = [
  {
    kind: 'global',
    label: 'Global mappings',
    list: '/v2/namespace/global-mappings',
    one: '/v2/namespace/global-mapping',
    hint: 'Map a global (optionally a subscript range) to another database',
  },
  {
    kind: 'package',
    label: 'Package mappings',
    list: '/v2/namespace/package-mappings',
    one: '/v2/namespace/package-mapping',
    hint: 'Make classes of a package visible from another database',
  },
  {
    kind: 'routine',
    label: 'Routine mappings',
    list: '/v2/namespace/routine-mappings',
    one: '/v2/namespace/routine-mapping',
    hint: 'Map routines (MAC, INT, INC, OBJ) to another database',
  },
];

function MappingsTab({
  ns,
  kind,
  dbOptions,
}: {
  ns: string;
  kind: (typeof KINDS)[number];
  dbOptions: string[];
}) {
  const key = [...nsKeys.one(ns), kind.kind] as const;
  const list = useQuery({
    queryKey: key,
    queryFn: () => result(api().GET(kind.list, { params: { query: { namespace: ns } } })),
  });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: { Name: '', Database: '', LockDatabase: '', Type: 'ALL' },
    validate: { Name: (v) => (v ? null : 'Required'), Database: (v) => (v ? null : 'Required') },
  });
  const add = useApiMutation(
    (v: typeof form.values) => {
      const params = { query: { namespace: ns, name: v.Name } };
      if (kind.kind === 'global')
        return run(
          api().PUT('/v2/namespace/global-mapping', {
            params,
            body: { Database: v.Database, LockDatabase: v.LockDatabase || v.Database },
          }),
          'PUT',
        );
      if (kind.kind === 'package')
        return run(
          api().PUT('/v2/namespace/package-mapping', { params, body: { Database: v.Database } }),
          'PUT',
        );
      return run(
        api().PUT('/v2/namespace/routine-mapping', { params, body: { Database: v.Database, Type: v.Type } }),
        'PUT',
      );
    },
    {
      invalidate: [key],
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );
  const del = useApiMutation(
    (name: string) => run(api().DELETE(kind.one, { params: { query: { namespace: ns, name } } }), 'DELETE'),
    { invalidate: [key] },
  );

  type Row = Record<string, unknown> & { Name?: string };
  const rows = (list.data ?? []) as Row[];
  const cols: ColumnDef<Row, unknown>[] = [
    ...Object.keys(rows[0] ?? { Name: '', Database: '' }).map((k) => ({
      accessorKey: k,
      header: k,
      cell: (c: { getValue: () => unknown }) => (
        <span className={k === 'Name' ? 'mono' : undefined}>{String(c.getValue() ?? '')}</span>
      ),
    })),
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Tooltip label="Delete mapping">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            onClick={(e) => {
              stop(e);
              confirmDanger({
                title: 'Delete mapping',
                message: `Delete the ${kind.kind} mapping ${row.original.Name}?`,
                confirmLabel: 'Delete',
                onConfirm: () => del.mutateAsync(row.original.Name ?? ''),
              });
            }}
            aria-label="Delete mapping"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ];

  return (
    <Stack gap="sm" pt="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {kind.hint}
        </Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
          Add
        </Button>
      </Group>
      <DataTable
        data={rows}
        columns={cols}
        loading={list.isPending}
        error={list.error}
        searchable={rows.length > 5}
        hideColumnMenu
        dense
        emptyMessage="No mappings"
      />
      <Modal opened={opened} onClose={close} title={`Add ${kind.kind} mapping to ${ns}`} centered>
        <form onSubmit={form.onSubmit((v) => add.mutate(v))}>
          <Stack gap="sm">
            <TextInput
              label={
                kind.kind === 'global'
                  ? 'Global name (e.g. MyGlobal or MyGlobal("sub"))'
                  : kind.kind === 'package'
                    ? 'Package name'
                    : 'Routine name or prefix (e.g. MyRtn*)'
              }
              data-autofocus
              {...form.getInputProps('Name')}
            />
            <Select label="Database" data={dbOptions} searchable {...form.getInputProps('Database')} />
            {kind.kind === 'global' ? (
              <Select
                label="Lock database"
                placeholder="same as database"
                data={dbOptions}
                searchable
                clearable
                {...form.getInputProps('LockDatabase')}
              />
            ) : null}
            {kind.kind === 'routine' ? (
              <Select
                label="Routine type"
                data={['ALL', 'MAC', 'INT', 'INC', 'OBJ']}
                {...form.getInputProps('Type')}
              />
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={add.isPending}>
                Add
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

export default function NamespaceDetailPage() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const ns = useQuery({
    queryKey: nsKeys.one(name),
    queryFn: () => result(api().GET('/v2/namespace', { params: { query: { name } } })),
  });
  const all = useQuery({ queryKey: nsKeys.list, queryFn: () => result(api().GET('/v2/namespaces')) });
  const dbs = useConfigDatabases();
  const dbOptions = (dbs.data ?? []).map((d) => d.Name ?? '').filter(Boolean);
  const [copyOpen, setCopyOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  const interop = useApiMutation(
    () => run(api().POST('/v2/namespace/enable-interop', { params: { query: { name } } })),
    { invalidate: [nsKeys.one(name)] },
  );
  const copy = useApiMutation(
    (src: string) =>
      run(
        api().POST('/v2/namespace/copy-mappings', {
          body: { SourceNamespace: src, DestinationNamespace: name },
        }),
      ),
    { invalidate: [nsKeys.one(name)], onSuccess: () => setCopyOpen(false) },
  );
  const remove = useApiMutation(
    () => run(api().DELETE('/v2/namespace', { params: { query: { name } } }), 'DELETE'),
    { invalidate: [nsKeys.list], onSuccess: () => navigate('/namespaces') },
  );

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/namespaces"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Namespaces
        </Button>
      </Group>
      <PageHeader
        title={name}
        description="Namespace definition and its mappings."
        privileges={['%Admin_Manage:U']}
        actions={
          <Menu shadow="md" withinPortal>
            <Menu.Target>
              <Button size="xs" rightSection={<IconChevronDown size={14} />}>
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                onClick={() =>
                  confirmDanger({
                    title: 'Enable interoperability',
                    message: `Enable interoperability (productions) in ${name}? This maps the Ens* packages and creates the %Ens_* resources.`,
                    confirmLabel: 'Enable',
                    color: 'indigo',
                    onConfirm: () => interop.mutateAsync(),
                  })
                }
              >
                Enable interoperability
              </Menu.Item>
              <Menu.Item onClick={() => setCopyOpen(true)}>Copy mappings from…</Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() =>
                  confirmDanger({
                    title: 'Delete namespace',
                    message: (
                      <>
                        Delete namespace <b>{name}</b> and its web applications? Databases are kept.
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
        }
      />
      {ns.isError ? <ErrorAlert error={ns.error} onRetry={() => ns.refetch()} /> : null}
      <Paper p="md" mb="md">
        {ns.data ? (
          <KeyValueList cols={3} items={objectToItems(ns.data as Record<string, unknown>)} />
        ) : (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        )}
      </Paper>
      <Paper p="md">
        <Tabs defaultValue="global">
          <Tabs.List>
            {KINDS.map((k) => (
              <Tabs.Tab key={k.kind} value={k.kind}>
                {k.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {KINDS.map((k) => (
            <Tabs.Panel key={k.kind} value={k.kind}>
              <MappingsTab ns={name} kind={k} dbOptions={dbOptions} />
            </Tabs.Panel>
          ))}
        </Tabs>
      </Paper>
      <Modal
        opened={copyOpen}
        onClose={() => setCopyOpen(false)}
        title={`Copy mappings into ${name}`}
        centered
      >
        <Stack gap="sm">
          <Select
            label="Source namespace"
            data={(all.data ?? []).map((n) => n.Name ?? '').filter((n) => n && n !== name)}
            value={source}
            onChange={setSource}
            searchable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!source} loading={copy.isPending} onClick={() => source && copy.mutate(source)}>
              Copy
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
