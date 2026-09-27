import { Badge, Button, Checkbox, Group, Modal, Select, Stack, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { WebApplicationList } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { renderValue } from '@/components/KeyValueList';
import { useSession } from '@/stores/session';
import { AUTHE_FLAGS, flagsToBits, secKeys, webAppExposure } from './keys';

type Row = WebApplicationList[number];
export const webAppUrl = (name: string) => `/security/web-apps/detail?name=${encodeURIComponent(name)}`;

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Name', header: 'Application', cell: (c) => <b className="mono">{String(c.getValue())}</b> },
  {
    accessorKey: 'Namespace',
    header: 'Namespace',
    cell: ({ row }) => (
      <Group gap={4}>
        <span>{row.original.Namespace}</span>
        {row.original.NamespaceDefault ? (
          <Badge size="xs" color="gray">
            default
          </Badge>
        ) : null}
      </Group>
    ),
  },
  {
    accessorKey: 'Type',
    header: 'Type',
    cell: (c) => (
      <Badge size="xs" color={c.getValue() === 'REST' ? 'cyan' : 'indigo'}>
        {String(c.getValue())}
      </Badge>
    ),
  },
  {
    accessorKey: 'Enabled',
    header: 'Enabled',
    cell: (c) => <BoolBadge value={c.getValue() as boolean} yes="Enabled" no="Disabled" />,
  },
  {
    accessorKey: 'AuthenticationMethods',
    header: 'Authentication',
    cell: ({ row }) => {
      const exposure = webAppExposure(row.original);
      return (
        <Group gap={4} wrap="nowrap">
          {renderValue(row.original.AuthenticationMethods)}
          {exposure === 'open' ? (
            <Tooltip label="Enabled, accepts unauthenticated requests and requires no resource: anyone who reaches the web server gets in as UnknownUser">
              <Badge size="xs" color="red" variant="filled" tabIndex={0}>
                open
              </Badge>
            </Tooltip>
          ) : exposure === 'gated' ? (
            <Tooltip
              label={`Accepts unauthenticated requests; UnknownUser needs ${row.original.Resource} to get in`}
            >
              <Badge size="xs" color="yellow" variant="light" tabIndex={0}>
                unauthenticated
              </Badge>
            </Tooltip>
          ) : null}
        </Group>
      );
    },
  },
  {
    accessorKey: 'Resource',
    header: 'Resource',
    cell: (c) => <span className="mono">{String(c.getValue() || '-')}</span>,
  },
  {
    accessorKey: 'DispatchClass',
    header: 'Dispatch class',
    cell: (c) => <span className="mono">{String(c.getValue() || '')}</span>,
  },
  {
    accessorKey: 'IsSystemApp',
    header: 'System',
    cell: (c) => <BoolBadge value={c.getValue() as boolean} />,
  },
];

export default function WebAppsPage() {
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const list = useQuery({ queryKey: secKeys.webApps, queryFn: () => result(api().GET('/v2/web-apps')) });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: {
      Name: '',
      NameSpace: 'USER',
      Description: '',
      DispatchClass: '',
      Path: '',
      Resource: '',
      flags: ['32'],
      JWTAuthEnabled: false,
      Enabled: true,
      IsNameSpaceDefault: false,
    },
    validate: {
      Name: (v) => (/^\/[\w./-]*$/.test(v) ? null : 'Must start with / (e.g. /csp/myapp or /api/myapp)'),
    },
  });
  const create = useApiMutation(
    (v: typeof form.values) =>
      run(
        api().PUT('/v2/web-app', {
          params: { query: { name: v.Name } },
          body: {
            NameSpace: v.NameSpace,
            Description: v.Description,
            DispatchClass: v.DispatchClass || undefined,
            Path: v.Path || undefined,
            Resource: v.Resource || undefined,
            AutheEnabled: flagsToBits(v.flags.map(Number)),
            JWTAuthEnabled: v.JWTAuthEnabled,
            Enabled: v.Enabled,
            IsNameSpaceDefault: v.IsNameSpaceDefault,
          },
        }),
        'PUT',
      ),
    {
      invalidate: [secKeys.webApps],
      onSuccess: () => {
        close();
        form.reset();
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Web applications"
        description="CSP and REST applications: namespace, authentication (including JWT), CORS and the resource required to use them."
        privileges={['%Admin_Secure:U']}
        actions={
          <>
            <RefreshControl screen="web-apps" onRefresh={() => list.refetch()} loading={list.isFetching} />
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={open}>
              Create application
            </Button>
          </>
        }
      />
      <DataTable
        stateKey="web-apps"
        exportName="web-apps"
        getRowLabel={(r) => `Open web application ${r.Name ?? ''}`}
        data={list.data}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        onRowClick={(r) => navigate(webAppUrl(r.Name ?? ''))}
        getRowId={(r) => r.Name ?? ''}
        initialSorting={[{ id: 'Name', desc: false }]}
        dense
        pageSize={50}
      />
      <Modal opened={opened} onClose={close} title="Create web application" centered size="lg">
        <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
          <Stack gap="sm">
            <TextInput
              label="Name (URL path)"
              placeholder="/api/myapp"
              data-autofocus
              {...form.getInputProps('Name')}
            />
            <Group grow>
              <Select
                label="Namespace"
                data={info?.namespaces?.map((n) => n.name ?? '').filter(Boolean) ?? ['USER']}
                searchable
                {...form.getInputProps('NameSpace')}
              />
              <TextInput
                label="Resource required"
                placeholder="optional"
                {...form.getInputProps('Resource')}
              />
            </Group>
            <TextInput label="Description" {...form.getInputProps('Description')} />
            <TextInput
              label="REST dispatch class"
              placeholder="MyApp.REST (leave empty for a CSP/static app)"
              {...form.getInputProps('DispatchClass')}
            />
            <TextInput
              label="Physical path (CSP/static files)"
              placeholder="/usr/irissys/csp/myapp/"
              {...form.getInputProps('Path')}
            />
            <Checkbox.Group label="Authentication methods" {...form.getInputProps('flags')}>
              <Group gap="sm" mt={4}>
                {AUTHE_FLAGS.slice(0, 4).map((f) => (
                  <Checkbox key={f.bit} value={String(f.bit)} label={f.label} />
                ))}
              </Group>
            </Checkbox.Group>
            <Group>
              <Checkbox
                label="JWT authentication"
                {...form.getInputProps('JWTAuthEnabled', { type: 'checkbox' })}
              />
              <Checkbox label="Enabled" {...form.getInputProps('Enabled', { type: 'checkbox' })} />
              <Checkbox
                label="Namespace default app"
                {...form.getInputProps('IsNameSpaceDefault', { type: 'checkbox' })}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
