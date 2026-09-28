import { Group, Stack, Tabs, Text } from '@mantine/core';
import { AuthorizationServer } from './oauth/AuthorizationServer';
import { ClientSide } from './oauth/ClientSide';
import { ResourceServers } from './oauth/ResourceServers';

/**
 * OAuth 2.0 in its three roles. Reads are hand-crafted; every write beyond delete goes to the
 * Explorer, whose forms come from the schemas and carry the quirk notes (IRIS 2026.2 names the
 * client's server field ServerDefinition, not OAuth2ServerDefinition).
 */
export function OAuthTab() {
  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <Text size="sm" c="dimmed">
          The authorization server needs <span className="mono">%Admin_OAuth2_Server:U</span>, its client
          registry <span className="mono">%Admin_OAuth2_Registration:U</span>, the client side{' '}
          <span className="mono">%Admin_OAuth2_Client:U</span> and resource servers{' '}
          <span className="mono">%Admin_Secure:U</span>.
        </Text>
      </Group>
      <Tabs defaultValue="server" variant="outline" keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="server">Authorization server</Tabs.Tab>
          <Tabs.Tab value="client">Client side</Tabs.Tab>
          <Tabs.Tab value="resource">Resource servers</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="server">
          <AuthorizationServer />
        </Tabs.Panel>
        <Tabs.Panel value="client">
          <ClientSide />
        </Tabs.Panel>
        <Tabs.Panel value="resource">
          <ResourceServers />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
