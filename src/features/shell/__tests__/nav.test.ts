import { describe, expect, it } from 'vitest';
import { activeNavPath, ALL_NAV_ITEMS, NAV, type NavColor } from '../nav';

/** Every colour with a contrast-tuned text token (styles.css); the type keeps nav.ts to these. */
const NAV_COLORS: NavColor[] = [
  'teal',
  'indigo',
  'grape',
  'green',
  'violet',
  'blue',
  'cyan',
  'red',
  'orange',
  'yellow',
  'lime',
  'pink',
  'gray',
];

describe('navigation colours', () => {
  it('gives every entry a colour with a contrast-tuned text token', () => {
    for (const section of NAV)
      for (const item of section.items) expect(NAV_COLORS, `${item.label}`).toContain(item.color);
  });

  it('lets neighbours differ, so the list is easy to scan', () => {
    for (const section of NAV)
      section.items.forEach((item, i) => {
        const next = section.items[i + 1];
        if (next) expect(item.color, `${item.label} / ${next.label}`).not.toBe(next.color);
      });
  });
});

describe('the active entry', () => {
  it('is one entry per screen, the longest path that matches by segment', () => {
    expect(activeNavPath('/health/fhir/CLINICAL/1', ALL_NAV_ITEMS)).toBe('/health/fhir');
    expect(activeNavPath('/health', ALL_NAV_ITEMS)).toBe('/health');
    expect(activeNavPath('/', ALL_NAV_ITEMS)).toBe('/');
    expect(activeNavPath('/security/users-audit', [{ to: '/security/users' }])).toBeNull();
  });
});
