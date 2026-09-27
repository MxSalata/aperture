import { Anchor, Badge, Grid, Group, List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { groupLabel } from '@/lib/openapi';
import { index } from '@/lib/specIndex';
import { useSession } from '@/stores/session';
import { APP_NAME } from '@/theme';
import { JsonViewer } from '@/components/JsonViewer';

export default function AboutPage() {
  const info = useSession((s) => s.info);
  const groups = Object.entries(index.groups).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHeader
        title={`About ${APP_NAME}`}
        description="A modern management portal for InterSystems IRIS, built for the InterSystems Programming Contest: Build Your Own Management Portal."
      />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="md" mb="md">
            <Title order={5} mb="xs">
              How it works
            </Title>
            <List size="sm" spacing={4}>
              <List.Item>
                Every screen talks to the <b>SysAdmin REST API</b> (<code>/api/admin</code>, spec v
                {index.version}); there is no server-side code of its own.
              </List.Item>
              <List.Item>
                Types for all {index.operations.length} operations are generated from the OpenAPI document;
                the <b>API Explorer</b> renders the rest of the spec at runtime.
              </List.Item>
              <List.Item>
                Authentication is JWT (<code>POST /login</code>, IRIS 2026.2+) with automatic refresh, or HTTP
                Basic on older versions.
              </List.Item>
              <List.Item>
                Long-running operations (202 Accepted) are followed in the <b>Job Center</b> by polling{' '}
                <code>/v2/async-result</code>.
              </List.Item>
              <List.Item>
                Navigation and actions adapt to the <b>privileges</b> reported by <code>GET /info</code>.
              </List.Item>
              <List.Item>
                Demo mode runs the whole API in the browser with Mock Service Worker - the same handlers power
                the unit and end-to-end tests.
              </List.Item>
            </List>
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
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md">
            <Paper p="md">
              <Title order={5} mb="xs">
                Links
              </Title>
              <Stack gap={4}>
                <Anchor
                  size="sm"
                  href="https://github.com/intersystems-community/sysadmin-api-specification"
                  target="_blank"
                  rel="noreferrer"
                >
                  SysAdmin API specification
                </Anchor>
                <Anchor
                  size="sm"
                  href="https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal"
                  target="_blank"
                  rel="noreferrer"
                >
                  Contest announcement
                </Anchor>
                <Anchor
                  size="sm"
                  href="https://github.com/MxSalata/aperture"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source code (MIT)
                </Anchor>
              </Stack>
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
