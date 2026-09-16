import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';
import type { Info } from '@/api/types';
import { ApiError } from '@/lib/errors';
import { apiBase, decodeJwtPayload } from '@/api/base';

/**
 * Session store: who we are, on which instance, and how we authenticate.
 *
 * Two authentication modes are supported transparently:
 *  - `jwt`   - `POST /login` (IRIS ≥ 2026.2) → bearer access token + refresh token.
 *  - `basic` - HTTP Basic on every request (any IRIS with the /api/admin web app).
 *
 * `auto` tries JWT and falls back to Basic if the login endpoint is missing.
 * Tokens live in sessionStorage: they survive a reload but not closing the tab.
 */
export type AuthMode = 'jwt' | 'basic';
export type SessionStatus = 'anonymous' | 'authenticating' | 'authenticated';

export interface LoginArgs {
  connectionId: string;
  baseUrl: string;
  username: string;
  password: string;
  role?: string;
  auth?: 'auto' | 'jwt' | 'basic';
}

interface JwtTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  subject?: string;
}

export interface SessionState {
  status: SessionStatus;
  mode: AuthMode | null;
  baseUrl: string;
  connectionId: string | null;
  username: string | null;
  role: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  basicCredentials: string | null;
  expiresAt: number | null;
  info: Info | null;
  lastError: string | null;
  /** Set when the session was ended by the app (expired token, server 401, …). */
  endedReason: string | null;

  login(args: LoginArgs): Promise<void>;
  refresh(): Promise<boolean>;
  logout(opts?: { reason?: string; remote?: boolean }): Promise<void>;
  loadInfo(): Promise<Info>;
  authorizationHeader(): string | null;
  apiBase(): string;
}

type LoginOutcome = JwtTokens | 'unsupported';

function jsonHeaders() {
  return { 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorFromBody(res: Response, body: Record<string, unknown> | null, fallback?: string): ApiError {
  const status = (body?.status ?? {}) as { Errors?: string[]; summary?: string };
  return new ApiError({
    status: res.status,
    url: res.url,
    method: 'POST',
    errors: status.Errors,
    summary: status.summary || fallback,
    console: body?.console as string[] | undefined,
  });
}

function tokensFromLoginBody(body: Record<string, unknown> | null): JwtTokens | null {
  const result = (body?.result ?? body) as Record<string, unknown> | undefined;
  const accessToken = result?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  const exp = typeof result?.exp === 'number' ? result.exp : (decodeJwtPayload(accessToken)?.exp as number | undefined);
  return {
    accessToken,
    refreshToken: typeof result?.refresh_token === 'string' ? result.refresh_token : null,
    expiresAt: exp ? exp * 1000 : null,
    subject: typeof result?.sub === 'string' ? result.sub : undefined,
  };
}

async function jwtLogin(base: string, args: LoginArgs): Promise<LoginOutcome> {
  const url = `${base}/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'omit',
      body: JSON.stringify({ user: args.username, password: args.password, ...(args.role ? { role: args.role } : {}) }),
    });
  } catch {
    throw new ApiError({ status: 0, url, method: 'POST', summary: 'Cannot reach the server. Check the URL and that IRIS is running.' });
  }
  if (res.status === 401) throw new ApiError({ status: 401, url, method: 'POST', summary: 'Invalid username or password.' });
  if (res.status === 404 || res.status === 405 || res.status === 501) return 'unsupported';
  const body = await readJson(res);
  if (!res.ok) throw errorFromBody(res, body, `Login failed (HTTP ${res.status})`);
  const tokens = tokensFromLoginBody(body);
  return tokens ?? 'unsupported';
}

async function basicProbe(base: string, credentials: string): Promise<Info> {
  const url = `${base}/info`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${credentials}` },
      credentials: 'omit',
    });
  } catch {
    throw new ApiError({ status: 0, url, summary: 'Cannot reach the server. Check the URL and that IRIS is running.' });
  }
  if (res.status === 401) throw new ApiError({ status: 401, url, summary: 'Invalid username or password.' });
  if (res.status === 403)
    throw new ApiError({ status: 403, url, summary: 'This user holds none of the %Admin_* privileges required to use the API.' });
  if (res.status === 404)
    throw new ApiError({ status: 404, url, summary: 'The /api/admin web application was not found on this server. Is it enabled?' });
  const body = await readJson(res);
  if (!res.ok) throw errorFromBody(res, body, `Login failed (HTTP ${res.status})`);
  return (body?.result ?? body) as Info;
}

let refreshInFlight: Promise<boolean> | null = null;

