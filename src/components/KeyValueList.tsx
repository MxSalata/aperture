import { Badge, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { redactDeep } from '@/lib/redact';

export interface KeyValue {
  label: string;
  value: ReactNode;
  span?: number;
  mono?: boolean;
}

interface Props {
  items: KeyValue[];
  cols?: number;
}

export function renderValue(v: unknown): ReactNode {
  if (v === null || v === undefined || v === '')
    return (
      <Text c="dimmed" size="sm">
        -
      </Text>
    );
  if (typeof v === 'boolean')
    return (
      <Badge size="sm" color={v ? 'teal' : 'gray'} variant="light">
        {v ? 'Yes' : 'No'}
      </Badge>
    );
  if (Array.isArray(v)) {
    if (!v.length)
      return (
        <Text c="dimmed" size="sm">
          -
        </Text>
      );
    if (v.every((x) => typeof x !== 'object'))
      return (
        <Group gap={4} wrap="wrap">
          {v.map((x, i) => (
            <Badge key={i} size="sm" variant="outline" color="gray" style={{ textTransform: 'none' }}>
              {String(x)}
            </Badge>
          ))}
        </Group>
      );
    return (
      <Text size="sm" className="mono">
        {JSON.stringify(v)}
      </Text>
    );
  }
  if (typeof v === 'object')
    return (
      <Text size="sm" className="mono">
        {JSON.stringify(v)}
      </Text>
    );
  return <Text size="sm">{String(v)}</Text>;
}

/** Two-column definition list used on all detail pages. */
export function KeyValueList({ items, cols = 2 }: Props) {
  return (
    <SimpleGrid cols={{ base: 1, sm: cols }} spacing="sm" verticalSpacing="sm">
      {items.map((it) => (
        <Stack key={it.label} gap={2}>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.3 }}>
            {it.label}
          </Text>
          <div className={it.mono ? 'mono' : undefined}>
            {typeof it.value === 'string' || typeof it.value === 'number' ? (
              <Text size="sm">{it.value}</Text>
            ) : (
              it.value
            )}
          </div>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

/**
 * Turn an arbitrary object into KeyValue items (used by detail pages and the Explorer).
 * Secret fields are redacted here, so every detail page inherits the rule.
 */
export function objectToItems(
  obj: Record<string, unknown> | null | undefined,
  opts: { omit?: string[]; labels?: Record<string, string> } = {},
): KeyValue[] {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([k]) => !opts.omit?.includes(k))
    .map(([k, v]) => ({
      label: opts.labels?.[k] ?? humanize(k),
      value: renderValue(redactDeep(v, k).value),
    }));
}

export function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
