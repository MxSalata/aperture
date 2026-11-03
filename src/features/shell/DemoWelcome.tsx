import { Anchor, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { IconFlask } from '@tabler/icons-react';
import { HOME_URL } from '@/stores/demo';
import { homeLabel, markWelcomeSeen } from './demoChrome';

/**
 * The demo's welcome: once per device when the demo first opens, and again from the banner's "About this demo".
 * It says what Aperture is, that the instance behind it is a mock with made-up data, and that nothing leaves the
 * browser, so a first look is never mistaken for a real server.
 */
export function DemoWelcome({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const close = () => {
    markWelcomeSeen();
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      centered
      size="lg"
      title={
        <Group gap={8} wrap="nowrap">
          <IconFlask size={18} aria-hidden />
          <Text fw={700}>Welcome to Aperture&apos;s demo</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Text>
          Aperture is a management portal for InterSystems IRIS. This demo is a contained trial: a mock IRIS
          instance runs inside your browser, so every namespace, database, user, process and message you see
          is made up.
        </Text>
        <List spacing={6} size="sm">
          <List.Item>
            Nothing connects to a real server, and nothing you do leaves this browser tab.
          </List.Item>
          <List.Item>
            Changes work as they would on a real instance: edit a user, run SQL or start a job, and the
            screens follow.
          </List.Item>
          <List.Item>Reload the page and everything starts again from the same made-up instance.</List.Item>
        </List>
        <Text size="sm" c="dimmed">
          Good places to start: the dashboard, the health check, and editing a user to see who loses what.
        </Text>
        <Group gap="sm" justify="flex-end">
          {HOME_URL ? (
            <Anchor href={HOME_URL} size="sm" onClick={markWelcomeSeen}>
              Back to {homeLabel(HOME_URL)}
            </Anchor>
          ) : null}
          <Button color="grape" onClick={close} data-autofocus>
            Start exploring
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
