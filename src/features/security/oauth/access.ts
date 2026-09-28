import { canUse } from '@/api/privileges';
import { isApiError } from '@/lib/errors';
import { useSession } from '@/stores/session';

/** What each of the three OAuth 2.0 tabs needs to read, and the checks they share. */
export const CLIENT = ['%Admin_OAuth2_Client:U'] as const;
export const SERVER = ['%Admin_OAuth2_Server:U'] as const;
export const REGISTRATION = ['%Admin_OAuth2_Registration:U'] as const;
export const SECURE = ['%Admin_Secure:U'] as const;

/** A deep link into the Explorer, where every OAuth 2.0 write has a form built from the schema. */
export const explorerLink = (opId: string) =>
  `/explorer/${encodeURIComponent('/v2/security')}?op=${encodeURIComponent(opId)}`;

export function useAllowed(resources: readonly string[]): boolean {
  const info = useSession((s) => s.info);
  return canUse(info, resources);
}

export const isNotFound = (e: unknown) => isApiError(e) && e.isNotFound;
