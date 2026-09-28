import { ActionIcon, Badge, Drawer, Group, Stack, Title, Tooltip } from '@mantine/core';
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
import { BoolBadge } from '@/components/StatusBadge';
import { secKeys } from '../keys';
import { SECURE, useAllowed } from './access';
import { ExplorerButton, NeedsPrivilege } from './shared';

type ResourceRow = Schemas['OAuth2ResourceServerList'][number];

/** OAuth 2.0 resource servers on this instance. */
export function ResourceServers() {
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
