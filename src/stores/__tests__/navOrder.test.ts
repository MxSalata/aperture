import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavSection } from '@/features/shell/nav';
import { applyOrder, isCustomOrder, orderNav } from '../navOrder';

const icon = (() => null) as unknown as NavSection['items'][number]['icon'];
const item = (to: string) => ({ label: to, to, icon, privileges: [] });
const NAV: NavSection[] = [
  { label: 'Overview', items: [item('/'), item('/jobs')] },
  { label: 'Operations', items: [item('/databases'), item('/devices'), item('/locks'), item('/journal')] },
  { label: 'Security', items: [item('/security/users'), item('/security/roles')] },
];
const paths = (s: NavSection) => s.items.map((i) => i.to);

describe('navigation order', () => {
  it('is the default order when nothing was moved', () => {
    const arranged = orderNav(NAV, { sections: [], items: {} });
    expect(arranged.map((s) => s.label)).toEqual(['Overview', 'Operations', 'Security']);
    expect(paths(arranged[1])).toEqual(['/databases', '/devices', '/locks', '/journal']);
    expect(isCustomOrder(NAV, { sections: [], items: {} })).toBe(false);
  });

  it('puts sections and screens where the user moved them, screens staying in their section', () => {
    const order = {
      sections: ['Security', 'Overview', 'Operations'],
      items: { Operations: ['/journal', '/databases', '/devices', '/locks'] },
    };
    const arranged = orderNav(NAV, order);
    expect(arranged.map((s) => s.label)).toEqual(['Security', 'Overview', 'Operations']);
    expect(paths(arranged[2])).toEqual(['/journal', '/databases', '/devices', '/locks']);
    expect(paths(arranged[0])).toEqual(['/security/users', '/security/roles']);
    expect(isCustomOrder(NAV, order)).toBe(true);
  });

  it('gives an entry the stored order does not know its default position, and drops one that no longer exists', () => {
    // A screen added to nav.ts later shows up where nav.ts puts it; a removed one leaves no hole.
    expect(applyOrder(['a', 'b', 'c', 'd'], ['d', 'gone', 'b'], (x) => x)).toEqual(['a', 'd', 'c', 'b']);
    expect(applyOrder(['a', 'b'], ['b', 'b', 'a'], (x) => x)).toEqual(['b', 'a']);
    expect(applyOrder(['a', 'b'], [], (x) => x)).toEqual(['a', 'b']);
  });

  describe('the store', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.resetModules();
    });

    it('moves a section or a screen by one step, persists it, and resets', async () => {
      const { useNavOrder, orderNav: arrange } = await import('../navOrder');
      const { NAV: real } = await import('@/features/shell/nav');
      const labels = () => arrange(real, useNavOrder.getState()).map((s) => s.label);
      const before = labels();
      useNavOrder.getState().moveSection(before[2], before[0]);
      expect(labels()).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
      useNavOrder.getState().moveSection(before[2], null);
      expect(labels()).toEqual([before[0], before[1], ...before.slice(3), before[2]]);

      const ops = real.find((s) => s.label === 'Operations')!;
      const devices = ops.items.find((i) => i.label === 'Devices')!;
      const journals = ops.items.find((i) => i.label === 'Journals')!;
      const after = ops.items[ops.items.indexOf(journals) + 1];
      useNavOrder.getState().moveItem('Operations', devices.to, after.to);
      const arranged = arrange(real, useNavOrder.getState()).find((s) => s.label === 'Operations')!;
      expect(arranged.items.indexOf(devices)).toBe(arranged.items.indexOf(journals) + 1);
      expect(JSON.parse(localStorage.getItem('aperture.nav')!).state).toEqual({
        sections: labels(),
        items: { Operations: arranged.items.map((i) => i.to) },
      });

      // An unknown section or screen, or a move onto itself, changes nothing.
      useNavOrder.getState().moveSection('Nowhere', before[0]);
      useNavOrder.getState().moveItem('Operations', '/nowhere', devices.to);
      useNavOrder.getState().moveItem('Operations', devices.to, devices.to);
      expect(Object.keys(useNavOrder.getState().items)).toEqual(['Operations']);
      expect(arrange(real, useNavOrder.getState()).find((s) => s.label === 'Operations')!.items).toEqual(
        arranged.items,
      );

      useNavOrder.getState().reset();
      expect(labels()).toEqual(before);
      expect(useNavOrder.getState().items).toEqual({});
    });
  });
});
