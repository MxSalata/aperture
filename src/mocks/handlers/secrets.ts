import {
  mockDb,
  type OAuthClientConfigRec,
  type OAuthResourceServerRec,
  type OAuthServerClientRec,
} from '../db';
import { recordAudit } from '../audit';
import { ok, created, notFound, badRequest, requireParam, jsonBody, filterRows, query } from '../util';
import { route, MANAGE, SECURE } from '../secure';

/**
 * The wallet, OAuth 2.0 and device operations, hand-written so the demo shows real objects rather
 * than schema examples, and so the Secrets & OAuth and Devices screens can create, change and
 * delete things. Secret values are write-only here as on IRIS: the mock keeps names and types and
 * never the value it was given.
 */
const WALLET = ['%Admin_Wallet:U'];
const OAUTH_CLIENT = ['%Admin_OAuth2_Client:U'];
const OAUTH_SERVER = ['%Admin_OAuth2_Server:U'];
const OAUTH_REGISTRATION = ['%Admin_OAuth2_Registration:U'];

const SECRET_TYPES = new Set(['%Wallet.KeyValue', '%Wallet.SymmetricKey', '%Wallet.RSA']);
const CLIENT_TYPES = new Set(['public', 'confidential', 'resource']);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const findCollection = (name: string | null) =>
  name ? mockDb.walletCollections.find((c) => same(c.Name, name)) : undefined;
const findDefinition = (id: string | null) =>
  id ? mockDb.oauthServerDefinitions.find((d) => same(d.ID, id)) : undefined;
const findClientConfig = (name: string | null) =>
  name ? mockDb.oauthClientConfigs.find((c) => same(c.ApplicationName, name)) : undefined;
const findResourceServer = (name: string | null) =>
  name ? mockDb.oauthResourceServers.find((r) => same(r.Name, name)) : undefined;
const findServerClient = (id: string | null) =>
  id ? mockDb.oauthServerClients.find((c) => same(c.ClientId, id)) : undefined;

/** "resource:permission" as the wallet documents it; the permission is optional. */
const RESOURCE = /^%?[A-Za-z0-9_%]+(:[A-Za-z]+)?$/;

/**
 * The `names` filter of the device list: "*" for everything, a comma-separated list where each
 * element is a name or a prefix ending in "*".
 */
function matchesNames(name: string, names: string | null): boolean {
  if (!names || names.trim() === '' || names.trim() === '*') return true;
  return names.split(',').some((raw) => {
    const n = raw.trim();
    if (!n) return false;
    if (n.endsWith('*')) return name.toLowerCase().startsWith(n.slice(0, -1).toLowerCase());
    return same(name, n);
  });
}

