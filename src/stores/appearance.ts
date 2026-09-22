import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Device preferences that must outlive any session: they are kept in localStorage
 * and never touched by logout or by an instance switch. Colour scheme itself stays
 * with Mantine (light / dark / auto); contrast is an independent axis on top of it.
 */
export type ContrastSetting = 'auto' | 'normal' | 'high';

interface AppearanceState {
  /** `auto` follows the OS `prefers-contrast: more` setting. */
  contrast: ContrastSetting;
  setContrast(contrast: ContrastSetting): void;
}

export const useAppearance = create<AppearanceState>()(
  persist((set) => ({ contrast: 'auto', setContrast: (contrast) => set({ contrast }) }), {
    name: 'aperture.appearance',
  }),
);
