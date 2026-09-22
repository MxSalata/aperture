import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  ColorSwatch,
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
import {
  IconClipboardList,
  IconContrast,
  IconDeviceDesktop,
  IconLogout,
  IconMoon,
  IconSearch,
  IconServer,
  IconSun,
  IconUserCircle,
  IconShieldCheck,
  IconFlask,
} from '@tabler/icons-react';
import { Suspense, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { NAV } from './nav';
import { CommandPalette } from './CommandPalette';
import { useSession } from '@/stores/session';
import { useDemo } from '@/stores/demo';
import { useHealth } from '@/stores/health';
import { selectActiveJobs, useJobs } from '@/stores/jobs';
import { canUse, heldPrivileges } from '@/api/privileges';
import { APP_NAME } from '@/theme';
import { PageSkeleton } from '@/components/PageSkeleton';
import { setInstanceTimezone } from '@/lib/format';
import { useInstanceLabel } from './useInstanceLabel';
import { useAppearance, type ContrastSetting } from '@/stores/appearance';
import { useResolvedContrast } from './useApplyAppearance';
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
  const baseUrl = useSession((s) => s.baseUrl);
  const demo = useDemo((s) => s.enabled);
  const reachable = useHealth((s) => s.reachable);
  const lastError = useHealth((s) => s.lastError);
  const instance = useInstanceLabel();
  const version = info?.serverVersion?.match(/\d{4}\.\d+(?:\.\d+)?/)?.[0];
  const product =
    info?.product === 'irisforhealth'
      ? 'IRIS for Health'
      : info?.product === 'healthconnect'
        ? 'Health Connect'
        : 'IRIS';
  const zoneNote = instance.timezone
    ? `times shown in ${instance.timezone}`
    : 'times shown as the instance reports them';
  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      <ColorSwatch color={`var(--mantine-color-${instance.color}-6)`} size={10} aria-hidden />
      <IconServer size={16} stroke={1.6} />
      <Tooltip label={`${info?.serverVersion ?? baseUrl ?? 'this server'} · ${zoneNote}`} multiline maw={420}>
        <Text size="sm" fw={500} truncate tabIndex={0} style={{ outlineOffset: 2 }}>
          {instance.name}
        </Text>
      </Tooltip>
      {version ? (
        <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
          {product} {version}
        </Badge>
      ) : null}
      {info?.systemMode ? (
        <Badge
          size="xs"
          variant="outline"
          color={info.systemMode === 'LIVE' ? 'red' : 'gray'}
          style={{ textTransform: 'none' }}
        >
          {info.systemMode}
        </Badge>
      ) : null}
      {demo ? (
        <Badge size="xs" variant="filled" color="grape" leftSection={<IconFlask size={10} />}>
          DEMO
        </Badge>
      ) : reachable ? (
        <Tooltip label="The last request to the instance succeeded">
          <Badge size="xs" variant="dot" color="teal" tabIndex={0} aria-label="Instance reachable">
            LIVE
          </Badge>
        </Tooltip>
      ) : (
        <Tooltip label={lastError ?? 'The instance cannot be reached'}>
          <Badge size="xs" variant="filled" color="red" tabIndex={0} aria-label="Instance unreachable">
            OFFLINE
          </Badge>
        </Tooltip>
      )}
    </Group>
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

/** Light / Dark / System (a way back to following the OS) and the independent contrast axis. */
function AppearanceMenu() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  const contrast = useAppearance((s) => s.contrast);
  const setContrast = useAppearance((s) => s.setContrast);
  const resolved = useResolvedContrast();
  const schemes = [
    { value: 'light', label: 'Light', icon: <IconSun size={16} /> },
    { value: 'dark', label: 'Dark', icon: <IconMoon size={16} /> },
    { value: 'auto', label: 'System', icon: <IconDeviceDesktop size={16} /> },
  ] as const;
  const contrasts: { value: ContrastSetting; label: string }[] = [
    { value: 'auto', label: 'System' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
  ];
  return (
    <Menu shadow="md" width={220} position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label="Appearance">
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Appearance">
            {resolved === 'high' ? (
              <IconContrast size={18} />
            ) : computed === 'dark' ? (
              <IconSun size={18} />
            ) : (
              <IconMoon size={18} />
            )}
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Theme</Menu.Label>
        {schemes.map((s) => (
          <Menu.Item
            key={s.value}
            leftSection={s.icon}
            onClick={() => setColorScheme(s.value)}
            aria-label={`${s.label}${colorScheme === s.value ? ' (current theme)' : ''}`}
            rightSection={colorScheme === s.value ? '●' : undefined}
          >
            {s.label}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Label>Contrast</Menu.Label>
        {contrasts.map((c) => (
          <Menu.Item
            key={c.value}
            leftSection={<IconContrast size={16} />}
            onClick={() => setContrast(c.value)}
            aria-label={`${c.label}${contrast === c.value ? ' (current contrast)' : ''}`}
            rightSection={contrast === c.value ? '●' : undefined}
          >
            {c.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function JobsButton() {
  const active = useJobs(useShallow(selectActiveJobs));
  const setOpen = useJobs((s) => s.setDrawerOpen);
  return (
    <Tooltip
      label={active.length ? `${active.length} running job${active.length === 1 ? '' : 's'}` : 'Job Center'}
    >
      <Indicator disabled={!active.length} processing color="indigo" size={8} offset={4}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          onClick={() => setOpen(true)}
          aria-label="Open Job Center"
        >
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
  const instance = useInstanceLabel();

  // Timestamps are parsed in the instance's zone once the profile names one. Set while
  // rendering, before the page below renders its first timestamp (an effect runs after the
  // children have already rendered in the browser's zone); idempotent, so safe to repeat.
  setInstanceTimezone(instance.timezone);
  useEffect(() => () => setInstanceTimezone(null), []);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 250, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header style={{ boxShadow: `inset 0 3px 0 0 var(--mantine-color-${instance.color}-6)` }}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="md"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Logo />
            </Link>
            <Box visibleFrom="sm" style={{ minWidth: 0 }}>
              <ServerChip />
            </Box>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Command palette">
              <UnstyledButton
                onClick={() => spotlight.open()}
                aria-label="Open command palette"
                visibleFrom="sm"
              >
                <Group
                  gap={6}
                  px="sm"
                  py={4}
                  style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
                >
                  <IconSearch size={14} />
                  <Text size="xs" c="dimmed">
                    Search
                  </Text>
                  <Kbd size="xs">⌘K</Kbd>
                </Group>
              </UnstyledButton>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => spotlight.open()}
              hiddenFrom="sm"
              aria-label="Search"
            >
              <IconSearch size={18} />
            </ActionIcon>
            <JobsButton />
            <AppearanceMenu />
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
                    // By path segment: /security/users is not active on /security/users-audit.
                    const active =
                      item.to === '/'
                        ? location.pathname === '/'
                        : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
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
