import { ActionIcon, Badge, Code, CopyButton, Group, ScrollArea, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconEyeOff } from '@tabler/icons-react';
import { useMemo } from 'react';
import { redactDeep } from '@/lib/redact';

interface Props {
  value: unknown;
  title?: string;
  maxHeight?: number;
}

/**
 * Pretty-printed JSON with a copy button - every screen offers the raw API payload.
 * Secrets (passwords, client secrets, tokens, private keys) are redacted before the text
 * exists, so neither the panel nor the clipboard ever holds them; a badge says how many.
 */
export function JsonViewer({ value, title = 'Raw response', maxHeight = 420 }: Props) {
  const { text, hidden } = useMemo(() => {
    const r = redactDeep(value);
    return { text: JSON.stringify(r.value, null, 2) ?? 'undefined', hidden: r.count };
  }, [value]);
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <Text size="xs" c="dimmed" fw={500}>
            {title}
          </Text>
          {hidden ? (
            <Tooltip
              label="Passwords, secrets, tokens and private keys are never shown or copied. The server still holds them."
              multiline
              w={260}
            >
              <Badge
                size="xs"
                variant="light"
                color="yellow"
                leftSection={<IconEyeOff size={10} />}
                tabIndex={0}
                aria-label={`${hidden} secret ${hidden === 1 ? 'value' : 'values'} hidden`}
              >
                {hidden} hidden
              </Badge>
            </Tooltip>
          ) : null}
        </Group>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy JSON'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                onClick={copy}
                aria-label="Copy JSON"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <ScrollArea.Autosize mah={maxHeight} type="auto">
        <Code block style={{ fontSize: 12 }}>
          {text}
        </Code>
      </ScrollArea.Autosize>
    </div>
  );
}
