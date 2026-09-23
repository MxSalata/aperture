import { create } from 'zustand';

/**
 * The password for `/api/mgmnt` in a JWT session (see `api/mgmnt.ts`): that web application takes a
 * password only, and a JWT session no longer has one. Asked for once, held in this tab's memory as
 * Basic credentials, never written to storage, and forgotten at sign-out or when the instance
 * refuses it.
 */
interface MgmntAuthState {
  basic: string | null;
  set(basic: string): void;
  clear(): void;
}

export const useMgmntAuth = create<MgmntAuthState>()((set) => ({
  basic: null,
  set: (basic) => set({ basic }),
  clear: () => set({ basic: null }),
}));
