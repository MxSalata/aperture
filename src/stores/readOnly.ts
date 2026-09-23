import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeSessionStorage } from './storage';

/**
 * Read-only mode, per browser tab: while it is on, this tab sends nothing that changes the
 * instance (the API middleware refuses it, see `api/readOnly.ts`). It lives in sessionStorage, so
 * it survives a reload of the tab and no other tab sees it. A safety catch for looking around a
 * production instance, not a security control: the server's privileges still decide what an
 * account may do.
 */
interface ReadOnlyState {
  readOnly: boolean;
  setReadOnly(readOnly: boolean): void;
}

export const useReadOnly = create<ReadOnlyState>()(
  persist(
    (set) => ({
      readOnly: false,
      setReadOnly: (readOnly) => set({ readOnly }),
    }),
    {
      name: 'aperture.readOnly',
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (s) => ({ readOnly: s.readOnly }) as ReadOnlyState,
    },
  ),
);
