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
/**
 * Aperture's mark: an iris diaphragm (the aperture of a lens, and IRIS), six blades round a
 * hexagonal opening, pale to ocean across the primary, on an edged slate tile (the same family as
 * Shutter's mark, whose blades turn the other way). public/favicon.svg draws the same mark for the
 * browser tab (and the README): keep the two alike.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  // Ids that url(#…) takes as they are (useId's may hold characters it does not).
  const id = useId().replace(/[^\w-]/g, '');
  const tile = `aperture-tile-${id}`;
  const blades = `aperture-blades-${id}`;
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
        <linearGradient id={tile} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0" style={{ stopColor: 'var(--mantine-color-dark-7)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mantine-color-dark-6)' }} />
        </linearGradient>
        <linearGradient id={blades} gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="54" y2="54">
          <stop offset="0" style={{ stopColor: 'var(--mantine-color-aperture-0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mantine-color-aperture-5)' }} />
        </linearGradient>
      </defs>
      <rect
        x="1.25"
        y="1.25"
        width="61.5"
        height="61.5"
        rx="18"
        fill={`url(#${tile})`}
        style={{ stroke: 'var(--mantine-color-dark-4)' }}
        strokeWidth="2.5"
      />
      {/* The gaps between the blades are the tile's own colour. */}
      <g
        fill={`url(#${blades})`}
        style={{ stroke: 'var(--mantine-color-dark-7)' }}
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        {BLADES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
