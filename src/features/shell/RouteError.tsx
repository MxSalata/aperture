import { Button, Code, Container, Group, Stack, Text, Title } from '@mantine/core';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <Container size="sm" py={80}>
      <Stack gap="md">
        <Title order={2}>Something went wrong</Title>
        <Text c="dimmed">
          The screen crashed while rendering. Reloading usually fixes it; if not, please open an issue with
          the details below.
        </Text>
        <Code block>{message}</Code>
        {stack ? (
          <Code block style={{ fontSize: 11, maxHeight: 260, overflow: 'auto' }}>
            {stack}
          </Code>
        ) : null}
        <Group>
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button component={Link} to="/" variant="default">
            Dashboard
          </Button>
          <Button component={Link} to="/login" variant="subtle">
            Sign in again
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
