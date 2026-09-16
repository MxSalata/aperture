import type { Info, PrivilegeKey } from './types';

/**
 * Operation summaries in the spec start with the required resource, e.g.
 * `(%Admin_Secure:U)` or `(%Admin_Manage:U or %Admin_Operate:U)`.
 * `GET /info` reports the caller's permissions keyed by the resource suffix
 * (`Secure`, `Manage`, `Operate`, …). This module bridges the two.
 */
export const PRIVILEGE_LABELS: Record<string, string> = {
  Operate: '%Admin_Operate',
  Manage: '%Admin_Manage',
  Secure: '%Admin_Secure',
  Task: '%Admin_Task',
  Journal: '%Admin_Journal',
  Wallet: '%Admin_Wallet',
  OAuth2_Client: '%Admin_OAuth2_Client',
  OAuth2_Server: '%Admin_OAuth2_Server',
  OAuth2_Registration: '%Admin_OAuth2_Registration',
  ExternalLanguageServerEdit: '%Admin_ExternalLanguageServerEdit',
  FileSystemAccess: '%Admin_FileSystemAccess',
  ConfigStore: '%Admin_ConfigStore',
};

/** `%Admin_Secure:U` → `Secure`. */
export function privilegeKey(resource: string): PrivilegeKey | null {
  const m = resource.match(/^%Admin_([A-Za-z0-9_]+)(?::[A-Z]+)?$/);
  return m ? (m[1] as PrivilegeKey) : null;
}

export type PrivilegeCheck = 'granted' | 'denied' | 'unknown';

/**
 * Does the logged-in user hold at least one of the given resources?
 * Returns `unknown` when the server did not report the resource at all
 * (older IRIS versions omit newer keys), in which case the UI stays optimistic.
 */
export function checkPrivileges(info: Info | null | undefined, resources: readonly string[]): PrivilegeCheck {
  if (!resources.length) return 'granted';
  if (!info?.privileges) return 'unknown';
  let sawKnown = false;
  for (const r of resources) {
    const key = privilegeKey(r);
    if (!key) continue;
    const entry = info.privileges[key];
    if (entry === undefined) continue;
    sawKnown = true;
    if (entry.use) return 'granted';
  }
  return sawKnown ? 'denied' : 'unknown';
}

export function canUse(info: Info | null | undefined, resources: readonly string[]): boolean {
  return checkPrivileges(info, resources) !== 'denied';
}

/** All resources the user holds, for the profile menu. */
export function heldPrivileges(info: Info | null | undefined): string[] {
  if (!info?.privileges) return [];
  return Object.entries(info.privileges)
    .filter(([, v]) => v?.use)
    .map(([k]) => PRIVILEGE_LABELS[k] ?? `%Admin_${k}`);
}
