import { ActionIcon, Code, CopyButton, Group, ScrollArea, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

interface Props {
  value: unknown;
  title?: string;
  maxHeight?: number;
}

/** Pretty-printed JSON with a copy button - every screen offers the raw API payload. */
export function JsonViewer({ value, title = 'Raw response', maxHeight = 420 }: Props) {
  const text = JSON.stringify(value, null, 2) ?? 'undefined';
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="xs" c="dimmed" fw={500}>
          {title}
        </Text>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy JSON'}>
              <ActionIcon size="sm" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} aria-label="Copy JSON">
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
