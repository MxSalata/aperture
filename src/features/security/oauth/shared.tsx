import { Alert, Button } from '@mantine/core';
import { IconExternalLink, IconInfoCircle } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { explorerLink } from './access';

/** The Explorer's form for an OAuth 2.0 write the tabs have no form of their own for. */
export function ExplorerButton({ op, children }: { op: string; children: ReactNode }) {
  return (
    <Button
      component={Link}
      to={explorerLink(op)}
      size="xs"
      variant="subtle"
      rightSection={<IconExternalLink size={12} />}
    >
      {children}
    </Button>
  );
}

export function NeedsPrivilege({ resources, what }: { resources: readonly string[]; what: string }) {
  return (
    <Alert
      color="gray"
      variant="light"
      icon={<IconInfoCircle size={18} />}
      title="Not readable with this account"
    >
      {what} needs <span className="mono">{resources.join(' or ')}</span>, which this account does not hold.
    </Alert>
  );
}
