import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconChevronDown, IconInfoCircle, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, call, result, run, useApiMutation, useAsyncResult, jobHeaders, SILENT } from '@/api/hooks';
import type { Schemas } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { formatDateTime, formatMB, formatNumber } from '@/lib/format';
import { useJobs } from '@/stores/jobs';
import { describeError } from '@/lib/errors';
import { dbKeys } from './useDatabases';

type Metrics = Schemas['AsyncTaskResultDatabaseMetrics'];

function NumberModal({
  opened,
  onClose,
  title,
  label,
  description,
  initial,
  min,
  onSubmit,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  label: string;
  description?: string;
  initial: number;
  min?: number;
  onSubmit: (v: number) => void;
  loading: boolean;
}) {
  const form = useForm({ initialValues: { value: initial } });
  // The dialog is mounted with the page, before the metrics it defaults from have arrived:
  // take the current value each time it opens.
  useEffect(() => {
    if (opened) form.setValues({ value: initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form onSubmit={form.onSubmit((v) => onSubmit(Number(v.value)))}>
        <Stack gap="sm">
          <NumberInput
            label={label}
            description={description}
            min={min}
            data-autofocus
            {...form.getInputProps('value')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Start
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default function DatabaseDetailPage() {
  const [params] = useSearchParams();
  const dir = params.get('dir') ?? '';
  const name = params.get('name') ?? '';
  const navigate = useNavigate();
  const openDrawer = useJobs((s) => s.setDrawerOpen);

  const config = useQuery({
    queryKey: dbKeys.configOne(name),
    enabled: !!name,
    queryFn: () => result(api().GET('/v2/database', { params: { query: { name } } })),
  });
  const local = useQuery({
    queryKey: dbKeys.localOne(dir),
    enabled: !!dir,
    queryFn: () => result(api().GET('/v2/database-dir', { params: { query: { dir } } })),
  });
  const volumes = useQuery({
    queryKey: [...dbKeys.localOne(dir), 'volumes'],
    enabled: !!dir,
    queryFn: () => result(api().GET('/v2/database-dir/volumes', { params: { query: { dir } } })),
    retry: false,
  });
  const metrics = useAsyncResult<Metrics>({ queryKey: dbKeys.localOne(dir) });
  const { start: loadMetrics } = metrics;

  useEffect(() => {
    if (!dir) return;
    void loadMetrics(() =>
      call(api().POST('/v2/database-dir/info', { params: { query: { dir } }, headers: SILENT }), 'POST'),
    ).catch(() => undefined);
  }, [dir, loadMetrics]);

  const invalidate = [dbKeys.local, dbKeys.config, dbKeys.localOne(dir), dbKeys.configOne(name)];
  const q = { params: { query: { dir } } } as const;

  // mount and truncate declare optional bodies; IRIS answers 415 without one (quirk optional-body-415).
  const mount = useApiMutation(() => run(api().POST('/v2/database-dir/mount', { ...q, body: {} })), {
    invalidate,
  });
  const dismount = useApiMutation(() => run(api().POST('/v2/database-dir/dismount', q)), { invalidate });
  const truncate = useApiMutation(() => run(api().POST('/v2/database-dir/truncate', { ...q, body: {} })), {
    invalidate,
  });
  const startJob = useApiMutation(
    (
      job:
        | 'compact'
        | 'defragment'
        | 'integrity-check'
        | 'expand-volume'
        | { size: number }
        | { target: number },
    ) => {
      const headers = (label: string) => jobHeaders(label, name || dir);
      if (typeof job === 'object' && 'size' in job)
        return run(api().POST('/v2/database-dir/modify-size', { ...q, body: { Size: job.size } }));
      if (typeof job === 'object' && 'target' in job)
        return run(
          api().POST('/v2/database-dir/compact', {
            ...q,
            body: { TargetFreeSpace: job.target },
            headers: headers('Compact database'),
          }),
        );
      if (job === 'defragment')
        return run(
          api().POST('/v2/database-dir/defragment', { ...q, headers: headers('Defragment database') }),
        );
      if (job === 'integrity-check')
        return run(
          api().POST('/v2/database-dir/integrity-check', {
            body: { Databases: [{ Directory: dir }] },
            headers: headers('Integrity check'),
          }),
        );
      if (job === 'expand-volume')
        return run(api().POST('/v2/database-dir/expand-volume', { ...q, body: {} }));
      return run(
        api().POST('/v2/database-dir/compact', {
          ...q,
          body: { TargetFreeSpace: 0 },
          headers: headers('Compact database'),
        }),
      );
    },
    {
      invalidate,
      success: (data) =>
        data.response.status === 202 ? 'Task queued - follow it in the Job Center' : data.summary || 'Done',
      onSuccess: (data) => {
        if (data.response.status === 202) openDrawer(true);
        closeCompact();
        closeSize();
      },
    },
  );
  const editLocal = useApiMutation(
    (body: Schemas['LocalDatabase']) => run(api().PUT('/v2/database-dir', { ...q, body }), 'PUT'),
    { invalidate, onSuccess: () => closeEdit() },
  );
  const editConfig = useApiMutation(
    (body: Schemas['ConfigDatabase']) =>
      run(api().PUT('/v2/database', { params: { query: { name } }, body }), 'PUT'),
    { invalidate, onSuccess: () => closeConfig() },
  );
  const remove = useApiMutation(
    async (opts: { deleteFiles: boolean }) => {
      if (name) await run(api().DELETE('/v2/database', { params: { query: { name } } }), 'DELETE');
      if (opts.deleteFiles && dir) {
        try {
          await run(api().DELETE('/v2/database-dir', q), 'DELETE');
        } catch (e) {
          if (!name) throw e;
          throw new Error(
            `The configuration entry ${name} was removed, but deleting the files in ${dir} failed: ${describeError(e)}. They are listed as "no config entry".`,
          );
        }
      }
      return { summary: `Database ${name || dir} deleted` };
    },
    { invalidate, onSuccess: () => navigate('/databases') },
  );

  const [compactOpen, { open: openCompact, close: closeCompact }] = useDisclosure(false);
  const [sizeOpen, { open: openSize, close: closeSize }] = useDisclosure(false);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [configOpen, { open: openConfig, close: closeConfig }] = useDisclosure(false);

  const editForm = useForm<Schemas['LocalDatabase']>({ initialValues: {} });
  const configForm = useForm<Schemas['ConfigDatabase']>({ initialValues: {} });
  // Populate the form once the record arrives; the form object itself is stable.
  useEffect(() => {
    // Not while the dialog is open: a background refetch must not overwrite what is being typed.
    if (local.data && !editOpen) editForm.setValues(local.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.data, editOpen]);
  // Populate the form once the record arrives; the form object itself is stable.
  useEffect(() => {
    // Not while the dialog is open: a background refetch must not overwrite what is being typed.
    if (config.data && !configOpen) configForm.setValues(config.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data, configOpen]);

  const m = metrics.result;
  const mounted = m?.Mounted;
  const usedMB = m ? Math.max(0, (m.Size ?? 0) - (m.AvailableSpace ?? 0)) : undefined;
  const usedPct = m && m.Size ? Math.min(100, ((usedMB ?? 0) / m.Size) * 100) : 0;

  if (!dir && !name) return <ErrorAlert error="Missing database identifier" />;

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/databases"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Databases
        </Button>
      </Group>
      <PageHeader
        title={
          <Group gap="sm">
            <span>{name || dir}</span>
            {local.data?.ReadOnly || m?.ReadOnlyReason ? <Badge color="yellow">read-only</Badge> : null}
            {m?.Mirrored ? <Badge color="cyan">mirrored</Badge> : null}
            {m?.Encrypted ? <Badge color="grape">encrypted</Badge> : null}
          </Group>
        }
        description={<span className="mono">{dir}</span>}
        privileges={['%Admin_Manage:U', '%Admin_Operate:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              loading={metrics.running}
              onClick={() => {
                local.refetch();
                config.refetch();
                void loadMetrics(() =>
                  call(api().POST('/v2/database-dir/info', { ...q, headers: SILENT }), 'POST'),
                ).catch(() => undefined);
              }}
            >
              Refresh
            </Button>
            <Menu shadow="md" withinPortal>
              <Menu.Target>
                <Button size="xs" rightSection={<IconChevronDown size={14} />}>
                  Actions
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Operate (%Admin_Operate)</Menu.Label>
                <Menu.Item onClick={() => mount.mutate()} disabled={mounted === true}>
                  Mount
                </Menu.Item>
                <Menu.Item
                  disabled={mounted === false}
                  onClick={() =>
                    confirmDanger({
                      title: 'Dismount database',
                      message: `Dismount ${name || dir}? Processes using it will get <PROTECT> errors.`,
                      confirmLabel: 'Dismount',
                      color: 'orange',
                      onConfirm: () => dismount.mutateAsync(),
                    })
                  }
                >
                  Dismount
                </Menu.Item>
                <Menu.Item onClick={openCompact}>Compact…</Menu.Item>
                <Menu.Item onClick={() => startJob.mutate('defragment')}>Defragment</Menu.Item>
                <Menu.Item onClick={() => startJob.mutate('integrity-check')}>Integrity check</Menu.Item>
                <Menu.Item
                  onClick={() =>
                    confirmDanger({
                      title: 'Truncate database',
                      message: 'Return the free space at the end of the file to the operating system?',
                      confirmLabel: 'Truncate',
                      color: 'orange',
                      onConfirm: () => truncate.mutateAsync(),
                    })
                  }
                >
                  Truncate
                </Menu.Item>
                <Menu.Label>Manage (%Admin_Manage)</Menu.Label>
                <Menu.Item onClick={openSize}>Expand size…</Menu.Item>
                <Menu.Item onClick={() => startJob.mutate('expand-volume')}>Expand into new volume</Menu.Item>
                <Menu.Item onClick={openEdit}>Edit database settings…</Menu.Item>
                <Menu.Item onClick={openConfig} disabled={!name}>
                  Edit configuration entry…
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() =>
                    confirmDanger({
                      title: 'Delete database',
                      message: (
                        <>
                          This removes the configuration entry <b>{name}</b>
                          {dir ? (
                            <>
                              {' '}
                              and deletes the files in <code>{dir}</code>
                            </>
                          ) : null}
                          . This cannot be undone.
                        </>
                      ),
                      confirmText: name || dir,
                      confirmLabel: 'Delete',
                      onConfirm: () => remove.mutateAsync({ deleteFiles: !!dir }),
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

      {local.isError ? <ErrorAlert error={local.error} onRetry={() => local.refetch()} /> : null}
      {metrics.error && !metrics.running ? (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />} mb="md">
          Metrics unavailable: {String((metrics.error as Error).message ?? metrics.error)}
        </Alert>
      ) : null}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" mb="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>Space</Title>
              {metrics.running ? (
                <Badge color="indigo" variant="light">
                  collecting via async task…
                </Badge>
              ) : m ? (
                <StatusBadge status={m.Full ? 'Full' : 'Normal'} />
              ) : null}
            </Group>
            {m ? (
              <Stack gap="xs">
                <Progress.Root size={18}>
                  <Progress.Section
                    value={usedPct}
                    color={usedPct > 90 ? 'red' : usedPct > 75 ? 'yellow' : 'indigo'}
                  >
                    <Progress.Label>{usedPct.toFixed(0)}% used</Progress.Label>
                  </Progress.Section>
                </Progress.Root>
                <KeyValueList
                  cols={3}
                  items={[
                    { label: 'File size', value: formatMB(m.Size) },
                    { label: 'Free inside file', value: formatMB(m.AvailableSpace) },
                    { label: 'Free at end', value: formatMB(m.EndFree) },
                    { label: 'Disk free', value: m.DiskFree ?? '-' },
                    { label: 'Max size', value: m.MaxSize ? formatMB(m.MaxSize) : 'Unlimited' },
                    {
                      label: 'Expansion size',
                      value: m.ExpansionSize ? formatMB(m.ExpansionSize) : 'System default',
                    },
                    { label: 'Blocks', value: formatNumber(m.Blocks) },
                    { label: 'Block size', value: `${formatNumber(m.BlockSize)} B` },
                    { label: 'Last expansion', value: formatDateTime(m.LastExpansionTime) },
                  ]}
                />
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {metrics.running ? 'Waiting for the server…' : 'No metrics yet.'}
              </Text>
            )}
          </Paper>

          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Database settings
            </Title>
            {local.data ? (
              <KeyValueList
                items={objectToItems(local.data as Record<string, unknown>, {
                  labels: {
                    ResourceName: 'Resource',
                    GlobalJournalState: 'Journal globals',
                    NewGlobalCollation: 'New global collation',
                    NewGlobalIsKeep: 'New globals keep',
                  },
                })}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>

          {name ? (
            <Paper p="md" mb="md">
              <Title order={5} mb="xs">
                Configuration entry
              </Title>
              {config.data ? (
                <KeyValueList items={objectToItems(config.data as Record<string, unknown>)} />
              ) : config.isError ? (
                <ErrorAlert error={config.error} />
              ) : (
                <Text size="sm" c="dimmed">
                  Loading…
                </Text>
              )}
            </Paper>
          ) : null}
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Volumes
            </Title>
            {volumes.data ? (
              (() => {
                const v = volumes.data as {
                  Volumes?: { Name?: string; Size?: number; Directory?: string }[];
                };
                const list =
                  v.Volumes ??
                  (Array.isArray(volumes.data)
                    ? (volumes.data as { Name?: string; Size?: number; Directory?: string }[])
                    : []);
                return list.length ? (
                  <Table fz="sm" verticalSpacing={4}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>File</Table.Th>
                        <Table.Th>Size</Table.Th>
                        <Table.Th>Directory</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {list.map((vol, i) => (
                        <Table.Tr key={i}>
                          <Table.Td className="mono">{vol.Name}</Table.Td>
                          <Table.Td className="tabular">{formatMB(vol.Size)}</Table.Td>
                          <Table.Td className="mono">{vol.Directory}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text size="sm" c="dimmed">
                    Single volume (IRIS.DAT)
                  </Text>
                );
              })()
            ) : volumes.isError ? (
              <Text size="sm" c="dimmed">
                Volume list requires %Admin_Manage
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
          <Paper p="md">
            <JsonViewer
              value={{ config: config.data, local: local.data, metrics: m }}
              title="Raw API responses"
              maxHeight={520}
            />
          </Paper>
        </Grid.Col>
      </Grid>

      <NumberModal
        opened={compactOpen}
        onClose={closeCompact}
        title="Compact database"
        label="Target free space at end of file (MB)"
        description="Blocks are moved toward the front of the file so the tail can be truncated afterwards."
        initial={Math.round((m?.AvailableSpace ?? 0) * 0.9)}
        min={0}
        loading={startJob.isPending}
        onSubmit={(v) => startJob.mutate({ target: v })}
      />
      <NumberModal
        opened={sizeOpen}
        onClose={closeSize}
        title="Expand database"
        label="New size (MB)"
        description="Must be larger than the current size."
        initial={(m?.Size ?? 0) + 100}
        min={1}
        loading={startJob.isPending}
        onSubmit={(v) => startJob.mutate({ size: v })}
      />

      <Modal opened={editOpen} onClose={closeEdit} title="Edit database settings" centered>
        <form
          onSubmit={editForm.onSubmit((v) =>
            reviewChanges({
              title: 'Review database settings',
              before: local.data as Record<string, unknown>,
              after: v as Record<string, unknown>,
              refetch: () => result(api().GET('/v2/database-dir', q)) as Promise<Record<string, unknown>>,
              onConfirm: () => editLocal.mutateAsync(v),
            }),
          )}
        >
          <Stack gap="sm">
            <NumberInput
              label="Max size (MB, 0 = unlimited)"
              min={0}
              {...editForm.getInputProps('MaxSize')}
            />
            <NumberInput
              label="Expansion size (MB, 0 = system default)"
              min={0}
              {...editForm.getInputProps('ExpansionSize')}
            />
            <TextInput label="Resource" {...editForm.getInputProps('ResourceName')} />
            <NumberInput
              label="New volume threshold (MB, 0 = single volume)"
              min={0}
              {...editForm.getInputProps('NewVolumeThreshold')}
            />
            <TextInput label="New volume directory" {...editForm.getInputProps('NewVolumeDirectory')} />
            <Checkbox
              label="Journal globals"
              {...editForm.getInputProps('GlobalJournalState', { type: 'checkbox' })}
            />
            <Checkbox label="Read-only" {...editForm.getInputProps('ReadOnly', { type: 'checkbox' })} />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeEdit}>
                Cancel
              </Button>
              <Button type="submit" loading={editLocal.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={configOpen} onClose={closeConfig} title={`Edit configuration: ${name}`} centered>
        <form
          onSubmit={configForm.onSubmit((v) =>
            reviewChanges({
              title: `Review configuration of ${name}`,
              before: config.data as Record<string, unknown>,
              after: { ...v, Directory: v.Directory ?? dir } as Record<string, unknown>,
              refetch: () =>
                result(api().GET('/v2/database', { params: { query: { name } } })) as Promise<
                  Record<string, unknown>
                >,
              onConfirm: () => editConfig.mutateAsync({ ...v, Directory: v.Directory ?? dir }),
            }),
          )}
        >
          <Stack gap="sm">
            <TextInput label="Directory" {...configForm.getInputProps('Directory')} />
            <TextInput
              label="Server (ECP data server, blank = local)"
              {...configForm.getInputProps('Server')}
            />
            <TextInput label="Stream location" {...configForm.getInputProps('StreamLocation')} />
            <Checkbox
              label="Mount at startup"
              {...configForm.getInputProps('MountAtStartup', { type: 'checkbox' })}
            />
            <Checkbox
              label="Mount required at startup"
              {...configForm.getInputProps('MountRequired', { type: 'checkbox' })}
            />
            <Checkbox
              label="Cluster mount mode"
              {...configForm.getInputProps('ClusterMountMode', { type: 'checkbox' })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeConfig}>
                Cancel
              </Button>
              <Button type="submit" loading={editConfig.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
