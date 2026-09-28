import { useId } from 'react';

/**
 * The blades of the mark in a 64-unit square: each bounded by one edge of the hexagonal opening,
 * extended to the rim, and the extension of the edge before it, as in a real iris diaphragm.
 */
const BLADES = [
  'M32 22L7.822 35.959A24.5 24.5 0 0 1 16.482 13.041Z',
  'M23.34 27L23.34 54.918A24.5 24.5 0 0 1 7.822 35.959Z',
  'M23.34 37L47.518 50.959A24.5 24.5 0 0 1 23.34 54.918Z',
  'M32 42L56.178 28.041A24.5 24.5 0 0 1 47.518 50.959Z',
  'M40.66 37L40.66 9.082A24.5 24.5 0 0 1 56.178 28.041Z',
  'M40.66 27L16.482 13.041A24.5 24.5 0 0 1 40.66 9.082Z',
];
/** One tint lighter per blade round the disc, so the blades read as turning. */
const TINTS = [1, 0.92, 0.84, 0.76, 0.68, 0.6];

/**
 * Aperture's mark: an iris diaphragm (the aperture of a lens, and IRIS), six white blades round a
 * hexagonal opening on a rounded square, deep to light across the primary. public/favicon.svg
 * draws the same mark for the browser tab (and the README): keep the two alike.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  // An id that url(#…) takes as it is (useId's may hold characters it does not).
  const gradient = `aperture-mark-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flex: 'none', filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.15))' }}
    >
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0" style={{ stopColor: 'var(--mantine-color-aperture-8)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mantine-color-aperture-4)' }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="19.2" fill={`url(#${gradient})`} />
      {/* The gaps between the blades are the tile's own colour. */}
      <g fill="#fff" stroke={`url(#${gradient})`} strokeWidth="1.6" strokeLinejoin="round">
        {BLADES.map((d, i) => (
          <path key={d} d={d} fillOpacity={TINTS[i]} />
        ))}
      </g>
    </svg>
  );
}
