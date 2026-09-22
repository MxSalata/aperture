import { describe, expect, it } from 'vitest';
import { certificateStatus, commonName, EXPIRY_WARNING_DAYS } from '../certs';

const NOW = Date.parse('2026-09-22T12:00:00Z');

describe('certificateStatus', () => {
  it('is ok well before expiry', () => {
    expect(certificateStatus('2027-09-22 12:00:00', NOW)).toEqual({ state: 'ok', days: 365 });
  });
  it('is expiring inside the warning window', () => {
    const r = certificateStatus('2026-10-04 12:00:00', NOW);
    expect(r.state).toBe('expiring');
    expect(r.days).toBeLessThanOrEqual(EXPIRY_WARNING_DAYS);
  });
  it('is expired once the date has passed, with negative days', () => {
    const r = certificateStatus('2026-08-13 12:00:00', NOW);
    expect(r.state).toBe('expired');
    expect(r.days).toBe(-40);
  });
  it('is expired ten hours past the date even though the rounded day count is zero', () => {
    expect(certificateStatus('2026-09-22 02:00:00', NOW)).toEqual({ state: 'expired', days: 0 });
  });
  it('rounds the day count the way people say it', () => {
    expect(certificateStatus('2026-10-04 11:00:00', NOW).days).toBe(12);
  });
  it('is unknown for unreadable dates', () => {
    expect(certificateStatus(undefined, NOW)).toEqual({ state: 'unknown', days: null });
    expect(certificateStatus('not a date', NOW)).toEqual({ state: 'unknown', days: null });
  });
});

describe('commonName', () => {
  it('reads the CN from RFC 2253 and OpenSSL style names', () => {
    expect(commonName('CN=iris.example.org,O=Example Hospital,C=GB')).toBe('iris.example.org');
    expect(commonName('/C=GB/O=Example/CN=hl7-gw.hospital.local')).toBe('hl7-gw.hospital.local');
  });
  it('falls back to the whole name when there is no CN', () => {
    expect(commonName('O=Example')).toBe('O=Example');
    expect(commonName(undefined)).toBe('');
  });
});
