import { ActionIcon, Badge, Code, Collapse, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPlayerPause, IconPlayerPlay, IconX, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api, envelope } from '@/api/client';
import { notifyError } from '@/lib/notify';
import { statusColor } from '@/components/StatusBadge';
import { JsonViewer } from '@/components/JsonViewer';
import { formatDurationMs } from '@/lib/format';
import { isTerminal, useJobs, type Job } from '@/stores/jobs';

/** Ticking clock for live durations; frozen when `active` is false. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function JobCard({ job, compact }: { job: Job; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const remove = useJobs((s) => s.remove);
  const update = useJobs((s) => s.update);
  const terminal = isTerminal(job.state);
  const now = useNow(!terminal);
  const duration = (terminal ? job.updatedAt : now) - job.createdAt;

  const control = async (action: 'pause' | 'resume' | 'cancel') => {
    try {
      const { data } = await envelope(api().POST(`/v2/async-result/${action}`, { params: { query: { id: job.id } } }));
      const task = (data as { result?: Job['task'] })?.result;
      if (task?.State) update(job.id, { state: task.State, task });
    } catch (e) {
      notifyError(e);
    }
  };

  const console = job.task?.Console ?? [];
  const hasResult = job.task?.Result && Object.keys(job.task.Result as object).length > 0;
  const prog = job.task?.Result as { ProgressCurrent?: number; ProgressTotal?: number; ProgressUnits?: string } | undefined;
  const progressPct = prog?.ProgressTotal ? Math.min(100, ((prog.ProgressCurrent ?? 0) / prog.ProgressTotal) * 100) : undefined;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }} onClick={() => setOpen((o) => !o)} role="button">
            {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {job.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {job.subject ?? `id ${job.id}`} · {formatDurationMs(duration)}
              </Text>
            </Stack>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Badge size="sm" variant="light" color={statusColor(job.state)} style={{ textTransform: 'none' }}>
              {job.state}
            </Badge>
            {job.state === 'Running' ? (
              <Tooltip label="Pause">
                <ActionIcon size="sm" variant="subtle" onClick={() => control('pause')} aria-label="Pause job">
                  <IconPlayerPause size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            {job.state === 'Paused' ? (
              <Tooltip label="Resume">
                <ActionIcon size="sm" variant="subtle" onClick={() => control('resume')} aria-label="Resume job">
                  <IconPlayerPlay size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            {!terminal ? (
              <Tooltip label="Cancel">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => control('cancel')} aria-label="Cancel job">
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Tooltip label="Remove from list">
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => remove(job.id)} aria-label="Remove job">
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
        {!terminal ? (
          <Stack gap={2}>
            <Progress size="xs" value={progressPct ?? (job.state === 'Paused' ? 50 : 100)} animated={progressPct === undefined && job.state !== 'Paused'} color={job.state === 'Paused' ? 'yellow' : 'indigo'} />
            {progressPct !== undefined ? <Text size="xs" c="dimmed" className="tabular">{prog?.ProgressCurrent ?? 0} / {prog?.ProgressTotal} {prog?.ProgressUnits} ({progressPct.toFixed(0)}%)</Text> : null}
          </Stack>
        ) : null}
        {job.error ? (
          <Text size="xs" c="red">
            {job.error}
          </Text>
        ) : null}
        {job.task?.FailureReason ? (
          <Text size="xs" c="red">
            {job.task.FailureReason}
          </Text>
        ) : null}
        <Collapse in={open}>
          <Stack gap="xs">
            {console.length ? (
              <Code block style={{ fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                {console.join('\n')}
              </Code>
            ) : (
              <Text size="xs" c="dimmed">
                No console output yet.
              </Text>
            )}
            {hasResult ? <JsonViewer value={job.task?.Result} title="Result" maxHeight={240} /> : null}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
