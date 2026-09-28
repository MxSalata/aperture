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
    const { useDashboard, orderCharts, DASHBOARD_CHARTS } = await import('../dashboard');
    expect(useDashboard.getState().charts).toEqual(['interopQueued', 'license']);
    // Stored before charts could be reordered: A to Z.
    expect(orderCharts(useDashboard.getState().order)).toEqual(DASHBOARD_CHARTS);
  });

  it('lists the charts A to Z by title until they are rearranged, keeps the order, and resets it', async () => {
    const { useDashboard, orderCharts, isCustomChartOrder, CHART_TITLES, DASHBOARD_CHARTS } =
      await import('../dashboard');
    const titles = DASHBOARD_CHARTS.map((c) => CHART_TITLES[c]);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'en')));
    expect(DASHBOARD_CHARTS).toHaveLength(Object.keys(CHART_TITLES).length);
    expect(titles[0]).toBe('Cache efficiency');

    const ordered = () => orderCharts(useDashboard.getState().order);
    useDashboard.getState().move('routineRefs', 'cacheEfficiency');
    expect(ordered()[0]).toBe('routineRefs');
    useDashboard.getState().move('cacheEfficiency', null);
    expect(ordered().at(-1)).toBe('cacheEfficiency');
    expect(isCustomChartOrder(useDashboard.getState().order)).toBe(true);
    expect(JSON.parse(localStorage.getItem('aperture.dashboard')!).state.order).toEqual(ordered());

    // A move onto itself, or of a chart that does not exist, changes nothing.
    const before = useDashboard.getState().order;
    useDashboard.getState().move('license', 'license');
    expect(useDashboard.getState().order).toBe(before);

    // Resetting the order keeps which charts show.
    useDashboard.getState().toggle('license');
    useDashboard.getState().resetOrder();
    expect(ordered()).toEqual(DASHBOARD_CHARTS);
    expect(isCustomChartOrder(useDashboard.getState().order)).toBe(false);
    expect(useDashboard.getState().charts).toContain('license');
  });

  it('keeps a stored order, placing a chart it does not mention where A to Z puts it', async () => {
    localStorage.setItem(
      'aperture.dashboard',
      JSON.stringify({
        state: { charts: ['license'], order: ['license', 'fromTheFuture', 'diskIo'] },
        version: 0,
      }),
    );
    const { useDashboard, orderCharts } = await import('../dashboard');
    expect(useDashboard.getState().order).toEqual(['license', 'diskIo']);
    const ordered = orderCharts(useDashboard.getState().order);
    expect(ordered.indexOf('license')).toBeLessThan(ordered.indexOf('diskIo'));
    expect(ordered).toHaveLength(9);
  });
});