function randomSecret(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export const secretsHandlers = [
  // ---- Wallet -----------------------------------------------------------------
  route('get', '/v2/wallet/collections', WALLET, ({ request }) =>
    ok(
      filterRows(
        mockDb.walletCollections.map(({ Name, EditResource, UseResource }) => ({
          Name,
          EditResource,
          UseResource,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/wallet/collection', WALLET, ({ request }) => {
    const c = findCollection(requireParam(request, 'name'));
    return c
      ? ok({ EditResource: c.EditResource, UseResource: c.UseResource })
      : notFound('Wallet collection');
  }),
  route('put', '/v2/wallet/collection', WALLET, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('name is required');
    const body = await jsonBody<{ EditResource?: string; UseResource?: string }>(request);
    for (const [key, value] of Object.entries(body))
      if (value !== undefined && !RESOURCE.test(String(value)))
        return badRequest(`${key} must be "resource" or "resource:permission"`);
    const existing = findCollection(name);
    if (existing) {
      if (body.EditResource !== undefined) existing.EditResource = body.EditResource;
      if (body.UseResource !== undefined) existing.UseResource = body.UseResource;
      recordAudit(account, 'WalletChange', `Wallet collection ${existing.Name} modified`);
      return ok(
        { EditResource: existing.EditResource, UseResource: existing.UseResource },
        { summary: `Wallet collection ${existing.Name} modified` },
      );
    }
    if (!body.EditResource || !body.UseResource)
      return badRequest('EditResource and UseResource are required to create a collection');
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return badRequest('Invalid collection name');
    mockDb.walletCollections.push({
      Name: name,
      EditResource: body.EditResource,
      UseResource: body.UseResource,
      secrets: [],
    });
    recordAudit(account, 'WalletChange', `Wallet collection ${name} created`);
    return created({ EditResource: body.EditResource, UseResource: body.UseResource }, [
      `Wallet collection ${name} created`,
    ]);
  }),
  route('delete', '/v2/wallet/collection', WALLET, ({ request, account }) => {
    const c = findCollection(requireParam(request, 'name'));
    if (!c) return notFound('Wallet collection');
    mockDb.walletCollections = mockDb.walletCollections.filter((x) => x !== c);
    recordAudit(account, 'WalletChange', `Wallet collection ${c.Name} deleted`);
    return ok({}, { summary: `Wallet collection ${c.Name} and its ${c.secrets.length} secret(s) deleted` });
  }),
  route('get', '/v2/wallet/secrets', WALLET, ({ request }) => {
    const c = findCollection(requireParam(request, 'collection'));
    if (!c) return notFound('Wallet collection');
    return ok(
      filterRows(
        c.secrets.map(({ Name, Type }) => ({ Name, Type })),
        request,
      ),
    );
  }),
  route('put', '/v2/wallet/secret', WALLET, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('name is required');
    // %Wallet.Secret names are "Collection.Secret".
    const dot = name.indexOf('.');
    if (dot <= 0 || dot === name.length - 1) return badRequest('A secret is named "Collection.Secret"');
    const c = findCollection(name.slice(0, dot));
    if (!c) return notFound('Wallet collection');
    const body = await jsonBody<{ Type?: string; WalletSecretConfig?: Record<string, unknown> }>(request);
    if (!body.Type || !SECRET_TYPES.has(body.Type))
      return badRequest('Type must be %Wallet.KeyValue, %Wallet.SymmetricKey or %Wallet.RSA');
    if (!body.WalletSecretConfig || typeof body.WalletSecretConfig !== 'object')
      return badRequest('WalletSecretConfig is required');
    const existing = c.secrets.find((s) => same(s.Name, name));
    if (existing) {
      existing.Type = body.Type;
      recordAudit(account, 'WalletChange', `Wallet secret ${name} replaced`);
      return ok({}, { summary: `Wallet secret ${name} replaced` });
    }
    c.secrets.push({ Name: name, Type: body.Type });
    recordAudit(account, 'WalletChange', `Wallet secret ${name} created`);
    return created({}, [`Wallet secret ${name} created`]);
  }),
  route('delete', '/v2/wallet/secret', WALLET, ({ request, account }) => {
    const name = requireParam(request, 'name') ?? '';
    const c = findCollection(name.slice(0, Math.max(0, name.indexOf('.'))));
    const s = c?.secrets.find((x) => same(x.Name, name));
    if (!c || !s) return notFound('Wallet secret');
    c.secrets = c.secrets.filter((x) => x !== s);
    recordAudit(account, 'WalletChange', `Wallet secret ${name} deleted`);
    return ok({}, { summary: `Wallet secret ${name} deleted` });
  }),

  // ---- OAuth 2.0: this instance as an authorization server ------------------------
  route('get', '/v2/security/oauth2/server', OAUTH_SERVER, () =>
    mockDb.oauthServer ? ok(mockDb.oauthServer) : notFound('OAuth2 authorization server configuration'),
  ),
  route('put', '/v2/security/oauth2/server', OAUTH_SERVER, async ({ request, account }) => {
    const body = await jsonBody<Record<string, unknown>>(request);
    const existed = !!mockDb.oauthServer;
    mockDb.oauthServer = { ...(mockDb.oauthServer ?? {}), ...body };
    recordAudit(account, 'OAuth2ServerChange', 'OAuth2 authorization server configuration saved');
    return existed
      ? ok(mockDb.oauthServer, { summary: 'Authorization server configuration modified' })
      : created(mockDb.oauthServer, ['Authorization server configured']);
  }),
  route('delete', '/v2/security/oauth2/server', OAUTH_SERVER, ({ account }) => {
    if (!mockDb.oauthServer) return notFound('OAuth2 authorization server configuration');
    mockDb.oauthServer = null;
    recordAudit(account, 'OAuth2ServerChange', 'OAuth2 authorization server configuration deleted');
    return ok({}, { summary: 'This instance no longer acts as an OAuth2 authorization server' });
  }),
  route('get', '/v2/security/oauth2/server/clients', OAUTH_REGISTRATION, ({ request }) =>
    ok(
      filterRows(
        mockDb.oauthServerClients.map(
          ({ Name, ClientId, ClientSecret, ClientType, Description, RedirectURL, Enabled }) => ({
            Name,
            ClientId,
            ClientSecret,
            ClientType,
            Description,
            RedirectURL,
            Enabled,
          }),
        ),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/oauth2/server/client', OAUTH_REGISTRATION, ({ request }) => {
    const c = findServerClient(requireParam(request, 'clientId'));
    return c ? ok(c) : notFound('OAuth2 client');
  }),
  route('post', '/v2/security/oauth2/server/client', OAUTH_REGISTRATION, async ({ request, account }) => {
    const body = await jsonBody<Partial<OAuthServerClientRec>>(request);
    if (!body.Name) return badRequest('Name is required');
    if (body.ClientType && !CLIENT_TYPES.has(body.ClientType))
      return badRequest('ClientType must be public, confidential or resource');
    const clientId = body.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (findServerClient(clientId)) return badRequest(`A client with id ${clientId} already exists`);
    const rec: OAuthServerClientRec = {
      Name: body.Name,
      ClientId: clientId,
      ClientSecret: randomSecret(),
      ClientType: body.ClientType ?? 'confidential',
      RedirectURL: body.RedirectURL ?? [],
      LaunchURL: body.LaunchURL ?? '',
      DefaultScope: body.DefaultScope ?? '',
      Description: body.Description ?? '',
      ClientCredentials: body.ClientCredentials ?? '',
      Metadata: body.Metadata ?? {},
      Enabled: true,
    };
    mockDb.oauthServerClients.push(rec);
    recordAudit(account, 'OAuth2ClientChange', `OAuth2 client ${rec.ClientId} created`);
    return created(rec, [`OAuth2 client ${rec.ClientId} created`]);
  }),
  route('put', '/v2/security/oauth2/server/client', OAUTH_REGISTRATION, async ({ request, account }) => {
    const c = findServerClient(requireParam(request, 'clientId'));
    if (!c) return notFound('OAuth2 client');
    const body = await jsonBody<Partial<OAuthServerClientRec>>(request);
    if (body.ClientType && !CLIENT_TYPES.has(body.ClientType))
      return badRequest('ClientType must be public, confidential or resource');
    Object.assign(c, body, { ClientId: c.ClientId, ClientSecret: c.ClientSecret });
    recordAudit(account, 'OAuth2ClientChange', `OAuth2 client ${c.ClientId} modified`);
    return ok(c, { summary: `OAuth2 client ${c.ClientId} modified` });
  }),
  route('delete', '/v2/security/oauth2/server/client', OAUTH_REGISTRATION, ({ request, account }) => {
    const c = findServerClient(requireParam(request, 'clientId'));
    if (!c) return notFound('OAuth2 client');
    mockDb.oauthServerClients = mockDb.oauthServerClients.filter((x) => x !== c);
    recordAudit(account, 'OAuth2ClientChange', `OAuth2 client ${c.ClientId} deleted`);
    return ok({}, { summary: `OAuth2 client ${c.ClientId} deleted` });
  }),
  route(
    'post',
    '/v2/security/oauth2/server/client/secret',
    OAUTH_REGISTRATION,
    async ({ request, account }) => {
      const c = findServerClient(requireParam(request, 'clientId'));
      if (!c) return notFound('OAuth2 client');
      const body = await jsonBody<{ ClientSecret?: string }>(request);
      c.ClientSecret = body.ClientSecret || randomSecret();
      recordAudit(account, 'OAuth2ClientChange', `OAuth2 client ${c.ClientId} secret changed`);
      return ok({}, { summary: `Client secret of ${c.ClientId} changed` });
    },
  ),

  // ---- OAuth 2.0: this instance as a client (server definitions, client configurations) ----
  route('get', '/v2/security/oauth2/client/server-definitions', OAUTH_CLIENT, ({ request }) =>
    ok(
      filterRows(
        mockDb.oauthServerDefinitions.map((d) => ({
          ID: d.ID,
          IssuerEndpoint: d.IssuerEndpoint,
          ClientCount: mockDb.oauthClientConfigs.filter((c) => same(c.ServerDefinition, d.ID)).length,
          ResourceCount: mockDb.oauthResourceServers.filter((r) => same(r.ServerDefinition, d.ID)).length,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/oauth2/client/server-definition', OAUTH_CLIENT, ({ request }) => {
    const d = findDefinition(requireParam(request, 'serverId'));
    return d
      ? ok({
          IssuerEndpoint: d.IssuerEndpoint,
          SSLConfiguration: d.SSLConfiguration,
          ServerCredentials: d.ServerCredentials,
          Metadata: d.Metadata,
        })
      : notFound('OAuth2 server definition');
  }),
  route(
    'post',
    '/v2/security/oauth2/client/server-definition',
    OAUTH_CLIENT,
    async ({ request, account }) => {
      const body = await jsonBody<{
        IssuerEndpoint?: string;
        SSLConfiguration?: string;
        ServerCredentials?: string;
        Metadata?: Record<string, unknown>;
      }>(request);
      if (!body.IssuerEndpoint) return badRequest('IssuerEndpoint is required');
      let host: string;
      try {
        host = new URL(body.IssuerEndpoint).host;
      } catch {
        return badRequest('IssuerEndpoint must be a URL');
      }
      if (findDefinition(host)) return badRequest(`A server definition for ${host} already exists`);
      const rec = {
        ID: host,
        IssuerEndpoint: body.IssuerEndpoint,
        SSLConfiguration: body.SSLConfiguration ?? '',
        ServerCredentials: body.ServerCredentials ?? '',
        Metadata: body.Metadata ?? { issuer: body.IssuerEndpoint },
      };
      mockDb.oauthServerDefinitions.push(rec);
      recordAudit(account, 'OAuth2ServerDefinitionChange', `OAuth2 server definition ${rec.ID} created`);
      return created(
        {
          IssuerEndpoint: rec.IssuerEndpoint,
          SSLConfiguration: rec.SSLConfiguration,
          ServerCredentials: rec.ServerCredentials,
          Metadata: rec.Metadata,
        },
        [`OAuth2 server definition ${rec.ID} created`],
      );
    },
  ),
  route('put', '/v2/security/oauth2/client/server-definition', OAUTH_CLIENT, async ({ request, account }) => {
    const d = findDefinition(requireParam(request, 'serverId'));
    if (!d) return notFound('OAuth2 server definition');
    const body = await jsonBody<Partial<typeof d>>(request);
    Object.assign(d, body, { ID: d.ID });
    recordAudit(account, 'OAuth2ServerDefinitionChange', `OAuth2 server definition ${d.ID} modified`);
    return ok(
      {
        IssuerEndpoint: d.IssuerEndpoint,
        SSLConfiguration: d.SSLConfiguration,
        ServerCredentials: d.ServerCredentials,
        Metadata: d.Metadata,
      },
      { summary: `OAuth2 server definition ${d.ID} modified` },
    );
  }),
  route('delete', '/v2/security/oauth2/client/server-definition', OAUTH_CLIENT, ({ request, account }) => {
    const d = findDefinition(requireParam(request, 'serverId'));
    if (!d) return notFound('OAuth2 server definition');
    const clients = mockDb.oauthClientConfigs.filter((c) => same(c.ServerDefinition, d.ID)).length;
    if (clients)
      return badRequest(
        `ERROR #5001: Server definition ${d.ID} still has ${clients} client configuration(s)`,
      );
    mockDb.oauthServerDefinitions = mockDb.oauthServerDefinitions.filter((x) => x !== d);
    recordAudit(account, 'OAuth2ServerDefinitionChange', `OAuth2 server definition ${d.ID} deleted`);
    return ok({}, { summary: `OAuth2 server definition ${d.ID} deleted` });
  }),
  route('get', '/v2/security/oauth2/client/client-configurations', OAUTH_CLIENT, ({ request }) => {
    const serverId = requireParam(request, 'serverId');
    if (!serverId) return badRequest('serverId is required');
    if (!findDefinition(serverId)) return ok([]);
    return ok(
      filterRows(
        mockDb.oauthClientConfigs
          .filter((c) => same(c.ServerDefinition, serverId))
          .map(({ ApplicationName, ClientType, DefaultScope }) => ({
            ApplicationName,
            ClientType,
            DefaultScope,
          })),
        request,
      ),
    );
  }),
  route('get', '/v2/security/oauth2/client/client-configuration', OAUTH_CLIENT, ({ request }) => {
    const c = findClientConfig(requireParam(request, 'applicationName'));
    if (!c) return notFound('OAuth2 client configuration');
    const { ApplicationName: _n, ...rest } = c;
    return ok(rest);
  }),
  route(
    'put',
    '/v2/security/oauth2/client/client-configuration',
    OAUTH_CLIENT,
    async ({ request, account }) => {
      const name = requireParam(request, 'applicationName');
      if (!name) return badRequest('applicationName is required');
      const body = await jsonBody<Partial<OAuthClientConfigRec> & { OAuth2ServerDefinition?: string }>(
        request,
      );
      // IRIS 2026.2 takes ServerDefinition (quirk oauth-client-server-definition); the spec's name is ignored.
      const { OAuth2ServerDefinition: _spec, ...fields } = body;
      if (fields.ClientType && !CLIENT_TYPES.has(fields.ClientType))
        return badRequest('ClientType must be public, confidential or resource');
      const existing = findClientConfig(name);
      if (existing) {
        Object.assign(existing, fields, { ApplicationName: existing.ApplicationName });
        recordAudit(account, 'OAuth2ClientChange', `OAuth2 client configuration ${name} modified`);
        const { ApplicationName: _a, ...rest } = existing;
        return ok(rest, { summary: `OAuth2 client configuration ${name} modified` });
      }
      if (!fields.ServerDefinition || !findDefinition(fields.ServerDefinition))
        return badRequest('ServerDefinition must name an existing server definition');
      const rec: OAuthClientConfigRec = {
        ApplicationName: name,
        ServerDefinition: fields.ServerDefinition,
        Enabled: fields.Enabled ?? true,
        Description: fields.Description ?? '',
        ClientType: fields.ClientType ?? 'confidential',
        SSLConfiguration: fields.SSLConfiguration ?? '',
        RedirectionEndpoint: fields.RedirectionEndpoint ?? '',
        DefaultScope: fields.DefaultScope ?? '',
        JWTAudience: fields.JWTAudience ?? '',
        ClientCredentials: fields.ClientCredentials ?? '',
        Metadata: fields.Metadata ?? { client_id: name },
      };
      mockDb.oauthClientConfigs.push(rec);
      recordAudit(account, 'OAuth2ClientChange', `OAuth2 client configuration ${name} created`);
      const { ApplicationName: _a, ...rest } = rec;
      return created(rest, [`OAuth2 client configuration ${name} created`]);
    },
  ),
  route('delete', '/v2/security/oauth2/client/client-configuration', OAUTH_CLIENT, ({ request, account }) => {
    const c = findClientConfig(requireParam(request, 'applicationName'));
    if (!c) return notFound('OAuth2 client configuration');
    mockDb.oauthClientConfigs = mockDb.oauthClientConfigs.filter((x) => x !== c);
    recordAudit(account, 'OAuth2ClientChange', `OAuth2 client configuration ${c.ApplicationName} deleted`);
    return ok({}, { summary: `OAuth2 client configuration ${c.ApplicationName} deleted` });
  }),

  // ---- OAuth 2.0: resource servers --------------------------------------------------
  route('get', '/v2/security/oauth2/resource-servers', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.oauthResourceServers.map(({ Name, ServerDefinition }) => ({ Name, ServerDefinition })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/oauth2/resource-server', SECURE, ({ request }) => {
    const r = findResourceServer(requireParam(request, 'name'));
    if (!r) return notFound('OAuth2 resource server');
    const { Name: _n, ServerDefinition: _s, ...rest } = r;
    return ok(rest);
  }),
  route('put', '/v2/security/oauth2/resource-server', SECURE, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('name is required');
    const body = await jsonBody<Partial<OAuthResourceServerRec>>(request);
    const existing = findResourceServer(name);
    if (existing) {
      Object.assign(existing, body, { Name: existing.Name });
      recordAudit(account, 'OAuth2ResourceServerChange', `OAuth2 resource server ${name} modified`);
      const { Name: _n, ServerDefinition: _s, ...rest } = existing;
      return ok(rest, { summary: `OAuth2 resource server ${name} modified` });
    }
    if (!body.IssuerEndpoint) return badRequest('IssuerEndpoint is required');
    const definition = mockDb.oauthServerDefinitions.find((d) =>
      same(d.IssuerEndpoint, body.IssuerEndpoint ?? ''),
    );
    const rec: OAuthResourceServerRec = {
      Name: name,
      ServerDefinition: definition?.ID ?? '',
      Enabled: body.Enabled ?? true,
      Description: body.Description ?? '',
      IssuerEndpoint: body.IssuerEndpoint,
      ScopeRequiredToConnect: body.ScopeRequiredToConnect ?? '',
      Audiences: body.Audiences ?? [],
      AccessTokenIsJWT: body.AccessTokenIsJWT ?? true,
      AlwaysCallIntrospection: body.AlwaysCallIntrospection ?? false,
      ClientId: body.ClientId ?? '',
      IntrospectionAuthMethod: body.IntrospectionAuthMethod ?? 'client_secret_basic',
      UseOIDC: body.UseOIDC ?? false,
      Authenticator: body.Authenticator ?? {},
    };
    mockDb.oauthResourceServers.push(rec);
    recordAudit(account, 'OAuth2ResourceServerChange', `OAuth2 resource server ${name} created`);
    const { Name: _n, ServerDefinition: _s, ...rest } = rec;
    return created(rest, [`OAuth2 resource server ${name} created`]);
  }),
  route('delete', '/v2/security/oauth2/resource-server', SECURE, ({ request, account }) => {
    const r = findResourceServer(requireParam(request, 'name'));
    if (!r) return notFound('OAuth2 resource server');
    mockDb.oauthResourceServers = mockDb.oauthResourceServers.filter((x) => x !== r);
    recordAudit(account, 'OAuth2ResourceServerChange', `OAuth2 resource server ${r.Name} deleted`);
    return ok({}, { summary: `OAuth2 resource server ${r.Name} deleted` });
  }),

  // ---- Devices -----------------------------------------------------------------------
  route('get', '/v2/devices', MANAGE, ({ request }) => {
    const names = query(request).get('names');
    return ok(
      filterRows(
        mockDb.devices.filter((d) => matchesNames(d.Name, names)).map((d) => ({ ...d })),
        request,
      ),
    );
  }),
  route('get', '/v2/device', MANAGE, ({ request }) => {
    const d = mockDb.devices.find((x) => same(x.Name, requireParam(request, 'name') ?? ''));
    if (!d) return notFound('Device');
    // The detail answers Prompt as the integer the spec declares; the list keeps IRIS's strings.
    const { Name: _n, Prompt, ...rest } = d;
    return ok({ ...rest, Prompt: Number(Prompt) || 0 });
  }),
];
