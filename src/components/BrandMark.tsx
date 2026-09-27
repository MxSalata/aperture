import { Box } from '@mantine/core';

/** Aperture's mark: a ring in a rounded square, deep to light across the primary. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Box
      w={size}
      h={size}
      aria-hidden
      style={{
        borderRadius: size * 0.3,
        background:
          'linear-gradient(135deg, var(--mantine-color-aperture-8), var(--mantine-color-aperture-4))',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 1px 2px rgb(0 0 0 / 0.15)',
      }}
    >
      <Box
        w={size * 0.42}
        h={size * 0.42}
        style={{ borderRadius: '50%', border: `${Math.max(2, size / 12)}px solid white` }}
      />
    </Box>
  );
}
