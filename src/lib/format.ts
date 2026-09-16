import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

dayjs.extend(relativeTime);
dayjs.extend(duration);

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

/** Bytes → "1.5 GB". */
export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** Megabytes (the unit IRIS uses for database sizes) → "1.5 GB". The API may return "Unlimited". */
export function formatMB(mb: number | string | null | undefined): string {
  if (mb === null || mb === undefined || mb === '') return '-';
  if (typeof mb === 'string' && Number.isNaN(Number(mb))) return mb;
  return formatBytes(Number(mb) * 1024 * 1024);
}

export function formatPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${v.toFixed(digits)}%`;
}

/** IRIS timestamps look like "2026-12-31 23:59:59" (or without seconds). */
export function parseIrisDate(s: string | null | undefined): dayjs.Dayjs | null {
  if (!s) return null;
  const d = dayjs(s.replace(' ', 'T'));
  return d.isValid() ? d : null;
}

export function formatDateTime(s: string | null | undefined): string {
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

export function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
