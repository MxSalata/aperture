import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { IconTrash } from '@tabler/icons-react';
import { api, result, run, useApiMutation } from '@/api/hooks';
import type { X509CredentialCertificate, X509CredentialsList } from '@/api/types';
import { DataTable, stop, type ColumnDef } from '@/components/DataTable';
import { BoolBadge } from '@/components/StatusBadge';
import { Timestamp } from '@/components/Timestamp';
import { confirmDanger } from '@/components/ConfirmDanger';
import { certificateStatus, commonName, EXPIRY_WARNING_DAYS, type CertState } from '@/lib/certs';
import { secKeys } from './keys';

type Row = X509CredentialsList[number] &
  Partial<X509CredentialCertificate> & { certLoading?: boolean; certError?: string };

const STATE_COLOR: Record<CertState, string> = {
  expired: 'red',
  expiring: 'yellow',
  ok: 'teal',
  unknown: 'gray',
};

/** "expired 40 days ago", "expired today", "12 days left", "expires today" or "no expiry read". */
export function ExpiryBadge({ notAfter }: { notAfter: string | null | undefined }) {
  const { state, days } = certificateStatus(notAfter);
  const label =
    state === 'unknown' || days === null
      ? 'no expiry read'
      : state === 'expired'
        ? days === 0
          ? 'expired today'
          : `expired ${-days} day${days === -1 ? '' : 's'} ago`
        : days === 0
          ? 'expires today'
          : `${days} day${days === 1 ? '' : 's'} left`;
  return (
    <Badge
      size="sm"
      tt="none"
      variant={state === 'ok' ? 'light' : 'filled'}
      color={STATE_COLOR[state]}
      // A badge clips its label to the cell width; this label is the point of the column, so let it wrap.
      styles={{
        root: { height: 'auto', maxWidth: 'none', whiteSpace: 'normal', padding: '2px 8px' },
        label: { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 },
      }}
    >
      {label}
    </Badge>
  );
}

/**
 * X.509 credentials with the validity of the certificate each one holds. The list endpoint
 * does not carry dates, so the certificate is read per alias; a credential whose certificate
 * cannot be read is still listed, with the reason.
 */
export function X509Tab() {
  const list = useQuery({
    queryKey: secKeys.x509,
    queryFn: () => result(api().GET('/v2/security/x509-credentials')),
  });
  const aliases = (list.data ?? []).map((c) => c.Alias ?? '').filter(Boolean);
  const certs = useQueries({
    queries: aliases.map((alias) => ({
      queryKey: secKeys.x509Cert(alias),
      queryFn: () =>
        result(api().GET('/v2/security/x509-credential/certificate', { params: { query: { alias } } })),
      staleTime: 60_000,
    })),
  });
  const rows: Row[] = (list.data ?? []).map((c, i) => ({
    ...c,
    ...(certs[i]?.data ?? {}),
    certLoading: certs[i]?.isPending,
    certError: certs[i]?.error ? (certs[i].error as Error).message : undefined,
  }));
  const remove = useApiMutation(
    (alias: string) =>
      run(api().DELETE('/v2/security/x509-credential', { params: { query: { alias } } }), 'DELETE'),
    { invalidate: [secKeys.x509] },
  );
  const counts = rows.reduce(
    (acc, r) => {
      acc[certificateStatus(r.ValidityNotAfter).state] += 1;
      return acc;
    },
    { expired: 0, expiring: 0, ok: 0, unknown: 0 } as Record<CertState, number>,
  );

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: 'Alias', header: 'Alias', cell: (c) => <b>{String(c.getValue())}</b> },
    {
      accessorKey: 'SubjectDN',
      header: 'Subject',
      cell: ({ row }) =>
        row.original.certLoading ? (
          <Text size="sm" c="dimmed">
            reading…
          </Text>
        ) : row.original.certError ? (
          <Text size="sm" c="red">
            {row.original.certError}
          </Text>
        ) : (
          <Tooltip label={row.original.SubjectDN} disabled={!row.original.SubjectDN}>
            <span>{commonName(row.original.SubjectDN)}</span>
          </Tooltip>
        ),
    },
    {
      accessorKey: 'IssuerDN',
      header: 'Issuer',
      cell: (c) => (
        <Tooltip label={String(c.getValue() ?? '')} disabled={!c.getValue()}>
          <span>{commonName(c.getValue() as string)}</span>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'ValidityNotAfter',
      header: 'Valid until',
      cell: ({ row }) => <Timestamp value={row.original.ValidityNotAfter} />,
    },
    {
      id: 'expiry',
      header: 'Expiry',
      accessorFn: (r) => certificateStatus(r.ValidityNotAfter).days ?? Number.MAX_SAFE_INTEGER,
      cell: ({ row }) =>
        row.original.certLoading ? null : <ExpiryBadge notAfter={row.original.ValidityNotAfter} />,
    },
    {
      accessorKey: 'HasPrivateKey',
      header: 'Private key',
      cell: (c) => <BoolBadge value={c.getValue() as boolean} yes="Held" no="Public only" />,
    },
    {
      accessorKey: 'OwnerList',
      header: 'Owners',
      cell: (c) => ((c.getValue() as string[] | undefined) ?? []).join(', ') || '-',
    },
    {
      accessorKey: 'PeerNames',
      header: 'Peer names',
      cell: (c) => ((c.getValue() as string[] | undefined) ?? []).join(', ') || '-',
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Tooltip label="Delete credential">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            aria-label="Delete"
            onClick={(e) => {
              stop(e);
              confirmDanger({
                title: 'Delete X.509 credential',
                message: (
                  <>
                    Delete <b>{row.original.Alias}</b>? TLS configurations, mirroring or OAuth settings that
                    reference it stop working.
                  </>
                ),
                confirmText: row.original.Alias ?? '',
                confirmLabel: 'Delete',
                onConfirm: () => remove.mutateAsync(row.original.Alias ?? ''),
              });
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      ),
    },
  ];

  return (
    <Stack gap="sm">
      <Group gap="xs" aria-live="polite">
        <Text size="sm" c="dimmed">
          {rows.length} credential{rows.length === 1 ? '' : 's'}
        </Text>
        {counts.expired ? (
          <Badge color="red" variant="filled" size="sm" tt="none">
            {counts.expired} expired
          </Badge>
        ) : null}
        {counts.expiring ? (
          <Badge color="yellow" variant="filled" size="sm" tt="none">
            {counts.expiring} expiring within {EXPIRY_WARNING_DAYS} days
          </Badge>
        ) : null}
        {!counts.expired && !counts.expiring && rows.length ? (
          <Badge color="teal" variant="light" size="sm" tt="none">
            none expiring within {EXPIRY_WARNING_DAYS} days
          </Badge>
        ) : null}
      </Group>
      <DataTable
        exportName="x509-credentials"
        data={rows}
        columns={columns}
        loading={list.isPending}
        error={list.error}
        getRowId={(r) => r.Alias ?? ''}
        initialSorting={[{ id: 'expiry', desc: false }]}
        dense
        emptyMessage="No X.509 credentials on this instance"
      />
    </Stack>
  );
}
