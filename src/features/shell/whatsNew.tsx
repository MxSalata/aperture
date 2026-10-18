import type { ReactNode } from 'react';

/**
 * What the About page lists as new in the last feature release. A merged dependency update is a
 * patch release of its own (1.6.1, 1.6.2, ...) with nothing new to list, so the package's version
 * may be a higher patch of NEW_IN; a test fails the release when the minor moves on and these lines
 * do not.
 */
export const NEW_IN = '1.6.0';
export const HIGHLIGHTS: ReactNode[] = [
  <>
    <b>FHIR servers</b>, in a new Health group on IRIS for Health: what each server stores, the resource types
    it serves, its configuration and jobs, and the FHIR packages.
  </>,
  <>
    Disable and enable a server, read back from IRIS; reset, decommission or delete one after typing its URL,
    with IRIS&apos;s job followed to its end. Servers that answer a search without credentials are called out.
  </>,
];
