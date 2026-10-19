import { create } from 'zustand';

/**
 * The credentials `/api/atelier` refused, so they are not sent there again: each try counts toward
 * the account's invalid-login limit. IRIS answers 401 both to a wrong password and to an account
 * without `%Development:USE`, so a refusal there does not clear the password the other password-only
 * applications share (`stores/mgmntAuth.ts`), which may well be right for them. A password given on
 * the SQL screen's own gate (`typed`) has worked nowhere yet, so a refusal forgets it everywhere and
 * the other screens do not send it on. Held in memory and forgotten at sign-out.
 */
interface AtelierAuthState {
  refused: string | null;
  typed: string | null;
  refuse(basic: string): void;
  type(basic: string): void;
  accept(): void;
  clear(): void;
}

export const useAtelierAuth = create<AtelierAuthState>()((set) => ({
  refused: null,
  typed: null,
  refuse: (basic) => set({ refused: basic }),
  type: (basic) => set({ typed: basic }),
  accept: () => set({ typed: null }),
  clear: () => set({ refused: null, typed: null }),
}));
