import { parseIrisDate } from './format';

export type CertState = 'expired' | 'expiring' | 'ok' | 'unknown';

/** Certificates within this many days of `ValidityNotAfter` are flagged as expiring. */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * Classify a certificate by its `ValidityNotAfter` timestamp. `days` is the whole number
 * of days until expiry, negative once it has passed; `null` when the date cannot be read.
 */
export function certificateStatus(
  notAfter: string | null | undefined,
  now: number = Date.now(),
): { state: CertState; days: number | null } {
  const d = parseIrisDate(notAfter);
  if (!d) return { state: 'unknown', days: null };
  // The state comes from the exact difference (ten hours past expiry is expired); the day
  // count is rounded the way a person would say it (11 days and 23 hours is "12 days").
  const diff = d.valueOf() - now;
  const days = Math.round(diff / 86_400_000) || 0; // `|| 0` turns -0 into 0
  return { state: diff < 0 ? 'expired' : days <= EXPIRY_WARNING_DAYS ? 'expiring' : 'ok', days };
}

/** `CN=iris.example.org,O=Example` or `/O=Example/CN=iris.example.org` → `iris.example.org`. */
export function commonName(dn: string | null | undefined): string {
  const m = /(?:^|[,/])\s*CN=([^,/]+)/i.exec(dn ?? '');
  return m ? m[1].trim() : (dn ?? '');
}
