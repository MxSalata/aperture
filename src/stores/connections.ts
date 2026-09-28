import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A connection profile points at one IRIS instance.
 *
 * `baseUrl` is what comes *in front of* `/api/admin`:
 *   ''                            → same origin (nginx proxy, IPM install, Vite dev proxy)
 *   '/iris-b'                     → another instance behind the same reverse proxy, under a path prefix
 *   'https://gw.example.com/iris' → a web gateway with an instance prefix, when it is this page's origin
 *
 * A different origin cannot be used from a browser: `/api/admin/v2` sends no CORS headers, by
 * design (InterSystems, contest announcement thread, 22 September 2026), so a cross-origin request
 * is refused before it reaches IRIS. An `http(s)://` base URL is accepted for a gateway that is
 * this page's origin, or a proxy of your own that adds CORS headers; nginx's template documents the
 * path-prefix pattern, which needs neither.
 */
export interface ConnectionProfile {
  id: string;
  name: string;
  baseUrl: string;
  /** Preferred auth mode. `auto` tries JWT first and falls back to Basic. */
  auth: 'auto' | 'jwt' | 'basic';
  /** Last username used, for convenience. */
  username?: string;
  /** One of PROFILE_COLORS; shown in the header so production and staging never look alike. */
  color?: string;
  /** IANA time zone of the instance (e.g. "Europe/Warsaw"); unset = assume the browser's zone. */
  timezone?: string;
}

/** Vetted Mantine colour keys (shade 6 keeps ≥3:1 against both header surfaces). */
export const PROFILE_COLORS = [
  'indigo',
  'cyan',
  'teal',
  'green',
  'orange',
  'red',
  'pink',
  'grape',
  'violet',
  'blue',
  'yellow',
  'gray',
] as const;

export function profileColor(profile: ConnectionProfile | undefined): string {
  return profile?.color && (PROFILE_COLORS as readonly string[]).includes(profile.color)
    ? profile.color
    : 'indigo';
}

/** A colour for the n-th saved profile, so new connections do not all look the same. */
export function nextProfileColor(existing: number): string {
  return PROFILE_COLORS[(existing + 1) % PROFILE_COLORS.length];
}

export const SAME_ORIGIN_ID = 'same-origin';

const defaultProfiles: ConnectionProfile[] = [
  {
    id: SAME_ORIGIN_ID,
    name: 'This server',
    baseUrl: '',
    auth: 'auto',
    username: '_SYSTEM',
    color: 'indigo',
  },
];

interface ConnectionsState {
  profiles: ConnectionProfile[];
  lastUsedId: string;
  upsert(profile: ConnectionProfile): void;
  remove(id: string): void;
  setLastUsed(id: string): void;
}

export const useConnections = create<ConnectionsState>()(
  persist(
    (set) => ({
      profiles: defaultProfiles,
      lastUsedId: SAME_ORIGIN_ID,
      upsert: (profile) =>
        set((s) => {
          const exists = s.profiles.some((p) => p.id === profile.id);
          return {
            profiles: exists
              ? s.profiles.map((p) => (p.id === profile.id ? profile : p))
              : [...s.profiles, profile],
          };
        }),
      remove: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id || p.id === SAME_ORIGIN_ID),
          lastUsedId: s.lastUsedId === id ? SAME_ORIGIN_ID : s.lastUsedId,
        })),
      setLastUsed: (id) => set({ lastUsedId: id }),
    }),
    { name: 'aperture.connections', version: 1 },
  ),
);

export function newProfileId() {
  return `conn-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Why a typed base URL cannot be used, or null. It must be an http(s) origin with an optional
 * path: credentials in the URL would be sent (and logged) with every request, and a query or a
 * fragment would be glued in front of every API path.
 */
export function baseUrlProblem(url: string): string | null {
  const text = url.trim();
  // A path prefix on this page's origin: another instance behind the same reverse proxy.
  if (text.startsWith('/')) {
    if (text.startsWith('//')) return 'A path prefix starts with a single slash, such as /iris-b';
    if (/[?#\s]/.test(text)) return 'The base URL cannot carry a query (?) or a fragment (#)';
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return 'Enter a path prefix such as /iris-b (an instance behind the same proxy) or a URL such as https://gateway.example.org/iris';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Use an http:// or https:// URL';
  if (parsed.username || parsed.password)
    return 'Leave credentials out of the URL: they are asked for at sign-in';
  if (parsed.search || parsed.hash) return 'The base URL cannot carry a query (?) or a fragment (#)';
  return null;
}

/**
 * What stands in the way of a base URL on another origin, or null when it is this page's origin or
 * a path prefix. Two things do: /api/admin sends no CORS headers (the browser refuses the answer
 * unless a proxy of yours adds them), and the builds that carry a Content-Security-Policy of their
 * own (the portal IRIS serves, the demo) allow calls to their own origin only, unless built with
 * VITE_CONNECT_SRC naming it.
 */
export function crossOriginWarning(url: string, page: { origin: string; csp: string | null }): string | null {
  const text = url.trim();
  if (!text || text.startsWith('/')) return null;
  let origin: string;
  try {
    origin = new URL(text).origin;
  } catch {
    return null;
  }
  if (origin === page.origin) return null;
  const connect =
    page.csp
      ?.match(/connect-src([^;]*)/)?.[1]
      .trim()
      .split(/\s+/) ?? null;
  const blocked = connect !== null && !connect.includes(origin) && !connect.includes('*');
  return (
    `${origin} is another origin: IRIS's /api/admin sends no CORS headers, so the browser refuses its answers unless a proxy of yours adds them.` +
    (blocked
      ? " This build's Content-Security-Policy also allows calls to its own origin only; building with VITE_CONNECT_SRC naming that origin lifts it."
      : '')
  );
}

/** This page's origin and its own Content-Security-Policy, for crossOriginWarning. */
export function pagePolicy(): { origin: string; csp: string | null } {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  return { origin: location.origin, csp: meta?.getAttribute('content') ?? null };
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/api\/admin$/, '');
}
