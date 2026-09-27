#!/usr/bin/env node
// Sample objects for a sandbox instance, so every read of the SysAdmin API has something to read:
// a wallet collection with a secret, an OAuth 2.0 resource server with a scope mapping, an OAuth 2.0
// server definition with a client configuration, a file system access purpose, a privileged
// routine application and a DocDB application. Everything is disabled or points at example.com, and
// nothing is contacted. Each type first gets a round trip on a throw-away ApertureProbe object
// (create, read back, delete, read back), which is also the coverage evidence for its writes; then
// the ApertureSample object is created (or updated) and read back. --remove deletes the samples.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/sample-data.mjs --out docs/verification/<run> [--remove]
import { account, evidenceWriter, http, signIn } from './lib.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const REMOVE = argv.includes('--remove');
const s = await signIn(account('admin'));
const q = (params) => new URLSearchParams(params).toString();
const call = async (method, path, params, body) => {
  const r = await http(method, `${path}?${q(params)}`, { auth: s.auth, body });
  return {
    status: r.status,
    result: r.json?.result,
    summary: r.json?.status?.summary ?? '',
    errors: (r.json?.status?.errors ?? []).map((x) => x.error ?? x),
  };
};

const ssl = await (async () => {
  const r = await http('GET', '/v2/security/ssl-configurations', { auth: s.auth });
  const rows = Array.isArray(r.json?.result) ? r.json.result : [];
  return (rows.find((c) => c.Name === 'ISC.FeatureTracker.SSL.Config') ?? rows[0])?.Name ?? '';
})();
const issuer = 'https://auth.example.com/oauth2';

/** Each type: the parameters that name an object, and the body of its PUT. */
const TYPES = [
  {
    kind: 'wallet collection',
    path: '/v2/wallet/collection',
    params: (n) => ({ name: n }),
    body: { UseResource: '%Admin_Manage:USE', EditResource: '%Admin_Secure:USE' },
  },
  {
    kind: 'wallet secret',
    path: '/v2/wallet/secret',
    params: (n) => ({ name: `ApertureSample.${n === 'ApertureSample' ? 'Api' : 'Probe'}` }),
    readPath: '/v2/wallet/secrets',
    readParams: () => ({ collection: 'ApertureSample' }),
    body: {
      Type: '%Wallet.KeyValue',
      WalletSecretConfig: {
        Secret: { user: 'sample', token: 'sample-value' },
        Usage: ['HTTP'],
        RequireTLS: true,
        AllowedHosts: ['api.example.com'],
      },
    },
  },
  {
    kind: 'OAuth 2.0 resource server',
    path: '/v2/security/oauth2/resource-server',
    params: (n) => ({ name: n }),
    body: {
      Enabled: false,
      Description: 'Aperture sample: disabled, nothing is contacted',
      IssuerEndpoint: issuer,
      AccessTokenIsJWT: true,
      Audiences: ['aperture-sample'],
    },
  },
  {
    kind: 'OAuth 2.0 resource server mapping',
    path: '/v2/security/oauth2/resource-server/mapping',
    // Which resource server checks the tokens of a web application: service CSP, key the path.
    params: (n) => ({ service: 'CSP', key: n === 'ApertureSample' ? '/aperture-sample' : '/aperture-probe' }),
    body: { Resource: 'ApertureSample' },
  },
  {
    kind: 'file system access purpose',
    path: '/v2/fs-access-purpose',
    params: (n) => ({ purpose: n }),
    body: { Restricted: false },
  },
  {
    kind: 'privileged routine application',
    path: '/v2/security/privileged-routine',
    params: (n) => ({ name: n }),
    body: {
      Description: 'Aperture sample: disabled',
      Enabled: false,
      MatchRoles: [],
      Resource: '',
      Routines: [],
    },
  },
  {
    kind: 'DocDB application',
    path: '/v2/doc-db',
    params: (n) => ({ name: n, namespace: 'USER' }),
    body: { Description: 'Aperture sample: disabled', Enabled: false, Resource: '' },
  },
];

const steps = [];
const log = (step) => {
  steps.push(step);
  console.log(
    `${step.kind} ${step.name}: ${step.action} → ${step.status}${step.summary ? ` ${step.summary.slice(0, 120)}` : ''}${step.errors?.length ? ` ${JSON.stringify(step.errors).slice(0, 160)}` : ''}`,
  );
};

async function readBack(t, name) {
  const params = t.readPath ? t.readParams(name) : t.params(name);
  return call('GET', t.readPath ?? t.path, params);
}

