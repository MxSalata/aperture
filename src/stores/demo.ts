import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';

/**
 * Demo mode serves the entire SysAdmin API from an in-browser mock (MSW).
 * It is what the online demo on GitHub Pages runs, and it is also reachable
 * from the login page of a real deployment ("Try the demo").
 */
interface DemoState {
  enabled: boolean;
  started: boolean;
  enable(): Promise<void>;
  disable(): void;
}

export const useDemo = create<DemoState>()(
  persist(
    (set, get) => ({
      enabled: import.meta.env.VITE_DEMO === '1',
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
      disable: () => set({ enabled: false }),
    }),
    {
      name: 'aperture.demo',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ enabled: s.enabled }) as DemoState,
    },
  ),
);
