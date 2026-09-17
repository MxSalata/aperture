import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Group,
  Indicator,
  Kbd,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { spotlight } from '@mantine/spotlight';
import { IconClipboardList, IconLogout, IconMoon, IconSearch, IconServer, IconSun, IconUserCircle, IconShieldCheck, IconFlask } from '@tabler/icons-react';
import { Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { NAV } from './nav';
import { CommandPalette } from './CommandPalette';
import { useSession } from '@/stores/session';
import { useConnections } from '@/stores/connections';
import { useDemo } from '@/stores/demo';
import { useHealth } from '@/stores/health';
import { selectActiveJobs, useJobs } from '@/stores/jobs';
import { canUse, heldPrivileges } from '@/api/privileges';
import { APP_NAME } from '@/theme';
import { PageSkeleton } from '@/components/PageSkeleton';
import { JobsDrawer } from '@/features/jobs/JobsDrawer';
import { JobPoller } from '@/features/jobs/JobPoller';

function Logo() {
  return (
    <Group gap={8} wrap="nowrap">
      <Box
        w={28}
        h={28}
        style={{
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--mantine-color-indigo-6), var(--mantine-color-cyan-5))',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box w={12} h={12} style={{ borderRadius: '50%', border: '2.5px solid white' }} />
      </Box>
      <Text fw={700} fz="lg" style={{ letterSpacing: -0.3 }}>
        {APP_NAME}
      </Text>
    </Group>
  );
}

function ServerChip() {
  const info = useSession((s) => s.info);
  const connectionId = useSession((s) => s.connectionId);
  const baseUrl = useSession((s) => s.baseUrl);
  const profiles = useConnections((s) => s.profiles);
  const demo = useDemo((s) => s.enabled);
  const reachable = useHealth((s) => s.reachable);
  const lastError = useHealth((s) => s.lastError);
  const profile = profiles.find((p) => p.id === connectionId);
  const version = info?.serverVersion?.match(/\d{4}\.\d+(?:\.\d+)?/)?.[0];
  const product = info?.product === 'irisforhealth' ? 'IRIS for Health' : info?.product === 'healthconnect' ? 'Health Connect' : 'IRIS';
  return (
    <Tooltip label={info?.serverVersion ?? baseUrl} multiline maw={420}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <IconServer size={16} stroke={1.6} />
        <Text size="sm" fw={500} truncate>
          {demo ? 'Demo instance' : (profile?.name ?? baseUrl ?? 'This server')}
        </Text>
        {version ? (
          <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
            {product} {version}
          </Badge>
        ) : null}
        {info?.systemMode ? (
          <Badge size="xs" variant="outline" color={info.systemMode === 'LIVE' ? 'red' : 'gray'} style={{ textTransform: 'none' }}>
            {info.systemMode}
          </Badge>
        ) : null}
        {demo ? (
          <Badge size="xs" variant="filled" color="grape" leftSection={<IconFlask size={10} />}>
            DEMO
          </Badge>
        ) : reachable ? (
          <Badge size="xs" variant="dot" color="teal" title="The last request to the instance succeeded">
            LIVE
          </Badge>
        ) : (
          <Badge size="xs" variant="filled" color="red" title={lastError ?? 'The instance cannot be reached'}>
            OFFLINE
          </Badge>
        )}
      </Group>
    </Tooltip>
  );
}

function UserMenu() {
  const username = useSession((s) => s.username);
  const role = useSession((s) => s.role);
  const mode = useSession((s) => s.mode);
  const info = useSession((s) => s.info);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const held = heldPrivileges(info);
  return (
    <Menu shadow="md" width={300} position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label="Account menu">
          <Group gap={6} wrap="nowrap">
            <IconUserCircle size={22} stroke={1.5} />
            <Text size="sm" fw={500} visibleFrom="sm">
              {username}
            </Text>
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          Signed in as <b>{username}</b> via {mode === 'jwt' ? 'JWT bearer token' : 'Basic auth'}
          {role ? ` · escalated to ${role}` : ''}
        </Menu.Label>
        <Menu.Label>
          <Group gap={4}>
            <IconShieldCheck size={14} />
            Privileges
          </Group>
        </Menu.Label>
        <Box px="sm" pb="xs">
          <Group gap={4} wrap="wrap">
            {held.length ? (
              held.map((p) => (
                <Badge key={p} size="xs" variant="light" color="teal" style={{ textTransform: 'none' }}>
                  {p}
                </Badge>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                none reported
              </Text>
            )}
          </Group>
        </Box>
        <Menu.Divider />
        <Menu.Item leftSection={<IconServer size={16} />} onClick={() => navigate('/settings/connections')}>
          Connections
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={16} />}
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  return (
    <Tooltip label={computed === 'dark' ? 'Light mode' : 'Dark mode'}>
      <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')} aria-label="Toggle color scheme">
        {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

function JobsButton() {
  const active = useJobs(useShallow(selectActiveJobs));
  const setOpen = useJobs((s) => s.setDrawerOpen);
  return (
    <Tooltip label={active.length ? `${active.length} running job${active.length === 1 ? '' : 's'}` : 'Job Center'}>
      <Indicator disabled={!active.length} processing color="indigo" size={8} offset={4}>
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setOpen(true)} aria-label="Open Job Center">
          <IconClipboardList size={18} />
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const info = useSession((s) => s.info);
  const location = useLocation();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 250, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Toggle navigation" />
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Logo />
            </Link>
            <Box visibleFrom="sm" style={{ minWidth: 0 }}>
              <ServerChip />
            </Box>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Command palette">
              <UnstyledButton onClick={() => spotlight.open()} aria-label="Open command palette" visibleFrom="sm">
                <Group gap={6} px="sm" py={4} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
                  <IconSearch size={14} />
                  <Text size="xs" c="dimmed">
                    Search
                  </Text>
                  <Kbd size="xs">⌘K</Kbd>
                </Group>
              </UnstyledButton>
            </Tooltip>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => spotlight.open()} hiddenFrom="sm" aria-label="Search">
              <IconSearch size={18} />
            </ActionIcon>
            <JobsButton />
            <ThemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea type="auto" style={{ flex: 1 }}>
          <Stack gap="md">
            {NAV.map((section) => {
              const items = section.items.filter((i) => canUse(info, i.privileges));
              if (!items.length) return null;
              return (
                <Stack key={section.label} gap={2}>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="sm" style={{ letterSpacing: 0.5 }}>
                    {section.label}
                  </Text>
                  {items.map((item) => {
                    const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        component={Link}
                        to={item.to}
                        label={item.label}
                        leftSection={<item.icon size={18} stroke={1.6} />}
                        active={active}
                        onClick={close}
                        style={{ borderRadius: 8 }}
                      />
                    );
                  })}
                </Stack>
              );
            })}
          </Stack>
        </ScrollArea>
        <Box hiddenFrom="sm" pt="xs">
          <ServerChip />
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </AppShell.Main>

      <CommandPalette />
      <JobsDrawer />
      <JobPoller />
    </AppShell>
  );
}
