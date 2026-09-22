import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  MultiSelect,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconEraser, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, call, result, run, useApiMutation, useAsyncResult, SILENT } from '@/api/hooks';
import type { AuditEventList, Schemas } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { StatusBadge } from '@/components/StatusBadge';
import { confirmDanger } from '@/components/ConfirmDanger';
import { formatDateTime, formatNumber } from '@/lib/format';
import { secKeys } from './keys';

type EventRow = AuditEventList[number];
type Record_ = Schemas['AsyncTaskResultListAuditRecords'][number];

/** `%System/%Login/LoginFailure` → parts for the query params. */
function splitEvent(name: string | undefined): { source: string; type: string; name: string } {
  const [source = '', type = '', ...rest] = (name ?? '').split('/');
  return { source, type, name: rest.join('/') };
}

function EventsTab() {
  const list = useQuery({
    queryKey: secKeys.auditEvents,
    queryFn: () => result(api().GET('/v2/security/audit/events')),
  });
  const toggle = useApiMutation(
    (v: { id: string; enabled: boolean }) => {
      const p = splitEvent(v.id);
      return run(
        api().PUT('/v2/security/audit/event', { params: { query: p }, body: { Enabled: v.enabled } }),
        'PUT',
      );
    },
    {
      invalidate: [secKeys.auditEvents],
      success: (_d, v) => `${v.id} ${v.enabled ? 'enabled' : 'disabled'}`,
    },
  );
  const clear = useApiMutation(
    (id: string) =>
      run(api().POST('/v2/security/audit/event/clear-count', { params: { query: splitEvent(id) } })),
    { invalidate: [secKeys.auditEvents] },
  );
  const del = useApiMutation(
    (id: string) =>
      run(api().DELETE('/v2/security/audit/event', { params: { query: splitEvent(id) } }), 'DELETE'),
    { invalidate: [secKeys.auditEvents] },
  );
  const columns: ColumnDef<EventRow, unknown>[] = [
    {
      accessorKey: 'EventName',
      header: 'Event (source / type / name)',
      cell: (c) => <span className="mono">{String(c.getValue())}</span>,
    },
    {
      accessorKey: 'Enabled',
      header: 'Enabled',
      cell: ({ row }) => (
        <Switch
          size="xs"
          checked={!!row.original.Enabled}
          onClick={stop}
          onChange={(e) =>
            toggle.mutate({ id: row.original.EventName ?? '', enabled: e.currentTarget.checked })
          }
          aria-label="Toggle audit event"
        />
      ),
    },
    {
      accessorKey: 'Total',
      header: 'Total',
      cell: (c) => <span className="tabular">{formatNumber(c.getValue() as number)}</span>,
    },
    {
      accessorKey: 'Written',
      header: 'Written',
      cell: (c) => <span className="tabular">{formatNumber(c.getValue() as number)}</span>,
    },
    {
      accessorKey: 'Lost',
      header: 'Lost',
      cell: (c) => <span className="tabular">{formatNumber(c.getValue() as number)}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Clear counters">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Clear counters"
              onClick={(e) => {
                stop(e);
                clear.mutate(row.original.EventName ?? '');
              }}
            >
              <IconEraser size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete user-defined event">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              disabled={row.original.EventName?.startsWith('%')}
              aria-label="Delete event"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete audit event',
                  message: (
                    <>
                      Delete <code>{row.original.EventName}</code>?
                    </>
                  ),
                  confirmLabel: 'Delete',
                  onConfirm: () => del.mutateAsync(row.original.EventName ?? ''),
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
    <DataTable
      exportName="audit-events"
      data={list.data}
      columns={columns}
      loading={list.isPending}
      error={list.error}
      getRowId={(r) => r.EventName ?? ''}
      initialSorting={[{ id: 'EventName', desc: false }]}
      pageSize={50}
      dense
    />
  );
}

function LogTab() {
  const events = useQuery({
    queryKey: secKeys.auditEvents,
    queryFn: () => result(api().GET('/v2/security/audit/events')),
  });
  const search = useAsyncResult<Record_[]>({ queryKey: ['audit', 'records'] });
  const [selected, setSelected] = useState<Record_ | null>(null);
  // The row limit of the query whose result is on screen, to tell a full page from a complete answer.
  const [queriedMax, setQueriedMax] = useState(0);
  const form = useForm({
    initialValues: {
      beginDateTime: '',
      endDateTime: '',
      usernames: '',
      events: [] as string[],
      maxRows: 200,
    },
  });
  const types = Array.from(
    new Set((events.data ?? []).map((e) => splitEvent(e.EventName).type).filter(Boolean)),
  );
  const rows = search.result ?? [];
  const columns: ColumnDef<Record_, unknown>[] = [
    {
      accessorKey: 'TimeStamp',
      header: 'Time',
      cell: (c) => <span className="tabular">{formatDateTime(c.getValue() as string)}</span>,
    },
    {
      accessorKey: 'Event',
      header: 'Event',
      cell: ({ row }) => (
        <span className="mono">
          {row.original.EventSource}/{row.original.EventType}/{row.original.Event}
        </span>
      ),
    },
    { accessorKey: 'Username', header: 'User' },
    { accessorKey: 'Status', header: 'Status', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
    { accessorKey: 'Description', header: 'Description' },
    { accessorKey: 'ClientIPAddress', header: 'Client IP' },
    { accessorKey: 'Namespace', header: 'Namespace' },
    {
      accessorKey: 'Pid',
      header: 'PID',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
  ];
  const submit = form.onSubmit((v) => {
    const query: Record<string, string | number> = { maxRows: v.maxRows };
    setQueriedMax(Number(v.maxRows) || 0);
    if (v.beginDateTime) query.beginDateTime = v.beginDateTime;
    if (v.endDateTime) query.endDateTime = v.endDateTime;
    if (v.usernames) query.usernames = v.usernames;
    if (v.events.length) query.eventTypes = v.events.join(',');
    void search
      .start(() =>
        call(api().POST('/v2/security/audit/records', { params: { query }, headers: SILENT }), 'POST'),
      )
      .catch(() => undefined);
  });
  return (
    <Stack gap="sm">
      <Paper p="md">
        <form onSubmit={submit}>
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              label="From"
              placeholder="2026-09-01 00:00:00"
              w={190}
              {...form.getInputProps('beginDateTime')}
            />
            <TextInput
              label="To"
              placeholder="2026-09-30 23:59:59"
              w={190}
              {...form.getInputProps('endDateTime')}
            />
            <TextInput
              label="Users (comma separated)"
              placeholder="jdoe,ops"
              w={200}
              {...form.getInputProps('usernames')}
            />
            <MultiSelect
              label="Event types"
              data={types}
              w={220}
              searchable
              {...form.getInputProps('events')}
            />
            <NumberInput label="Max rows" min={1} max={5000} w={110} {...form.getInputProps('maxRows')} />
            <Button type="submit" leftSection={<IconSearch size={14} />} loading={search.running}>
              Query audit log
            </Button>
          </Group>
        </form>
        <Text size="xs" c="dimmed" mt="xs">
          The query runs as an asynchronous task on the server (POST /v2/security/audit/records → 202 →
          /v2/async-result).
        </Text>
      </Paper>
      {search.error ? <ErrorAlert error={search.error} /> : null}
      {search.running ? (
        <Text size="sm" c="dimmed">
          Running task {search.jobId} - state {search.state ?? 'Queued'}…
        </Text>
      ) : null}
      {search.finished ? (
        <DataTable
          serverLimit={queriedMax}
          exportName="audit-records"
          data={rows}
          columns={columns}
          onRowClick={setSelected}
          getRowId={(r, i) => String(r.AuditIndex ?? `row-${i}`)}
          initialSorting={[{ id: 'TimeStamp', desc: true }]}
          dense
          pageSize={50}
          emptyMessage="No audit records match"
        />
      ) : null}
      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={`Audit record ${selected?.AuditIndex ?? ''}`}
      >
        {selected ? <KeyValueList items={objectToItems(selected as Record<string, unknown>)} /> : null}
      </Drawer>
    </Stack>
  );
}

function SettingsTab() {
  const enabled = useQuery({
    queryKey: secKeys.auditEnabled,
    queryFn: () => result(api().GET('/v2/security/audit/enabled')),
  });
  const set = useApiMutation(
    (v: boolean) => run(api().PUT('/v2/security/audit/enabled', { body: { Enabled: v } }), 'PUT'),
    { invalidate: [secKeys.auditEnabled] },
  );
  const [opened, { open, close }] = useDisclosure(false);
  const purge = useApiMutation(
    (v: { BeginDateTime: string; EndDateTime: string }) =>
      run(api().POST('/v2/security/audit/record/purge', { body: v })),
    { onSuccess: close },
  );
  const form = useForm({ initialValues: { BeginDateTime: '', EndDateTime: '' } });
  const on = (enabled.data as { Enabled?: boolean } | undefined)?.Enabled;
  return (
    <Stack gap="md" maw={640}>
      <Paper p="md">
        <Group justify="space-between">
          <div>
            <Title order={5}>Auditing</Title>
            <Text size="sm" c="dimmed">
              When disabled, no audit events are written to IRISAUDIT.
            </Text>
          </div>
          <Switch
            size="md"
            checked={!!on}
            disabled={enabled.isPending}
            onChange={(e) => set.mutate(e.currentTarget.checked)}
            label={on ? 'On' : 'Off'}
          />
        </Group>
      </Paper>
      <Paper p="md">
        <Title order={5}>Purge audit records</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Delete records inside a time range (blank = from the first / to the last record).
        </Text>
        <Button size="xs" color="red" variant="light" onClick={open}>
          Purge…
        </Button>
      </Paper>
      <Modal opened={opened} onClose={close} title="Purge audit records" centered>
        <form
          onSubmit={form.onSubmit((v) =>
            confirmDanger({
              title: 'Purge audit records',
              message: `Delete audit records from ${v.BeginDateTime || 'the first record'} to ${v.EndDateTime || 'the last record'}?`,
              confirmText: 'PURGE',
              confirmLabel: 'Purge',
              onConfirm: () => purge.mutateAsync(v),
            }),
          )}
        >
          <Stack gap="sm">
            <TextInput
              label="From (YYYY-MM-DD HH:MM:SS)"
              placeholder="blank = first record"
              {...form.getInputProps('BeginDateTime')}
            />
            <TextInput
              label="To (YYYY-MM-DD HH:MM:SS)"
              placeholder="blank = last record"
              {...form.getInputProps('EndDateTime')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" color="red">
                Purge
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

export default function AuditPage() {
  const queryClient = useQueryClient();
  return (
    <>
      <PageHeader
        title="Audit"
        description="Which events are audited, the audit log itself, and retention."
        privileges={['%Admin_Secure:U']}
        actions={
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            // Re-read the audit settings and events; a page reload would sign out a session that
            // is kept in memory only ("Keep me signed in" off) and drop the log query's result.
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['security', 'audit'] })}
          >
            Refresh
          </Button>
        }
      />
      <Tabs defaultValue="log">
        <Tabs.List mb="sm">
          <Tabs.Tab value="log">Audit log</Tabs.Tab>
          <Tabs.Tab value="events">Events</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="log">
          <LogTab />
        </Tabs.Panel>
        <Tabs.Panel value="events">
          <EventsTab />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <SettingsTab />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
