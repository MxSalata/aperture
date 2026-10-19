import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.7.1, 1.7.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.7.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    <b>SQL audit</b>: the SQL screen says when IRIS does not write the statements run there to its audit log,
    and the Health check reports SQL statements not audited.
  </>,
  <>
    An account with %Admin_Secure:U can switch change auditing on, and query auditing as a separate step, each
    confirmed, recorded in Activity and read back from IRIS.
  </>,
];
