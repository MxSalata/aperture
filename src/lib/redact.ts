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
  /(password|passwd|passphrase|secret|accesstoken|refreshtoken|logintoken|csrftoken|authorizationkey|apikey|privatekey$|hotpkey)/i;

/** Keys that contain a secret word but describe configuration, not a value to protect. */
const NOT_SECRET =
  /(interval|timeout|page|class|file|type|neverexpires|isjwt|expires|length|len|enabled|allowed|required|policy|method|url|endpoint|display)$/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key) && !NOT_SECRET.test(key);
}

/** Redact one field: strings under a secret key become the placeholder; everything else passes. */
export function redactField(key: string, value: unknown): unknown {
  return typeof value === 'string' && value !== '' && isSecretKey(key) ? REDACTED : value;
}

/**
 * Deep copy of `value` with every secret string replaced. Returns the number of values
 * hidden so the UI can say that something was withheld rather than silently omit it.
 */
export function redactDeep<T>(value: T): { value: T; count: number } {
  let count = 0;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') {
      if (key !== undefined && v !== '' && isSecretKey(key)) {
        count += 1;
        return REDACTED;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, k);
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, count };
}
