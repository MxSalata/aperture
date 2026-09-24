import { Button, Group, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { basicCredentials } from '@/api/base';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';

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
  return (
    <Paper withBorder p="md" maw={520}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password) return;
          set(basicCredentials(username, password));
          setPassword('');
          for (const key of resetKeys) void queryClient.resetQueries({ queryKey: key });
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
