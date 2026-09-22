import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatMB,
  formatNumber,
  parseIrisDate,
  formatDateTime,
  truncate,
  setInstanceTimezone,
  getInstanceTimezone,
} from '../format';

describe('format helpers', () => {
  it('formats bytes with binary units and binary labels', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GiB');
    // sub-byte and negative inputs must not index past the unit table
    expect(formatBytes(0.5)).toBe('1 B');
    expect(formatBytes(-0.5)).toBe('-1 B');
    expect(formatBytes(2 ** 60)).toBe('1024.0 PiB');
  });
  it('formats IRIS megabyte sizes and passes "Unlimited" through', () => {
    expect(formatMB(2048)).toBe('2.0 GiB');
    expect(formatMB('Unlimited')).toBe('Unlimited');
    expect(formatMB(undefined)).toBe('-');
  });
  it('parses IRIS timestamps with and without seconds', () => {
    expect(parseIrisDate('2026-12-31 23:59:59')?.year()).toBe(2026);
    expect(formatDateTime('2026-02-23 00:00')).toBe('2026-02-23 00:00:00');
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTime(Date.UTC(2026, 1, 23, 0, 0, 0))).toMatch(/^2026-02-2[23] /);
  });
  it('keeps instance wall-clock digits and computes the instant in the instance zone', () => {
    setInstanceTimezone('Asia/Tokyo');
    try {
      expect(getInstanceTimezone()).toBe('Asia/Tokyo');
      expect(formatDateTime('2026-01-01 12:00:00')).toBe('2026-01-01 12:00:00');
      expect(parseIrisDate('2026-01-01 12:00:00')?.valueOf()).toBe(Date.UTC(2026, 0, 1, 3, 0, 0));
    } finally {
      setInstanceTimezone(null);
    }
  });
  it('ignores an unknown time zone instead of breaking every date', () => {
    setInstanceTimezone('Mars/Olympus_Mons');
    expect(getInstanceTimezone()).toBeNull();
    expect(formatDateTime('2026-01-01 12:00:00')).toBe('2026-01-01 12:00:00');
  });
  it('formats numbers defensively', () => {
    expect(formatNumber('12')).toBe('12');
    expect(formatNumber(null)).toBe('-');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('parseIrisDate with a zone designator', () => {
  it('converts an instant instead of reading it as the instance wall clock', () => {
    const at = Date.UTC(2026, 8, 22, 12, 0, 0);
    setInstanceTimezone('America/New_York');
    try {
      const d = parseIrisDate(new Date(at).toISOString());
      expect(d?.valueOf()).toBe(at);
      expect(d?.format('YYYY-MM-DD HH:mm')).toBe('2026-09-22 08:00');
      expect(parseIrisDate('2026-09-22T14:00:00+02:00')?.valueOf()).toBe(at);
      // A wall-clock IRIS timestamp is still read in the instance zone.
      expect(parseIrisDate('2026-09-22 08:00:00')?.valueOf()).toBe(at);
      // A plain date is not mistaken for a zone offset.
      expect(parseIrisDate('2026-12-31')?.format('YYYY-MM-DD')).toBe('2026-12-31');
    } finally {
      setInstanceTimezone(null);
    }
  });
});
