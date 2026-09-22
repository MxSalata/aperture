import { Alert, Badge, Button, Checkbox, Group, Stack, Table, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { humanize } from './KeyValueList';
import { redactDeep } from '@/lib/redact';

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Keys whose value differs between two objects (deep-compared by JSON). */
export function diffObjects(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  omit: string[] = [],
): FieldChange[] {
  const out: FieldChange[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const key of keys) {
    if (omit.includes(key)) continue;
    const b = before?.[key];
    const a = after[key];
    if (a === undefined && !(key in after)) continue;
    if (!same(b, a)) out.push({ key, before: b, after: a });
  }
  return out;
}

/** One side of a change as text; secrets are redacted like everywhere else (a drift can touch them). */
export function show(key: string, value: unknown): string {
  const v = redactDeep(value, key).value;
  if (v === undefined || v === null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface ReviewOptions<T extends Record<string, unknown>> {
  title?: string;
  before: T | undefined;
  after: T;
  labels?: Record<string, string>;
  omit?: string[];
  /** Re-read the object right before applying, to detect edits made elsewhere since it was opened. */
  refetch?: () => Promise<T>;
  confirmLabel?: string;
  onConfirm: () => unknown | Promise<unknown>;
}

function Body<T extends Record<string, unknown>>({
  id,
  changes,
  labels,
  refetch,
  before,
  confirmLabel,
  onConfirm,
}: ReviewOptions<T> & { id: string; changes: FieldChange[] }) {
  const [busy, setBusy] = useState(false);
  const [drift, setDrift] = useState<FieldChange[] | null>(refetch ? null : []);
  const [checking, setChecking] = useState(!!refetch);
  const [override, setOverride] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!refetch) return;
    let cancelled = false;
    refetch()
      .then((current) => {
        if (cancelled) return;
        setDrift(diffObjects(before, current as Record<string, unknown>));
      })
      .catch((e) => {
        if (!cancelled) setCheckError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refetch, before]);

  const blocked = (drift?.length ?? 0) > 0 && !override;
  return (
    <Stack gap="sm">
      <Text size="sm">
        {changes.length} field{changes.length === 1 ? '' : 's'} will change. Nothing is sent until you apply.
      </Text>
      <Table fz="sm" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Field</Table.Th>
            <Table.Th>Current</Table.Th>
            <Table.Th>New</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {changes.map((c) => (
            <Table.Tr key={c.key}>
              <Table.Td>{labels?.[c.key] ?? humanize(c.key)}</Table.Td>
              <Table.Td className="mono muted" style={{ wordBreak: 'break-all' }}>
                {show(c.key, c.before)}
              </Table.Td>
              <Table.Td className="mono" style={{ wordBreak: 'break-all' }}>
                {show(c.key, c.after)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {checking ? (
        <Text size="xs" c="dimmed">
          Re-reading the current definition from the server…
        </Text>
      ) : checkError ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          Could not re-read the object before applying: {checkError}
        </Alert>
      ) : drift && drift.length ? (
        <Alert
          color="orange"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="Changed on the server since you opened it"
        >
          <Stack gap={4}>
            {drift.map((d) => (
              <Group key={d.key} gap={6}>
                <Badge size="xs" color="orange" variant="light" style={{ textTransform: 'none' }}>
                  {labels?.[d.key] ?? humanize(d.key)}
                </Badge>
                <Text size="xs" className="mono">
                  {show(d.key, d.before)} → {show(d.key, d.after)}
                </Text>
              </Group>
            ))}
            <Checkbox
              size="xs"
              label="Apply my changes anyway (overwrites those server-side values)"
              checked={override}
              onChange={(e) => setOverride(e.currentTarget.checked)}
            />
          </Stack>
        </Alert>
      ) : drift ? (
        <Text size="xs" c="teal">
          Verified: the definition on the server still matches what you edited.
        </Text>
      ) : null}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={() => modals.close(id)}>
          Cancel
        </Button>
        <Button
          disabled={checking || blocked}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // The dialog may have been open for a while: re-read once more right before writing.
              if (refetch && !override) {
                try {
                  const current = await refetch();
                  const latest = diffObjects(before, current as Record<string, unknown>);
                  if (latest.length) {
                    setDrift(latest);
                    return;
                  }
                } catch (e) {
                  setCheckError(e instanceof Error ? e.message : String(e));
                }
              }
              await onConfirm();
              modals.close(id);
            } catch {
              /* the write reported its own error (useApiMutation toasts it); the review stays open */
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel ?? 'Apply changes'}
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Explicit change review before a write: lists old → new per field, re-reads the
 * object to detect concurrent edits, and only then calls `onConfirm`.
 * Skips the dialog (with a toast) when nothing changed.
 */
export function reviewChanges<T extends Record<string, unknown>>(opts: ReviewOptions<T>) {
  const changes = diffObjects(opts.before, opts.after, opts.omit);
  if (!changes.length) {
    notifications.show({ message: 'No changes to apply.', color: 'gray', autoClose: 2500 });
    return;
  }
  const id = `review-${Math.random().toString(36).slice(2)}`;
  modals.open({
    modalId: id,
    title: opts.title ?? 'Review changes',
    centered: true,
    size: 'lg',
    zIndex: 1100,
    children: <Body {...opts} id={id} changes={changes} />,
  });
}
