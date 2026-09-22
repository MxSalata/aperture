import { Group, Paper, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  color?: string;
  footer?: ReactNode;
  /** Rendered to the right of the value, e.g. a sparkline. */
  aside?: ReactNode;
}

export function StatTile({ label, value, hint, icon, color = 'indigo', footer, aside }: Props) {
  return (
    <Paper p="md" radius="md" withBorder h="100%">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Tooltip label={hint} disabled={!hint}>
            <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.4 }} tabIndex={hint ? 0 : undefined} aria-label={hint ? `${label} (${hint})` : undefined}>
              {label}
            </Text>
          </Tooltip>
          <Text fz={26} fw={650} lh={1.15} className="tabular" style={{ wordBreak: 'break-word' }}>
            {value}
          </Text>
          {footer ? (
            <Text size="xs" c="dimmed">
              {footer}
            </Text>
          ) : null}
        </Stack>
        {aside ?? (icon ? (
          <ThemeIcon variant="light" color={color} size={38} radius="md">
            {icon}
          </ThemeIcon>
        ) : null)}
      </Group>
    </Paper>
  );
}
