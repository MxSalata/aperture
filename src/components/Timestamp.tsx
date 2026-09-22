import { Tooltip } from '@mantine/core';
import { getInstanceTimezone, parseIrisDate } from '@/lib/format';

interface Props {
  value: string | null | undefined;
  /** Which form is shown; the other one is in the tooltip. */
  mode?: 'absolute' | 'relative';
  className?: string;
}

/**
 * One timestamp, both readings. IRIS reports wall-clock times of the instance without a
 * zone; they are shown verbatim, and relative times are exact when the connection profile
 * names the instance's time zone (otherwise the browser's zone is assumed and said so).
 */
export function Timestamp({ value, mode = 'absolute', className }: Props) {
  const d = parseIrisDate(value);
  if (!d) return <span className={className}>{value || '-'}</span>;
  const absolute = d.format('YYYY-MM-DD HH:mm:ss');
  const relative = d.fromNow();
  const zone = getInstanceTimezone();
  const primary = mode === 'relative' ? relative : absolute;
  const secondary = mode === 'relative' ? absolute : relative;
  return (
    <Tooltip label={`${secondary} · ${zone ? `instance time zone ${zone}` : 'instance clock, assumed to be in your time zone'}`}>
      <time dateTime={d.toISOString()} className={className ?? 'tabular'} style={{ cursor: 'help' }}>
        {primary}
      </time>
    </Tooltip>
  );
}
