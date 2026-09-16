/** Path of the SysAdmin API relative to the IRIS web server root. */
export const API_PREFIX = '/api/admin';

/** `'http://host:52773'` → `'http://host:52773/api/admin'`; `''` → `'/api/admin'`. */
export function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}`;
}

/** Minimal JWT payload decoder (no verification - the server does that). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
