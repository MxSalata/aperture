import { Tabs } from '@mantine/core';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { WalletTab } from './WalletTab';
import { OAuthTab } from './OAuthTab';

/**
 * The contest's "security and secrets" area beyond TLS and X.509: the wallet (collections and
 * write-only secrets) and OAuth 2.0 in its three roles (authorization server, client, resource
 * server). The tab lives in the URL (?tab=oauth) so a link opens the right one.
 */
export default function SecretsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'oauth' ? 'oauth' : 'wallet';
  return (
    <>
      <PageHeader
        title="Wallet & OAuth 2.0"
        description="Wallet collections and the secrets they hold (values are write-only: IRIS never returns them and Aperture never asks), and the OAuth 2.0 configuration of this instance as an authorization server, as a client of other servers and as a resource server."
      />
      <Tabs
        value={tab}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === 'oauth') next.set('tab', 'oauth');
          else next.delete('tab');
          setParams(next, { replace: true });
        }}
        keepMounted={false}
      >
        <Tabs.List mb="sm">
          <Tabs.Tab value="wallet">Wallet</Tabs.Tab>
          <Tabs.Tab value="oauth">OAuth 2.0</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="wallet">
          <WalletTab />
        </Tabs.Panel>
        <Tabs.Panel value="oauth">
          <OAuthTab />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
