import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { api, result } from '@/api/client';
import { canUse } from '@/api/privileges';
import { formatOffset, offsetFromWallClock, setMeasuredOffset } from '@/lib/format';
import { safeSessionStorage } from '@/stores/storage';
import { useSession } from '@/stores/session';

/**
 * The instance's UTC offset, measured, for a connection that names no time zone. IRIS reports its
 * wall clock without a zone, and a browser elsewhere read it in its own zone: five hours wrong
 * for a London instance seen from New York ("finished in 5 hours" for a task that ran minutes
 * ago). `LastUpdate` of /v2/monitor/system-usage is the instance's clock at this moment, so the
 * difference to this browser's clock is the instance's offset now (re-measured every 30 minutes,
 * which also follows a daylight-saving change). Needs %Admin_Operate; without it, or with a
 * reading too stale to trust, the browser's zone remains the assumption.
 *
 * When the offsets differ, the operator is told once per session and connection: a named zone
 * also gets times across a daylight-saving change right, which a measured offset cannot.
 */
export function useInstanceClock(zone: string | null | undefined): void {
  const info = useSession((s) => s.info);
  const connectionId = useSession((s) => s.connectionId);
  const clock = useQuery({
    queryKey: ['instance-clock', connectionId],
    enabled: !zone && !!info && canUse(info, ['%Admin_Operate:U']),
    queryFn: async () =>
      offsetFromWallClock((await result(api().GET('/v2/monitor/system-usage'))).LastUpdate),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
  const offset = zone ? null : (clock.data ?? null);
  // Set while rendering, like the named zone, so the page below parses with it on its first render;
  // cleared with the session (resetInstanceState).
  setMeasuredOffset(offset);

  useEffect(() => {
    if (offset === null) return;
    const browser = -new Date().getTimezoneOffset();
    if (offset === browser) return;
    const key = `aperture.clockNotice.${connectionId ?? ''}`;
    try {
      if (safeSessionStorage.getItem(key)) return;
      safeSessionStorage.setItem(key, '1');
    } catch {
      /* no storage: tell every time */
    }
    notifications.show({
      title: "The instance's clock is not this browser's",
      message: `It runs at ${formatOffset(offset)}, this browser at ${formatOffset(browser)}. Times are read at the instance's offset; name its time zone under Settings → Connections to keep them exact across daylight-saving changes.`,
      color: 'blue',
      autoClose: 15_000,
    });
  }, [offset, connectionId]);
}
