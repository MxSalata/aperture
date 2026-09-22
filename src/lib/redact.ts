/**
 * Secrets never become UI content. Any value whose key names a password, secret, token
 * or private key is replaced before it is rendered, listed, copied or exported. The rule
 * is applied at the render boundary (JsonViewer, KeyValueList, CSV export), so a screen
 * cannot forget it, and it is keyed on the property name because the SysAdmin API
 * returns secrets under a small, predictable vocabulary (`Password`, `ClientSecret`,
 * `PrivateKeyPassword`, `InitialAccessToken`, `KeyValueSecret`, …).
 *
 * Only string values are hidden: booleans such as `ChangePassword`, numbers such as
 * `AccessTokenInterval` and paths such as `PrivateKeyFile` carry no secret material.
 */
export const REDACTED = '••••••••';

const SECRET_KEY =
  /(password|passwd|passphrase|secret|accesstoken|refreshtoken|idtoken|logintoken|csrftoken|authorizationkey|apikey|privatekey$|hotpkey)/i;

/** Keys that contain a secret word but describe configuration, not a value to protect. */
const NOT_SECRET =
  /(interval|timeout|page|class|file|type|neverexpires|isjwt|expires|length|len|enabled|allowed|required|policy|method|url|endpoint|display|alg|enc|supported)$/i;

export function isSecretKey(key: string): boolean {
  // OAuth and JWT payloads spell the same words in snake_case (`access_token`, `refresh_token`).
  const k = key.replace(/[_-]/g, '');
  return SECRET_KEY.test(k) && !NOT_SECRET.test(k);
}

/** Redact one field: strings under a secret key become the placeholder; everything else passes. */
export function redactField(key: string, value: unknown): unknown {
  return typeof value === 'string' && value !== '' && isSecretKey(key) ? REDACTED : value;
}

/**
 * Deep copy of `value` with every secret string replaced. Returns the number of values
 * hidden so the UI can say that something was withheld rather than silently omit it.
 * `key` names the property `value` was read from, when the caller took it out of an object.
 *
 * Inside an object or array held under a secret key (`Secret`, `WalletSecretConfig`) every
 * string is secret material, whatever its own key; and in a name/value list (process
 * variables) the secret word is in the sibling `Name`, so `Value` is hidden by it.
 */
export function redactDeep<T>(value: T, key?: string): { value: T; count: number } {
  let count = 0;
  const walk = (v: unknown, k: string | undefined, underSecret: boolean): unknown => {
    const secret = underSecret || (k !== undefined && isSecretKey(k));
    if (typeof v === 'string') {
      if (secret && v !== '') {
        count += 1;
        return REDACTED;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, k, underSecret));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      const name = typeof o.Name === 'string' ? o.Name : typeof o.name === 'string' ? o.name : undefined;
      const secretValue = name !== undefined && isSecretKey(name);
      const out: Record<string, unknown> = {};
      for (const [ck, x] of Object.entries(o))
        out[ck] = walk(x, ck, secret || (secretValue && /^value$/i.test(ck)));
      return out;
    }
    return v;
  };
  return { value: walk(value, key, false) as T, count };
}
