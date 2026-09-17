import { create } from 'zustand';

/**
 * Reachability of the connected instance, fed by the API client.
 * Drives the LIVE / OFFLINE pill in the header so a failing poll never
 * masquerades as a healthy server.
 */
interface HealthState {
  reachable: boolean;
  lastOkAt: number | null;
  lastFailAt: number | null;
  lastError: string | null;
  failures: number;
  markOk(): void;
  markFail(message: string): void;
  reset(): void;
}

export const useHealth = create<HealthState>()((set) => ({
  reachable: true,
  lastOkAt: null,
  lastFailAt: null,
  lastError: null,
  failures: 0,
  markOk: () => set((s) => (s.reachable && s.failures === 0 ? { lastOkAt: Date.now() } : { reachable: true, failures: 0, lastError: null, lastOkAt: Date.now() })),
  markFail: (message) => set((s) => ({ reachable: false, failures: s.failures + 1, lastFailAt: Date.now(), lastError: message })),
  reset: () => set({ reachable: true, lastOkAt: null, lastFailAt: null, lastError: null, failures: 0 }),
}));
