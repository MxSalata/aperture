import { createTheme, rem, type MantineThemeOverride } from '@mantine/core';

export const APP_NAME = 'Aperture';
export const APP_TAGLINE = 'Management portal for InterSystems IRIS';

/** Base theme; App.tsx derives the contrast-aware variant from it. Fonts are the system stacks, which is what actually renders (nothing is web-loaded). */
export const themeBase: MantineThemeOverride = {
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
  headings: { fontWeight: '650' },
  fontSizes: { xs: rem(12), sm: rem(13.5), md: rem(15), lg: rem(17), xl: rem(20) },
  components: {
    Table: { defaultProps: { highlightOnHover: true, verticalSpacing: 'xs', fz: 'sm' } },
    Paper: { defaultProps: { withBorder: true, radius: 'md' } },
    Card: { defaultProps: { withBorder: true, radius: 'md' } },
    Badge: { defaultProps: { variant: 'light' } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 300 } },
    // Forms live in modals; a stray click outside must not discard a half-filled one (Escape still closes).
    Modal: { defaultProps: { closeOnClickOutside: false } },
  },
};

export const theme = createTheme(themeBase);

/**
 * Under high contrast the low-opacity `light` variant of badges and alerts is replaced by
 * solid/outlined ones at the theme level, so the 45 call sites need no change; explicit
 * `variant` props still win.
 */
export function themeFor(contrast: 'normal' | 'high') {
  if (contrast === 'normal') return theme;
  return createTheme({
    ...themeBase,
    components: {
      ...themeBase.components,
      Badge: { defaultProps: { variant: 'filled' } },
      Alert: { defaultProps: { variant: 'outline' } },
      Tooltip: { defaultProps: { withArrow: true, openDelay: 300 } },
    },
  });
}
