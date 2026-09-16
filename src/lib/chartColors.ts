/**
 * Chart palette. Categorical hues are assigned in this fixed order and never
 * cycled; the same slot keeps the same hue whatever the series count.
 * Light-mode steps are Mantine shade 6; dark-mode steps are shade 6/7/8 so they sit
 * in the lightness band for a dark surface. Both sets pass the CVD/contrast validator.
 */
export const CATEGORICAL_LIGHT = ['#4c6ef5', '#12b886', '#fd7e14', '#be4bdb', '#15aabf'] as const;
export const CATEGORICAL_DARK = ['#4c6ef5', '#0ca678', '#e8590c', '#be4bdb', '#1098ad'] as const;

/** Mantine color keys in the same order (Mantine resolves the right shade per scheme). */
export const SERIES = ['indigo', 'teal', 'orange', 'grape', 'cyan'] as const;
/** Mantine shade per slot for each scheme (matches the hex palettes above). */
export const SERIES_SHADE_LIGHT = [6, 6, 6, 6, 6] as const;
export const SERIES_SHADE_DARK = [6, 7, 8, 6, 7] as const;

export const seriesColor = (i: number, scheme: 'light' | 'dark') =>
  scheme === 'dark' ? CATEGORICAL_DARK[i % CATEGORICAL_DARK.length] : CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length];

export const STATUS_COLORS = { good: 'teal', warning: 'yellow', serious: 'orange', critical: 'red' } as const;
