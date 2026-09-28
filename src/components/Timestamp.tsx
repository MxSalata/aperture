import { Tooltip, VisuallyHidden } from '@mantine/core';
import { formatOffset, getInstanceTimezone, getMeasuredOffset, parseIrisDate } from '@/lib/format';

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
 * The second reading is in the tooltip for the mouse and in hidden text for a screen reader,
 * so a table of timestamps adds no tab stops.
 */
export function Timestamp({ value, mode = 'absolute', className }: Props) {
  const d = parseIrisDate(value);
  if (!d) return <span className={className}>{value || '-'}</span>;
  const absolute = d.format('YYYY-MM-DD HH:mm:ss');
  const relative = d.fromNow();
  const zone = getInstanceTimezone();
  const offset = getMeasuredOffset();
  const clock = zone
    ? `instance time zone ${zone}`
    : offset !== null
      ? `instance clock at ${formatOffset(offset)}, measured (name its time zone in Connections for exact times across daylight-saving changes)`
      : 'instance clock, assumed to be in your time zone';
  const primary = mode === 'relative' ? relative : absolute;
  const secondary = mode === 'relative' ? absolute : relative;
  return (
    <Tooltip label={`${secondary} · ${clock}`}>
      <time dateTime={d.toISOString()} className={className ?? 'tabular'} style={{ cursor: 'help' }}>
        {primary}
        {/* The other reading for a screen reader, which the tooltip gives the mouse; no tab stop. */}
        <VisuallyHidden> ({secondary})</VisuallyHidden>
      </time>
    </Tooltip>
  );
}
