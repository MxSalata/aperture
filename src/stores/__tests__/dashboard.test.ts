import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dashboard chart selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts with the two interoperability charts, toggles in catalogue order, persists, and resets', async () => {
    const { useDashboard, DEFAULT_CHARTS } = await import('../dashboard');
    expect(useDashboard.getState().charts).toEqual(DEFAULT_CHARTS);
    expect(DEFAULT_CHARTS).toEqual(['interopMessages', 'interopQueued']);
    useDashboard.getState().toggle('globalRefs');
    useDashboard.getState().toggle('interopMessages');
    expect(useDashboard.getState().charts).toEqual(['globalRefs', 'interopQueued']);
    useDashboard.getState().toggle('interopMessages');
    expect(useDashboard.getState().charts).toEqual(['globalRefs', 'interopMessages', 'interopQueued']);
    expect(JSON.parse(localStorage.getItem('aperture.dashboard')!).state.charts).toEqual([
      'globalRefs',
      'interopMessages',
      'interopQueued',
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
