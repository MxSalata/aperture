import { Badge, Button, Drawer, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, result } from '@/api/hooks';
import type { Schemas } from '@/api/types';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { JsonViewer } from '@/components/JsonViewer';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { PageHeader } from '@/components/PageHeader';
import { RefreshControl } from '@/components/RefreshControl';

type Row = Schemas['DeviceList'][number];

/** Device types as IRIS names them (Config.Devices). */
const TYPE_LABEL: Record<string, string> = {
  TRM: 'Terminal',
  SPL: 'Spool / printer',
  MT: 'Magnetic tape',
  BT: 'Bit-bucket',
  IPC: 'Interprocess',
  FILE: 'File',
  OTHER: 'Other',
};

const explorer = (op: string) => `/explorer/${encodeURIComponent('/v2/device')}?op=${encodeURIComponent(op)}`;

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'Name', header: 'Device', cell: (c) => <b className="mono">{String(c.getValue())}</b> },
  {
    accessorKey: 'Type',
    header: 'Type',
    cell: (c) => {
      const t = String(c.getValue() ?? '');
      return (
        <Badge size="sm" variant="light" tt="none">
          {TYPE_LABEL[t] ? `${TYPE_LABEL[t]} (${t})` : t}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'SubType',
    header: 'Subtype',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  {
    accessorKey: 'PhysicalDevice',
    header: 'Physical device',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
  { accessorKey: 'Description', header: 'Description' },
  { accessorKey: 'Alias', header: 'Alias' },
  { accessorKey: 'AlternateDevice', header: 'Alternate' },
  {
    accessorKey: 'OpenParameters',
    header: 'Open parameters',
    cell: (c) => <span className="mono">{String(c.getValue() ?? '')}</span>,
  },
];

/**
 * Devices (Config.Devices): what a process opens with the OPEN command. The list and the detail
 * come from the SysAdmin API; creating, editing and deleting a device or a subtype are one form
 * away in the Explorer, built from the schema.
 */
export default function DevicesPage() {
  const list = useQuery({ queryKey: ['devices'], queryFn: () => result(api().GET('/v2/devices')) });
  const settings = useQuery({
    queryKey: ['devices', 'settings'],
    queryFn: () => result(api().GET('/v2/device/settings')),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['devices', selected],
    queryFn: () => result(api().GET('/v2/device', { params: { query: { name: selected! } } })),
    enabled: !!selected,
  });
  const s = settings.data as
    { TelnetSettings?: Record<string, unknown>; IOSettings?: Record<string, unknown> } | undefined;
  return (
    <>
      <PageHeader
        title="Devices"
        description="Terminals, printers, spool and tape devices as IRIS configures them, with the instance-wide device settings. Devices are what a process opens; the OPEN parameters here are the defaults."
        privileges={['%Admin_Manage:U']}
        actions={
          <>
            <RefreshControl screen="devices" onRefresh={() => list.refetch()} loading={list.isFetching} />
            <Button
              component={Link}
              to={explorer('PUT /v2/device')}
              size="xs"
              variant="light"
              rightSection={<IconExternalLink size={12} />}
            >
              Create or edit in the Explorer
            </Button>
          </>
        }
      />
      <Stack gap="md">
        <DataTable
          stateKey="devices"
          exportName="devices"
          data={list.data}
          columns={columns}
          loading={list.isPending}
          error={list.error}
          getRowId={(r) => r.Name ?? ''}
          getRowLabel={(r) => `Details of device ${r.Name}`}
          onRowClick={(r) => setSelected(r.Name ?? null)}
          initialSorting={[{ id: 'Name', desc: false }]}
          searchable
          searchPlaceholder="Filter devices…"
          emptyMessage="No devices are configured"
          dense
        />
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Title order={5}>Telnet settings</Title>
              <Button
                component={Link}
                to={explorer('PUT /v2/device/settings')}
                size="compact-xs"
                variant="subtle"
                rightSection={<IconExternalLink size={12} />}
              >
                Edit
              </Button>
            </Group>
            {settings.error ? (
              <ErrorAlert error={settings.error} />
            ) : (
              <KeyValueList items={objectToItems(s?.TelnetSettings)} />
            )}
          </Paper>
          <Paper withBorder p="md">
            <Title order={5} mb="xs">
              Default devices by use
            </Title>
            {settings.error ? (
              <Text size="sm" c="dimmed">
                Unavailable
              </Text>
            ) : (
              <KeyValueList items={objectToItems(s?.IOSettings)} />
            )}
          </Paper>
        </SimpleGrid>
      </Stack>
      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={
          <b>
            Device <span className="mono">{selected}</span>
          </b>
        }
      >
        {detail.error ? (
          <ErrorAlert error={detail.error} />
        ) : (
          <Stack gap="md">
            <KeyValueList items={objectToItems(detail.data as Record<string, unknown> | undefined)} />
            <JsonViewer value={detail.data} title="GET /v2/device" />
            <Group gap="xs">
              <Button
                component={Link}
                to={explorer('PUT /v2/device')}
                size="xs"
                variant="light"
                rightSection={<IconExternalLink size={12} />}
              >
                Edit in the Explorer
              </Button>
              <Button
                component={Link}
                to={explorer('DELETE /v2/device')}
                size="xs"
                variant="subtle"
                color="red"
                rightSection={<IconExternalLink size={12} />}
              >
                Delete in the Explorer
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </>
  );
}
