import { Anchor, Badge, Grid, Group, Kbd, List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { isReaderMissing, logsRequest } from '@/api/logs';
import { JsonViewer } from '@/components/JsonViewer';
import { KeyValueList } from '@/components/KeyValueList';
import { PageHeader } from '@/components/PageHeader';
import { isApiError } from '@/lib/errors';
import { groupLabel } from '@/lib/openapi';
import { index } from '@/lib/specIndex';
import { DEMO_BUILD, useDemo } from '@/stores/demo';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useSession } from '@/stores/session';
import { APP_NAME } from '@/theme';

const REPO = 'https://github.com/MxSalata/aperture';

/** What the log reader says about itself (GET /api/aperture/). */
interface ReaderInfo {
  version?: string;
  /** Since 1.0.5; before it, `version` was the reader's own numbering. */
  readerApiVersion?: string;
}

/** The highlights of this release; the changelog has the rest. */
const NEW_IN = '1.0.5';
const HIGHLIGHTS: ReactNode[] = [
  <>Docker Compose step by step in the README, and a compose file that comes back after a reboot.</>,
  <>
    The Docker image applies <code>IRIS_PASSWORD</code> at the container&apos;s first start only: a restart
    keeps the passwords changed in IRIS since.
  </>,
  <>Similar entries: a query only reads, and the wording index refreshes one at a time.</>,
  <>
    A Content-Security-Policy on the portal IRIS serves and on the demo, and a session IRIS revokes ends at
    once.
  </>,
  <>A lighter first load: React DOM now stays cached from one release to the next.</>,
];

const LINKS: [string, string][] = [
  ['Source code (MIT licence)', REPO],
  ['Changelog', `${REPO}/blob/main/CHANGELOG.md`],
  ['Every screen, area by area', `${REPO}/blob/main/docs/FEATURES.md`],
  ['The 20 places where the specification and IRIS disagree', `${REPO}/blob/main/docs/SPEC_FINDINGS.md`],
  ['API coverage, operation by operation', `${REPO}/blob/main/docs/COVERAGE.md`],
  ['Report an issue', `${REPO}/issues`],
  ['Aperture on Open Exchange', 'https://openexchange.intersystems.com/package/Aperture'],
  [
    'The article on the Developer Community',
    'https://community.intersystems.com/post/aperture-management-portal-intersystems-iris-no-separate-application-server',
  ],
  ['The online demo', 'https://mxsalata.github.io/aperture/'],
  ['SysAdmin API specification', 'https://github.com/intersystems-community/sysadmin-api-specification'],
  [
    'Contest announcement',
    'https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal',
  ],
];

/** A link to another site; `inline` underlines it, as a link inside running text must be. */
function External({
  href,
  size = 'sm',
  inline = false,
  children,
}: {
  href: string;
  size?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <Anchor size={size} href={href} target="_blank" rel="noreferrer" underline={inline ? 'always' : 'hover'}>
      {children}
    </Anchor>
  );
}

/** "IRIS for Health 2026.2 (Build 221U)" from the long version string GET /info answers. */
function instanceName(product: string | undefined, serverVersion: string | undefined): string {
  const name = product === 'irisforhealth' ? 'IRIS for Health' : 'InterSystems IRIS';
  const version = serverVersion?.match(/\d{4}\.\d+(?:\.\d+)?(?: \(Build [^)]+\))?/)?.[0];
  return version ? `${name} ${version}` : name;
}

/**
 * The log reader's version when this session may ask without a password prompt (a Basic session,
 * or the password given to the Messages log), otherwise where to connect it.
 */
function useReaderVersion(): ReactNode {
  const basicSession = useSession((s) => s.mode === 'basic' && !!s.basicCredentials);
  const readerPassword = useMgmntAuth((s) => !!s.basic);
  const canAsk = basicSession || readerPassword;
  const reader = useQuery({
    queryKey: ['aperture-logs', 'info'],
    queryFn: () => logsRequest<ReaderInfo>('/'),
    enabled: canAsk,
    retry: false,
    staleTime: 60_000,
  });
  if (!canAsk)
    return (
      <>
        asks for your password once, in{' '}
        <Anchor component={Link} to="/logs/messages" size="sm" underline="always">
          Logs → Messages log
        </Anchor>
      </>
    );
  if (reader.isPending) return 'checking…';
  if (reader.isError) {
    if (isReaderMissing(reader.error)) return 'not installed on this instance (the IPM package adds it)';
    if (isApiError(reader.error) && reader.error.isForbidden) return 'needs %Admin_Operate:USE';
    return isApiError(reader.error) ? reader.error.summary : 'not reachable';
  }
  const { version, readerApiVersion } = reader.data;
  // Before 1.0.5 the reader answered its own numbering as `version`.
  if (!readerApiVersion) return `installed, reader API ${version ?? 'unknown'}`;
  return `${version || 'installed'}, reader API ${readerApiVersion}`;
}

