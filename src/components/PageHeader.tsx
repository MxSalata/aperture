import { Group, Stack, Text, Title, type TitleProps } from '@mantine/core';
import type { ReactNode } from 'react';
import { PrivilegeBadge } from './PrivilegeBadge';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** `%Admin_*` resources the page needs; rendered as a badge with the user's status. */
  privileges?: readonly string[];
  order?: TitleProps['order'];
  children?: ReactNode;
}

export function PageHeader({ title, description, actions, privileges, order = 2, children }: Props) {
  return (
    <Stack gap="xs" mb="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="sm" align="center" wrap="wrap">
            <Title order={order} style={{ lineHeight: 1.2 }}>
              {title}
            </Title>
            {privileges?.length ? <PrivilegeBadge resources={privileges} /> : null}
          </Group>
          {description ? (
            <Text c="dimmed" size="sm" maw={820}>
              {description}
            </Text>
          ) : null}
        </Stack>
        {actions ? <Group gap="xs" wrap="wrap">{actions}</Group> : null}
      </Group>
      {children}
    </Stack>
  );
}
