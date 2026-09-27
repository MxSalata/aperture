import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';

/** True for `vite build --mode demo` (GitHub Pages): the in-browser mock is the only backend there. */
export const DEMO_BUILD = import.meta.env.VITE_DEMO === '1';

/** Every account of the demo instance has this password (the mock's, never a real one). */
export const DEMO_PASSWORD = 'SYS';

/**
 * Demo mode serves the entire SysAdmin API from an in-browser mock (MSW).
 * It is what the online demo on GitHub Pages runs, and it is also reachable
 * from the login page of a real deployment ("Try the demo").
 */
interface DemoState {
  enabled: boolean;
  started: boolean;
  enable(): Promise<void>;
  /**
   * Stops interception and unregisters the mock's service worker, so that a real
   * instance is never answered with fabricated data once the user signs in to one.
   */
  disable(): Promise<void>;
}

export const useDemo = create<DemoState>()(
  persist(
    (set, get) => ({
      enabled: DEMO_BUILD,
      started: false,
      enable: async () => {
        if (get().started) {
          set({ enabled: true });
          return;
        }
        const { startMockWorker } = await import('@/mocks/browser');
        await startMockWorker();
        set({ enabled: true, started: true });
      },
      disable: async () => {
        if (get().started) {
          try {
            const { stopMockWorker } = await import('@/mocks/browser');
            await stopMockWorker();
          } catch {
            /* best effort: the flag below still hides the demo badge and the next reload starts clean */
          }
        }
        set({ enabled: false, started: false });
      },
    }),
    {
      name: 'aperture.demo',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ enabled: s.enabled }) as DemoState,
    },
  ),
);
