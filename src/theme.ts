import { createTheme, rem } from '@mantine/core';

export const APP_NAME = 'Aperture';
export const APP_TAGLINE = 'Management portal for InterSystems IRIS';

export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, "JetBrains Mono", "Fira Code", Menlo, Consolas, "Liberation Mono", monospace',
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
});
