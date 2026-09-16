import { describe, expect, it } from 'vitest';
import { formatBytes, formatMB, formatNumber, parseIrisDate, formatDateTime, truncate } from '../format';

describe('format helpers', () => {
  it('formats bytes with binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });
  it('formats IRIS megabyte sizes and passes "Unlimited" through', () => {
    expect(formatMB(2048)).toBe('2.0 GB');
    expect(formatMB('Unlimited')).toBe('Unlimited');
    expect(formatMB(undefined)).toBe('-');
  });
  it('parses IRIS timestamps with and without seconds', () => {
    expect(parseIrisDate('2026-12-31 23:59:59')?.year()).toBe(2026);
    expect(formatDateTime('2026-02-23 00:00')).toBe('2026-02-23 00:00:00');
    expect(formatDateTime('')).toBe('-');
  });
  it('formats numbers defensively', () => {
    expect(formatNumber('12')).toBe('12');
    expect(formatNumber(null)).toBe('-');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});
