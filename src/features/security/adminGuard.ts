import { api, result } from '@/api/client';

/**
 * Who can still administer security after a change. A change that leaves no enabled account
 * holding %All or %Admin_Secure:U locks everyone out of users, roles and resources, through this
 * portal and the Management Portal alike; the screens that edit users and roles ask here first.
 *
 * An account administers security when it is enabled and one of its own roles (escalation roles
 * do not count: they need a separate sign-in) is %All, grants %Admin_Secure with U, or grants such
 * a role, at any depth. If %Admin_Secure is public with U, everyone holds it and nothing locks out.
 * Role and user names are compared without case, as IRIS compares them.
 */
export interface RoleFacts {
  resources: { Name?: string; Permissions?: string }[];
  granted: string[];
}

export interface AdminModel {
  /** Every role, by lower-case name. */
  roles: Record<string, RoleFacts>;
  /** For each role that confers security administration: the users holding it directly (lower case). */
  holders: Record<string, string[]>;
  /** Every user's Enabled, by lower-case name. */
  enabled: Record<string, boolean>;
  /** %Admin_Secure is public with U: every account holds it. */
  publicSecure: boolean;
}

export type AdminChange =
  | { kind: 'user-edit'; user: string; roles: string[]; enabled: boolean }
  | { kind: 'user-delete'; user: string }
  | { kind: 'role-edit'; role: string; resources: RoleFacts['resources']; granted: string[] }
  | { kind: 'role-delete'; role: string };

const lc = (s: string) => s.toLowerCase();

function grantsSecure(f: RoleFacts): boolean {
  return f.resources.some((r) => lc(r.Name ?? '') === '%admin_secure' && /u/i.test(r.Permissions ?? ''));
}

/** Roles that confer security administration: %All, %Admin_Secure:U, or a granted role that does. */
export function adminRoles(roles: Record<string, RoleFacts>): Set<string> {
  const admin = new Set<string>();
  for (const [name, f] of Object.entries(roles)) if (name === '%all' || grantsSecure(f)) admin.add(name);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, f] of Object.entries(roles))
      if (!admin.has(name) && f.granted.some((g) => admin.has(lc(g)))) {
        admin.add(name);
        grew = true;
      }
  }
  return admin;
}

/** Enabled users who hold a role conferring security administration as one of their own roles. */
export function securityAdmins(model: AdminModel): Set<string> {
  const out = new Set<string>();
  for (const role of adminRoles(model.roles))
    for (const user of model.holders[role] ?? []) if (model.enabled[user]) out.add(user);
  return out;
}

/** The model as it would be after the change. */
export function applyChange(model: AdminModel, change: AdminChange): AdminModel {
  const roles = structuredClone(model.roles);
  const holders = structuredClone(model.holders);
  const enabled = { ...model.enabled };
  if (change.kind === 'user-edit' || change.kind === 'user-delete') {
    const user = lc(change.user);
    for (const r of Object.keys(holders)) holders[r] = holders[r].filter((u) => u !== user);
    if (change.kind === 'user-edit') {
      for (const r of change.roles.map(lc)) (holders[r] ??= []).push(user);
      enabled[user] = change.enabled;
    } else enabled[user] = false;
  } else if (change.kind === 'role-edit') {
    roles[lc(change.role)] = { resources: change.resources, granted: change.granted };
  } else {
    const role = lc(change.role);
    delete roles[role];
    delete holders[role];
    for (const f of Object.values(roles)) f.granted = f.granted.filter((g) => lc(g) !== role);
  }
  return { ...model, roles, holders, enabled };
}

export interface AdminVerdict {
  before: string[];
  after: string[];
  /** The change leaves nobody able to administer security. */
  locksOut: boolean;
}

export function judge(model: AdminModel, change: AdminChange): AdminVerdict {
  if (model.publicSecure) return { before: ['everyone'], after: ['everyone'], locksOut: false };
  const before = [...securityAdmins(model)].sort();
  const after = [...securityAdmins(applyChange(model, change))].sort();
  return { before, after, locksOut: before.length > 0 && after.length === 0 };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Read what the verdict needs: every role (for its grants), the direct holders of the roles that
 * confer security administration, every user's Enabled, and whether %Admin_Secure is public.
 */
export async function loadAdminModel(): Promise<AdminModel> {
  const list = (await result(api().GET('/v2/security/roles'))) ?? [];
  const names = list.map((r) => r.Name ?? '').filter(Boolean);
  const details = await mapLimit(names, 8, (name) =>
    result(api().GET('/v2/security/role', { params: { query: { name } } })),
  );
  const roles: Record<string, RoleFacts> = {};
  names.forEach((name, i) => {
    const d = details[i] ?? {};
    roles[lc(name)] = {
      resources: (d.Resources ?? []) as RoleFacts['resources'],
      granted: (d.GrantedRoles ?? []).map(String),
    };
  });
  const admin = [...adminRoles(roles)];
  const owners = await mapLimit(admin, 8, (name) =>
    result(api().GET('/v2/security/role/owners', { params: { query: { name } } })),
  );
  const holders: Record<string, string[]> = {};
  admin.forEach((role, i) => {
    holders[role] = ((owners[i] ?? []) as { Name?: string; Type?: string }[])
      .filter((o) => o.Type === 'User')
      .map((o) => lc(o.Name ?? ''));
  });
  const users = (await result(api().GET('/v2/security/users'))) ?? [];
  const enabled: Record<string, boolean> = {};
  for (const u of users) enabled[lc(u.Name ?? '')] = u.Enabled === true;
  const secure = await result(
    api().GET('/v2/security/resource', { params: { query: { name: '%Admin_Secure' } } }),
  );
  return { roles, holders, enabled, publicSecure: /u/i.test(secure?.PublicPermission ?? '') };
}
