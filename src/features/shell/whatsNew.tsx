import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.4.1, 1.4.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.4.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    <b>Productions</b>, in a new Interoperability group: every production of the instance with its state, its
    hosts with their errors of the last day from their event logs, and each host&apos;s messages, queue,
    connections and settings.
  </>,
  <>
    Start and stop a production or one of its hosts, confirmed, and read back from IRIS, which answers success
    whatever it did.
  </>,
];
