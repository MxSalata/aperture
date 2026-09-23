import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import { adminRoles, judge, loadAdminModel, securityAdmins, type AdminModel } from '../adminGuard';

const secure = (p = 'U') => [{ Name: '%Admin_Secure', Permissions: p }];

/** alice holds %All; bob holds SecAdmin (%Admin_Secure:U); carol holds Wrapper, which grants SecAdmin. */
function model(over: Partial<AdminModel> = {}): AdminModel {
  return {
    roles: {
      '%all': { resources: [], granted: [] },
      secadmin: { resources: secure(), granted: [] },
      wrapper: { resources: [], granted: ['SecAdmin'] },
      reader: { resources: [{ Name: '%Admin_Secure', Permissions: 'R' }], granted: [] },
      '%operator': { resources: [{ Name: '%Admin_Operate', Permissions: 'U' }], granted: [] },
    },
    holders: { '%all': ['alice'], secadmin: ['bob'], wrapper: ['carol'] },
    enabled: { alice: true, bob: true, carol: true, dave: true },
    publicSecure: false,
    ...over,
  };
}

describe('who administers security', () => {
  it('counts %All, %Admin_Secure:U and roles granting them, at any depth', () => {
    expect([...adminRoles(model().roles)].sort()).toEqual(['%all', 'secadmin', 'wrapper']);
    expect([...securityAdmins(model())].sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('does not count %Admin_Secure without U, or disabled accounts', () => {
    const m = model({
      holders: { reader: ['dave'], '%all': ['alice'] },
      enabled: { alice: false, dave: true },
    });
    expect([...securityAdmins(m)]).toEqual([]);
  });
});

describe('the last-admin verdict', () => {
  const only = (user: string, role = '%all') =>
    model({ holders: { [role]: [user] }, enabled: { [user]: true, other: true } });

  it('blocks disabling, deleting or stripping the only administrator', () => {
    expect(
      judge(only('alice'), { kind: 'user-edit', user: 'alice', roles: ['%All'], enabled: false }).locksOut,
    ).toBe(true);
    expect(judge(only('alice'), { kind: 'user-delete', user: 'Alice' }).locksOut).toBe(true);
    expect(
      judge(only('alice'), { kind: 'user-edit', user: 'alice', roles: ['%Operator'], enabled: true })
        .locksOut,
    ).toBe(true);
  });

  it('blocks deleting or emptying the only role that confers it', () => {
    const m = only('bob', 'secadmin');
    expect(judge(m, { kind: 'role-delete', role: 'SecAdmin' }).locksOut).toBe(true);
    expect(judge(m, { kind: 'role-edit', role: 'SecAdmin', resources: [], granted: [] }).locksOut).toBe(true);
    // Read but not use: still locks out.
    expect(
      judge(m, { kind: 'role-edit', role: 'SecAdmin', resources: secure('R'), granted: [] }).locksOut,
    ).toBe(true);
  });

  it('follows granted roles: removing the grant from the wrapper locks carol out', () => {
    const m = only('carol', 'wrapper');
    expect(judge(m, { kind: 'role-edit', role: 'Wrapper', resources: [], granted: [] }).locksOut).toBe(true);
    expect(judge(m, { kind: 'role-delete', role: 'SecAdmin' }).locksOut).toBe(true);
  });

  it('lets any change through while another administrator remains', () => {
    const v = judge(model(), { kind: 'user-delete', user: 'alice' });
    expect(v.locksOut).toBe(false);
    expect(v.after).toEqual(['bob', 'carol']);
    expect(judge(model(), { kind: 'role-delete', role: 'SecAdmin' }).after).toEqual(['alice']);
  });

  it('never blocks when %Admin_Secure is public (everyone holds it)', () => {
    expect(judge(only('alice'), { kind: 'user-delete', user: 'alice' }).locksOut).toBe(true);
    expect(
      judge({ ...only('alice'), publicSecure: true }, { kind: 'user-delete', user: 'alice' }).locksOut,
    ).toBe(false);
  });
});

describe('the model, read from the instance (the mock)', () => {
  beforeAll(async () => {
    resetDb();
    resetClients();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
  });

  it('finds the seeded administrators and judges the removal of all but one', async () => {
    const m = await loadAdminModel();
    const admins = [...securityAdmins(m)].sort();
    expect(admins).toContain('_system');
    // Removing every administrator but _SYSTEM, then _SYSTEM itself, would lock everyone out.
    const fewer = admins
      .filter((u) => u !== '_system')
      .reduce<AdminModel>((acc, u) => ({ ...acc, enabled: { ...acc.enabled, [u]: false } }), m);
    expect(
      judge(fewer, { kind: 'user-edit', user: '_SYSTEM', roles: ['%All'], enabled: false }).locksOut,
    ).toBe(true);
    expect(judge(m, { kind: 'user-edit', user: '_SYSTEM', roles: ['%All'], enabled: false }).locksOut).toBe(
      admins.length === 1,
    );
  });
});
