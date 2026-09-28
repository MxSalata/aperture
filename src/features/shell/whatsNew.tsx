import type { ReactNode } from 'react';

/**
 * What the About page lists as new. NEW_IN must be the package's version: a test fails the release
 * when package.json moves on and these lines do not.
 */
export const NEW_IN = '1.0.6';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    The Tasks screen shows which tasks are suspended: IRIS&apos;s task list reports every task as active, so
    each task&apos;s state now comes from its own read. The Health check finds suspended tasks the same way.
  </>,
  <>
    Every resource save is read back, and the portal says when IRIS answered 200 without keeping a change; the
    description stops at the 256 characters IRIS holds.
  </>,
  <>
    The README&apos;s links work on Open Exchange, and it explains why the Docker image is IRIS and Aperture
    in one.
  </>,
];
