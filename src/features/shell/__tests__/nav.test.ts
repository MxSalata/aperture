import { describe, expect, it } from 'vitest';
import { NAV, type NavColor } from '../nav';

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
