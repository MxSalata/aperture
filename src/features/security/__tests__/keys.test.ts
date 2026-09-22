import { describe, expect, it } from 'vitest';
import { AUTHE_FLAGS, applyFlags, bitsToFlags } from '../keys';

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
