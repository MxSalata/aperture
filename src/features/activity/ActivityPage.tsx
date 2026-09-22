import { Badge, Button, Text } from '@mantine/core';
import { IconDownload, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { formatDateTime } from '@/lib/format';
import { useActivity, type ActivityEntry } from '@/stores/activity';
import { confirmDanger } from '@/components/ConfirmDanger';
import dayjs from 'dayjs';
import { downloadText } from '@/lib/download';

const METHOD_COLOR: Record<string, string> = { POST: 'indigo', PUT: 'orange', DELETE: 'red', PATCH: 'grape' };

const columns: ColumnDef<ActivityEntry, unknown>[] = [
  { accessorKey: 'at', header: 'When', cell: (c) => <span className="tabular">{formatDateTime(c.getValue() as number)}</span> },
  { accessorKey: 'method', header: 'Method', cell: (c) => <Badge size="sm" variant="filled" color={METHOD_COLOR[c.getValue() as string] ?? 'gray'} style={{ fontFamily: 'var(--aperture-mono)' }}>{String(c.getValue())}</Badge> },
  { accessorKey: 'path', header: 'Operation', cell: ({ row }) => <span className="mono">{row.original.path}{row.original.query ? <span style={{ opacity: 0.6 }}>?{row.original.query}</span> : null}</span> },
  { accessorKey: 'status', header: 'Result', cell: ({ row }) => <Badge size="sm" variant="light" color={row.original.ok ? (row.original.status === 202 ? 'indigo' : 'teal') : 'red'}>HTTP {row.original.status}</Badge> },
  { accessorKey: 'summary', header: 'Server said' },
  { accessorKey: 'durationMs', header: 'Time', cell: (c) => <span className="tabular">{String(c.getValue())} ms</span> },
  { accessorKey: 'jobId', header: 'Job', cell: (c) => (c.getValue() ? <Link to="/jobs" className="mono">{String(c.getValue())}</Link> : null) },
];

export default function ActivityPage() {
  const entries = useActivity(useShallow((s) => s.entries));
  const clear = useActivity((s) => s.clear);
  const download = () =>
    downloadText(`aperture-activity-${dayjs().format('YYYYMMDD-HHmmss')}.json`, JSON.stringify(entries, null, 2), 'application/json');
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change this browser tab sent to the instance and what the server answered. Kept for the tab's lifetime; durable auditing is IRIS's audit log."
        actions={
          <>
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={download} disabled={!entries.length}>Export JSON</Button>
            <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} disabled={!entries.length} onClick={() => confirmDanger({ title: 'Clear activity', message: 'Forget the recorded changes of this tab?', confirmLabel: 'Clear', onConfirm: clear })}>Clear</Button>
          </>
        }
      />
      <DataTable data={entries} columns={columns} getRowId={(e) => e.id} initialSorting={[{ id: 'at', desc: true }]} dense emptyMessage={<Text size="sm" c="dimmed">No changes sent yet. Edits, creations, deletions and queued operations will appear here.</Text>} />
    </>
  );
}
