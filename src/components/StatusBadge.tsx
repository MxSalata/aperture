import { Badge, type BadgeProps } from '@mantine/core';

const COLORS: Record<string, string> = {
  // database
  'mounted/rw': 'teal',
  'mounted/r': 'yellow',
  dismounted: 'gray',
  'not mounted': 'gray',
  // process
  runw: 'teal',
  run: 'teal',
  hang: 'yellow',
  evtw: 'blue',
  lock: 'orange',
  susp: 'red',
  read: 'blue',
  // tasks / jobs
  success: 'teal',
  error: 'red',
  suspended: 'yellow',
  running: 'blue',
  finished: 'teal',
  failed: 'red',
  canceled: 'gray',
  paused: 'yellow',
  queued: 'gray',
  scheduled: 'blue',
  'not running': 'red',
  completed: 'teal',
  normal: 'teal',
  warning: 'yellow',
  troubled: 'red',
  yes: 'teal',
  no: 'gray',
  enabled: 'teal',
  disabled: 'gray',
  unknown: 'gray',
  missing: 'gray',
};

export function statusColor(status: string | undefined | null): string {
  if (!status) return 'gray';
  return COLORS[status.toLowerCase()] ?? 'gray';
}

export function StatusBadge({ status, ...props }: { status: string | undefined | null } & Omit<BadgeProps, 'children'>) {
  return (
    <Badge size="sm" variant="light" color={statusColor(status)} style={{ textTransform: 'none' }} {...props}>
      {status || '-'}
    </Badge>
  );
}

export function BoolBadge({ value, yes = 'Yes', no = 'No', ...props }: { value: boolean | undefined | null; yes?: string; no?: string } & Omit<BadgeProps, 'children'>) {
  return (
    <Badge size="sm" variant="light" color={value ? 'teal' : 'gray'} {...props}>
      {value ? yes : no}
    </Badge>
  );
}
