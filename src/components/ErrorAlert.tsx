import { Alert, Button, Code, Collapse, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { describeError, isApiError } from '@/lib/errors';

interface Props {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ErrorAlert({ error, title, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const api = isApiError(error) ? error : null;
  const details = api ? [...api.errors, ...api.console].filter((l) => l && l !== api.summary) : [];
  return (
    <Alert
      role="alert"
      color="red"
      variant="light"
      icon={<IconAlertTriangle size={18} />}
      title={
        title ??
        (api
          ? `${api.method} ${api.url.replace(/^.*\/api\/admin/, '') || 'request'} → ${api.status ? `HTTP ${api.status}` : 'no response'}`
          : 'Something went wrong')
      }
    >
      <Stack gap="xs">
        <Text size="sm">{describeError(error)}</Text>
        <Group gap="xs">
          {onRetry ? (
            <Button size="compact-xs" variant="light" color="red" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          {details.length ? (
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide details' : `Details (${details.length})`}
            </Button>
          ) : null}
        </Group>
        <Collapse in={open}>
          <Code block>{details.join('\n')}</Code>
        </Collapse>
      </Stack>
    </Alert>
  );
}
