import { Button, Grid, Group, Paper, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { api, result } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/lib/format';
import { selectAllJobs, useJobs } from '@/stores/jobs';
import { JobCard } from './JobCard';
import type { Schemas } from '@/api/types';

type Row = Schemas['AsyncTaskBase'];

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'GUID',
    header: 'Id',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'TaskName', header: 'Task' },
  { accessorKey: 'State', header: 'State', cell: (c) => <StatusBadge status={c.getValue() as string} /> },
  { accessorKey: 'TimeQueued', header: 'Queued', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'TimeStarted', header: 'Started', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'TimeFinished', header: 'Finished', cell: (c) => formatDateTime(c.getValue() as string) },
  { accessorKey: 'FailureReason', header: 'Failure' },
];

export default function JobsPage() {
  const local = useJobs(useShallow(selectAllJobs));
  const follow = useJobs((s) => s.follow);
  const clearFinished = useJobs((s) => s.clearFinished);
  const serverJobs = useQuery({
    queryKey: ['async-results'],
    queryFn: () => result(api().GET('/v2/async-results')),
    refetchInterval: 5000,
  });

  return (
    <>
      <PageHeader
        title="Job Center"
        description="Asynchronous tasks queued through the API (database compaction, integrity checks, audit queries, …). Tasks started by other users are not visible, by design of the API."
        privileges={['%Admin_Operate:U']}
        actions={
          <>
            <RefreshControl
              screen="jobs"
              onRefresh={() => serverJobs.refetch()}
              loading={serverJobs.isFetching}
            />
            <Button variant="subtle" size="xs" onClick={clearFinished}>
              Clear finished
            </Button>
          </>
        }
      />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Followed in this session
            </Text>
            {local.length ? (
              local.map((j) => <JobCard key={j.id} job={j} />)
            ) : (
              <Paper p="md">
                <Text size="sm" c="dimmed">
                  Nothing yet. Start a compaction or an integrity check from a database, or an audit query,
                  and it will show up here.
                </Text>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper p="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="sm">
                All my tasks on the server
              </Text>
              <Text size="xs" c="dimmed">
                GET /v2/async-results
              </Text>
            </Group>
            <DataTable
              exportName="async-tasks"
              data={serverJobs.data}
              columns={columns}
              loading={serverJobs.isPending}
              error={serverJobs.error}
              initialSorting={[{ id: 'TimeQueued', desc: true }]}
              onRowClick={(row) =>
                row.GUID && follow({ id: row.GUID, name: row.TaskName ?? row.GUID, state: row.State })
              }
              emptyMessage="No async tasks on the server"
              dense
            />
            <Text size="xs" c="dimmed" mt="xs">
              Click a row to follow it in this session. A task that has ended is read once more to show its
              result, and IRIS 2026.2 logs a severity-2 alert for every read of an ended task after the first
              (messages.log, /api/monitor/alerts) unless this tab already read it.
            </Text>
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}
