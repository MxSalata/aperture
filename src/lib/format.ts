import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Time zone policy. IRIS reports wall-clock timestamps of the instance with no zone
 * designator. Aperture renders them verbatim (never converted), and interprets them in
 * the zone the connection profile names so that relative times ("3 hours ago") are exact
 * when the operator sits in another zone. With no zone named, the instance's UTC offset is
 * measured from its clock (`offsetFromWallClock`) and used instead: right until the next
 * daylight-saving change, where the browser's zone (the last resort) is wrong all year for an
 * instance in another zone. The portal's own instants (when a change was sent, chart axes) are
 * shown on the same clock, so one screen never mixes two zones.
 */
let instanceZone: string | null = null;
/** The instance's UTC offset in minutes, measured when no zone is named; null when unknown. */
let measuredOffset: number | null = null;

export function isValidTimezone(zone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function setInstanceTimezone(zone: string | null | undefined): void {
  instanceZone = zone && isValidTimezone(zone) ? zone : null;
}

export function getInstanceTimezone(): string | null {
  return instanceZone;
}

export function setMeasuredOffset(minutes: number | null | undefined): void {
  measuredOffset = typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : null;
}

export function getMeasuredOffset(): number | null {
  return measuredOffset;
}

/**
 * The instance's UTC offset right now, in minutes, from its wall-clock reading of this moment
 * (`LastUpdate` of GET /v2/monitor/system-usage), or null when the reading cannot be trusted.
 * Real offsets are whole quarter hours; a reading more than 3 minutes off one is stale.
 */
export function offsetFromWallClock(wall: string | null | undefined, now = Date.now()): number | null {
  const t = wall ? Date.parse(`${wall.trim().replace(' ', 'T')}Z`) : NaN;
  if (!Number.isFinite(t)) return null;
  const minutes = (t - now) / 60_000;
  const quarters = Math.round(minutes / 15) * 15;
  if (Math.abs(minutes - quarters) > 3 || Math.abs(quarters) > 14 * 60) return null;
  return quarters;
}

/** "UTC+01:00" for an offset in minutes. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const m = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * A wall-clock reading taken at a UTC offset. Built from the instant (the reading as UTC, less the
 * offset): dayjs's utcOffset(offset, true) keeps the text but not the instant.
 */
function atOffset(iso: string, offset: number): dayjs.Dayjs {
  const asUtc = dayjs.utc(iso);
  return asUtc.isValid() ? dayjs(asUtc.valueOf() - offset * 60_000).utcOffset(offset) : asUtc;
}

/** An instant on the instance's clock: its named zone, else its measured offset, else the browser's. */
function onInstanceClock(d: dayjs.Dayjs): dayjs.Dayjs {
  if (instanceZone) return d.tz(instanceZone);
  if (measuredOffset !== null) return d.utcOffset(measuredOffset);
  return d;
}

/** An epoch in milliseconds as the instance's wall clock would read it (chart axes use HH:mm:ss). */
export function formatClock(ms: number, pattern = 'HH:mm:ss'): string {
  return Number.isFinite(ms) ? onInstanceClock(dayjs(ms)).format(pattern) : '-';
}

const numberFmt = new Intl.NumberFormat(undefined);
const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '-';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return numberFmt.format(v);
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return compactFmt.format(n);
}

/**
 * Bytes → "1.5 GiB". Binary units with binary labels: IRIS reports sizes in MB meaning
 * 1024², so a value that reads "1.0 GiB" here is the "1024 MB" of the classic portal.
 */
export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** Megabytes (the unit IRIS uses for database sizes) → "1.5 GiB". The API may return "Unlimited". */
export function formatMB(mb: number | string | null | undefined): string {
  if (mb === null || mb === undefined || mb === '') return '-';
  if (typeof mb === 'string' && Number.isNaN(Number(mb))) return mb;
  return formatBytes(Number(mb) * 1024 * 1024);
}

export function formatPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${v.toFixed(digits)}%`;
}

/** A designator at the end ("…Z", "…+02:00") makes a timestamp an instant rather than a wall-clock time. */
const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * IRIS timestamps look like "2026-12-31 23:59:59" (or without seconds); see the time zone
 * policy above. Timestamps that name their own zone (alerts.log writes UTC "…Z", and the
 * portal's own epochs arrive as ISO strings) are converted into the instance zone, never
 * reinterpreted as its wall clock.
 */
export function parseIrisDate(s: string | null | undefined): dayjs.Dayjs | null {
  if (!s) return null;
  if (ZONED.test(s.trim())) {
    const d = dayjs(s.trim());
    return d.isValid() ? onInstanceClock(d) : null;
  }
  const iso = s.replace(' ', 'T');
  const d = instanceZone
    ? dayjs.tz(iso, instanceZone)
    : measuredOffset !== null
      ? atOffset(iso, measuredOffset)
      : dayjs(iso);
  return d.isValid() ? d : null;
}

/**
 * An epoch in milliseconds as the instance would write it (`YYYY-MM-DD HH:mm:ss` on the
 * instance's clock: its named zone, else its measured offset, else the browser's), for query
 * parameters such as the audit log's `beginDateTime`.
 */
export function toIrisDateTime(ms: number): string {
  return onInstanceClock(dayjs(ms)).format('YYYY-MM-DD HH:mm:ss');
}

/** Absolute wall-clock rendering of an IRIS timestamp, or of an epoch in milliseconds. */
export function formatDateTime(s: string | number | null | undefined): string {
  if (typeof s === 'number') return formatClock(s, 'YYYY-MM-DD HH:mm:ss');
  const d = parseIrisDate(s);
  return d ? d.format('YYYY-MM-DD HH:mm:ss') : s || '-';
}

export function formatRelative(s: string | null | undefined): string {
  const d = parseIrisDate(s);
  return d ? d.fromNow() : s || '-';
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const d = dayjs.duration(ms);
  if (ms < 60_000) return `${d.seconds()}s`;
  if (ms < 3_600_000) return `${d.minutes()}m ${d.seconds()}s`;
  return `${Math.floor(d.asHours())}h ${d.minutes()}m`;
}

/**
 * A process's ElapsedTime ("00:35:18", hours unpadded past 99) in seconds, for sorting; -1 when
 * it is not in that form.
 */
export function elapsedSeconds(s: string | null | undefined): number {
  const m = /^\s*(\d+):(\d{1,2}):(\d{1,2})\s*$/.exec(s ?? '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : -1;
}

export function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
