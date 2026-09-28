import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchLogIndex, refreshLogIndex, similarEntries, type SimilarMatch } from '@/api/logSimilarity';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Timestamp } from '@/components/Timestamp';
import { formatBytes, formatNumber } from '@/lib/format';
import { parseLogLine, SEVERITY_LABEL, type LogEntry, type LogSeverity } from '@/lib/messagesLog';

const SEVERITY_COLOR: Record<LogSeverity, string> = { 0: 'gray', 1: 'yellow', 2: 'red', 3: 'red' };

/** The message of a raw entry, without its stamp, for the list. */
function messageOf(text: string): string {
  const [first, ...rest] = text.split('\n');
  const parsed = parseLogLine(first);
  return [parsed ? parsed.message : first, ...rest].join('\n');
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <Badge
      size="sm"
      variant={score >= 0.9 ? 'filled' : 'light'}
      color={score >= 0.9 ? 'teal' : 'gray'}
      tt="none"
    >
      {pct} %
    </Badge>
  );
}

function Match({ m, sameFile }: { m: SimilarMatch; sameFile: boolean }) {
  return (
    <Paper p="xs" withBorder>
      <Group gap="xs" wrap="wrap" mb={4}>
        <ScoreBadge score={m.score} />
        {m.time ? (
          <Text size="xs" className="tabular">
            <Timestamp value={m.time} />
          </Text>
        ) : null}
        {m.severity !== null ? (
          <Badge size="xs" variant="light" color={SEVERITY_COLOR[m.severity]} tt="none">
            {SEVERITY_LABEL[m.severity]}
          </Badge>
        ) : null}
        {!sameFile ? (
          <Text size="xs" c="dimmed" className="mono">
            {m.file}
          </Text>
        ) : null}
      </Group>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {messageOf(m.text)}
      </Text>
    </Paper>
  );
}

interface Props {
  entry: LogEntry & { offset: number };
  file: string;
}

/**
 * The entries worded like one entry of the log, across messages.log and its rotations, from the
 * package's wording index (IRIS Vector Search over hashed words). Brings the index up to date
 * first, one bounded refresh at a time, and says so while it does.
 */
export function SimilarEntries({ entry, file }: Props) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{
    phase: 'checking' | 'indexing' | 'searching';
    pendingBytes?: number;
  }>({
    phase: 'checking',
  });
  const similar = useQuery({
    queryKey: ['aperture-logs', 'similar', file, entry.offset],
    queryFn: () => similarEntries(file, entry.offset, 20, setProgress),
    retry: false,
    staleTime: 0,
  });
  const status = useQuery({
    queryKey: ['aperture-logs', 'index'],
    queryFn: fetchLogIndex,
    retry: false,
    enabled: similar.isSuccess,
  });
  const refresh = useMutation({
    mutationFn: refreshLogIndex,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['aperture-logs', 'index'] });
      void queryClient.invalidateQueries({ queryKey: ['aperture-logs', 'similar'] });
    },
  });

  const summary = similar.data?.summary;
  const capped = summary?.capped;
  return (
    <Stack gap="sm">
      <Paper p="xs" withBorder>
        <Group gap="xs" wrap="wrap" mb={4}>
          {entry.severity !== null ? (
            <Badge size="xs" variant="light" color={SEVERITY_COLOR[entry.severity]} tt="none">
              {SEVERITY_LABEL[entry.severity]}
            </Badge>
          ) : null}
          {entry.time ? (
            <Text size="xs" className="tabular">
              <Timestamp value={entry.time} />
            </Text>
          ) : null}
          {entry.category ? <span className="mono">{entry.category}</span> : null}
        </Group>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {entry.message}
        </Text>
      </Paper>

      {similar.isPending ? (
        <Group gap="sm" role="status" aria-live="polite">
          <Loader size="sm" />
          <Text size="sm">
            {progress.phase === 'indexing'
              ? `Indexing new lines… ${progress.pendingBytes ? `${formatBytes(progress.pendingBytes)} to go` : ''}`
              : progress.phase === 'searching'
                ? 'Searching the index…'
                : 'Checking the index…'}
          </Text>
        </Group>
      ) : similar.error ? (
        <ErrorAlert error={similar.error} />
      ) : similar.data && summary ? (
        <>
          <Text size="sm" fw={600} aria-live="polite">
            {summary.similar <= 1 ? (
              'Not seen elsewhere in the indexed logs.'
            ) : (
              <>
                Seen {capped ? 'at least ' : ''}
                {formatNumber(summary.similar)} times since <Timestamp value={summary.first} /> (last{' '}
                <Timestamp value={summary.last} />
                ).
              </>
            )}
          </Text>
          {similar.data.matches.length ? (
            <Stack gap="xs" component="ol" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {similar.data.matches.map((m) => (
                <li key={`${m.file}:${m.offset}`}>
                  <Match m={m} sameFile={m.file === file} />
                </li>
              ))}
            </Stack>
          ) : (
            <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
              Nothing else in the indexed logs is worded like this entry.
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Matched by wording with IRIS Vector Search (cosine similarity over hashed words), not by meaning.
            The percentage is the cosine similarity; 90 % and more counts as the same message.
          </Text>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="xs" c="dimmed">
              {status.data
                ? `${formatNumber(status.data.lines)} entries indexed from ${status.data.files.length} file${status.data.files.length === 1 ? '' : 's'}${status.data.stale ? `, ${formatBytes(status.data.pendingBytes)} not yet` : ''}`
                : ''}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconRefresh size={12} />}
              onClick={() => refresh.mutate()}
              loading={refresh.isPending}
            >
              Refresh index
            </Button>
          </Group>
          {refresh.error ? <ErrorAlert error={refresh.error} /> : null}
        </>
      ) : null}
    </Stack>
  );
}
