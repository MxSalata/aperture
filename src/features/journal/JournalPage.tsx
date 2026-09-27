import {
  Button,
  Checkbox,
  Drawer,
  Group,
  NumberInput,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { canUse } from '@/api/privileges';
import { useSession } from '@/stores/session';
import { useQuery } from '@tanstack/react-query';
import {
  IconArrowsExchange,
  IconFolder,
  IconListDetails,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, call, result, run, useApiMutation, useAsyncResult, jobHeaders, SILENT } from '@/api/hooks';
import type { JournalFileList, JournalSettings } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { putBody, sendsOnlyChanges } from '@/api/partialPut';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useJobs } from '@/stores/jobs';

type FileRow = JournalFileList[number];
const SETTINGS_PRIVILEGES = ['%Admin_Manage:U', '%Admin_Journal:U'];

const EMPTY_SETTINGS: JournalSettings = {
  CurrentDirectory: '',
  AlternateDirectory: '',
  JournalFilePrefix: '',
  FileSizeLimit: 0,
  DaysBeforePurge: 0,
  BackupsBeforePurge: 0,
  wijdir: '',
  targwijsz: 0,
  FreezeOnError: false,
  CompressFiles: false,
  JournalcspSession: false,
  PurgeArchived: false,
};

/**
 * Journal records shown per read. IRIS 2026.2 returns half the maxRows it is given (200 → 100,
 * the default 1000 → 500; quirk journal-records-half-maxrows), so the request asks for twice as
 * many and the screen keeps one page. A full page means the file holds more, which the table's
 * limit badge says; if IRIS stops halving, the page is still one page.
 */
const RECORDS_PAGE = 200;
const keys = {
  files: ['journal', 'files'] as const,
  file: (f: string) => ['journal', 'file', f] as const,
  settings: ['journal', 'settings'] as const,
};

const fileColumns: ColumnDef<FileRow, unknown>[] = [
  {
    accessorKey: 'Name',
    header: 'File',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    accessorKey: 'Size',
    header: 'Size on disk',
    cell: (c) => <span className="tabular">{formatBytes(c.getValue() as number)}</span>,
  },
  {
    accessorKey: 'DataSize',
    header: 'Journal data',
    cell: (c) => <span className="tabular">{formatBytes(c.getValue() as number)}</span>,
  },
  { accessorKey: 'CreationTime', header: 'Created', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'Reason', header: 'Switch reason' },
];

function FileDrawer({ file, onClose }: { file: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: keys.file(file ?? ''),
    enabled: !!file,
    queryFn: () => result(api().GET('/v2/journal/file', { params: { query: { file: file! } } })),
  });
  const records = useAsyncResult<Record<string, unknown>[]>({ queryKey: keys.file(file ?? '') });
  const openDrawer = useJobs((s) => s.setDrawerOpen);
  const check = useApiMutation(
    () =>
      run(
        api().POST('/v2/journal/file/integrity-check', {
          params: { query: { file: file! } },
          body: {},
          headers: jobHeaders('Journal integrity check', file ?? undefined),
        }),
      ),
    { success: 'Integrity check queued - see Job Center', onSuccess: () => openDrawer(true) },
  );
  const { reset } = records;
  // Another file was opened: forget the previous file's records.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  const rows = (records.result ?? []).slice(0, RECORDS_PAGE);
  const recColumns: ColumnDef<Record<string, unknown>, unknown>[] = [
    'Address',
    'TimeStamp',
    'TypeName',
    'ProcessID',
    'GlobalNode',
    'NewValue',
    'InTransaction',
  ].map((k) => ({
    accessorKey: k,
    header: k,
    cell: (c) => (
      <span className={k === 'GlobalNode' || k === 'NewValue' ? 'mono' : 'tabular'}>
        {String(c.getValue() ?? '')}
      </span>
    ),
  }));

  return (
    <Drawer
      opened={!!file}
      onClose={onClose}
      position="right"
      size="xl"
      title={<span className="mono">{file}</span>}
      padding="md"
    >
      <Stack gap="md">
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconShieldCheck size={14} />}
            onClick={() => check.mutate()}
            loading={check.isPending}
          >
            Integrity check
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconListDetails size={14} />}
            loading={records.running}
            onClick={() =>
              file &&
              records.start(() =>
                call(
                  api().POST('/v2/journal/file/records', {
                    params: { query: { file, maxRows: RECORDS_PAGE * 2 } },
                    headers: SILENT,
                  }),
                  'POST',
                ),
              )
            }
          >
            Browse records (first {RECORDS_PAGE})
          </Button>
        </Group>
        {detail.isError ? (
          <ErrorAlert error={detail.error} />
        ) : detail.data ? (
          <KeyValueList
            cols={3}
            items={objectToItems(detail.data as Record<string, unknown>, {
              omit: ['MirrorInfo ', 'MirrorInfo'],
            })}
          />
        ) : (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        )}
        {records.error ? <ErrorAlert error={records.error} /> : null}
        {records.running ? (
          <Text size="sm" c="dimmed">
            Reading journal records via async task {records.jobId}…
          </Text>
        ) : null}
        {rows.length ? (
          <DataTable
            data={rows}
            columns={recColumns}
            dense
            pageSize={50}
            hideColumnMenu
            serverLimit={RECORDS_PAGE}
          />
        ) : null}
      </Stack>
    </Drawer>
  );
}

