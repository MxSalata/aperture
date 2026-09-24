import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconExternalLink, IconEye, IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { canUse } from '@/api/privileges';
import type { Schemas } from '@/api/types';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { PrivilegeBadge } from '@/components/PrivilegeBadge';
import { BoolBadge } from '@/components/StatusBadge';
import { isApiError } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { secKeys } from './keys';

const CLIENT = ['%Admin_OAuth2_Client:U'] as const;
const SERVER = ['%Admin_OAuth2_Server:U'] as const;
const REGISTRATION = ['%Admin_OAuth2_Registration:U'] as const;
const SECURE = ['%Admin_Secure:U'] as const;

/** A deep link into the Explorer, where every OAuth 2.0 write has a form built from the schema. */
const explorerLink = (opId: string) =>
  `/explorer/${encodeURIComponent('/v2/security')}?op=${encodeURIComponent(opId)}`;

function ExplorerButton({ op, children }: { op: string; children: ReactNode }) {
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

function NeedsPrivilege({ resources, what }: { resources: readonly string[]; what: string }) {
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

function useAllowed(resources: readonly string[]): boolean {
  const info = useSession((s) => s.info);
  return canUse(info, resources);
}

const isNotFound = (e: unknown) => isApiError(e) && e.isNotFound;

// ---- This instance as an authorization server ------------------------------------------

type ServerClientRow = Schemas['OAuth2ServerClientList'][number];

function AuthorizationServer() {
  const allowedServer = useAllowed(SERVER);
  const allowedClients = useAllowed(REGISTRATION);
  const server = useQuery({
    queryKey: secKeys.oauthServer,
    queryFn: () => result(api().GET('/v2/security/oauth2/server')),
    enabled: allowedServer,
    retry: false,
  });
  const clients = useQuery({
    queryKey: secKeys.oauthServerClients,
    queryFn: () => result(api().GET('/v2/security/oauth2/server/clients')),
    enabled: allowedClients,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: secKeys.oauthServerClient(selected ?? ''),
    queryFn: () =>
      result(api().GET('/v2/security/oauth2/server/client', { params: { query: { clientId: selected! } } })),
    enabled: !!selected,
  });
  const remove = useApiMutation(
    (clientId: string) =>
      run(api().DELETE('/v2/security/oauth2/server/client', { params: { query: { clientId } } }), 'DELETE'),
    {
      invalidate: [secKeys.oauthServerClients],
      onSuccess: (_d, id) => {
        if (selected === id) setSelected(null);
      },
    },
  );
  const scopes = ((
    server.data as { SupportedScopes?: { Scope?: string; Description?: string }[] } | undefined
  )?.SupportedScopes ?? []) as { Scope?: string; Description?: string }[];
  const serverItems = objectToItems(server.data as Record<string, unknown> | undefined, {
    omit: ['SupportedScopes', 'Metadata', 'CustomizationRoles'],
  });

  const columns: ColumnDef<ServerClientRow, unknown>[] = [
    { accessorKey: 'Name', header: 'Client', cell: (c) => <b>{String(c.getValue())}</b> },
    {
      accessorKey: 'ClientId',
      header: 'Client id',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      accessorKey: 'ClientType',
      header: 'Type',
      cell: (c) => (
        <Badge size="sm" variant="light" tt="none">
          {String(c.getValue() ?? '')}
        </Badge>
      ),
    },
    { accessorKey: 'Description', header: 'Description' },
    {
      accessorKey: 'RedirectURL',
      header: 'Redirect URLs',
      cell: (c) => ((c.getValue() as string[] | undefined) ?? []).join(', ') || '-',
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Details">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Details"
              onClick={(e) => {
                stop(e);
                setSelected(row.original.ClientId ?? null);
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete client">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete OAuth 2.0 client',
                  message: (
                    <>
                      Delete <b>{row.original.ClientId}</b>? Applications signing in with it are refused from
                      the next request, and its secret cannot be recovered.
                    </>
                  ),
                  confirmText: row.original.ClientId ?? '',
                  confirmLabel: 'Delete',
                  onConfirm: () => remove.mutateAsync(row.original.ClientId ?? ''),
                });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" align="flex-start" mb="xs" wrap="wrap">
          <Group gap="xs">
            <Title order={5}>This instance as an authorization server</Title>
            <PrivilegeBadge resources={SERVER} />
          </Group>
          <Group gap={4}>
            <ExplorerButton op="PUT /v2/security/oauth2/server">Edit in the Explorer</ExplorerButton>
          </Group>
        </Group>
        {!allowedServer ? (
          <NeedsPrivilege resources={SERVER} what="The authorization server configuration" />
        ) : server.isPending ? (
          <Text size="sm" c="dimmed">
            Reading…
          </Text>
        ) : server.error && isNotFound(server.error) ? (
          <Text size="sm" c="dimmed">
            Not configured: this instance does not issue tokens.{' '}
            <span className="mono">PUT /v2/security/oauth2/server</span> sets it up; the Explorer builds the
            form from the schema.
          </Text>
        ) : server.error ? (
          <ErrorAlert error={server.error} />
        ) : (
          <Stack gap="sm">
            <KeyValueList items={serverItems} cols={3} />
            {scopes.length ? (
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
                  Supported scopes
                </Text>
                <Group gap={6} mt={4} wrap="wrap">
                  {scopes.map((s) => (
                    <Tooltip key={s.Scope} label={s.Description} disabled={!s.Description}>
                      <Badge variant="light" tt="none">
                        {s.Scope}
                      </Badge>
                    </Tooltip>
                  ))}
                </Group>
              </div>
            ) : null}
          </Stack>
        )}
      </Paper>

      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Title order={5}>Clients registered with this server</Title>
            <PrivilegeBadge resources={REGISTRATION} />
          </Group>
          <ExplorerButton op="POST /v2/security/oauth2/server/client">
            Register a client in the Explorer
          </ExplorerButton>
        </Group>
        {!allowedClients ? (
          <NeedsPrivilege resources={REGISTRATION} what="The client list" />
        ) : (
          <DataTable
            data={clients.data}
            columns={columns}
            loading={clients.isPending}
            error={clients.error}
            getRowId={(r) => r.ClientId ?? ''}
            emptyMessage="No clients are registered with this authorization server"
            exportName="oauth2-server-clients"
            dense
          />
        )}
      </Stack>

      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={
          <b>
            OAuth 2.0 client <span className="mono">{selected}</span>
          </b>
        }
      >
        {detail.error ? (
          <ErrorAlert error={detail.error} />
        ) : (
          <Stack gap="md">
            <KeyValueList
              items={objectToItems(detail.data as Record<string, unknown> | undefined, {
                omit: ['Metadata'],
              })}
            />
            <Text size="xs" c="dimmed">
              Secrets are hidden at the render boundary; the JSON below has them redacted too.
            </Text>
            <JsonViewer value={detail.data} title="GET /v2/security/oauth2/server/client" />
            <ExplorerButton op="PUT /v2/security/oauth2/server/client">Edit in the Explorer</ExplorerButton>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}

// ---- This instance as a client: server definitions and client configurations -------------

type DefinitionRow = Schemas['OAuth2AuthorizationServerList'][number];
type ClientConfigRow = Schemas['OAuth2ClientsUsingServer'][number];

function ClientSide() {
  const allowed = useAllowed(CLIENT);
  const definitions = useQuery({
    queryKey: secKeys.oauthDefinitions,
    queryFn: () => result(api().GET('/v2/security/oauth2/client/server-definitions')),
    enabled: allowed,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const definition = useQuery({
    queryKey: secKeys.oauthDefinition(selected ?? ''),
    queryFn: () =>
      result(
        api().GET('/v2/security/oauth2/client/server-definition', {
          params: { query: { serverId: selected! } },
        }),
      ),
    enabled: !!selected,
  });
  const configs = useQuery({
    queryKey: secKeys.oauthClientConfigs(selected ?? ''),
    queryFn: () =>
      result(
        api().GET('/v2/security/oauth2/client/client-configurations', {
          params: { query: { serverId: selected! } },
        }),
      ),
    enabled: !!selected,
  });
  const [application, setApplication] = useState<string | null>(null);
  const config = useQuery({
    queryKey: secKeys.oauthClientConfig(application ?? ''),
    queryFn: () =>
      result(
        api().GET('/v2/security/oauth2/client/client-configuration', {
          params: { query: { applicationName: application! } },
        }),
      ),
    enabled: !!application,
  });
  const removeDefinition = useApiMutation(
    (serverId: string) =>
      run(
        api().DELETE('/v2/security/oauth2/client/server-definition', { params: { query: { serverId } } }),
        'DELETE',
      ),
    {
      invalidate: [secKeys.oauthDefinitions],
      onSuccess: (_d, id) => {
        if (selected === id) setSelected(null);
      },
    },
  );
  const removeConfig = useApiMutation(
    (applicationName: string) =>
      run(
        api().DELETE('/v2/security/oauth2/client/client-configuration', {
          params: { query: { applicationName } },
        }),
        'DELETE',
      ),
    {
      invalidate: [secKeys.oauthDefinitions, ['security', 'oauth2', 'client-configurations']],
      onSuccess: (_d, name) => {
        if (application === name) setApplication(null);
      },
    },
  );

  const columns: ColumnDef<DefinitionRow, unknown>[] = [
    { accessorKey: 'ID', header: 'Server', cell: (c) => <b>{String(c.getValue())}</b> },
    {
      accessorKey: 'IssuerEndpoint',
      header: 'Issuer',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    { accessorKey: 'ClientCount', header: 'Client configurations' },
    { accessorKey: 'ResourceCount', header: 'Resource servers' },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Details">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Details"
              onClick={(e) => {
                stop(e);
                setSelected(row.original.ID ?? null);
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete server definition">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete OAuth 2.0 server definition',
                  message: (
                    <>
                      Delete <b>{row.original.ID}</b>? Its {row.original.ClientCount ?? 0} client
                      configuration
                      {row.original.ClientCount === 1 ? '' : 's'} and {row.original.ResourceCount ?? 0}{' '}
                      resource server
                      {row.original.ResourceCount === 1 ? '' : 's'} lose their issuer.
                    </>
                  ),
                  confirmText: row.original.ID ?? '',
                  confirmLabel: 'Delete',
                  onConfirm: () => removeDefinition.mutateAsync(row.original.ID ?? ''),
                });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];
  const configColumns: ColumnDef<ClientConfigRow, unknown>[] = [
    { accessorKey: 'ApplicationName', header: 'Application', cell: (c) => <b>{String(c.getValue())}</b> },
    {
      accessorKey: 'ClientType',
      header: 'Type',
      cell: (c) => (
        <Badge size="sm" variant="light" tt="none">
          {String(c.getValue() ?? '')}
        </Badge>
      ),
    },
    {
      accessorKey: 'DefaultScope',
      header: 'Default scope',
      cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Details">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Details"
              onClick={(e) => {
                stop(e);
                setApplication(row.original.ApplicationName ?? null);
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete client configuration">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete OAuth 2.0 client configuration',
                  message: (
                    <>
                      Delete <b>{row.original.ApplicationName}</b>? The application can no longer obtain
                      tokens from {selected}.
                    </>
                  ),
                  confirmText: row.original.ApplicationName ?? '',
                  confirmLabel: 'Delete',
                  onConfirm: () => removeConfig.mutateAsync(row.original.ApplicationName ?? ''),
                });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  if (!allowed) return <NeedsPrivilege resources={CLIENT} what="The client-side OAuth 2.0 configuration" />;
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Title order={5}>Authorization servers this instance uses as a client</Title>
          <PrivilegeBadge resources={CLIENT} />
        </Group>
        <ExplorerButton op="POST /v2/security/oauth2/client/server-definition">
          Add a server in the Explorer
        </ExplorerButton>
      </Group>
      <DataTable
        data={definitions.data}
        columns={columns}
        loading={definitions.isPending}
        error={definitions.error}
        getRowId={(r) => r.ID ?? ''}
        emptyMessage="No authorization server is defined; this instance is not an OAuth 2.0 client of anything"
        exportName="oauth2-server-definitions"
        dense
      />
      <Drawer
        opened={!!selected}
        onClose={() => {
          setSelected(null);
          setApplication(null);
        }}
        position="right"
        size="xl"
        title={
          <b>
            Server definition <span className="mono">{selected}</span>
          </b>
        }
      >
        <Stack gap="md">
          {definition.error ? (
            <ErrorAlert error={definition.error} />
          ) : (
            <KeyValueList
              items={objectToItems(definition.data as Record<string, unknown> | undefined, {
                omit: ['Metadata'],
              })}
            />
          )}
          {definition.data?.Metadata ? (
            <JsonViewer value={definition.data.Metadata} title="Server metadata (discovery document)" />
          ) : null}
          <Group justify="space-between" wrap="wrap">
            <Title order={5}>Client configurations</Title>
            <Group gap={4}>
              <ExplorerButton op="PUT /v2/security/oauth2/client/client-configuration">
                Add or edit in the Explorer
              </ExplorerButton>
              <ExplorerButton op="PUT /v2/security/oauth2/client/server-definition">
                Edit the server
              </ExplorerButton>
            </Group>
          </Group>
          <DataTable
            data={configs.data}
            columns={configColumns}
            loading={configs.isPending}
            error={configs.error}
            getRowId={(r) => r.ApplicationName ?? ''}
            emptyMessage="No application is configured as a client of this server"
            hideColumnMenu
            dense
          />
          {application ? (
            <Paper withBorder p="md">
              <Group justify="space-between" mb="xs">
                <Title order={6}>
                  <span className="mono">{application}</span>
                </Title>
                <Anchor size="xs" onClick={() => setApplication(null)}>
                  Close
                </Anchor>
              </Group>
              {config.error ? (
                <ErrorAlert error={config.error} />
              ) : (
                <Stack gap="sm">
                  <KeyValueList
                    items={objectToItems(config.data as Record<string, unknown> | undefined, {
                      omit: ['Metadata'],
                    })}
                  />
                  {config.data?.Metadata ? (
                    <JsonViewer value={config.data.Metadata} title="Client metadata (secrets redacted)" />
                  ) : null}
                </Stack>
              )}
            </Paper>
          ) : null}
        </Stack>
      </Drawer>
    </Stack>
  );
}

// ---- Resource servers ---------------------------------------------------------------------

type ResourceRow = Schemas['OAuth2ResourceServerList'][number];

function ResourceServers() {
  const allowed = useAllowed(SECURE);
  const list = useQuery({
    queryKey: secKeys.oauthResourceServers,
    queryFn: () => result(api().GET('/v2/security/oauth2/resource-servers')),
    enabled: allowed,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: secKeys.oauthResourceServer(selected ?? ''),
    queryFn: () =>
      result(api().GET('/v2/security/oauth2/resource-server', { params: { query: { name: selected! } } })),
    enabled: !!selected,
  });
  const remove = useApiMutation(
    (name: string) =>
      run(api().DELETE('/v2/security/oauth2/resource-server', { params: { query: { name } } }), 'DELETE'),
    {
      invalidate: [secKeys.oauthResourceServers, secKeys.oauthDefinitions],
      onSuccess: (_d, name) => {
        if (selected === name) setSelected(null);
      },
    },
  );
  const columns: ColumnDef<ResourceRow, unknown>[] = [
    { accessorKey: 'Name', header: 'Resource server', cell: (c) => <b>{String(c.getValue())}</b> },
    { accessorKey: 'ServerDefinition', header: 'Authorization server' },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Details">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Details"
              onClick={(e) => {
                stop(e);
                setSelected(row.original.Name ?? null);
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete resource server">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete OAuth 2.0 resource server',
                  message: (
                    <>
                      Delete <b>{row.original.Name}</b>? Web applications protected by it stop validating
                      tokens.
                    </>
                  ),
                  confirmText: row.original.Name ?? '',
                  confirmLabel: 'Delete',
                  onConfirm: () => remove.mutateAsync(row.original.Name ?? ''),
                });
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];
  if (!allowed) return <NeedsPrivilege resources={SECURE} what="The resource server list" />;
  const d = detail.data as
    (Record<string, unknown> & { Enabled?: boolean; Audiences?: string[] }) | undefined;
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Title order={5}>Resource servers (APIs on this instance that accept tokens)</Title>
          <PrivilegeBadge resources={SECURE} />
        </Group>
        <ExplorerButton op="PUT /v2/security/oauth2/resource-server">
          Add or edit in the Explorer
        </ExplorerButton>
      </Group>
      <DataTable
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        getRowId={(r) => r.Name ?? ''}
        emptyMessage="No resource server is configured"
        exportName="oauth2-resource-servers"
        dense
      />
      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={
          <b>
            Resource server <span className="mono">{selected}</span>
          </b>
        }
      >
        {detail.error ? (
          <ErrorAlert error={detail.error} />
        ) : (
          <Stack gap="md">
            {d ? (
              <Group gap="xs">
                <BoolBadge value={!!d.Enabled} yes="Enabled" no="Disabled" />
                {(d.Audiences ?? []).map((a) => (
                  <Badge key={a} variant="light" tt="none">
                    aud {a}
                  </Badge>
                ))}
              </Group>
            ) : null}
            <KeyValueList items={objectToItems(d, { omit: ['Authenticator', 'Audiences'] })} />
            {d?.Authenticator && Object.keys(d.Authenticator as object).length ? (
              <JsonViewer value={d.Authenticator} title="Authenticator" />
            ) : null}
            <ExplorerButton op="PUT /v2/security/oauth2/resource-server">Edit in the Explorer</ExplorerButton>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}

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
