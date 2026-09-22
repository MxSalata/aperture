import { Switch } from '@mantine/core';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

interface Options {
  defaultLive?: boolean;
  intervalMs?: number;
  label?: string;
}

/**
 * A query with a "Live (5s)" switch: the same toggle the process, lock and web-session
 * screens used to declare each by hand.
 */
export function useLiveQuery<T>(
  query: { queryKey: QueryKey; queryFn: () => Promise<T> },
  { defaultLive = false, intervalMs = 5000, label }: Options = {},
): {
  query: ReturnType<typeof useQuery<T>>;
  live: boolean;
  setLive: (live: boolean) => void;
  control: ReactNode;
} {
  const [live, setLive] = useState(defaultLive);
  const result = useQuery({ ...query, refetchInterval: live ? intervalMs : false });
  const control = (
    <Switch
      size="xs"
      label={label ?? `Live (${intervalMs / 1000}s)`}
      checked={live}
      onChange={(e) => setLive(e.currentTarget.checked)}
    />
  );
  return { query: result, live, setLive, control };
}
