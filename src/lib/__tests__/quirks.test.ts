import { describe, expect, it } from 'vitest';
import { documentedPath, quirksFor, servedPath } from '../quirks';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';

const REVOKE = { method: 'POST', path: '/v2/security/oauth2/revoke' };
const SERVED = '/v2/security/oauth2/server/revoke';

describe('an operation IRIS serves somewhere else than the spec says', () => {
  it('is sent to where IRIS serves it, with a note in the Explorer', () => {
    expect(servedPath(REVOKE)).toBe(SERVED);
    expect(quirksFor(REVOKE).map((q) => q.id)).toContain('oauth2-revoke-path');
    expect(servedPath({ method: 'GET', path: '/v2/security/users' })).toBe('/v2/security/users');
  });

  it('is answered by the mock at the served path only, as by IRIS', async () => {
    expect(documentedPath('POST', SERVED)).toBe(REVOKE.path);
    expect(documentedPath('POST', REVOKE.path)).toBeNull();
    expect(documentedPath('GET', '/v2/security/users')).toBe('/v2/security/users');

    resetDb();
    resetClients();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
    const auth = useSession.getState().authorizationHeader()!;
    const post = (path: string) =>
      fetch(`http://iris.test/api/admin${path}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: '{}',
      });
    expect((await post(REVOKE.path)).status).toBe(404);
    expect((await post(SERVED)).ok).toBe(true);
  });
});
