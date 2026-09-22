import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';

/**
 * Session history of changes: every non-GET call the portal sent, with the
 * outcome the server reported. Recorded by the API client middleware.
 */
export interface ActivityEntry {
  id: string;
  at: number;
  method: string;
  /** Path relative to /api/admin, without the query string. */
  path: string;
  query: string;
  status: number;
  ok: boolean;
  summary: string;
  durationMs: number;
  jobId?: string | null;
}

const MAX = 300;

interface ActivityState {
  entries: ActivityEntry[];
  record(entry: Omit<ActivityEntry, 'id'>): void;
  clear(): void;
}

export const useActivity = create<ActivityState>()(
  persist(
    (set) => ({
      entries: [],
      record: (entry) =>
        set((s) => {
          const next = [
            { ...entry, id: `${entry.at}-${Math.random().toString(36).slice(2, 8)}` },
            ...s.entries,
          ];
          return { entries: next.length > MAX ? next.slice(0, MAX) : next };
        }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'aperture.activity', storage: createJSONStorage(() => safeSessionStorage) },
  ),
);
