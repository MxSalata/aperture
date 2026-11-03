import { ActionIcon, Box, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle, IconTestPipe } from '@tabler/icons-react';
import { HOME_URL } from '@/stores/demo';
import { homeLabel } from './demoChrome';

/**
 * The demo's banner, the top row of the header on every page while the in-browser mock answers, so it cannot
 * scroll away. It follows Shutter's trial banner: "Demo environment", whose data it is and that nothing leaves, an
 * info button for the welcome window again and, on a build that names a home page (VITE_HOME_URL), a button back to
 * it. The striped edge marks it as apart from the app on any theme. A region, not a live region.
 */
export function DemoBanner({ onAbout }: { onAbout?: () => void }) {
  return (
    <Box role="region" aria-label="Demo environment" className="demo-banner" px="md">
      <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconTestPipe size={18} aria-hidden style={{ flex: 'none' }} />
          <Text size="sm" fw={700} style={{ flex: 'none' }}>
            Demo environment
          </Text>
          <Text size="sm" truncate visibleFrom="sm">
            · Made-up IRIS data: nothing leaves this browser
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
          {onAbout ? (
            <Tooltip label="About this demo">
              <ActionIcon
                variant="subtle"
                color="grape"
                size="md"
                aria-label="About this demo"
                onClick={onAbout}
                className="demo-banner-control"
              >
                <IconInfoCircle size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
          ) : null}
          {HOME_URL ? (
            <Button
              component="a"
              href={HOME_URL}
              variant="subtle"
              color="grape"
              size="compact-sm"
              leftSection={<IconArrowLeft size={14} aria-hidden />}
              className="demo-banner-control"
            >
              <Text span inherit visibleFrom="sm">
                Back to&nbsp;
              </Text>
              {homeLabel(HOME_URL)}
            </Button>
          ) : null}
        </Group>
      </Group>
    </Box>
  );
}
