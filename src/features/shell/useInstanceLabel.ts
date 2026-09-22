import { useConnections, profileColor } from '@/stores/connections';
import { useDemo } from '@/stores/demo';
import { useSession } from '@/stores/session';

/** Name, colour and LIVE flag of the connected instance, for the header and the document title. */
export function useInstanceLabel(): { name: string; color: string; live: boolean; timezone: string | null } {
  const connectionId = useSession((s) => s.connectionId);
  const baseUrl = useSession((s) => s.baseUrl);
  const systemMode = useSession((s) => s.info?.systemMode);
  const profiles = useConnections((s) => s.profiles);
  const demo = useDemo((s) => s.enabled);
  const profile = profiles.find((p) => p.id === connectionId);
  if (demo) return { name: 'Demo instance', color: 'grape', live: false, timezone: null };
  return {
    name: profile?.name ?? (baseUrl || 'This server'),
    color: profileColor(profile),
    live: systemMode === 'LIVE',
    timezone: profile?.timezone ?? null,
  };
}
