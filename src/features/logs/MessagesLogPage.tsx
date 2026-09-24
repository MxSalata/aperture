import { Alert, Badge, Button, Code, Drawer, Group, MultiSelect, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconArrowUp, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchLogSources, isReaderMissing, readLogWindow, type LogSource, type LogWindow } from '@/api/logs';
import { mgmntCredentials } from '@/api/mgmnt';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { PasswordGate } from '@/components/PasswordGate';
import { Timestamp } from '@/components/Timestamp';
import { formatBytes, formatNumber } from '@/lib/format';
import {
  parseLogLines,
  SEVERITY_LABEL,
  severityCounts,
  type LogEntry,
  type LogSeverity,
} from '@/lib/messagesLog';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';

const SEVERITY_COLOR: Record<LogSeverity, string> = { 0: 'gray', 1: 'yellow', 2: 'red', 3: 'red' };
const KIND_LABEL: Record<string, string> = {
  messages: 'messages.log',
  alerts: 'alerts.log',
  monitor: 'SystemMonitor.log',
};

/** The window size a page load or an "older" click asks for. */
const WINDOW_BYTES = 65_536;

function SeverityBadge({ severity }: { severity: LogSeverity | null }) {
  if (severity === null)
    return (
      <Badge size="xs" variant="outline" color="gray" tt="none">
        no stamp
      </Badge>
    );
  return (
    <Badge size="xs" variant={severity >= 2 ? 'filled' : 'light'} color={SEVERITY_COLOR[severity]} tt="none">
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

/**
 * messages.log, alerts.log, SystemMonitor.log and their rotations, read through Aperture's own
 * log reader (/api/aperture, Embedded Python on the instance): the newest window first, older
 * ones on request, each a bounded read that costs the same whatever the file's size. Filtering
 * is over what has been read; the file is never fetched whole.
 */
export default function MessagesLogPage() {
  useMgmntAuth((s) => s.basic); // re-render when the password is given or forgotten
  const mode = useSession((s) => s.mode);
  const ready = !!mgmntCredentials();
  const [params, setParams] = useSearchParams();
  const requested = params.get('file');

  const sources = useQuery({
    queryKey: ['aperture-logs', 'sources'],
    queryFn: fetchLogSources,
    enabled: ready,
    retry: false,
  });
  const list = sources.data ?? [];
  const file: LogSource | undefined =
    list.find((s) => s.id === requested) ?? list.find((s) => s.kind === 'messages' && s.current) ?? list[0];

  // Windows read before the latest one, oldest first, valid for one file and one latest window:
  // a refetch or another file drops them without an effect.
  const [older, setOlder] = useState<{ file: string; base: number; windows: LogWindow[] }>({
    file: '',
    base: -1,
    windows: [],
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const [severities, setSeverities] = useState<string[]>([]);
  const [open, setOpen] = useState<LogEntry | null>(null);

  const latest = useQuery({
    queryKey: ['aperture-logs', 'window', file?.id],
    queryFn: () => readLogWindow(file!.id, 0, WINDOW_BYTES),
    enabled: ready && !!file,
    retry: false,
    staleTime: 0,
  });
  const windows = useMemo<LogWindow[]>(() => {
    if (!latest.data || !file) return [];
    const kept = older.file === file.id && older.base === latest.data.start ? older.windows : [];
    return [...kept, latest.data];
  }, [latest.data, file, older]);

  const entries = useMemo(() => {
    const all = windows.flatMap((w) => w.lines);
    return parseLogLines(all).reverse(); // newest first
  }, [windows]);
  const counts = useMemo(() => severityCounts(entries), [entries]);
  // The table's own filter box searches the text; this narrows by severity first.
  const shown = useMemo(() => {
    const wanted = new Set(severities.map(Number));
    return wanted.size ? entries.filter((e) => e.severity !== null && wanted.has(e.severity)) : entries;
  }, [entries, severities]);

  const oldest = windows[0];
  const loadOlder = async () => {
    if (!file || !oldest?.hasMore) return;
    setLoadingOlder(true);
    setReadError(null);
    const base = latest.data?.start ?? -1;
    try {
      const w = await readLogWindow(file.id, oldest.start, WINDOW_BYTES);
      setOlder((cur) => ({
        file: file.id,
        base,
        windows: [w, ...(cur.file === file.id && cur.base === base ? cur.windows : [])],
      }));
    } catch (e) {
      setReadError(e);
    } finally {
      setLoadingOlder(false);
    }
  };

  const columns: ColumnDef<LogEntry, unknown>[] = [
    {
      accessorKey: 'time',
      header: 'Time',
      cell: ({ row }) =>
        row.original.time ? (
          <span className="tabular" style={{ whiteSpace: 'nowrap' }}>
            <Timestamp value={row.original.time} />
            {row.original.millis !== null ? (
              <Text span size="xs" c="dimmed">
                .{String(row.original.millis).padStart(3, '0')}
              </Text>
            ) : null}
          </span>
        ) : (
          <Text span size="xs" c="dimmed">
            -
          </Text>
        ),
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
    {
      accessorKey: 'pid',
      header: 'PID',
      cell: (c) => <span className="tabular">{c.getValue() === null ? '' : String(c.getValue())}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      accessorKey: 'message',
      header: 'Message',
      cell: (c) => (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {String(c.getValue() ?? '')}
        </Text>
      ),
    },
  ];

  const readBytes = windows.length ? windows[windows.length - 1].end - windows[0].start : 0;
  const notInstalled = isReaderMissing(sources.error);

  return (
    <>
      <Group gap="xs" mb="xs">
        <Button
          component={Link}
          to="/logs"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
        >
          Logs
        </Button>
      </Group>
      <PageHeader
        title="Messages log"
        description="messages.log, alerts.log and SystemMonitor.log as IRIS writes them, newest first, read in bounded windows by Aperture's own log reader on the instance (/api/aperture, Embedded Python). Older lines load on request; a 100 MB log costs the same per page as a small one."
        privileges={['%Admin_Operate:U']}
        actions={
          ready && file ? (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                void sources.refetch();
                void latest.refetch();
              }}
              loading={latest.isFetching}
            >
              Latest
            </Button>
          ) : null
        }
      />
      <Stack gap="sm">
        {!ready && mode === 'jwt' ? (
          <PasswordGate application="/api/aperture" action="Read the logs" resetKeys={[['aperture-logs']]} />
        ) : null}
        {notInstalled ? (
          <Alert
            color="blue"
            variant="light"
            icon={<IconInfoCircle size={18} />}
            title="The log reader is not installed on this instance"
          >
            <Text size="sm">
              The SysAdmin API has no route for <span className="mono">messages.log</span>, so Aperture reads
              it through a small read-only REST class of its own, <span className="mono">/api/aperture</span>,
              which the <span className="mono">iris-aperture</span> IPM package creates (
              <Code>zpm "install iris-aperture"</Code> or <Code>zpm "load /path/to/checkout"</Code>; the
              Docker image has it). Until then this screen has nothing to read; every other screen is
              unaffected.
            </Text>
          </Alert>
        ) : sources.error && ready ? (
          <ErrorAlert error={sources.error} />
        ) : null}
        {ready && list.length ? (
          <>
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                label="File"
                value={file?.id ?? null}
                onChange={(v) => {
                  const next = new URLSearchParams(params);
                  if (v) next.set('file', v);
                  else next.delete('file');
                  setParams(next, { replace: true });
                }}
                data={Object.entries(
                  list.reduce<Record<string, { value: string; label: string }[]>>((groups, s) => {
                    const group = KIND_LABEL[s.kind] ?? s.kind;
                    (groups[group] ??= []).push({
                      value: s.id,
                      label: `${s.id}${s.current ? '' : ' (rotation)'} · ${formatBytes(s.size)}`,
                    });
                    return groups;
                  }, {}),
                ).map(([group, items]) => ({ group, items }))}
                allowDeselect={false}
                w={340}
              />
              <MultiSelect
                label="Severity"
                placeholder="all"
                data={[
                  { value: '0', label: 'info' },
                  { value: '1', label: 'warning' },
                  { value: '2', label: 'severe' },
                  { value: '3', label: 'fatal' },
                ]}
                value={severities}
                onChange={setSeverities}
                w={220}
                clearable
              />
            </Group>
            {file ? (
              <Group gap="xs" wrap="wrap" aria-live="polite">
                <Text size="xs" c="dimmed" className="mono">
                  {file.path}
                </Text>
                <Text size="xs" c="dimmed">
                  · {formatBytes(file.size)} · modified <Timestamp value={file.modified} mode="relative" />
                </Text>
                <Text size="xs" c="dimmed">
                  · {formatNumber(entries.length)} entries from the last {formatBytes(readBytes)} read
                </Text>
                {counts[2] + counts[3] ? (
                  <Badge size="sm" color="red" variant="filled" tt="none">
                    {counts[2] + counts[3]} severe
                  </Badge>
                ) : null}
                {counts[1] ? (
                  <Badge size="sm" color="yellow" variant="filled" tt="none">
                    {counts[1]} warnings
                  </Badge>
                ) : null}
              </Group>
            ) : null}
            {readError ? <ErrorAlert error={readError} /> : null}
            <DataTable
              data={latest.isPending ? undefined : shown}
              columns={columns}
              loading={latest.isPending}
              error={latest.error}
              getRowId={(r) => `${r.index}-${r.time}-${r.pid ?? ''}`}
              getRowLabel={(r) => `Log entry ${r.time || 'without a stamp'}`}
              onRowClick={setOpen}
              pageSize={50}
              serverLimit={0}
              exportName={file ? file.id.replace(/\.log$/, '') : 'messages'}
              emptyMessage={
                entries.length
                  ? 'Nothing in what was read matches the filter; load older lines or widen it'
                  : 'The file is empty'
              }
              dense
            />
            <Group justify="space-between" wrap="wrap">
              <Text size="xs" c="dimmed">
                {oldest ? (
                  oldest.hasMore ? (
                    <>
                      Read from byte {formatNumber(oldest.start)}; {formatBytes(oldest.start)} older remain in
                      the file.
                    </>
                  ) : (
                    'The whole file has been read.'
                  )
                ) : null}
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconArrowUp size={14} />}
                onClick={() => void loadOlder()}
                loading={loadingOlder}
                disabled={!oldest?.hasMore}
              >
                Older lines
              </Button>
            </Group>
          </>
        ) : null}
        {ready && !sources.isPending && !sources.error && !list.length ? (
          <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
            The reader found no log file in the manager directory.
          </Alert>
        ) : null}
      </Stack>
      <Drawer
        opened={!!open}
        onClose={() => setOpen(null)}
        position="right"
        size="lg"
        title={<b>Log entry</b>}
      >
        {open ? (
          <Stack gap="sm">
            <Group gap="xs">
              <SeverityBadge severity={open.severity} />
              {open.time ? <Timestamp value={open.time} /> : null}
              {open.pid !== null ? <Text size="sm">PID {open.pid}</Text> : null}
              {open.category ? <span className="mono">{open.category}</span> : null}
            </Group>
            <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {open.raw}
            </Code>
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
