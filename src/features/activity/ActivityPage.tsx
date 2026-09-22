import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconDownload, IconListSearch, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import dayjs from 'dayjs';
import { api, awaitAsyncResult, call, SILENT } from '@/api/hooks';
import { jobIdFromResponse } from '@/api/client';
import type { Schemas } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { confirmDanger } from '@/components/ConfirmDanger';
import { formatDateTime, parseIrisDate, toIrisDateTime } from '@/lib/format';
import { downloadText } from '@/lib/download';
import {
  AUDIT_WINDOW_MS,
  auditExpectation,
  auditSubject,
  matchAuditRecords,
  type AuditExpectation,
} from '@/lib/auditEvents';
import { useActivity, type ActivityEntry } from '@/stores/activity';

const METHOD_COLOR: Record<string, string> = { POST: 'indigo', PUT: 'orange', DELETE: 'red', PATCH: 'grape' };

type AuditRow = Schemas['AsyncTaskResultListAuditRecords'][number];

interface Evidence {
  entry: ActivityEntry;
  expect: AuditExpectation;
  subject: string | null;
  status: 'running' | 'done' | 'error';
  returned: number;
  matches: AuditRow[];
  best: AuditRow | null;
  error?: unknown;
}

/** The record closest in time to the request is the one the change most plausibly produced. */
function closest(records: AuditRow[], at: number): AuditRow | null {
  if (!records.length) return null;
  const distance = (r: AuditRow) => Math.abs((parseIrisDate(r.TimeStamp)?.valueOf() ?? Infinity) - at);
  return [...records].sort((a, b) => distance(a) - distance(b))[0];
}

