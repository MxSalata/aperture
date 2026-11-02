import { Anchor, Box, Group, Text } from '@mantine/core';
import { IconArrowLeft, IconFlask } from '@tabler/icons-react';
import { HOME_URL } from '@/stores/demo';
import { DEMO_BANNER_HEIGHT, homeLabel } from './demoChrome';

/**
 * The demo's banner, the top row of the header on every page while the in-browser mock answers, so it cannot
 * scroll away: what the demo is and that nothing in it is real, "About this demo" (the welcome window again) and,
 * on a build that names a home page (VITE_HOME_URL), a link back to it. A region, not a live region.
 */
export function DemoBanner({ onAbout }: { onAbout?: () => void }) {
  return (
    <Box role="region" aria-label="Demo" className="demo-banner" h={DEMO_BANNER_HEIGHT} px="md">
      <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconFlask size={16} aria-hidden style={{ flex: 'none' }} />
          <Text size="sm" fw={700} style={{ flex: 'none' }}>
            Demo
          </Text>
          <Text size="sm" truncate visibleFrom="md">
            A contained trial: made-up data from a mock IRIS in your browser. Nothing connects to a real
            server, and it all resets when you reload.
          </Text>
          <Text size="sm" truncate hiddenFrom="md">
            Made-up data, in your browser only
          </Text>
        </Group>
        <Group gap="md" wrap="nowrap" style={{ flex: 'none' }}>
          {onAbout ? (
            <Anchor component="button" type="button" size="sm" className="demo-banner-link" onClick={onAbout}>
              <Text span size="sm" visibleFrom="sm" inherit>
                About this demo
              </Text>
              <Text span size="sm" hiddenFrom="sm" inherit>
                About
              </Text>
            </Anchor>
          ) : null}
          {HOME_URL ? (
            <Anchor href={HOME_URL} size="sm" className="demo-banner-link">
              <Group gap={4} wrap="nowrap">
                <IconArrowLeft size={14} aria-hidden />
                <Text span size="sm" visibleFrom="sm" inherit>
                  Back to&nbsp;
                </Text>
                {homeLabel(HOME_URL)}
              </Group>
            </Anchor>
          ) : null}
        </Group>
      </Group>
    </Box>
  );
}