export default function JournalPage() {
  const files = useQuery({ queryKey: keys.files, queryFn: () => result(api().GET('/v2/journal/files')) });
  // The settings need %Admin_Manage or %Admin_Journal; an operator (%Admin_Operate) sees the files only.
  const info = useSession((s) => s.info);
  const mayReadSettings = canUse(info, SETTINGS_PRIVILEGES);
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: () => result(api().GET('/v2/journal/settings')),
    enabled: mayReadSettings,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const switchFile = useApiMutation(() => run(api().POST('/v2/journal/switch-file')), {
    invalidate: [keys.files],
  });
  const switchDir = useApiMutation(() => run(api().POST('/v2/journal/switch-dir')), {
    invalidate: [keys.files, keys.settings],
  });
  const save = useApiMutation(
    (body: JournalSettings) => run(api().PUT('/v2/journal/settings', { body }), 'PUT'),
    { invalidate: [keys.settings] },
  );
  // Every field the form shows starts defined, so its inputs are controlled from the first render
  // (the settings arrive in the effect below, after it).
  const form = useForm<JournalSettings>({ initialValues: EMPTY_SETTINGS });
  // Every read of the settings becomes the form's baseline; the fields follow it (e.g. after a
  // switch of directory) unless someone is editing them, whose typing a refetch must not undo.
  useEffect(() => {
    if (!settings.data) return;
    const editing = form.isDirty();
    form.setInitialValues(settings.data);
    if (!editing) form.setValues(settings.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  return (
    <>
      <PageHeader
        title="Journaling"
        description="Journal files record every database update for recovery and mirroring. Switch files, inspect records and tune purge settings."
        privileges={['%Admin_Operate:U', '%Admin_Journal:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => files.refetch()}
              loading={files.isFetching}
            >
              Refresh
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconArrowsExchange size={14} />}
              onClick={() =>
                confirmDanger({
                  title: 'Switch journal file',
                  message: 'Start a new journal file now? The current file is closed and kept.',
                  confirmLabel: 'Switch',
                  color: 'aperture',
                  onConfirm: () => switchFile.mutateAsync(),
                })
              }
            >
              Switch file
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFolder size={14} />}
              onClick={() =>
                confirmDanger({
                  title: 'Switch journal directory',
                  message: `Switch journaling to the alternate directory (${String(settings.data?.AlternateDirectory ?? 'not configured')})?`,
                  confirmLabel: 'Switch',
                  color: 'aperture',
                  onConfirm: () => switchDir.mutateAsync(),
                })
              }
            >
              Switch to alternate directory
            </Button>
          </>
        }
      />
      <Tabs defaultValue="files">
        <Tabs.List mb="sm">
          <Tabs.Tab value="files">Journal files</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="files">
          <DataTable
            stateKey="journal"
            exportName="journal-files"
            data={files.data}
            columns={fileColumns}
            loading={files.isPending}
            error={files.error}
            onRowClick={(r) => setSelected(r.Name ?? null)}
            getRowId={(r) => r.Name ?? ''}
            initialSorting={[{ id: 'CreationTime', desc: true }]}
            dense
          />
          <FileDrawer file={selected} onClose={() => setSelected(null)} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <Paper p="md" maw={720}>
            <Title order={5} mb="sm">
              Journal settings
            </Title>
            {!mayReadSettings ? (
              <Text size="sm" c="dimmed">
                Reading the journal settings needs {SETTINGS_PRIVILEGES.join(' or ')}.
              </Text>
            ) : null}
            {settings.isError ? <ErrorAlert error={settings.error} /> : null}
            {settings.data ? (
              // Fields appear with the values they edit: an empty form would be editable, and saveable.
              <form
                onSubmit={form.onSubmit((v) =>
                  reviewChanges({
                    title: 'Review journal settings',
                    before: settings.data as Record<string, unknown>,
                    after: v as Record<string, unknown>,
                    refetch: () =>
                      result(api().GET('/v2/journal/settings')) as Promise<Record<string, unknown>>,
                    onlyChanges: sendsOnlyChanges('/v2/journal/settings'),
                    onConfirm: (changed) =>
                      save.mutateAsync(putBody('/v2/journal/settings', v, changed as Partial<typeof v>)),
                  }),
                )}
              >
                <Stack gap="sm">
                  <TextInput label="Current directory" {...form.getInputProps('CurrentDirectory')} />
                  <TextInput label="Alternate directory" {...form.getInputProps('AlternateDirectory')} />
                  <TextInput label="Journal file prefix" {...form.getInputProps('JournalFilePrefix')} />
                  <Group grow>
                    <NumberInput
                      label="File size limit (MB)"
                      min={1}
                      {...form.getInputProps('FileSizeLimit')}
                    />
                    <NumberInput
                      label="Days before purge"
                      min={0}
                      {...form.getInputProps('DaysBeforePurge')}
                    />
                    <NumberInput
                      label="Backups before purge"
                      min={0}
                      {...form.getInputProps('BackupsBeforePurge')}
                    />
                  </Group>
                  <Group grow>
                    <TextInput label="WIJ directory" {...form.getInputProps('wijdir')} />
                    <NumberInput label="Target WIJ size (MB)" min={0} {...form.getInputProps('targwijsz')} />
                  </Group>
                  <Checkbox
                    label="Freeze on journal error"
                    {...form.getInputProps('FreezeOnError', { type: 'checkbox' })}
                  />
                  <Checkbox
                    label="Compress journal files"
                    {...form.getInputProps('CompressFiles', { type: 'checkbox' })}
                  />
                  <Checkbox
                    label="Journal CSP session data"
                    {...form.getInputProps('JournalcspSession', { type: 'checkbox' })}
                  />
                  <Checkbox
                    label="Purge archived files"
                    {...form.getInputProps('PurgeArchived', { type: 'checkbox' })}
                  />
                  <Group justify="flex-end">
                    <Button type="submit" loading={save.isPending}>
                      Save settings
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : settings.isPending ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : null}
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
