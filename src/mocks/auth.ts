import type { Info } from '@/api/types';

/**
 * Mock identity provider. Four accounts show off privilege-aware UI:
 *   _SYSTEM / SYS     - everything
 *   superuser / SYS   - everything
 *   operator / SYS    - %Admin_Operate + %Admin_Task only
 *   auditor / SYS     - %Admin_Secure only
 */
export interface MockAccount {
  username: string;
  password: string;
  privileges: string[];
  roles: string[];
}

const ALL = [
  'Operate',
  'Manage',
  'Secure',
  'Task',
  'Journal',
  'Wallet',
  'OAuth2_Client',
  'OAuth2_Server',
  'OAuth2_Registration',
  'ExternalLanguageServerEdit',
  'FileSystemAccess',
  'ConfigStore',
];

export const accounts: MockAccount[] = [
  { username: '_SYSTEM', password: 'SYS', privileges: ALL, roles: ['%All'] },
  { username: 'superuser', password: 'SYS', privileges: ALL, roles: ['%All'] },
  { username: 'operator', password: 'SYS', privileges: ['Operate', 'Task', 'Journal'], roles: ['%Operator'] },
  { username: 'auditor', password: 'SYS', privileges: ['Secure'], roles: ['%Manager'] },
];

export function findAccount(username: string, password?: string): MockAccount | undefined {
  const a = accounts.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!a) return undefined;
  if (password !== undefined && a.password !== password) return undefined;
  return a;
}

/** Access tokens: header.payload.signature with a fake signature - the mock only checks structure and expiry. */
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
  typ: 'access' | 'refresh';
  sid: string;
}

export function issueToken(username: string, typ: 'access' | 'refresh', ttlSeconds: number, sid: string): string {
  const iat = Date.now() / 1000;
  const payload: TokenPayload = { sub: username, iat, exp: Math.floor(iat + ttlSeconds), typ, sid };
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.${b64('mock-signature-' + sid)}`;
}

export function parseToken(token: string): TokenPayload | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as TokenPayload;
    if (!p.sub || !p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

const revokedSessions = new Set<string>();

export function revokeSession(sid: string) {
  revokedSessions.add(sid);
}

export function isRevoked(sid: string) {
  return revokedSessions.has(sid);
}

/** Resolve the caller from Authorization header (Bearer or Basic). */
export function authenticate(request: Request): MockAccount | null {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    const payload = parseToken(header.slice(7));
    if (!payload || payload.typ !== 'access') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (isRevoked(payload.sid)) return null;
    return findAccount(payload.sub) ?? null;
  }
  if (header.startsWith('Basic ')) {
    try {
      const [user, ...rest] = atob(header.slice(6)).split(':');
      return findAccount(user, rest.join(':')) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export function infoFor(account: MockAccount, namespaces: string[]): Info {
  const privileges: Record<string, { use: boolean }> = {};
  for (const k of ALL) privileges[k] = { use: account.privileges.includes(k) };
  return {
    apiVersion: 2,
    username: account.username,
    serverVersion: 'IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2.0 (Build 142U) Fri Sep 4 2026 10:22:01 EDT',
    systemMode: 'DEVELOPMENT',
    product: 'iris',
    namespaces: namespaces.map((name) => ({ name })),
    privileges: privileges as Info['privileges'],
  };
}

/** `(%Admin_Secure:U)` style resource → does the account hold it? */
export function holds(account: MockAccount, resources: string[]): boolean {
  if (!resources.length) return true;
  return resources.some((r) => {
    const m = r.match(/^%Admin_([A-Za-z0-9_]+)/);
    return m ? account.privileges.includes(m[1]) : true;
  });
}