export default function AboutPage() {
  const info = useSession((s) => s.info);
  const mode = useSession((s) => s.mode);
  const demo = useDemo((s) => s.enabled);
  const reader = useReaderVersion();
  const groups = Object.entries(index.groups).sort((a, b) => b[1] - a[1]);
  const instance = instanceName(info?.product, info?.serverVersion);
  const installation = [
    { label: 'Aperture', value: __APP_VERSION__, mono: true },
    { label: 'Instance', value: demo ? `${instance}, the demo in your browser` : instance },
    {
      label: 'Signed in as',
      value: info?.username
        ? `${info.username}, with ${mode === 'jwt' ? 'a JWT' : 'HTTP Basic authentication'}`
        : '-',
    },
    {
      label: 'SysAdmin API',
      value: `specification v${index.version}, ${index.operations.length} operations`,
    },
    { label: 'Log reader', value: <Text size="sm">{reader}</Text>, span: 2 },
    {
      label: 'Served from',
      value: DEMO_BUILD ? 'GitHub Pages (the online demo)' : `${location.origin}${location.pathname}`,
      span: 2,
      mono: !DEMO_BUILD,
    },
  ];
  return (
    <>
      <PageHeader
        title={`About ${APP_NAME}`}
        description="A modern management portal for InterSystems IRIS, built for the InterSystems Programming Contest: Build Your Own Management Portal."
      />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="md">
            <Paper p="md">
              <Title order={5} mb="xs">
                What it is
              </Title>
              <Text size="sm">
                A set of static files that IRIS serves itself. Your browser calls IRIS&apos;s own
                administrative APIs signed in as you, so IRIS checks your privileges on every call and writes
                your name into its audit log. Aperture has no application server, agent or proxy of its own to
                run.
              </Text>
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                How it works
              </Title>
              <List size="sm" spacing={4}>
                <List.Item>
                  The screens talk to the <b>SysAdmin REST API</b> (<code>/api/admin</code>, specification v
                  {index.version}). The log files, which that API does not serve, are the exception: for them
                  the IPM package adds a small read-only reader in Embedded Python (<code>/api/aperture</code>
                  ), with a wording index on IRIS Vector Search behind <b>Similar entries</b>.
                </List.Item>
                <List.Item>
                  Types for all {index.operations.length} operations are generated from the OpenAPI document;
                  the <b>API Explorer</b> renders the rest of the specification at run time.
                </List.Item>
                <List.Item>
                  Sign-in is a JWT (<code>POST /login</code>) that is refreshed before it expires, or HTTP
                  Basic where JWT is switched off; a session IRIS revokes ends at once.
                </List.Item>
                <List.Item>
                  Long-running operations (<code>202 Accepted</code>) are followed in the <b>Job Center</b> by
                  polling <code>/v2/async-result</code>, and a task that has ended is never read again.
                </List.Item>
                <List.Item>
                  Navigation and actions adapt to the <b>privileges</b> <code>GET /info</code> reports.
                </List.Item>
                <List.Item>
                  The <b>Health check</b> runs sixteen read-only checks with your own access; every finding
                  shows its evidence and opens the screen that fixes it.
                </List.Item>
                <List.Item>
                  Demo mode runs the whole API in the browser with Mock Service Worker; the same handlers
                  power the unit and end-to-end tests.
                </List.Item>
              </List>
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                New in {NEW_IN}
              </Title>
              <List size="sm" spacing={4} mb="xs">
                {HIGHLIGHTS.map((h, i) => (
                  <List.Item key={i}>{h}</List.Item>
                ))}
              </List>
              <External href={`${REPO}/blob/main/CHANGELOG.md`}>
                Everything that changed, release by release
              </External>
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                API coverage
              </Title>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                {groups.map(([g, n]) => (
                  <Group key={g} gap={6} justify="space-between">
                    <Text size="sm">{groupLabel(g)}</Text>
                    <Badge size="xs" variant="light" color="gray">
                      {n}
                    </Badge>
                  </Group>
                ))}
              </SimpleGrid>
            </Paper>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md">
            <Paper p="md">
              <Title order={5} mb="sm">
                This installation
              </Title>
              <KeyValueList items={installation} />
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                Keyboard
              </Title>
              <List size="sm" spacing={6}>
                <List.Item>
                  <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> (<Kbd>⌘</Kbd> + <Kbd>K</Kbd> on a Mac) or <Kbd>/</Kbd> opens
                  the command palette: every screen and action by name.
                </List.Item>
                <List.Item>
                  <Kbd>Alt</Kbd> + <Kbd>↑</Kbd> or <Kbd>↓</Kbd> moves the focused entry of the navigation, and{' '}
                  <Kbd>Alt</Kbd> + <Kbd>Shift</Kbd> + <Kbd>↑</Kbd> or <Kbd>↓</Kbd> its whole group; the same
                  keys order the dashboard&apos;s charts in Choose charts.
                </List.Item>
                <List.Item>
                  <Kbd>Esc</Kbd> closes a dialog or a drawer.
                </List.Item>
              </List>
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                Privacy
              </Title>
              <Text size="sm">
                Aperture talks to the IRIS you sign in to and to nothing else: no analytics, no fonts, scripts
                or images from other sites, no AI model. Your tokens stay in this browser tab and end with it.
              </Text>
            </Paper>
            <Paper p="md">
              <Title order={5} mb="xs">
                Links
              </Title>
              <Stack gap={4}>
                {LINKS.map(([label, href]) => (
                  <External key={href} href={href}>
                    {label}
                  </External>
                ))}
              </Stack>
              <Text size="xs" c="dimmed" mt="sm">
                Built with React, Mantine, TanStack Query and Table, openapi-typescript and openapi-fetch,
                Recharts, zustand, dayjs, Mock Service Worker and Vite. It implements two Ideas Portal ideas,{' '}
                <External size="xs" inline href="https://ideas.intersystems.com/ideas/DPI-I-813">
                  DPI-I-813
                </External>{' '}
                and{' '}
                <External size="xs" inline href="https://ideas.intersystems.com/ideas/DPI-I-966">
                  DPI-I-966
                </External>
                .
              </Text>
            </Paper>
            <Paper p="md">
              <JsonViewer value={info} title="GET /info" maxHeight={420} />
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}
