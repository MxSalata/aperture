import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import { loadAdminModel, type AdminModel, type RoleFacts } from '../adminGuard';
import { diffPrivileges, loadImpact, privilegesOf, rolesReaching } from '../impact';

const roles: Record<string, RoleFacts> = {
  '%all': { resources: [], granted: [] },
  ops: { resources: [{ Name: '%Admin_Operate', Permissions: 'U' }], granted: ['db'] },
  db: { resources: [{ Name: '%DB_USER', Permissions: 'RW' }], granted: [] },
  reader: { resources: [{ Name: '%DB_USER', Permissions: 'R' }], granted: [] },
};
const names = new Map([
  ['%db_user', '%DB_USER'],
  ['%admin_operate', '%Admin_Operate'],
]);

describe('the privileges an account holds', () => {
  it('are its roles, what they grant at any depth, and public permissions', () => {
    const p = privilegesOf(roles, ['OPS'], { '%Service_Web': 'U' });
    expect(p.all).toBe(false);
    expect([...p.perms.get('%db_user')!]).toEqual(['R', 'W']);
    expect(p.perms.get('%service_web')?.has('U')).toBe(true);
    expect(privilegesOf(roles, ['%All'], {}).all).toBe(true);
  });

  it('are lost only when no other role or public permission still gives them', () => {
    const before = privilegesOf(roles, ['ops', 'reader'], {});
    const after = privilegesOf(roles, ['reader'], {});
    expect(diffPrivileges(before, after, names)).toEqual({
      lost: ['%Admin_Operate:U', '%DB_USER:W'],
      gained: [],
    });
    const fromAll = diffPrivileges(privilegesOf(roles, ['%All'], {}), after, names);
    expect(fromAll.lost).toEqual(['%All (every privilege)']);
  });

  it('come from every role that grants the edited one', () => {
    expect(rolesReaching(roles, 'DB').sort()).toEqual(['db', 'ops']);
  });
});

describe('who loses what, read from the instance', () => {
  let model: AdminModel;
  beforeEach(async () => {
    resetDb();
    resetClients();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
    model = await loadAdminModel();
  });

  const operatorWithout = (dropped: string) => ({
    kind: 'role-edit' as const,
    role: '%Operator',
    granted: [],
    resources: [
      '%Admin_Operate:U',
      '%Admin_Task:U',
      '%Admin_Journal:U',
      '%DB_IRISSYS:R',
      '%Service_Console:U',
      '%Service_Terminal:U',
    ]
      .filter((g) => g !== dropped)
      .map((g) => ({ Name: g.split(':')[0], Permissions: g.split(':')[1] })),
  });

  it('names every holder of a role that loses a privilege', async () => {
    const report = (await loadImpact(model, operatorWithout('%Admin_Journal:U')))!;
    expect(report.changes).toEqual([
      { user: 'Admin', lost: ['%Admin_Journal:U'], gained: [] },
      { user: 'operator', lost: ['%Admin_Journal:U'], gained: [] },
      { user: 'ops', lost: ['%Admin_Journal:U'], gained: [] },
    ]);
    expect(report.more).toBe(0);
  });

  it('leaves out a holder who keeps the privilege through another role', async () => {
    // Admin also holds %Manager, which grants %Admin_Task:U.
    const report = (await loadImpact(model, operatorWithout('%Admin_Task:U')))!;
    expect(report.changes.map((c) => c.user)).toEqual(['operator', 'ops']);
  });

  it('follows grants: a role granted by another reaches that role’s holders', async () => {
    const report = (await loadImpact(model, {
      kind: 'role-edit',
      role: '%EnsRole_Operator',
      granted: [],
      resources: [{ Name: '%Ens_Portal', Permissions: 'U' }],
    }))!;
    expect(report.changes).toEqual([{ user: '_Ensemble', lost: ['%Ens_MessageHeader:R'], gained: [] }]);
  });

  it('shows what a user loses when a role is taken away', async () => {
    const report = (await loadImpact(model, {
      kind: 'user-edit',
      user: 'jdoe',
      roles: ['%DB_IRISAPP', '%DB_USER'],
      enabled: true,
    }))!;
    const [jdoe] = report.changes;
    expect(jdoe.user).toBe('jdoe');
    expect(jdoe.lost).toContain('%Development:U');
    // %DB_USER:RW stays: the %DB_USER role still gives it.
    expect(jdoe.lost.some((p) => p.startsWith('%DB_USER:'))).toBe(false);
  });
});
