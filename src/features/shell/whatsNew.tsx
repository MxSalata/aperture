import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.3.1, 1.3.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.3.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    Every screen fits a phone and a laptop: the dashboard&apos;s upcoming tasks keep their status inside the
    card, with the time under each name, and wide tables scroll inside their card instead of the page.
  </>,
];
