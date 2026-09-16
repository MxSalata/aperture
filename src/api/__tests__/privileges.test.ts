import { describe, expect, it } from 'vitest';
import { checkPrivileges, heldPrivileges, privilegeKey } from '../privileges';
import type { Info } from '../types';

const info: Info = { privileges: { Operate: { use: true }, Secure: { use: false }, Manage: { use: true } } };

describe('privileges', () => {
  it('maps resource names to /info keys', () => {
    expect(privilegeKey('%Admin_Secure:U')).toBe('Secure');
    expect(privilegeKey('%Admin_OAuth2_Client:U')).toBe('OAuth2_Client');
    expect(privilegeKey('nonsense')).toBeNull();
  });
  it('grants when any listed resource is held', () => {
    expect(checkPrivileges(info, ['%Admin_Secure:U', '%Admin_Operate:U'])).toBe('granted');
    expect(checkPrivileges(info, ['%Admin_Secure:U'])).toBe('denied');
  });
  it('stays optimistic for resources the server does not report', () => {
    expect(checkPrivileges(info, ['%Admin_Wallet:U'])).toBe('unknown');
    expect(checkPrivileges(null, ['%Admin_Secure:U'])).toBe('unknown');
    expect(checkPrivileges(info, [])).toBe('granted');
  });
  it('lists held privileges by resource name', () => {
    expect(heldPrivileges(info)).toEqual(['%Admin_Operate', '%Admin_Manage']);
  });
});
