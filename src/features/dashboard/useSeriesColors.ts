import { useComputedColorScheme } from '@mantine/core';
import { SERIES, SERIES_SHADE_DARK, SERIES_SHADE_LIGHT } from '@/lib/chartColors';

/** Mantine color keys for chart series, validated against each surface (see lib/chartColors). */
export function useSeriesColors(): string[] {
  const scheme = useComputedColorScheme('light');
  return SERIES.map((c, i) => `${c}.${scheme === 'dark' ? SERIES_SHADE_DARK[i] : SERIES_SHADE_LIGHT[i]}`);
}
