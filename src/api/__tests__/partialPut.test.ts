import { describe, expect, it } from 'vitest';
import { MERGING_PUT, putBody, sendsOnlyChanges } from '../partialPut';

describe('which edits send only what changed', () => {
  // Confirmed on IRIS for Health 2026.2 by e2e/live/writes.spec.ts (27 September 2026).
  const security = [
    '/v2/security/role',
    '/v2/security/resource',
    '/v2/security/user',
    '/v2/web-app',
    '/v2/security/service',
    '/v2/security/ssl-configuration',
  ];

  it('sends the changed fields of every security type IRIS was seen to merge', () => {
    for (const path of security) {
      expect(sendsOnlyChanges(path), path).toBe(true);
      expect(putBody(path, { Description: 'a', Enabled: true }, { Description: 'b' })).toEqual({
        Description: 'b',
      });
    }
  });

  it('still sends the whole form for a type nobody probed', () => {
    expect(MERGING_PUT.has('/v2/task')).toBe(false);
    expect(putBody('/v2/task', { Name: 'a', Suspended: false }, { Name: 'b' })).toEqual({
      Name: 'a',
      Suspended: false,
    });
  });
});