// OAuth 2.0 client side first: a resource server's IssuerEndpoint must name an existing server
// definition. No discovery (discover=0: IRIS refuses "false" with a 500), so nothing is contacted;
// the client configuration that uses it is disabled.
if (!REMOVE && ssl) {
  const defs = async () => {
    const r = await http('GET', '/v2/security/oauth2/client/server-definitions', { auth: s.auth });
    return Array.isArray(r.json?.result) ? r.json.result : [];
  };
  let def = (await defs()).find((d) => d.IssuerEndpoint === issuer);
  if (!def) {
    const post = await call(
      'POST',
      '/v2/security/oauth2/client/server-definition',
      { discover: '0' },
      {
        IssuerEndpoint: issuer,
        SSLConfiguration: ssl,
        Metadata: {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        },
      },
    );
    log({ kind: 'OAuth 2.0 server definition', name: issuer, action: 'create', ...post });
    def = (await defs()).find((d) => d.IssuerEndpoint === issuer);
  }
  if (def) {
    const id = def.ID ?? def.Id ?? def.id;
    const read = await call('GET', '/v2/security/oauth2/client/server-definition', { serverId: id });
    log({ kind: 'OAuth 2.0 server definition', name: String(id), action: 'read', status: read.status });
    const client = await call(
      'PUT',
      '/v2/security/oauth2/client/client-configuration',
      { applicationName: 'ApertureSample' },
      {
        // IRIS 2026.2 names the field ServerDefinition (spec finding 6).
        ServerDefinition: id,
        Enabled: false,
        Description: 'Aperture sample: disabled, nothing is contacted',
        ClientType: 'confidential',
        SSLConfiguration: ssl,
        RedirectionEndpoint: { Host: 'localhost', Port: '443', Prefix: '', UseSSL: true },
        DefaultScope: 'openid',
      },
    );
    log({
      kind: 'OAuth 2.0 client configuration',
      name: 'ApertureSample',
      action: 'create or update',
      ...client,
    });
    const back = await call('GET', '/v2/security/oauth2/client/client-configuration', {
      applicationName: 'ApertureSample',
    });
    log({
      kind: 'OAuth 2.0 client configuration',
      name: 'ApertureSample',
      action: 'read',
      status: back.status,
    });
  }
}
// Samples are removed children first (a mapping before its server, secrets before the collection).
const order = REMOVE ? [...TYPES].reverse() : TYPES;
for (const t of order) {
  if (REMOVE) {
    const d = await call('DELETE', t.path, t.params('ApertureSample'));
    log({ kind: t.kind, name: 'ApertureSample', action: 'delete', ...d });
    continue;
  }
  // A round trip on a probe object; the mapping and the secret live inside the sample parents,
  // which are created first, so their probes run after the parents exist.
  const needsParent = t.kind === 'wallet secret' || t.kind === 'OAuth 2.0 resource server mapping';
  const runProbe = async () => {
    const put = await call('PUT', t.path, t.params('ApertureProbe'), t.body);
    log({ kind: t.kind, name: 'ApertureProbe', action: 'create', ...put });
    if (put.status >= 300) return;
    const read = await readBack(t, 'ApertureProbe');
    log({ kind: t.kind, name: 'ApertureProbe', action: 'read', status: read.status });
    const del = await call('DELETE', t.path, t.params('ApertureProbe'));
    log({ kind: t.kind, name: 'ApertureProbe', action: 'delete', ...del });
    if (!t.readPath) {
      const gone = await readBack(t, 'ApertureProbe');
      log({ kind: t.kind, name: 'ApertureProbe', action: 'read after delete', status: gone.status });
    }
  };
  if (!needsParent) await runProbe();
  const put = await call('PUT', t.path, t.params('ApertureSample'), t.body);
  log({ kind: t.kind, name: 'ApertureSample', action: 'create or update', ...put });
  const read = await readBack(t, 'ApertureSample');
  log({ kind: t.kind, name: 'ApertureSample', action: 'read', status: read.status });
  if (needsParent) await runProbe();
}

if (REMOVE) {
  await call('DELETE', '/v2/security/oauth2/client/client-configuration', {
    applicationName: 'ApertureSample',
  });
}
if (s.mode === 'jwt') await http('POST', '/logout', { auth: s.auth });

if (OUT) {
  const info = await http('GET', '/info', {
    auth: `Basic ${Buffer.from(`${account('admin').user}:${account('admin').password}`).toString('base64')}`,
  });
  const write = evidenceWriter(OUT, {
    serverVersion: () => (info.json?.result ?? info.json)?.serverVersion ?? null,
  });
  console.log(
    '→',
    write(REMOVE ? 'sample-data-removed' : 'sample-data', {
      about: 'Sample objects and the round trips on probe objects (scripts/live/sample-data.mjs)',
      steps,
    }),
  );
}
