/**
 * Chart palette. Categorical hues are assigned in this fixed order, so the same slot keeps
 * the same hue whatever the series count or the colour scheme. A sixth series would reuse
 * the first hue (`seriesColor` wraps); no chart draws more than five.
 *
 * Two separate properties are guaranteed, and `chartColors.test.ts` enforces the second:
 *  - the hues are mutually distinguishable under the common colour-vision deficiencies
 *    (indigo / teal / orange / grape / cyan were chosen with the dataviz validator);
 *  - every swatch keeps WCAG 1.4.11's 3:1 against the surface it is drawn on
 *    (white in light mode, the slate `dark-7` #1f2630 in dark mode); the high-contrast
 *    palettes keep 4:1 on white (no Mantine orange reaches 4.5:1 there; shade 9 is 4.30) and
 *    5:1 on dark. Shades therefore differ per scheme: teal 6 (#12b886) reads at 2.55:1 on
 *    white and is not used there.
 */
export const CATEGORICAL_LIGHT = ['#4c6ef5', '#099268', '#e8590c', '#be4bdb', '#0c8599'] as const;
export const CATEGORICAL_DARK = ['#5c7cfa', '#0ca678', '#f76707', '#be4bdb', '#1098ad'] as const;
export const CATEGORICAL_LIGHT_HC = ['#364fc7', '#087f5b', '#d9480f', '#862e9c', '#0b7285'] as const;
export const CATEGORICAL_DARK_HC = ['#748ffc', '#38d9a9', '#ffa94d', '#da77f2', '#3bc9db'] as const;

/** Mantine color keys in the same order (Mantine resolves the right shade per scheme). */
export const SERIES = ['indigo', 'teal', 'orange', 'grape', 'cyan'] as const;
/** Mantine shade per slot, matching the hex palettes above. */
export const SERIES_SHADE_LIGHT = [6, 8, 8, 6, 8] as const;
export const SERIES_SHADE_DARK = [5, 7, 7, 6, 7] as const;
export const SERIES_SHADE_LIGHT_HC = [9, 9, 9, 9, 9] as const;
export const SERIES_SHADE_DARK_HC = [4, 4, 4, 4, 4] as const;

/** Surfaces the palettes are validated against. */
export const SURFACE_LIGHT = '#ffffff';
export const SURFACE_DARK = '#1f2630';

/** Redundant, non-colour encoding for line series: the n-th series gets the n-th dash pattern. */
export const SERIES_DASH = ['', '6 3', '2 3', '8 3 2 3', '1 3'] as const;

export type Scheme = 'light' | 'dark';
export type Contrast = 'normal' | 'high';

export function seriesColor(i: number, scheme: Scheme, contrast: Contrast = 'normal'): string {
  const palette =
    scheme === 'dark'
      ? contrast === 'high'
        ? CATEGORICAL_DARK_HC
        : CATEGORICAL_DARK
      : contrast === 'high'
        ? CATEGORICAL_LIGHT_HC
        : CATEGORICAL_LIGHT;
  return palette[i % palette.length];
}

/** WCAG 2.1 relative luminance and contrast ratio, for tests and for the palette itself. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const STATUS_COLORS = { good: 'teal', warning: 'yellow', serious: 'orange', critical: 'red' } as const;
