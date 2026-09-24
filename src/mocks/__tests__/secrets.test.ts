/**
 * The wallet, OAuth 2.0 and device handlers of the mock: privilege gating, the write-only
 * secret, and the 404s the screens rely on.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';

const BASE = 'http://iris.test';

const signIn = (username: string) =>
  useSession.getState().login({ connectionId: 't', baseUrl: BASE, username, password: 'SYS' });

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: {
      Authorization: useSession.getState().authorizationHeader() ?? '',
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    json: text ? (JSON.parse(text) as { result?: unknown; status?: { summary?: string } }) : null,
  };
}

describe('wallet', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
  });

  it('lists collections and the names and types of their secrets, never a value', async () => {
    await signIn('_SYSTEM');
    const list = await call('GET', '/v2/wallet/collections');
    expect(list.status).toBe(200);
    const names = (list.json?.result as { Name: string }[]).map((c) => c.Name);
    expect(names).toContain('HL7Interfaces');
    const secrets = await call('GET', '/v2/wallet/secrets?collection=HL7Interfaces');
    expect(secrets.status).toBe(200);
    for (const s of secrets.json?.result as Record<string, unknown>[]) {
      expect(Object.keys(s).sort()).toEqual(['Name', 'Type']);
      expect(s.Name).toMatch(/^HL7Interfaces\./);
    }
  });

  it('creates, replaces and deletes a secret by its "Collection.Secret" name, and forgets the value', async () => {
    await signIn('_SYSTEM');
    const body = {
      Type: '%Wallet.KeyValue',
      WalletSecretConfig: { Secret: { user: 'svc', password: 'hunter2' }, Usage: ['HTTP'], RequireTLS: true },
    };
    const created = await call('PUT', '/v2/wallet/secret?name=CloudBackups.glacier', body);
    expect(created.status).toBe(201);
    const replaced = await call('PUT', '/v2/wallet/secret?name=CloudBackups.glacier', body);
    expect(replaced.status).toBe(200);
    const secrets = await call('GET', '/v2/wallet/secrets?collection=CloudBackups');
    expect(JSON.stringify(secrets.json)).not.toContain('hunter2');
    expect((secrets.json?.result as { Name: string }[]).map((s) => s.Name)).toContain('CloudBackups.glacier');
    expect((await call('DELETE', '/v2/wallet/secret?name=CloudBackups.glacier')).status).toBe(200);
    expect((await call('DELETE', '/v2/wallet/secret?name=CloudBackups.glacier')).status).toBe(404);
    expect((await call('PUT', '/v2/wallet/secret?name=NoSuch.thing', body)).status).toBe(404);
    expect(
      (await call('PUT', '/v2/wallet/secret?name=CloudBackups.x', { Type: '%Wallet.Nope' })).status,
    ).toBe(400);
  });

  it('creates a collection with both resources, edits one, and deletes it with its secrets', async () => {
    await signIn('_SYSTEM');
    expect(
      (await call('PUT', '/v2/wallet/collection?name=Lab', { UseResource: '%Admin_Manage:USE' })).status,
    ).toBe(400);
    const created = await call('PUT', '/v2/wallet/collection?name=Lab', {
      UseResource: '%Admin_Manage:USE',
      EditResource: '%Admin_Secure:USE',
    });
    expect(created.status).toBe(201);
    const edited = await call('PUT', '/v2/wallet/collection?name=Lab', { UseResource: '%Admin_Operate:USE' });
    expect(edited.status).toBe(200);
    expect(edited.json?.result).toEqual({
      EditResource: '%Admin_Secure:USE',
      UseResource: '%Admin_Operate:USE',
    });
    expect((await call('DELETE', '/v2/wallet/collection?name=Lab')).status).toBe(200);
    expect((await call('GET', '/v2/wallet/collection?name=Lab')).status).toBe(404);
  });

  it('is refused to an account without %Admin_Wallet', async () => {
    await signIn('operator');
    expect((await call('GET', '/v2/wallet/collections')).status).toBe(403);
  });
});

describe('OAuth 2.0', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
  });

  it('answers the server, its clients, the server definitions with their counts, and the resource servers', async () => {
    await signIn('_SYSTEM');
    const server = await call('GET', '/v2/security/oauth2/server');
    expect(server.status).toBe(200);
    expect((server.json?.result as { IssuerEndpoint: string }).IssuerEndpoint).toMatch(/^https:/);
    const clients = await call('GET', '/v2/security/oauth2/server/clients');
    expect((clients.json?.result as { ClientId: string }[]).map((c) => c.ClientId)).toContain(
      'aperture-portal',
    );
    const defs = await call('GET', '/v2/security/oauth2/client/server-definitions');
    const def = (defs.json?.result as { ID: string; ClientCount: number; ResourceCount: number }[])[0];
    expect(def).toMatchObject({ ID: 'login.example.org', ClientCount: 2, ResourceCount: 1 });
    const configs = await call('GET', `/v2/security/oauth2/client/client-configurations?serverId=${def.ID}`);
    expect((configs.json?.result as { ApplicationName: string }[]).map((c) => c.ApplicationName)).toEqual([
      'aperture-portal',
      'fhir-gateway',
    ]);
    const resources = await call('GET', '/v2/security/oauth2/resource-servers');
    expect(resources.json?.result).toEqual([{ Name: 'fhir-api', ServerDefinition: 'login.example.org' }]);
  });

  it('answers 404 once the authorization server is deleted, and refuses to delete a server definition in use', async () => {
    await signIn('_SYSTEM');
    expect((await call('DELETE', '/v2/security/oauth2/server')).status).toBe(200);
    expect((await call('GET', '/v2/security/oauth2/server')).status).toBe(404);
    expect(
      (await call('DELETE', '/v2/security/oauth2/client/server-definition?serverId=login.example.org'))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          'DELETE',
          '/v2/security/oauth2/client/client-configuration?applicationName=aperture-portal',
        )
      ).status,
    ).toBe(200);
    expect(
      (await call('DELETE', '/v2/security/oauth2/client/client-configuration?applicationName=fhir-gateway'))
        .status,
    ).toBe(200);
    expect(
      (await call('DELETE', '/v2/security/oauth2/client/server-definition?serverId=login.example.org'))
        .status,
    ).toBe(200);
  });

  it('takes ServerDefinition as IRIS 2026.2 does, whichever name the client configuration was sent with', async () => {
    await signIn('_SYSTEM');
    const created = await call(
      'PUT',
      '/v2/security/oauth2/client/client-configuration?applicationName=lims',
      {
        OAuth2ServerDefinition: 'login.example.org',
        ServerDefinition: 'login.example.org',
        ClientType: 'public',
      },
    );
    expect(created.status).toBe(201);
    const detail = await call('GET', '/v2/security/oauth2/client/client-configuration?applicationName=lims');
    expect((detail.json?.result as { ServerDefinition: string }).ServerDefinition).toBe('login.example.org');
  });

  it('gates each role on its own privilege', async () => {
    await signIn('auditor'); // %Admin_Secure only
    expect((await call('GET', '/v2/security/oauth2/resource-servers')).status).toBe(200);
    expect((await call('GET', '/v2/security/oauth2/server')).status).toBe(403);
    expect((await call('GET', '/v2/security/oauth2/client/server-definitions')).status).toBe(403);
  });
});

describe('devices', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
  });

  it('lists devices with the strings IRIS sends and filters by the names parameter', async () => {
    await signIn('_SYSTEM');
    const all = await call('GET', '/v2/devices');
    expect(all.status).toBe(200);
    const rows = all.json?.result as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(5);
    expect(typeof rows[0].Prompt).toBe('string');
    const some = await call('GET', `/v2/devices?names=${encodeURIComponent('|T*,0')}`);
    expect((some.json?.result as { Name: string }[]).map((d) => d.Name).sort()).toEqual([
      '0',
      '|TNT|',
      '|TRM|',
    ]);
    const one = await call('GET', `/v2/device?name=${encodeURIComponent('|PRN|')}`);
    expect(one.status).toBe(200);
    expect(typeof (one.json?.result as { Prompt: unknown }).Prompt).toBe('number');
    expect((await call('GET', '/v2/device?name=nope')).status).toBe(404);
  });
});
