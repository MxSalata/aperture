import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'aperture.appearance';

/** Each test gets fresh modules, so the store rehydrates from whatever localStorage holds. */
async function load() {
  vi.resetModules();
  const [{ useAppearance }, { useApplyAppearance }] = await Promise.all([
    import('../appearance'),
    import('@/features/shell/useApplyAppearance'),
  ]);
  return { useAppearance, useApplyAppearance };
}

describe('appearance: palette setting', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.aperturePalette;
    delete document.documentElement.dataset.apertureContrast;
  });

  it('defaults to the standard light theme and persists a choice of Pastel', async () => {
    const { useAppearance } = await load();
    expect(useAppearance.getState().palette).toBe('default');
    useAppearance.getState().setPalette('pastel');
    expect(JSON.parse(localStorage.getItem(KEY)!).state).toMatchObject({
      contrast: 'auto',
      palette: 'pastel',
    });
  });

  it('restores the stored palette on the next load, next to the contrast', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { contrast: 'high', palette: 'pastel' }, version: 0 }));
    const { useAppearance } = await load();
    expect(useAppearance.getState()).toMatchObject({ contrast: 'high', palette: 'pastel' });
  });

  it('reads a setting saved before the palette existed as the standard theme', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { contrast: 'normal' }, version: 0 }));
    const { useAppearance } = await load();
    expect(useAppearance.getState()).toMatchObject({ contrast: 'normal', palette: 'default' });
  });

  it('is written to <html data-aperture-palette>, the sibling of the contrast attribute', async () => {
    const { useAppearance, useApplyAppearance } = await load();
    renderHook(() => useApplyAppearance());
    expect(document.documentElement.dataset.aperturePalette).toBe('default');
    expect(document.documentElement.dataset.apertureContrast).toBe('normal');
    act(() => useAppearance.getState().setPalette('pastel'));
    expect(document.documentElement.dataset.aperturePalette).toBe('pastel');
    act(() => useAppearance.getState().setContrast('high'));
    expect(document.documentElement.dataset.apertureContrast).toBe('high');
    // The attribute records the choice; styles.css applies it only to the light scheme at normal
    // contrast (e2e/appearance.spec.ts checks the rendered colours in dark and high contrast).
    expect(document.documentElement.dataset.aperturePalette).toBe('pastel');
  });
});
