/** Path of the SysAdmin API relative to the IRIS web server root. */
export const API_PREFIX = '/api/admin';

/** `'http://host:52773'` → `'http://host:52773/api/admin'`; `''` → `'/api/admin'`. */
export function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}`;
}

/** Minimal JWT payload decoder (no verification - the server does that). The payload is UTF-8 JSON. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

/**
 * `user:password` in Base64 for HTTP Basic. `btoa` only takes Latin-1 and throws on anything
 * else (a password with "ł" or "€" crashed the sign-in). Latin-1 input is encoded exactly as
 * before, so no working password changes on the wire; the rest is sent as UTF-8, the charset
 * RFC 7617 §2.1 names.
 */
export function basicCredentials(username: string, password: string): string {
  const text = `${username}:${password}`;
  try {
    return btoa(text);
  } catch {
    let binary = '';
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}
