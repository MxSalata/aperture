import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A connection profile points at one IRIS instance.
 *
 * `baseUrl` is the origin (and optional path prefix) *in front of* `/api/admin`:
 *   ''                          → same origin (nginx proxy, IPM install, Vite dev proxy)
 *   'http://iris.lan:52773'     → private web server of a remote instance (needs CORS on /api/admin)
 *   'https://gw.example.com/iris' → web gateway with an instance prefix
 */
export interface ConnectionProfile {
  id: string;
  name: string;
  baseUrl: string;
  /** Preferred auth mode. `auto` tries JWT first and falls back to Basic. */
  auth: 'auto' | 'jwt' | 'basic';
  /** Last username used, for convenience. */
  username?: string;
  color?: string;
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
            profiles: exists ? s.profiles.map((p) => (p.id === profile.id ? profile : p)) : [...s.profiles, profile],
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

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/api\/admin$/, '');
}
