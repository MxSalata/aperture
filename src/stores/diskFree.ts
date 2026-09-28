import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DiskFreeUnit = 'percent' | 'size';

interface DiskFreeState {
  /** How the Databases screen shows the free space of each database's disk. */
  unit: DiskFreeUnit;
  set(unit: DiskFreeUnit): void;
  toggle(): void;
}

/** A device preference: disk free as a share of the disk (the default) or as a size. */
export const useDiskFree = create<DiskFreeState>()(
  persist(
    (set) => ({
      unit: 'percent',
      set: (unit) => set({ unit }),
      toggle: () => set((s) => ({ unit: s.unit === 'percent' ? 'size' : 'percent' })),
    }),
    { name: 'aperture.diskfree', partialize: (s) => ({ unit: s.unit }) },
  ),
);
