import { ActionIcon, Anchor, Badge, Drawer, Group, Paper, Stack, Title, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { Schemas } from '@/api/types';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { PrivilegeBadge } from '@/components/PrivilegeBadge';
import { secKeys } from '../keys';
import { CLIENT, useAllowed } from './access';
import { ExplorerButton, NeedsPrivilege } from './shared';

type DefinitionRow = Schemas['OAuth2AuthorizationServerList'][number];
type ClientConfigRow = Schemas['OAuth2ClientsUsingServer'][number];

/** OAuth 2.0 with this instance as a client: its server definitions and client configurations. */
export function ClientSide() {
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
