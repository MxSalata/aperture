import { ActionIcon, Badge, Drawer, Group, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
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
import { REGISTRATION, SERVER, isNotFound, useAllowed } from './access';
import { ExplorerButton, NeedsPrivilege } from './shared';

type ServerClientRow = Schemas['OAuth2ServerClientList'][number];

/** OAuth 2.0 with this instance as the authorization server: its settings and registered clients. */
export function AuthorizationServer() {
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
