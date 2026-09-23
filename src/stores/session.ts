import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';
import type { Info } from '@/api/types';
import { ApiError, normalizeErrors } from '@/lib/errors';
import { apiBase, basicCredentials, decodeJwtPayload } from '@/api/base';
import { useJobs } from '@/stores/jobs';
import { useMetrics } from '@/stores/metrics';
import { useActivity } from '@/stores/activity';
import { useHealth } from '@/stores/health';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { queryClient } from '@/query';
import { forgetEndedTasks } from '@/api/endedTasks';
import { setInstanceTimezone, setMeasuredOffset } from '@/lib/format';
import { claimSession, newSessionKey, releaseSession } from './sessionLock';

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
  /** Persist tokens in sessionStorage so a reload keeps the session (default true). */
  persist?: boolean;
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
  /** When false, credentials stay in memory only and a reload signs you out. */
  persistTokens: boolean;
  /** Names this tab's JWT session for the one-tab-per-session lock (`sessionLock.ts`). */
  sessionKey: string | null;

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
  const n = normalizeErrors(body);
  return new ApiError({
    status: res.status,
    url: res.url,
    method: 'POST',
    errors: n.errors,
    summary: n.summary || fallback,
    console: n.console,
  });
}

/**
 * When the access token expires, on this browser's clock. IRIS 2026.2 issues 60-second access
 * tokens; read as an absolute `exp`, a browser clock a minute fast would refresh before every
 * request. The token's lifetime (`exp - iat`) counted from now is immune to clock skew.
 */
function expiryFrom(result: Record<string, unknown> | undefined, accessToken: string): number | null {
  const claims = decodeJwtPayload(accessToken) ?? {};
  const exp = typeof result?.exp === 'number' ? result.exp : (claims.exp as number | undefined);
  const iat = typeof result?.iat === 'number' ? result.iat : (claims.iat as number | undefined);
  if (exp && iat && exp > iat) return Date.now() + (exp - iat) * 1000;
  return exp ? exp * 1000 : null;
}

function tokensFromLoginBody(body: Record<string, unknown> | null): JwtTokens | null {
  const result = (body?.result ?? body) as Record<string, unknown> | undefined;
  const accessToken = result?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  return {
    accessToken,
    refreshToken: typeof result?.refresh_token === 'string' ? result.refresh_token : null,
    expiresAt: expiryFrom(result, accessToken),
    subject: typeof result?.sub === 'string' ? result.sub : undefined,
  };
}

/**
 * The scheme a 401 asks for. IRIS names what its web application takes: `Bearer` when JWT
 * authentication is on, `Basic` when it is off, and then POST /login is no JWT endpoint at all:
 * IRIS asks for a password before the request reaches it, so its 401 says nothing about the one in
 * the body. nginx and the dev server hide WWW-Authenticate (it would open the browser's own login
 * dialog) and pass it on as X-Aperture-WWW-Authenticate; a cross-origin answer shows neither.
 */
function challengeOf(res: Response): string {
  return (res.headers.get('WWW-Authenticate') ?? res.headers.get('X-Aperture-WWW-Authenticate') ?? '').trim();
}

