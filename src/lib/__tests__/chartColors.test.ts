import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@mantine/core';
import {
  CATEGORICAL_DARK,
  CATEGORICAL_DARK_HC,
  CATEGORICAL_LIGHT,
  CATEGORICAL_LIGHT_HC,
  CATEGORICAL_PASTEL,
  SERIES,
  SERIES_SHADE_DARK,
  SERIES_SHADE_DARK_HC,
  SERIES_SHADE_LIGHT,
  SERIES_SHADE_LIGHT_HC,
  SERIES_SHADE_PASTEL,
  SURFACE_DARK,
  SURFACE_PASTEL,
  SURFACE_LIGHT,
  contrastRatio,
} from '../chartColors';

const cases: Array<[string, readonly string[], readonly number[], string, number]> = [
  ['light', CATEGORICAL_LIGHT, SERIES_SHADE_LIGHT, SURFACE_LIGHT, 3],
  ['dark', CATEGORICAL_DARK, SERIES_SHADE_DARK, SURFACE_DARK, 3],
  // orange has no Mantine shade above 4.3:1 on white, so the light floor is 4:1 (well above the 3:1 graphics minimum)
  ['light high-contrast', CATEGORICAL_LIGHT_HC, SERIES_SHADE_LIGHT_HC, SURFACE_LIGHT, 4],
  ['dark high-contrast', CATEGORICAL_DARK_HC, SERIES_SHADE_DARK_HC, SURFACE_DARK, 5],
  ['pastel', CATEGORICAL_PASTEL, SERIES_SHADE_PASTEL, SURFACE_PASTEL, 3],
];

describe('chart palettes', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it.each(cases)(
    '%s swatches keep the required contrast against their surface',
    (_name, palette, _shades, surface, floor) => {
      for (const hex of palette)
        expect(contrastRatio(hex, surface), `${hex} on ${surface}`).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(cases)(
    '%s hex values are exactly the Mantine shades the charts request',
    (_name, palette, shades) => {
      palette.forEach((hex, i) => expect(DEFAULT_THEME.colors[SERIES[i]][shades[i]].toLowerCase()).toBe(hex));
    },
  );

  it('assigns a distinct dash pattern per slot for the line charts', async () => {
    const { SERIES_DASH } = await import('../chartColors');
    expect(new Set(SERIES_DASH).size).toBe(SERIES_DASH.length);
  });
});
