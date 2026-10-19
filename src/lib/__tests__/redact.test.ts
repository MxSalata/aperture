import { describe, expect, it } from 'vitest';
import { isSecretKey, redactDeep, redactField, redactText, REDACTED } from '../redact';

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
      // OAuth / JWT payloads (POST /login and /refresh answers, OAuth2 client registration)
      'access_token',
      'refresh_token',
      'registration_access_token',
      'id_token',
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
      'access_token_signed_response_alg',
      'id_token_encrypted_response_enc',
      'access_token_encryption_alg_values_supported',
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

  it('hides every string inside an object held under a secret key', () => {
    const { value, count } = redactDeep({
      Secret: { username: 'svc', value: 'p@ss' },
      Name: 'wallet-entry',
    });
    expect(value.Secret).toEqual({ username: REDACTED, value: REDACTED });
    expect(value.Name).toBe('wallet-entry');
    expect(count).toBe(2);
  });

  it('hides the value of a name/value pair whose name is a secret word', () => {
    const { value } = redactDeep([
      { Name: 'password', Value: 'hunter2' },
      { Name: 'user', Value: 'jdoe' },
    ]);
    expect(value).toEqual([
      { Name: 'password', Value: REDACTED },
      { Name: 'user', Value: 'jdoe' },
    ]);
  });

  it('takes the key of a value read out of an object', () => {
    expect(redactDeep('hunter2', 'Password').value).toBe(REDACTED);
    expect(redactDeep({ value: 'x' }, 'WalletSecretConfig').value).toEqual({ value: REDACTED });
    expect(redactDeep('jdoe', 'Name').value).toBe('jdoe');
  });

  it('passes primitives through untouched', () => {
    expect(redactDeep(42)).toEqual({ value: 42, count: 0 });
    expect(redactDeep(null)).toEqual({ value: null, count: 0 });
  });
});

describe('settings that end in a secret word', () => {
  it('keeps the authorization server policy ReturnRefreshToken and still hides a refresh token', () => {
    expect(isSecretKey('ReturnRefreshToken')).toBe(false);
    expect(isSecretKey('refresh_token')).toBe(true);
    expect(isSecretKey('RefreshToken')).toBe(true);
  });
});

describe('redactText', () => {
  it('hides secret values in a body that does not parse, and keeps the rest as typed', () => {
    expect(redactText('{"Name":"bob","Password":"hunter2",}')).toBe(
      `{"Name":"bob","Password":"${REDACTED}",}`,
    );
    expect(redactText("{Name: 'bob', ClientSecret: 'a\\'b' PasswordNeverExpires: \"1\"")).toBe(
      `{Name: 'bob', ClientSecret: '${REDACTED}' PasswordNeverExpires: "1"`,
    );
  });

  it('hides a value whose closing quote is missing, up to the end of its line', () => {
    expect(redactText('{\n  "Password": "hunter2\n  "Name": "bob"\n')).toBe(
      `{\n  "Password": "${REDACTED}\n  "Name": "bob"\n`,
    );
    expect(redactText('{"access_token": "abc", "Password": ""')).toBe(
      `{"access_token": "${REDACTED}", "Password": ""`,
    );
  });

  it('finds a secret key after an earlier value lost its closing quote', () => {
    expect(redactText('{"Name": "bob, "Password": "hunter2"}')).toBe(
      `{"Name": "bob, "Password": "${REDACTED}"}`,
    );
    expect(redactText('{"Note": "x\\", "Password": "hunter2"}')).toBe(
      `{"Note": "x\\", "Password": "${REDACTED}"}`,
    );
    expect(redactText('{"Note": "x\\\\\\", "Password": "hunter2"}')).not.toContain('hunter2');
  });

  it('hides a value typed without quotes, and leaves literals and nested values to their keys', () => {
    expect(redactText('{"Password": hunter2, "Name": "x"}')).toBe(`{"Password": ${REDACTED}, "Name": "x"}`);
    expect(redactText('{ClientSecret: s3 cr3t }')).toBe(`{ClientSecret: ${REDACTED} }`);
    expect(redactText('{"Password":\n  hunter2\n}')).toBe(`{"Password":\n  ${REDACTED}\n}`);
    expect(redactText('{"ChangePassword": true, "Password": null,}')).toBe(
      '{"ChangePassword": true, "Password": null,}',
    );
    expect(redactText('{"Secret": {"Password": "p"},}')).toBe(`{"Secret": {"Password": "${REDACTED}"},}`);
  });
});