async function jwtLogin(base: string, args: LoginArgs): Promise<LoginOutcome> {
  const url = `${base}/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'omit',
      body: JSON.stringify({
        user: args.username,
        password: args.password,
        ...(args.role ? { role: args.role } : {}),
      }),
    });
  } catch {
    throw new ApiError({
      status: 0,
      url,
      method: 'POST',
      summary: 'Cannot reach the server. Check the URL and that IRIS is running.',
    });
  }
  if (res.status === 401) {
    const challenge = challengeOf(res);
    // JWT authentication is switched off on the web application: sign in with Basic instead.
    if (/^basic\b/i.test(challenge)) return 'unsupported';
    throw new ApiError({
      status: 401,
      url,
      method: 'POST',
      summary: challenge
        ? 'Invalid username or password.'
        : 'Invalid username or password. If JWT authentication is switched off on /api/admin, sign in with Basic.',
    });
  }
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
    throw new ApiError({
      status: 0,
      url,
      summary: 'Cannot reach the server. Check the URL and that IRIS is running.',
    });
  }
  if (res.status === 401) throw new ApiError({ status: 401, url, summary: 'Invalid username or password.' });
  if (res.status === 403)
    throw new ApiError({
      status: 403,
      url,
      summary: 'This user holds none of the %Admin_* privileges required to use the API.',
    });
  if (res.status === 404)
    throw new ApiError({
      status: 404,
      url,
      summary: 'The /api/admin web application was not found on this server. Is it enabled?',
    });
  const body = await readJson(res);
  if (!res.ok) throw errorFromBody(res, body, `Login failed (HTTP ${res.status})`);
  return (body?.result ?? body) as Info;
}

/**
 * Aperture speaks SysAdmin API v2, which ships with IRIS 2026.2. IRIS 2026.1 serves v1 only
 * (every /api/admin/v2 path answers 404, and there is no POST /login), and older releases
 * have no SysAdmin API at all: signing in there would open a portal whose every screen fails.
 */
export const REQUIRED_API_VERSION = 2;

function assertSupportedApi(info: Info, url: string): void {
  const v = Number(info.apiVersion);
  if (Number.isFinite(v) && v > 0 && v < REQUIRED_API_VERSION)
    throw new ApiError({
      status: 0,
      url,
      summary: `This instance serves SysAdmin API v${v}${info.serverVersion ? ` (${info.serverVersion.match(/\d{4}\.\d+/)?.[0] ?? info.serverVersion})` : ''}. Aperture needs API v${REQUIRED_API_VERSION}, which ships with IRIS 2026.2.`,
    });
}

/** Shown after a reload ended a Basic session, whose credentials are never stored. */
export const BASIC_NOT_KEPT =
  'Signed out by the reload: with Basic authentication the password is kept in memory only. JWT sessions (IRIS 2026.2) survive a reload.';

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Everything cached about the instance we were talking to: query results, jobs, metric
 * history, the activity log and the reachability pill. A tab holds one session, so a
 * reset at the session boundary is what keeps instance A's rows from ever painting for B.
 */
export function resetInstanceState(): void {
  queryClient.clear();
  forgetEndedTasks();
  setInstanceTimezone(null);
  setMeasuredOffset(null);
  useJobs.getState().clearAll();
  useMetrics.getState().clear();
  useActivity.getState().clear();
  useHealth.getState().reset();
  useMgmntAuth.getState().clear();
}

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
  sessionKey: null,
};

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      ...anonymous,
      baseUrl: '',
      connectionId: null,
      lastError: null,
      endedReason: null,
      persistTokens: true,

      apiBase: () => apiBase(get().baseUrl),

      authorizationHeader: () => {
        const s = get();
        if (s.mode === 'jwt' && s.accessToken) return `Bearer ${s.accessToken}`;
        if (s.mode === 'basic' && s.basicCredentials) return `Basic ${s.basicCredentials}`;
        return null;
      },

      login: async (args) => {
        const base = apiBase(args.baseUrl);
        const previous = get();
        if (
          previous.status === 'authenticated' ||
          previous.connectionId !== args.connectionId ||
          previous.baseUrl !== args.baseUrl
        ) {
          resetInstanceState();
        }
        set({
          status: 'authenticating',
          lastError: null,
          endedReason: null,
          baseUrl: args.baseUrl,
          connectionId: args.connectionId,
          persistTokens: args.persist !== false,
        });
        try {
          const preferred = args.auth ?? 'auto';
          let outcome: LoginOutcome = 'unsupported';
          if (preferred !== 'basic') outcome = await jwtLogin(base, args);

          if (outcome === 'unsupported') {
            if (preferred === 'jwt') {
              throw new ApiError({
                status: 404,
                url: `${base}/login`,
                summary:
                  'JWT login is not available on this server (requires IRIS 2026.2+). Try Basic authentication.',
              });
            }
            // Escalation exists only at POST /login: a Basic session would run with the
            // account's own roles while the portal said otherwise.
            if (args.role)
              throw new ApiError({
                status: 400,
                url: `${base}/login`,
                summary: `Escalation to ${args.role} needs JWT sign-in (POST /login), which this server does not offer. Sign in without an escalation role.`,
              });
            const credentials = basicCredentials(args.username, args.password);
            const info = await basicProbe(base, credentials);
            assertSupportedApi(info, `${base}/info`);
            set({
              status: 'authenticated',
              mode: 'basic',
              username: info.username ?? args.username,
              role: null,
              basicCredentials: credentials,
              accessToken: null,
              refreshToken: null,
              expiresAt: null,
              info,
            });
            return;
          }

          const sessionKey = newSessionKey();
          set({
            status: 'authenticated',
            mode: 'jwt',
            username: outcome.subject ?? args.username,
            role: args.role ?? null,
            accessToken: outcome.accessToken,
            refreshToken: outcome.refreshToken,
            expiresAt: outcome.expiresAt,
            basicCredentials: null,
            sessionKey,
          });
          await claimSession(sessionKey);
          assertSupportedApi(await get().loadInfo(), `${base}/info`);
        } catch (e) {
          // A token issued to a session that cannot start (e.g. /info refuses the account) is revoked.
          if (get().mode === 'jwt') await get().logout();
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
            // Signed out (or into another session) while the refresh was in flight: do not bring it back.
            if (get().refreshToken !== s.refreshToken) return false;
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
        releaseSession();
        // Everything cached belongs to the user/instance that just ended.
        resetInstanceState();
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
      version: 2,
      storage: createJSONStorage(() => safeSessionStorage),
      // Only a JWT session survives a reload. Basic credentials are the password itself (Base64 of
      // user:password), so they stay in memory, whatever the checkbox says; tokens expire (60 s
      // access, 900 s refresh on IRIS 2026.2) and can be revoked, a password cannot.
      partialize: (s) => {
        const keep = s.persistTokens && s.mode === 'jwt';
        const basicInMemory = s.status === 'authenticated' && s.mode === 'basic';
        return {
          status: s.status === 'authenticated' && keep ? 'authenticated' : 'anonymous',
          mode: keep ? s.mode : null,
          baseUrl: s.baseUrl,
          connectionId: s.connectionId,
          username: s.username,
          role: s.role,
          persistTokens: s.persistTokens,
          accessToken: keep ? s.accessToken : null,
          refreshToken: keep ? s.refreshToken : null,
          basicCredentials: null,
          expiresAt: keep ? s.expiresAt : null,
          sessionKey: keep ? s.sessionKey : null,
          info: keep ? s.info : null,
          // What the sign-in page says after the reload of a Basic session.
          ...(basicInMemory ? { endedReason: BASIC_NOT_KEPT } : {}),
        } as SessionState;
      },
      // Version 1 stored Basic credentials when "keep me signed in" was ticked: drop them.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SessionState>;
        if (version < 2 && (p.basicCredentials || p.mode === 'basic'))
          return {
            ...p,
            basicCredentials: null,
            mode: null,
            status: 'anonymous',
            info: null,
          } as SessionState;
        return p as SessionState;
      },
    },
  ),
);

export const selectIsAuthenticated = (s: SessionState) => s.status === 'authenticated';
