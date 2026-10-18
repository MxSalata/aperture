import { create } from 'zustand';

/**
 * The credentials `/api/atelier` refused, so they are not sent there again: each try counts toward
 * the account's invalid-login limit. IRIS answers 401 both to a wrong password and to an account
 * without `%Development:USE`, so a refusal there does not clear the password the other password-only
 * applications share (`stores/mgmntAuth.ts`), which may well be right for them. Held in memory and
 * forgotten at sign-out.
 */
interface AtelierAuthState {
  refused: string | null;
  refuse(basic: string): void;
  clear(): void;
}

export const useAtelierAuth = create<AtelierAuthState>()((set) => ({
  refused: null,
  refuse: (basic) => set({ refused: basic }),
  clear: () => set({ refused: null }),
}));
