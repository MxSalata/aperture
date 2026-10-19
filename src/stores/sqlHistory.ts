import { create } from 'zustand';
import { safeSessionStorage } from './storage';

const KEY = 'aperture.sql.history';

/** A statement that may carry a password (`CREATE USER x IDENTIFIED BY 'secret'`, `SET PASSWORD`). */
const SECRET = /\bIDENTIFIED\s+BY\b|\bPASSWORD\b/i;

/**
 * The SQL explorer's recent statements (the last 20), kept in this tab's sessionStorage so they
 * survive a reload. A statement that may carry a password is not kept: passwords stay in memory
 * only (`stores/mgmntAuth.ts`). Forgotten at sign-out, so the next account on the tab does not see
 * them.
 */
interface SqlHistoryState {
  statements: string[];
  add(text: string): void;
  clear(): void;
}

function read(): string[] {
  try {
    const list: unknown = JSON.parse(String(safeSessionStorage.getItem(KEY) ?? '[]'));
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const useSqlHistory = create<SqlHistoryState>()((set) => ({
  statements: read(),
  add: (text) => {
    if (SECRET.test(text)) return;
    set((s) => {
      const statements = [text, ...s.statements.filter((h) => h !== text)].slice(0, 20);
      void safeSessionStorage.setItem(KEY, JSON.stringify(statements));
      return { statements };
    });
  },
  clear: () => {
    void safeSessionStorage.removeItem(KEY);
    set({ statements: [] });
  },
}));
