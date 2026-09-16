import { Paper, Text } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';

export default function ComingSoon({ title = 'Coming soon' }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Paper p="md">
        <Text c="dimmed">This screen is being built.</Text>
      </Paper>
    </>
  );
}
