import { useComputedColorScheme } from '@mantine/core';
import { SERIES, SERIES_SHADE_DARK, SERIES_SHADE_DARK_HC, SERIES_SHADE_LIGHT, SERIES_SHADE_LIGHT_HC } from '@/lib/chartColors';
import { useResolvedContrast } from '@/features/shell/useApplyAppearance';

/** Mantine color keys for chart series, validated against each surface and contrast level (see lib/chartColors). */
export function useSeriesColors(): string[] {
  const scheme = useComputedColorScheme('light');
  const contrast = useResolvedContrast();
  const shades =
    scheme === 'dark' ? (contrast === 'high' ? SERIES_SHADE_DARK_HC : SERIES_SHADE_DARK) : contrast === 'high' ? SERIES_SHADE_LIGHT_HC : SERIES_SHADE_LIGHT;
  return SERIES.map((c, i) => `${c}.${shades[i]}`);
}
