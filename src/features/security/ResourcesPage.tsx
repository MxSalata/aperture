import { ActionIcon, Button, Group, Modal, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { putBody, sendsOnlyChanges } from '@/api/partialPut';
import type { ResourceList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { confirmDanger } from '@/components/ConfirmDanger';
import { reviewChanges } from '@/components/ReviewChanges';
import { DESCRIPTION_MAX, putResource, type ResourceBody } from './resourceWrite';
import { secKeys } from './keys';

type Row = ResourceList[number];
/**
 * IRIS 2026.2 refuses a resource with no public permission, created or edited: "" and null answer
 * 400 with no message, a missing field 400 "required" (quirk resource-create-empty-public).
 */
const NONE_REFUSED =
  'The SysAdmin API refuses a resource with no public permission (IRIS 2026.2). Choose one here, or take public access away in the Management Portal.';
/** Every combination of Read, Write and Use, in the order IRIS writes them; "none" shows, but cannot be chosen. */
const PERMS = [
  { value: '', label: 'none (the API refuses it)', disabled: true },
  ...['R', 'W', 'U', 'RW', 'RU', 'WU', 'RWU'].map((p) => ({ value: p, label: p })),
];

export default function ResourcesPage() {
  const list = useQuery({
    queryKey: secKeys.resources,
    queryFn: () => result(api().GET('/v2/security/resources')),
  });
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [before, setBefore] = useState<Record<string, unknown> | undefined>(undefined);
  const form = useForm({
    initialValues: { Name: '', Description: '', PublicPermission: '' },
    validate: { Name: (v) => (/^[A-Za-z%][\w.-]*$/.test(v) ? null : 'Invalid resource name') },
  });
  // Read back after every write: IRIS can answer 200 and keep nothing (resourceWrite.ts).
  const save = useApiMutation(
    ({ name, body }: { name: string; body: ResourceBody }) => putResource(name, body),
    {
      invalidate: [secKeys.resources],
      onSuccess: () => {
        close();
        form.reset();
        setEditing(null);
      },
    },
  );
  const remove = useApiMutation(
    (name: string) => run(api().DELETE('/v2/security/resource', { params: { query: { name } } }), 'DELETE'),
    { invalidate: [secKeys.resources] },
  );

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Name', header: 'Resource', cell: (c) => <b className="mono">{String(c.getValue())}</b> },
    { accessorKey: 'Description', header: 'Description' },
    { accessorKey: 'ResourceType', header: 'Type' },
    {
      accessorKey: 'PublicPermission',
      header: 'Public permission',
      cell: (c) => <span className="mono">{String(c.getValue() || '-')}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Edit"
              onClick={(e) => {
                stop(e);
                setEditing(row.original.Name ?? '');
                setBefore({
                  Description: row.original.Description ?? '',
                  PublicPermission: row.original.PublicPermission ?? '',
                });
                form.setValues({
                  Name: row.original.Name ?? '',
                  Description: row.original.Description ?? '',
                  PublicPermission: row.original.PublicPermission ?? '',
                });
                open();
              }}
            >
              <IconPencil size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={row.original.AllowDelete ? 'Delete' : 'System resource'}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              disabled={!row.original.AllowDelete}
              aria-label="Delete"
              onClick={(e) => {
                stop(e);
                confirmDanger({
                  title: 'Delete resource',
                  message: (
                    <>
                      Delete resource <b>{row.original.Name}</b>?
                    </>
                  ),
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

  return (
    <>
      <PageHeader
        title="Resources"
        description="Protected assets (databases, services, applications, %Admin_* privileges) and the permissions granted to everyone."
        privileges={['%Admin_Secure:U']}
        actions={
          <>
            <RefreshControl screen="resources" onRefresh={() => list.refetch()} loading={list.isFetching} />
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setEditing(null);
                form.reset();
                open();
              }}
            >
              Create resource
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="resources"
        exportName="resources"
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        getRowId={(r) => r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
        pageSize={50}
        dense
      />
      <Modal opened={opened} onClose={close} title={editing ? `Edit ${editing}` : 'Create resource'} centered>
        <form
          onSubmit={form.onSubmit((v) => {
            const body: ResourceBody = { Description: v.Description, PublicPermission: v.PublicPermission };
            if (editing)
              reviewChanges({
                title: `Review changes to ${editing}`,
                before,
                after: body,
                refetch: () =>
                  result(
                    api().GET('/v2/security/resource', { params: { query: { name: editing } } }),
                  ) as Promise<Record<string, unknown>>,
                // Only what changed: an untouched "none" from the Management Portal is never sent back.
                onlyChanges: sendsOnlyChanges('/v2/security/resource'),
                onConfirm: (changed) =>
                  save.mutateAsync({
                    name: editing,
                    body: putBody('/v2/security/resource', body, changed as ResourceBody),
                  }),
              });
            else if (!v.PublicPermission) form.setFieldError('PublicPermission', NONE_REFUSED);
            else save.mutate({ name: v.Name, body });
          })}
        >
          <Stack gap="sm">
            <TextInput label="Name" disabled={!!editing} data-autofocus {...form.getInputProps('Name')} />
            <TextInput
              label="Description"
              description={`${DESCRIPTION_MAX} characters at most: IRIS answers a longer one with 200 and keeps nothing.`}
              maxLength={DESCRIPTION_MAX}
              {...form.getInputProps('Description')}
            />
            <Select
              label="Public permission"
              description="IRIS 2026.2 refuses a resource with no public permission, on creation and on edit."
              data={PERMS}
              {...form.getInputProps('PublicPermission')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
