import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Checkbox,
  Container,
  Divider,
  Group,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconFlask, IconInfoCircle, IconLogin, IconServer } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSession } from '@/stores/session';
import {
  baseUrlProblem,
  normalizeBaseUrl,
  newProfileId,
  nextProfileColor,
  useConnections,
  SAME_ORIGIN_ID,
} from '@/stores/connections';
import { DEMO_BUILD, useDemo } from '@/stores/demo';
import { describeError } from '@/lib/errors';
import { APP_NAME, APP_TAGLINE } from '@/theme';

const NEW_ID = '__new__';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const login = useSession((s) => s.login);
  const status = useSession((s) => s.status);
  const endedReason = useSession((s) => s.endedReason);
  const profiles = useConnections((s) => s.profiles);
  const lastUsedId = useConnections((s) => s.lastUsedId);
  const upsert = useConnections((s) => s.upsert);
  const setLastUsed = useConnections((s) => s.setLastUsed);
  const demoEnabled = useDemo((s) => s.enabled);
  const enableDemo = useDemo((s) => s.enable);
  const disableDemo = useDemo((s) => s.disable);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A retried sign-in to a new connection updates the profile the first attempt saved.
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);

  const initial = profiles.find((p) => p.id === lastUsedId) ?? profiles[0];
  const form = useForm({
    initialValues: {
      connectionId: initial.id,
      newName: '',
      newBaseUrl: 'http://localhost:52773',
      username: initial.username ?? '_SYSTEM',
      password: '',
      role: '',
      auth: initial.auth as 'auto' | 'jwt' | 'basic',
      persist: true,
    },
    validate: {
      username: (v) => (v.trim() ? null : 'Username is required'),
      password: (v) => (v ? null : 'Password is required'),
      newBaseUrl: (v, values) => (values.connectionId === NEW_ID ? baseUrlProblem(v) : null),
    },
  });

  useEffect(() => {
    if (status === 'authenticated') navigate(from, { replace: true });
  }, [status, navigate, from]);

  const submit = form.onSubmit(async (values) => {
    setError(null);
    setBusy(true);
    try {
      let profile = profiles.find((p) => p.id === values.connectionId);
      if (values.connectionId === NEW_ID) {
        const id = pendingProfileId ?? newProfileId();
        setPendingProfileId(id);
        profile = {
          id,
          name: values.newName.trim() || normalizeBaseUrl(values.newBaseUrl),
          baseUrl: normalizeBaseUrl(values.newBaseUrl),
          auth: values.auth,
          username: values.username,
          color: profiles.find((p) => p.id === id)?.color ?? nextProfileColor(profiles.length),
        };
        upsert(profile);
      } else if (profile) {
        upsert({ ...profile, username: values.username, auth: values.auth });
      }
      if (!profile) throw new Error('Choose a connection');
      // Outside the demo build, a sign-in to any real profile (including "This server") ends the demo
      // first, so the very first request is answered by IRIS and never by the mock.
      if (demoEnabled && !DEMO_BUILD) await disableDemo();
      setLastUsed(profile.id);
      await login({
        connectionId: profile.id,
        baseUrl: profile.baseUrl,
        username: values.username.trim(),
        password: values.password,
        role: values.role.trim() || undefined,
        auth: values.auth,
        persist: values.persist,
      });
      // The effect above navigates once `status` is authenticated; a second navigate() here
      // would interrupt the landing redirect for accounts that cannot use the Dashboard.
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  });

  const tryDemo = async () => {
    setError(null);
    setBusy(true);
    try {
      await enableDemo();
      setLastUsed(SAME_ORIGIN_ID);
      await login({
        connectionId: SAME_ORIGIN_ID,
        baseUrl: '',
        username: '_SYSTEM',
        password: 'SYS',
        auth: 'jwt',
      });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const selectData = [
    ...profiles.map((p) => ({
      value: p.id,
      label: p.baseUrl ? `${p.name} · ${p.baseUrl}` : `${p.name} (same origin)`,
    })),
    { value: NEW_ID, label: '+ New connection…' },
  ];

  return (
    <Box
      mih="100vh"
      style={{ background: 'linear-gradient(160deg, var(--mantine-color-indigo-light) 0%, transparent 55%)' }}
    >
      <Container size={460} py={60}>
        <Center mb="lg">
          <Stack gap={4} align="center">
            <Group gap={10}>
              <Box
                w={40}
                h={40}
                style={{
                  borderRadius: 12,
                  background:
                    'linear-gradient(135deg, var(--mantine-color-indigo-6), var(--mantine-color-cyan-5))',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Box w={16} h={16} style={{ borderRadius: '50%', border: '3px solid white' }} />
              </Box>
              <Title order={1} style={{ letterSpacing: -0.5 }}>
                {APP_NAME}
              </Title>
            </Group>
            <Text c="dimmed" size="sm">
              {APP_TAGLINE}
            </Text>
          </Stack>
        </Center>

        <Paper p="lg" radius="lg" shadow="sm">
          <form onSubmit={submit}>
            <Stack gap="sm">
              {endedReason && !error ? (
                <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
                  {endedReason}
                </Alert>
              ) : null}
              {error ? (
                <Alert
                  color="red"
                  variant="light"
                  icon={<IconAlertCircle size={16} />}
                  title="Sign-in failed"
                >
                  {error}
                </Alert>
              ) : null}

              <Select
                label="IRIS instance"
                leftSection={<IconServer size={16} />}
                data={selectData}
                allowDeselect={false}
                {...form.getInputProps('connectionId')}
                onChange={(v) => {
                  form.setFieldValue('connectionId', v ?? SAME_ORIGIN_ID);
                  const p = profiles.find((x) => x.id === v);
                  if (p) {
                    form.setFieldValue('username', p.username ?? form.values.username);
                    form.setFieldValue('auth', p.auth);
                  }
                }}
              />
              {form.values.connectionId === NEW_ID ? (
                <Group grow align="flex-start">
                  <TextInput label="Name" placeholder="Home server" {...form.getInputProps('newName')} />
                  <TextInput
                    label="Base URL"
                    placeholder="http://iris.lan:52773"
                    {...form.getInputProps('newBaseUrl')}
                    description="Origin in front of /api/admin"
                  />
                </Group>
              ) : null}

              <TextInput
                label="Username"
                autoComplete="username"
                data-autofocus
                {...form.getInputProps('username')}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                {...form.getInputProps('password')}
              />
              <TextInput
                label="Escalation role"
                placeholder="optional, e.g. %All"
                description="Sent as `role` to POST /login (IRIS 2026.2+) to escalate privileges for this session"
                {...form.getInputProps('role')}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Authentication
                </Text>
                <SegmentedControl
                  fullWidth
                  size="xs"
                  data={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'jwt', label: 'JWT (2026.2+)' },
                    { value: 'basic', label: 'Basic' },
                  ]}
                  {...form.getInputProps('auth')}
                />
                <Text size="xs" c="dimmed">
                  Auto tries <code>POST /login</code> for a JWT and falls back to HTTP Basic on older
                  versions.
                </Text>
              </Stack>

              <Checkbox
                size="xs"
                label="Keep me signed in for this browser tab"
                description="Off: credentials stay in memory only and a reload signs you out"
                {...form.getInputProps('persist', { type: 'checkbox' })}
              />

              <Button type="submit" leftSection={<IconLogin size={16} />} loading={busy} fullWidth mt="xs">
                Sign in
              </Button>

              <Divider label="or" labelPosition="center" />

              <Tooltip
                label="Runs the whole API in your browser with realistic fake data. Nothing is sent anywhere."
                multiline
                maw={300}
              >
                <Button
                  variant="light"
                  color="grape"
                  leftSection={<IconFlask size={16} />}
                  onClick={tryDemo}
                  loading={busy}
                  fullWidth
                >
                  Try the demo (no IRIS needed)
                </Button>
              </Tooltip>
              <Text size="xs" c="dimmed" ta="center">
                Demo accounts: <code>_SYSTEM</code>, <code>operator</code>, <code>auditor</code> - password{' '}
                <code>SYS</code>
              </Text>
            </Stack>
          </form>
        </Paper>

        <Text size="xs" c="dimmed" ta="center" mt="lg">
          Built on the InterSystems IRIS SysAdmin REST API v2 ·{' '}
          <Anchor
            size="xs"
            href="https://github.com/intersystems-community/sysadmin-api-specification"
            target="_blank"
            rel="noreferrer"
          >
            specification
          </Anchor>
        </Text>
      </Container>
    </Box>
  );
}
