import { Button, Grid, Group, Modal, Paper, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { IconKey, IconRefresh } from '@tabler/icons-react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import { PageHeader } from '@/components/PageHeader';
import { confirmDanger } from '@/components/ConfirmDanger';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { DataTable, type ColumnDef } from '@/components/DataTable';

type AnyRow = Record<string, unknown>;
const cols = (keys: string[]): ColumnDef<AnyRow, unknown>[] =>
  keys.map((k) => ({
    accessorKey: k,
    header: k,
    cell: (c) => <span className="tabular">{String(c.getValue() ?? '')}</span>,
  }));

export default function LicensePage() {
  const key = useQuery({ queryKey: ['license', 'key'], queryFn: () => result(api().GET('/v2/license/key')) });
  const usage = useQuery({
    queryKey: ['license', 'usage'],
    queryFn: () => result(api().GET('/v2/monitor/license-usage')),
    refetchInterval: 15000,
  });
  const servers = useQuery({
    queryKey: ['license', 'servers'],
    queryFn: () => result(api().GET('/v2/license/servers')),
  });
  const [opened, { open, close }] = useDisclosure(false);
  const form = useForm({
    initialValues: { Key: '' },
    validate: { Key: (v) => (v.trim() ? null : 'Paste the contents of the license key file') },
  });
  const validate = useApiMutation(
    (v: typeof form.values) => run(api().POST('/v2/license/key/validate', { body: { Key: v.Key } })),
    { success: (d) => d.summary || 'Key is valid' },
  );
  const activate = useApiMutation(
    (v: typeof form.values) => run(api().PUT('/v2/license/key', { body: { Key: v.Key } }), 'PUT'),
    { invalidate: [['license']], onSuccess: close },
  );
  const u = usage.data as
    { Summary?: AnyRow[]; UsageByUser?: AnyRow[]; UsageByProcess?: AnyRow[] } | undefined;

  return (
    <>
      <PageHeader
        title="License"
        description="Installed license key, current consumption of license units and license servers."
        privileges={['%Admin_Manage:U', '%Admin_Operate:U']}
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                key.refetch();
                usage.refetch();
              }}
            >
              Refresh
            </Button>
            <Button size="xs" leftSection={<IconKey size={14} />} onClick={open}>
              Activate key…
            </Button>
          </>
        }
      />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              License key
            </Title>
            {key.isError ? (
              <ErrorAlert error={key.error} />
            ) : key.data ? (
              <KeyValueList items={objectToItems(key.data as AnyRow)} />
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
          <Paper p="md">
            <Title order={5} mb="xs">
              License servers
            </Title>
            {servers.data ? (
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Address</Table.Th>
                    <Table.Th>Port</Table.Th>
                    <Table.Th>Description</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(servers.data as AnyRow[]).map((s, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{String(s.Name ?? '')}</Table.Td>
                      <Table.Td className="mono">{String(s.Address ?? '')}</Table.Td>
                      <Table.Td>{String(s.Port ?? '')}</Table.Td>
                      <Table.Td>{String(s.Description ?? '')}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : servers.isError ? (
              <Text size="sm" c="dimmed">
                Requires %Admin_Manage
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Usage summary
            </Title>
            {u?.Summary ? (
              <DataTable
                serverLimit={0}
                data={u.Summary}
                columns={cols(Object.keys(u.Summary[0] ?? {}))}
                searchable={false}
                hideColumnMenu
                dense
              />
            ) : usage.isError ? (
              <ErrorAlert error={usage.error} />
            ) : (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            )}
          </Paper>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              Usage by user
            </Title>
            {u?.UsageByUser ? (
              <DataTable
                serverLimit={0}
                data={u.UsageByUser}
                columns={cols(Object.keys(u.UsageByUser[0] ?? {}))}
                searchable={false}
                hideColumnMenu
                dense
                emptyMessage="No connected users"
              />
            ) : null}
          </Paper>
          <Paper p="md">
            <Title order={5} mb="xs">
              Usage by process
            </Title>
            {u?.UsageByProcess ? (
              <DataTable
                serverLimit={0}
                data={u.UsageByProcess}
                columns={cols(Object.keys(u.UsageByProcess[0] ?? {}))}
                hideColumnMenu
                dense
                pageSize={10}
                emptyMessage="No processes holding license units"
              />
            ) : null}
          </Paper>
        </Grid.Col>
      </Grid>
      <Modal opened={opened} onClose={close} title="Activate a license key" centered>
        <Stack gap="sm">
          <Textarea
            label="License key (contents of iris.key)"
            placeholder="[ConfigFile]\nFileType=InterSystems IRIS License Key File\n…"
            autosize
            minRows={6}
            styles={{ input: { fontFamily: 'var(--aperture-mono)', fontSize: 12 } }}
            data-autofocus
            {...form.getInputProps('Key')}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => form.validate().hasErrors || validate.mutate(form.values)}
              loading={validate.isPending}
            >
              Validate
            </Button>
            <Button
              onClick={() =>
                form.validate().hasErrors ||
                confirmDanger({
                  title: 'Activate this license key',
                  message:
                    'The instance switches to this key now: its capacity and expiry replace the current ones for every user. Validate it first if you have not.',
                  confirmLabel: 'Activate',
                  color: 'orange',
                  onConfirm: () => activate.mutateAsync(form.values),
                })
              }
              loading={activate.isPending}
            >
              Activate
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
