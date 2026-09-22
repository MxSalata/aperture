import { Button, Drawer, Group, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { selectAllJobs, useJobs } from '@/stores/jobs';
import { JobCard } from './JobCard';

export function JobsDrawer() {
  const open = useJobs((s) => s.drawerOpen);
  const setOpen = useJobs((s) => s.setDrawerOpen);
  const jobs = useJobs(useShallow(selectAllJobs));
  const clearFinished = useJobs((s) => s.clearFinished);
  const navigate = useNavigate();

  return (
    <Drawer
      opened={open}
      onClose={() => setOpen(false)}
      position="right"
      size="md"
      title="Job Center"
      padding="md"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Long-running operations the API accepted with <code>202</code>. They keep running on the server;
          this list follows them.
        </Text>
        <Group justify="space-between">
          <Button size="compact-xs" variant="subtle" onClick={clearFinished} disabled={!jobs.length}>
            Clear finished
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            rightSection={<IconArrowRight size={14} />}
            onClick={() => {
              setOpen(false);
              navigate('/jobs');
            }}
          >
            All jobs on server
          </Button>
        </Group>
        {jobs.length ? (
          jobs.map((j) => <JobCard key={j.id} job={j} compact />)
        ) : (
          <Text c="dimmed" size="sm">
            No jobs in this session yet.
          </Text>
        )}
      </Stack>
    </Drawer>
  );
}