export default function ActivityPage() {
  const entries = useActivity(useShallow((s) => s.entries));
  const clear = useActivity((s) => s.clear);
  const bind = useActivity((s) => s.bind);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  const find = async (entry: ActivityEntry) => {
    const expect = auditExpectation(entry.method, entry.path);
    if (!expect) return;
    const subject = auditSubject(entry.query);
    setEvidence({ entry, expect, subject, status: 'running', returned: 0, matches: [], best: null });
    try {
      const query = {
        beginDateTime: toIrisDateTime(entry.at - AUDIT_WINDOW_MS),
        endDateTime: toIrisDateTime(entry.at + AUDIT_WINDOW_MS),
        eventTypes: expect.eventType,
        maxRows: 500,
      };
      const { data, response } = await call(
        api().POST('/v2/security/audit/records', { params: { query } as never, headers: SILENT }),
        'POST',
      );
      const id = await jobIdFromResponse(response, data);
      if (!id) throw new Error('The server accepted the audit query but returned no task to follow.');
      const records = (await awaitAsyncResult<AuditRow[]>(id)) ?? [];
      const matches = matchAuditRecords(records, expect, subject);
      const best = closest(matches, entry.at);
      if (best) bind(entry.id, { index: String(best.AuditIndex), event: best.Event ?? '' });
      setEvidence({ entry, expect, subject, status: 'done', returned: records.length, matches, best });
    } catch (error) {
      setEvidence((e) => (e ? { ...e, status: 'error', error } : e));
    }
  };

  const columns: ColumnDef<ActivityEntry, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'at',
        header: 'When',
        cell: (c) => <span className="tabular">{formatDateTime(c.getValue() as number)}</span>,
      },
      {
        accessorKey: 'method',
        header: 'Method',
        cell: (c) => (
          <Badge
            size="sm"
            variant="filled"
            color={METHOD_COLOR[c.getValue() as string] ?? 'gray'}
            style={{ fontFamily: 'var(--aperture-mono)' }}
          >
            {String(c.getValue())}
          </Badge>
        ),
      },
      {
        accessorKey: 'path',
        header: 'Operation',
        cell: ({ row }) => (
          <span className="mono">
            {row.original.path}
            {row.original.query ? <span className="muted">?{row.original.query}</span> : null}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Result',
        cell: ({ row }) => (
          <Badge
            size="sm"
            variant="light"
            color={row.original.ok ? (row.original.status === 202 ? 'indigo' : 'teal') : 'red'}
          >
            HTTP {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: 'summary', header: 'Server said' },
      {
        accessorKey: 'durationMs',
        header: 'Time',
        cell: (c) => <span className="tabular">{String(c.getValue())} ms</span>,
      },
      {
        accessorKey: 'jobId',
        header: 'Job',
        cell: (c) =>
          c.getValue() ? (
            <Link to="/jobs" className="mono">
              {String(c.getValue())}
            </Link>
          ) : null,
      },
      {
        id: 'audit',
        header: 'Audit',
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original;
          if (e.audit)
            return (
              <Tooltip label={`Audit record ${e.audit.index} (${e.audit.event}) proves this change`}>
                <Badge
                  size="sm"
                  variant="light"
                  color="teal"
                  leftSection={<IconShieldCheck size={12} />}
                  style={{ cursor: 'pointer' }}
                  onClick={(ev) => {
                    stop(ev);
                    void find(e);
                  }}
                >
                  #{e.audit.index}
                </Badge>
              </Tooltip>
            );
          if (!e.ok || !auditExpectation(e.method, e.path)) return null;
          return (
            <Tooltip label="Find the audit record IRIS wrote for this change">
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label="Find audit record"
                onClick={(ev) => {
                  stop(ev);
                  void find(e);
                }}
              >
                <IconListSearch size={14} />
              </ActionIcon>
            </Tooltip>
          );
        },
      },
    ],
    // `find` only closes over store actions and setState, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const download = () =>
    downloadText(
      `aperture-activity-${dayjs().format('YYYYMMDD-HHmmss')}.json`,
      JSON.stringify(entries, null, 2),
      'application/json',
    );

  const ev = evidence;
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change this browser tab sent to the instance and what the server answered. Kept for the tab's lifetime; durable auditing is IRIS's audit log, and a security change can be matched to the audit record that proves it."
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconDownload size={14} />}
              onClick={download}
              disabled={!entries.length}
            >
              Export JSON
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              disabled={!entries.length}
              onClick={() =>
                confirmDanger({
                  title: 'Clear activity',
                  message: 'Forget the recorded changes of this tab?',
                  confirmLabel: 'Clear',
                  onConfirm: clear,
                })
              }
            >
              Clear
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="activity"
        exportName="activity"
        data={entries}
        columns={columns}
        getRowId={(e) => e.id}
        initialSorting={[{ id: 'at', desc: true }]}
        dense
        emptyMessage={
          <Text size="sm" c="dimmed">
            No changes sent yet. Edits, creations, deletions and queued operations will appear here.
          </Text>
        }
      />
      <Drawer
        opened={!!ev}
        onClose={() => setEvidence(null)}
        position="right"
        size="lg"
        title={ev ? `Audit evidence for ${ev.entry.method} ${ev.entry.path}` : ''}
      >
        {ev ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Sent {formatDateTime(ev.entry.at)}
              {ev.subject ? (
                <>
                  {' '}
                  for <b>{ev.subject}</b>
                </>
              ) : null}
              . Looking for{' '}
              <span className="mono">
                %System/{ev.expect.eventType}/{ev.expect.events.join('|') || '*'}
              </span>{' '}
              between {toIrisDateTime(ev.entry.at - AUDIT_WINDOW_MS)} and{' '}
              {toIrisDateTime(ev.entry.at + AUDIT_WINDOW_MS)} (instance time).
            </Text>
            {ev.status === 'error' ? <ErrorAlert error={ev.error} /> : null}
            {ev.status === 'running' ? (
              <Text size="sm" c="dimmed" aria-live="polite">
                Querying the audit log as an asynchronous task…
              </Text>
            ) : null}
            {ev.status === 'done' && ev.best ? (
              <Alert
                color="teal"
                variant="light"
                icon={<IconShieldCheck size={16} />}
                title="Recorded by IRIS"
              >
                Audit record <b>{String(ev.best.AuditIndex)}</b> ({ev.best.EventSource}/{ev.best.EventType}/
                {ev.best.Event}) at {formatDateTime(ev.best.TimeStamp)} by <b>{ev.best.Username}</b>:{' '}
                {ev.best.Description}
              </Alert>
            ) : null}
            {ev.status === 'done' && !ev.best ? (
              <Alert color="yellow" variant="light" title="No matching audit record">
                <Text size="sm">
                  Nothing in the window names this change. Either the event is not enabled under{' '}
                  <Anchor component={Link} to="/security/audit" size="sm">
                    Audit → Events
                  </Anchor>
                  , auditing is switched off, or the instance clock differs from this browser's (set the
                  instance time zone on the connection). {ev.returned} record{ev.returned === 1 ? '' : 's'}{' '}
                  came back for the window.
                </Text>
              </Alert>
            ) : null}
            {ev.matches.length > 1 ? (
              <Text size="xs" c="dimmed">
                {ev.matches.length} records match; the closest in time is shown first.
              </Text>
            ) : null}
            {(ev.best ? [ev.best, ...ev.matches.filter((r) => r !== ev.best)] : ev.matches).map((r) => (
              <Paper key={String(r.AuditIndex)} p="sm" withBorder>
                <Group justify="space-between" mb={4}>
                  <Text size="sm" fw={600}>
                    #{String(r.AuditIndex)} {r.Event}
                  </Text>
                  <Text size="xs" c="dimmed" className="tabular">
                    {formatDateTime(r.TimeStamp)}
                  </Text>
                </Group>
                <KeyValueList
                  cols={2}
                  items={objectToItems(r as Record<string, unknown>, {
                    omit: [
                      'AuditIndex',
                      'Event',
                      'TimeStamp',
                      'UTCTimeStamp',
                      'SystemID',
                      'UserInfo',
                      'SessionID',
                    ],
                  })}
                />
              </Paper>
            ))}
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
