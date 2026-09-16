import type { StateStorage } from 'zustand/middleware';

/**
 * sessionStorage adapter that never throws: private windows, blocked storage,
 * and test teardown all degrade to "no persistence" instead of crashing.
 */
export const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
