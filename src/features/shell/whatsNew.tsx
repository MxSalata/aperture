import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.5.1, 1.5.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.5.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    <b>SQL</b>, in Operations: run SQL in any namespace as yourself, with each column&apos;s type, the query
    plan, the catalogue of schemas, tables and columns, and the statements running now and run before.
  </>,
  <>
    A statement that changes data says what it does before it runs, asks first, and is refused in a read-only
    tab.
  </>,
];
