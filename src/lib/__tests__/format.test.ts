import { describe, expect, it } from 'vitest';
import {
  elapsedSeconds,
  formatClock,
  formatOffset,
  getMeasuredOffset,
  offsetFromWallClock,
  setMeasuredOffset,
  toIrisDateTime,
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

describe('process elapsed time', () => {
  it('reads the hh:mm:ss IRIS writes, hours unpadded past 99', () => {
    expect(elapsedSeconds('00:35:18')).toBe(35 * 60 + 18);
    expect(elapsedSeconds('123:00:01')).toBe(123 * 3600 + 1);
    // Sorting by the value, not the text: 100 hours is longer than 99.
    expect(elapsedSeconds('100:00:00')).toBeGreaterThan(elapsedSeconds('99:59:59'));
  });

  it('is -1 for anything else', () => {
    expect(elapsedSeconds('0h 35m')).toBe(-1);
    expect(elapsedSeconds('')).toBe(-1);
    expect(elapsedSeconds(undefined)).toBe(-1);
  });
});

describe('the instance clock, measured', () => {
  // LastUpdate of /v2/monitor/system-usage read at 11:13:05Z from a London instance in summer.
  const now = Date.UTC(2026, 8, 23, 11, 13, 5);

  it('reads the offset from a wall-clock reading of this moment', () => {
    expect(offsetFromWallClock('2026-09-23 12:13:06', now)).toBe(60); // Europe/London, BST
    expect(offsetFromWallClock('2026-09-23 07:13:04', now)).toBe(-240); // America/New_York, EDT
    expect(offsetFromWallClock('2026-09-23 16:43:05', now)).toBe(330); // Asia/Kolkata
    expect(offsetFromWallClock('2026-09-23 16:58:05', now)).toBe(345); // Asia/Kathmandu
  });

  it('does not trust a reading that is not of this moment', () => {
    expect(offsetFromWallClock('2026-09-23 11:21:05', now)).toBeNull(); // 8 minutes: stale, no zone
    expect(offsetFromWallClock('2026-09-23 11:53:05', now)).toBeNull(); // 5 minutes from +00:45
    expect(offsetFromWallClock('not a time', now)).toBeNull();
    expect(offsetFromWallClock(undefined, now)).toBeNull();
    expect(offsetFromWallClock('2026-09-24 03:13:05', now)).toBeNull(); // +16 h: no such zone
  });

  it('names offsets the way the notice and tooltips do', () => {
    expect(formatOffset(60)).toBe('UTC+01:00');
    expect(formatOffset(-240)).toBe('UTC−04:00');
    expect(formatOffset(345)).toBe('UTC+05:45');
  });

  it('reads instance times at the measured offset when no zone is named, whatever the browser zone', () => {
    setInstanceTimezone(null);
    setMeasuredOffset(60);
    try {
      expect(getMeasuredOffset()).toBe(60);
      // The text stays verbatim; the instant is the one the instance meant.
      expect(formatDateTime('2026-09-23 12:10:00')).toBe('2026-09-23 12:10:00');
      expect(parseIrisDate('2026-09-23 12:10:00')?.valueOf()).toBe(Date.UTC(2026, 8, 23, 11, 10, 0));
      // The audit window is asked for in the instance's clock.
      expect(toIrisDateTime(Date.UTC(2026, 8, 23, 11, 10, 0))).toBe('2026-09-23 12:10:00');
      // The portal's own instants and alerts.log's UTC times are shown on the same clock.
      expect(formatDateTime(Date.UTC(2026, 8, 23, 11, 10, 0))).toBe('2026-09-23 12:10:00');
      expect(formatDateTime('2026-09-23T12:02:14.473Z')).toBe('2026-09-23 13:02:14');
      expect(formatClock(Date.UTC(2026, 8, 23, 11, 10, 0))).toBe('12:10:00');
    } finally {
      setMeasuredOffset(null);
    }
  });

  it('prefers a named zone, which also knows about daylight saving', () => {
    setInstanceTimezone('Europe/London');
    setMeasuredOffset(60);
    try {
      // After the clocks go back (25 October 2026), London is UTC+0: the zone knows, the offset does not.
      expect(parseIrisDate('2026-10-26 12:00:00')?.valueOf()).toBe(Date.UTC(2026, 9, 26, 12, 0, 0));
    } finally {
      setInstanceTimezone(null);
      setMeasuredOffset(null);
    }
  });
});