const anonymous = {
  status: 'anonymous' as SessionStatus,
  mode: null,
  username: null,
  role: null,
  accessToken: null,
  refreshToken: null,
  basicCredentials: null,
  expiresAt: null,
  info: null,
};

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      ...anonymous,
      baseUrl: '',
      connectionId: null,
      lastError: null,
      endedReason: null,

      apiBase: () => apiBase(get().baseUrl),

      authorizationHeader: () => {
        const s = get();
        if (s.mode === 'jwt' && s.accessToken) return `Bearer ${s.accessToken}`;
        if (s.mode === 'basic' && s.basicCredentials) return `Basic ${s.basicCredentials}`;
        return null;
      },

      login: async (args) => {
        const base = apiBase(args.baseUrl);
        set({ status: 'authenticating', lastError: null, endedReason: null, baseUrl: args.baseUrl, connectionId: args.connectionId });
        try {
          const preferred = args.auth ?? 'auto';
          let outcome: LoginOutcome = 'unsupported';
          if (preferred !== 'basic') outcome = await jwtLogin(base, args);

          if (outcome === 'unsupported') {
            if (preferred === 'jwt') {
              throw new ApiError({
                status: 404,
                url: `${base}/login`,
                summary: 'JWT login is not available on this server (requires IRIS 2026.2+). Try Basic authentication.',
              });
            }
            const credentials = btoa(`${args.username}:${args.password}`);
            const info = await basicProbe(base, credentials);
            set({
              status: 'authenticated',
              mode: 'basic',
              username: info.username ?? args.username,
              role: args.role ?? null,
              basicCredentials: credentials,
              accessToken: null,
              refreshToken: null,
              expiresAt: null,
              info,
            });
            return;
          }

          set({
            status: 'authenticated',
            mode: 'jwt',
            username: outcome.subject ?? args.username,
            role: args.role ?? null,
            accessToken: outcome.accessToken,
            refreshToken: outcome.refreshToken,
            expiresAt: outcome.expiresAt,
            basicCredentials: null,
          });
          await get().loadInfo();
        } catch (e) {
          set({ ...anonymous, lastError: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      },

      refresh: async () => {
        const s = get();
        if (s.mode !== 'jwt' || !s.refreshToken) return false;
        if (refreshInFlight) return refreshInFlight;
        refreshInFlight = (async () => {
          try {
            const res = await fetch(`${s.apiBase()}/refresh`, {
              method: 'POST',
              headers: jsonHeaders(),
              credentials: 'omit',
              body: JSON.stringify({ refresh_token: s.refreshToken }),
            });
            if (!res.ok) return false;
            const tokens = tokensFromLoginBody(await readJson(res));
            if (!tokens) return false;
            set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken ?? s.refreshToken,
              expiresAt: tokens.expiresAt,
            });
            return true;
          } catch {
            return false;
          } finally {
            refreshInFlight = null;
          }
        })();
        return refreshInFlight;
      },

      logout: async (opts) => {
        const s = get();
        if (opts?.remote !== false && s.mode === 'jwt' && s.accessToken) {
          try {
            await fetch(`${s.apiBase()}/logout`, {
              method: 'POST',
              headers: { ...jsonHeaders(), Authorization: `Bearer ${s.accessToken}` },
              credentials: 'omit',
              body: JSON.stringify({ refresh_token: s.refreshToken }),
            });
          } catch {
            /* best effort */
          }
        }
        set({ ...anonymous, endedReason: opts?.reason ?? null });
        // Jobs and metric history belong to the user/instance that just ended.
        const [{ useJobs }, { useMetrics }] = await Promise.all([import('@/stores/jobs'), import('@/stores/metrics')]);
        useJobs.getState().clearAll();
        useMetrics.getState().clear();
      },

      loadInfo: async () => {
        const { api, call } = await import('@/api/client');
        // The spec returns Info unwrapped; tolerate an envelope too.
        const { data } = await call(api().GET('/info'));
        const info = ((data as { result?: Info } | undefined)?.result ?? data) as Info;
        set({ info, username: info.username ?? get().username });
        return info;
      },
    }),
    {
      name: 'aperture.session',
      version: 1,
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) =>
        ({
          status: s.status === 'authenticated' ? 'authenticated' : 'anonymous',
          mode: s.mode,
          baseUrl: s.baseUrl,
          connectionId: s.connectionId,
          username: s.username,
          role: s.role,
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          basicCredentials: s.basicCredentials,
          expiresAt: s.expiresAt,
          info: s.info,
        }) as SessionState,
    },
  ),
);

export const selectIsAuthenticated = (s: SessionState) => s.status === 'authenticated';
