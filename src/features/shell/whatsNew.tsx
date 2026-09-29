import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.2.1, 1.2.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.2.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    Opening an entry of the Messages log says how often its message was logged, and since when, found with
    IRIS Vector Search; <b>Show similar entries</b> lists them. Nothing is indexed until you ask.
  </>,
  <>
    Dependency updates arrive once a month, and each merged batch is a patch release of its own, with the
    image published as that version.
  </>,
];
