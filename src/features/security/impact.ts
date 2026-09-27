import { api, result } from '@/api/client';
import { mapLimit } from '@/lib/limiter';
import { applyChange, type AdminChange, type AdminModel, type RoleFacts } from './adminGuard';

/**
 * Who loses what: for a change to a role or to a user's roles, the privileges (resource and
 * permission, such as %DB_USER:W) each affected account holds before and after. An account holds
 * the union of its own roles, the roles they grant at any depth, and every resource's public
 * permission; %All holds everything. So a privilege the role drops is lost only by an account that
 * does not also hold it another way. Escalation roles do not count (they need a separate sign-in),
 * and disabled accounts are left out (they cannot sign in).
 */
export interface Privileges {
  all: boolean;
  /** Letters (R, W, U) held per resource, by lower-case name. */
  perms: Map<string, Set<string>>;
}

export interface UserImpact {
  user: string;
  lost: string[];
  gained: string[];
}

export interface ImpactReport {
  /** Accounts whose privileges change, by name. */
  changes: UserImpact[];
  /** Enabled accounts that hold the role or the edited user: all of them were checked unless `more`. */
  checked: number;
  /** Accounts beyond the ones checked (the preview reads at most MAX_USERS accounts). */
  more: number;
}

export const MAX_USERS = 50;

const lc = (s: string) => s.toLowerCase();
const LETTERS = ['R', 'W', 'U'];

/** Roles reachable from `held` through grants, the held ones included (lower case). */
function closure(roles: Record<string, RoleFacts>, held: string[]): Set<string> {
  const out = new Set<string>();
  const stack = held.map(lc);
  while (stack.length) {
    const r = stack.pop()!;
    if (out.has(r)) continue;
    out.add(r);
    for (const g of roles[r]?.granted ?? []) stack.push(lc(g));
  }
  return out;
}

export function privilegesOf(
  roles: Record<string, RoleFacts>,
  held: string[],
  publicPerms: Record<string, string>,
): Privileges {
  const perms = new Map<string, Set<string>>();
  const add = (resource: string, letters: string) => {
    const key = lc(resource);
    const set = perms.get(key) ?? new Set<string>();
    for (const l of letters.toUpperCase()) if (LETTERS.includes(l)) set.add(l);
    if (set.size) perms.set(key, set);
  };
  for (const [resource, letters] of Object.entries(publicPerms)) add(resource, letters);
  const reach = closure(roles, held);
  for (const r of reach)
    for (const res of roles[r]?.resources ?? []) add(res.Name ?? '', res.Permissions ?? '');
  return { all: reach.has('%all'), perms };
}

/** Privileges in `a` that `b` does not hold, as `Resource:Letters` with the resource as IRIS spells it. */
function minus(a: Privileges, b: Privileges, names: Map<string, string>): string[] {
  if (b.all) return [];
  if (a.all) return ['%All (every privilege)'];
  const out: string[] = [];
  for (const [res, letters] of a.perms) {
    const missing = LETTERS.filter((l) => letters.has(l) && !b.perms.get(res)?.has(l));
    if (missing.length) out.push(`${names.get(res) ?? res}:${missing.join('')}`);
  }
  return out.sort();
}

export function diffPrivileges(
  before: Privileges,
  after: Privileges,
  names: Map<string, string>,
): { lost: string[]; gained: string[] } {
  return { lost: minus(before, after, names), gained: minus(after, before, names) };
}

/** Roles that reach `role` through grants, `role` included (lower case). */
export function rolesReaching(roles: Record<string, RoleFacts>, role: string): string[] {
  const target = lc(role);
  return Object.keys(roles).filter((r) => closure(roles, [r]).has(target));
}

/** The spelling IRIS uses for each resource, for display. */
function resourceNames(
  model: AdminModel,
  publicPerms: Record<string, string>,
  extra: RoleFacts[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const r of Object.keys(publicPerms)) names.set(lc(r), r);
  for (const f of [...Object.values(model.roles), ...extra])
    for (const res of f.resources) if (res.Name) names.set(lc(res.Name), res.Name);
  return names;
}

/**
 * Read what the preview needs and compute it. `model` is the admin model the guard already read
 * (every role with its resources and grants, every user's Enabled). A user deletion has no preview:
 * the account goes, with everything it held.
 */
export async function loadImpact(model: AdminModel, change: AdminChange): Promise<ImpactReport | null> {
  if (change.kind === 'user-delete') return null;
  const resources = (await result(api().GET('/v2/security/resources'))) ?? [];
  const publicPerms: Record<string, string> = {};
  for (const r of resources) if (r.Name && r.PublicPermission) publicPerms[r.Name] = r.PublicPermission;

  let users: string[];
  if (change.kind === 'user-edit') users = [lc(change.user)];
  else {
    const reaching = rolesReaching(model.roles, change.role);
    const owners = await mapLimit(reaching, 8, (name) =>
      model.holders[name]
        ? Promise.resolve(model.holders[name])
        : result(api().GET('/v2/security/role/owners', { params: { query: { name } } })).then((list) =>
            ((list ?? []) as { Name?: string; Type?: string }[])
              .filter((o) => o.Type === 'User')
              .map((o) => lc(o.Name ?? '')),
          ),
    );
    users = [...new Set(owners.flat())].filter((u) => u && model.enabled[u]).sort();
  }
  const checked = users.slice(0, MAX_USERS);
  const details = await mapLimit(checked, 8, (name) =>
    result(api().GET('/v2/security/user', { params: { query: { name } } })),
  );

  const after = applyChange(model, change);
  const names = resourceNames(
    model,
    publicPerms,
    change.kind === 'role-edit' ? [{ resources: change.resources, granted: [] }] : [],
  );
  const changes: UserImpact[] = [];
  checked.forEach((user, i) => {
    const d = details[i] ?? {};
    const held = ((d.Roles ?? []) as string[]).map(String);
    const heldAfter =
      change.kind === 'user-edit'
        ? change.roles
        : change.kind === 'role-delete'
          ? held.filter((r) => lc(r) !== lc(change.role))
          : held;
    const diff = diffPrivileges(
      privilegesOf(model.roles, held, publicPerms),
      privilegesOf(after.roles, heldAfter, publicPerms),
      names,
    );
    // The user detail carries no Name: the spelling comes from the users list.
    const shown = model.userNames?.[user] ?? (change.kind === 'user-edit' ? change.user : user);
    if (diff.lost.length || diff.gained.length) changes.push({ user: shown, ...diff });
  });
  return { changes, checked: checked.length, more: users.length - checked.length };
}
