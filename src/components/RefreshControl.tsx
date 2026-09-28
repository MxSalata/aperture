import { Button, Menu } from '@mantine/core';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { REFRESH_INTERVALS, useAutoRefresh } from '@/stores/autoRefresh';

interface Props {
  /** Names the screen, so the interval chosen for it is remembered on this device. */
  screen: string;
  onRefresh(): void;
  loading?: boolean;
  /** The interval until the user picks one; off (0) unless the screen says otherwise. */
  defaultSeconds?: number;
}

/**
 * Repeats `onRefresh` every `seconds` while the tab is visible. A hidden tab does not poll the
 * instance; when it comes back it refreshes at once and starts counting again, so what it shows is
 * never older than one interval.
 */
export function useAutoRefreshInterval(
  screen: string,
  onRefresh: () => void,
  defaultSeconds = 0,
): [number, (s: number) => void] {
  const seconds = useAutoRefresh((s) => s.intervals[screen] ?? defaultSeconds);
  const setSeconds = useAutoRefresh((s) => s.set);
  const latest = useRef(onRefresh);
  useEffect(() => {
    latest.current = onRefresh;
  });
  useEffect(() => {
    if (!seconds) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => latest.current(), seconds * 1000);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        latest.current();
        start();
      } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [seconds]);
  return [seconds, (s) => setSeconds(screen, s)];
}

/**
 * The Refresh button of a screen, joined to a menu that sets an interval for it: off by default,
 * or every 5, 15, 30 or 60 seconds, remembered per screen on this device.
 */
export function RefreshControl({ screen, onRefresh, loading, defaultSeconds }: Props) {
  const [seconds, setSeconds] = useAutoRefreshInterval(screen, onRefresh, defaultSeconds);
  return (
    <Button.Group>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconRefresh size={14} />}
        onClick={onRefresh}
        loading={loading}
      >
        Refresh
      </Button>
      <Menu shadow="md" position="bottom-end" withinPortal>
        <Menu.Target>
          <Button
            size="xs"
            variant={seconds ? 'light' : 'default'}
            rightSection={<IconChevronDown size={12} />}
            aria-label={seconds ? `Auto-refresh every ${seconds} seconds` : 'Auto-refresh off'}
          >
            {seconds ? `Every ${seconds} s` : 'Auto-refresh: off'}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Auto-refresh</Menu.Label>
          {/* The bullet marks the current choice for the eye; the name says it, as the Appearance menu does. */}
          <Menu.Item
            onClick={() => setSeconds(0)}
            aria-label={`Off${seconds ? '' : ' (current)'}`}
            rightSection={seconds ? undefined : '●'}
          >
            Off
          </Menu.Item>
          {REFRESH_INTERVALS.map((s) => (
            <Menu.Item
              key={s}
              onClick={() => setSeconds(s)}
              aria-label={`Every ${s} seconds${seconds === s ? ' (current)' : ''}`}
              rightSection={seconds === s ? '●' : undefined}
            >
              Every {s} seconds
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
}
