import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard chart selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts with the two original charts, toggles in catalogue order, persists, and resets', async () => {
    const { useDashboard, DEFAULT_CHARTS } = await import('../dashboard');
    expect(useDashboard.getState().charts).toEqual(DEFAULT_CHARTS);
    useDashboard.getState().toggle('interopMessages');
    useDashboard.getState().toggle('globalRefs');
    expect(useDashboard.getState().charts).toEqual(['diskIo', 'interopMessages']);
    useDashboard.getState().toggle('globalRefs');
    expect(useDashboard.getState().charts).toEqual(['globalRefs', 'diskIo', 'interopMessages']);
    expect(JSON.parse(localStorage.getItem('aperture.dashboard')!).state.charts).toEqual([
      'globalRefs',
      'diskIo',
      'interopMessages',
    ]);
    useDashboard.getState().reset();
    expect(useDashboard.getState().charts).toEqual(DEFAULT_CHARTS);
  });

  it('restores a stored choice and drops a chart id it does not know', async () => {
    localStorage.setItem(
      'aperture.dashboard',
      JSON.stringify({ state: { charts: ['interopQueued', 'fromTheFuture', 'license'] }, version: 0 }),
    );
    const { useDashboard } = await import('../dashboard');
    expect(useDashboard.getState().charts).toEqual(['interopQueued', 'license']);
  });
});
