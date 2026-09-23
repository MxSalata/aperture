import { describe, expect, it } from 'vitest';
import { AUTHE_FLAGS, applyFlags, bitsToFlags, serviceEnabled, webAppExposure } from '../keys';

const bitOf = (label: string) => AUTHE_FLAGS.find((f) => f.label === label)?.bit;

describe('AutheEnabled flags', () => {
  it('numbers the flags as the specification documents them (Service.AutheEnabled)', () => {
    expect(bitOf('OS')).toBe(2 ** 4);
    expect(bitOf('Password')).toBe(2 ** 5);
    expect(bitOf('Unauthenticated')).toBe(2 ** 6);
    expect(bitOf('LDAP')).toBe(2 ** 11);
    expect(bitOf('Delegated')).toBe(2 ** 13);
    expect(bitOf('Login token')).toBe(2 ** 14);
  });

  it('keeps the bits the form does not show when the ticked flags change', () => {
    const twoFactorPw = 2 ** 21;
    const mutualTls = 2 ** 25;
    const kerberosApi = 2 ** 2;
    const original = 32 | twoFactorPw | mutualTls | kerberosApi;
    // Untouched form: the value round-trips exactly.
    expect(applyFlags(original, bitsToFlags(original))).toBe(original);
    // Password unticked, LDAP ticked: only those two bits move.
    expect(applyFlags(original, [2048])).toBe(2048 | twoFactorPw | mutualTls | kerberosApi);
  });

  it('starts from nothing for a new object', () => {
    expect(applyFlags(undefined, [32, 64])).toBe(96);
  });
});

describe('web application exposure', () => {
  it('is open when enabled, unauthenticated and without a resource', () => {
    expect(webAppExposure({ Enabled: true, AuthenticationMethods: ['Unauthenticated'] })).toBe('open');
    expect(
      webAppExposure({
        Enabled: true,
        AuthenticationMethods: ['Password', 'Unauthenticated'],
        Resource: '%DB_X',
      }),
    ).toBe('gated');
    expect(webAppExposure({ Enabled: true, AuthenticationMethods: ['Password'] })).toBeNull();
    expect(webAppExposure({ Enabled: false, AuthenticationMethods: ['Unauthenticated'] })).toBeNull();
  });
});

describe('service rows', () => {
  it('reads Enabled as IRIS 2026.2 sends it (a boolean, no EnabledBoolean)', () => {
    // Rows as GET /v2/security/services answered on IRIS for Health 2026.2 (Build 221U).
    expect(serviceEnabled({ Enabled: true, Public: 'N/A' } as { Enabled: unknown })).toBe(true);
    expect(serviceEnabled({ Enabled: false })).toBe(false);
  });

  it('also reads the shape the specification declares', () => {
    expect(serviceEnabled({ Enabled: 'Yes', EnabledBoolean: true })).toBe(true);
    expect(serviceEnabled({ Enabled: 'No', EnabledBoolean: false })).toBe(false);
    expect(serviceEnabled({ Enabled: 'Yes' })).toBe(true);
    expect(serviceEnabled({})).toBe(false);
  });

  it('keeps AutheSystem (bit 10), which the form does not show, when a service is edited', () => {
    // %Service_Login on a 2026.2 container: Password + AutheSystem.
    expect(applyFlags(1056, bitsToFlags(1056))).toBe(1056);
    expect(applyFlags(1056, [32, 16])).toBe(1056 | 16);
  });
});
