import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <Center py={80}>
      <Stack align="center" gap="xs">
        <Title order={2}>Page not found</Title>
        <Text c="dimmed">The screen you were looking for does not exist.</Text>
        <Button component={Link} to="/" variant="light">
          Back to the dashboard
        </Button>
      </Stack>
    </Center>
  );
}
