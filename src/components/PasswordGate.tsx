import { Alert, Button, Code, Group, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { IconFlask, IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { basicCredentials } from '@/api/base';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';
import { DEMO_PASSWORD, useDemo } from '@/stores/demo';

interface Props {
  /** The web application that takes a password only, e.g. "/api/mgmnt". */
  application: string;
  /** What the password unlocks, on the button. */
  action: string;
  /** Queries to start over once the password is given (the previous attempt may have ended in a refusal). */
  resetKeys: QueryKey[];
}

/**
 * A JWT session has no password to send to a web application that accepts a password only
 * (/api/mgmnt, /api/aperture): ask for it once, for this tab's memory only. The same credentials
 * serve every such application of the instance (stores/mgmntAuth.ts).
 */
export function PasswordGate({ application, action, resetKeys }: Props) {
  const username = useSession((s) => s.username) ?? '';
  const set = useMgmntAuth((s) => s.set);
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const demo = useDemo((s) => s.enabled);
  const unlock = (value: string) => {
    set(basicCredentials(username, value));
    setPassword('');
    for (const key of resetKeys) void queryClient.resetQueries({ queryKey: key });
  };
  return (
    <Paper withBorder p="md" maw={520}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (password) unlock(password);
        }}
      >
        <Stack gap="sm">
          <Group gap={6}>
            <IconKey size={18} />
            <Title order={5}>{application} needs your password</Title>
          </Group>
          <Text size="sm">
            Its web application accepts a password only; the token of this session is not valid there. The
            password stays in this tab&apos;s memory until you sign out, and is never stored.
          </Text>
          {demo ? (
            <Alert color="grape" variant="light" icon={<IconFlask size={16} />} p="xs">
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm">
                  Demo instance: every account&apos;s password is <Code>{DEMO_PASSWORD}</Code>.
                </Text>
                <Button size="compact-sm" variant="light" color="grape" onClick={() => unlock(DEMO_PASSWORD)}>
                  Use it
                </Button>
              </Group>
            </Alert>
          ) : null}
          <PasswordInput
            label={`Password for ${username}`}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button type="submit" disabled={!password}>
              {action}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
