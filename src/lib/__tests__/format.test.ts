import { describe, expect, it } from 'vitest';
import { formatBytes, formatMB, formatNumber, parseIrisDate, formatDateTime, truncate } from '../format';

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
  it('formats numbers defensively', () => {
    expect(formatNumber('12')).toBe('12');
    expect(formatNumber(null)).toBe('-');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});
