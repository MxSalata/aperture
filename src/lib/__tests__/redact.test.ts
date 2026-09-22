import { describe, expect, it } from 'vitest';
import { isSecretKey, redactDeep, redactField, REDACTED } from '../redact';

describe('isSecretKey', () => {
  it('matches the secret vocabulary of the SysAdmin API', () => {
    for (const k of [
      'Password',
      'AdminPassword',
      'NewPassword',
      'LDAPSearchPassword',
      'PrivateKeyPassword',
      'ClientSecret',
      'Secret',
      'RSASecret',
      'KeyValueSecret',
      'WalletSecret',
      'InitialAccessToken',
      'CSRFToken',
      'AutheLoginToken',
      'AuthorizationKey',
      'HOTPKey',
      'PrivateKey',
    ])
      expect(isSecretKey(k), k).toBe(true);
  });

  it('leaves configuration keys that merely mention a secret word', () => {
    for (const k of [
      'PasswordNeverExpires',
      'ChangePasswordPage',
      'PrivateKeyFile',
      'PrivateKeyType',
      'ClientSecretInterval',
      'RefreshTokenInterval',
      'JWTAccessTokenTimeout',
      'RevokeTokenClass',
      'TokenEndpoint',
      'AccessTokenIsJWT',
      'Name',
      'Key',
      'KeyLen',
    ])
      expect(isSecretKey(k), k).toBe(false);
  });
});

describe('redactField', () => {
  it('hides only non-empty strings under a secret key', () => {
    expect(redactField('Password', 'hunter2')).toBe(REDACTED);
    expect(redactField('Password', '')).toBe('');
    expect(redactField('ChangePassword', true)).toBe(true);
    expect(redactField('Description', 'hunter2')).toBe('hunter2');
  });
});

describe('redactDeep', () => {
  it('walks nested objects and arrays and counts what it hid', () => {
    const input = {
      Name: 'jdoe',
      Password: 'hunter2',
      ChangePassword: true,
      OAuth: [
        { ClientSecret: 'abc', ClientId: 'portal' },
        { ClientSecret: '', ClientId: 'x' },
      ],
      Nested: { Deep: { PrivateKeyPassword: 'pw', PrivateKeyFile: '/keys/a.pem' } },
    };
    const { value, count } = redactDeep(input);
    expect(count).toBe(3);
    expect(value.Password).toBe(REDACTED);
    expect(value.ChangePassword).toBe(true);
    expect(value.OAuth[0].ClientSecret).toBe(REDACTED);
    expect(value.OAuth[0].ClientId).toBe('portal');
    expect(value.OAuth[1].ClientSecret).toBe('');
    expect(value.Nested.Deep.PrivateKeyPassword).toBe(REDACTED);
    expect(value.Nested.Deep.PrivateKeyFile).toBe('/keys/a.pem');
    expect(input.Password, 'input is not mutated').toBe('hunter2');
  });

  it('redacts string arrays under a secret key', () => {
    const { value, count } = redactDeep({ Secrets: ['a', 'b'], Names: ['a'] });
    expect(value.Secrets).toEqual([REDACTED, REDACTED]);
    expect(value.Names).toEqual(['a']);
    expect(count).toBe(2);
  });

  it('passes primitives through untouched', () => {
    expect(redactDeep(42)).toEqual({ value: 42, count: 0 });
    expect(redactDeep(null)).toEqual({ value: null, count: 0 });
  });
});
