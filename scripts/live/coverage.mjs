#!/usr/bin/env node
// Every GET operation of the SysAdmin API against a real instance, for docs/COVERAGE.md: each one
// called with parameters taken from the instance's own lists, its answer checked against the
// spec's schema, and the outcome recorded. Read-only, with one exception kept out: an ended async
// task is never read (every read after the first final one logs a severity-2 alert); the live
// check's single-read round trip covers GET /v2/async-result instead.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/coverage.mjs --out docs/verification/<run>
import { account, evidenceWriter, http, signIn, shape, waitForTask } from './lib.mjs';
import { check, index, resultSchema } from './spec.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
if (!OUT) {
  console.error('usage: coverage.mjs --out <evidence directory>');
  process.exit(2);
}

const s = await signIn(account('admin'));
const cache = new Map();
async function list(path) {
  if (!cache.has(path)) {
    const r = await http('GET', path, { auth: s.auth });
    const v = r.status === 200 ? (r.json?.result ?? null) : null;
    cache.set(path, Array.isArray(v) ? v : v ? [v] : []);
  }
  return cache.get(path);
}
/** The first row of a list with a value for `key` (optionally the one `prefer` picks). */
async function pick(path, key, prefer) {
  const rows = await list(path);
  const row = (prefer && rows.find(prefer)) || rows.find((r) => r?.[key] !== undefined && r?.[key] !== '');
  return row?.[key];
}

const userDir = async () =>
  pick('/v2/database-dirs', 'Directory', (d) => /\/user\/?$/i.test(d.Directory ?? ''));
/** A namespace that has a mapping of the kind, with the mapping's name. */
async function mapping(kind) {
  for (const ns of (await list('/v2/namespaces')).map((n) => n.Name).filter(Boolean)) {
    const rows = await list(`/v2/namespace/${kind}-mappings?namespace=${encodeURIComponent(ns)}`);
    const name = rows.find((r) => r?.Name)?.Name;
    if (name) return { namespace: ns, name };
  }
  return null;
}

/** Query parameters for an operation, or a reason it cannot be called here. */
async function resolve(op) {
  const p = op.path;
  const byName = {
    '/v2/database': () => pick('/v2/databases', 'Name', (d) => d.Name === 'USER'),
    '/v2/device': () => pick('/v2/devices', 'Name'),
    '/v2/device/subtype': () => pick('/v2/device/subtypes', 'Name'),
    '/v2/ecp/data-server': () => pick('/v2/ecp/data-servers', 'Name'),
    '/v2/ecp/data-server/databases': () => pick('/v2/ecp/data-servers', 'Name'),
    '/v2/ext-lang-server': () => pick('/v2/ext-lang-servers', 'Name'),
    '/v2/ext-lang-server/activity': () => pick('/v2/ext-lang-servers', 'Name'),
    '/v2/license/server': () => pick('/v2/license/servers', 'Name'),
    '/v2/namespace': async () => 'USER',
    '/v2/security/ldap/configuration': () => pick('/v2/security/ldap/configurations', 'Name'),
    '/v2/security/oauth2/resource-server': () => pick('/v2/security/oauth2/resource-servers', 'Name'),
    '/v2/security/privileged-routine': () => pick('/v2/security/privileged-routines', 'Name'),
    '/v2/security/resource': () => pick('/v2/security/resources', 'Name'),
    '/v2/security/role': async () => '%Manager',
    '/v2/security/role/owners': async () => '%Manager',
    '/v2/security/service': async () => '%Service_Bindings',
    '/v2/security/ssl-configuration': () => pick('/v2/security/ssl-configurations', 'Name'),
    '/v2/security/user': async () => account('admin').user,
    '/v2/wallet/collection': () => pick('/v2/wallet/collections', 'Name'),
    '/v2/web-app': async () => '/api/admin',
    '/v2/wqm-category': () => pick('/v2/wqm-categories', 'Name'),
  };
  if (byName[p]) {
    const name = await byName[p]();
    return name ? { name } : { skip: 'no such object on this instance' };
  }
  switch (p) {
    case '/v2/async-result':
      return {
        skip: 'never called here: re-reading an ended task logs an alert; the live check reads one task once',
      };
    case '/v2/process': {
      const id = await pick('/v2/processes', 'Pid');
      return id ? { id } : { skip: 'no process listed' };
    }
    case '/v2/task':
    case '/v2/task/info': {
      const id = await pick('/v2/tasks', 'Id');
      return id !== undefined ? { id } : { skip: 'no task' };
    }
    case '/v2/journal/file': {
      const file = await pick('/v2/journal/files', 'Name');
      return file ? { file } : { skip: 'no journal file' };
    }
    case '/v2/journal/file/record': {
      const file = await pick('/v2/journal/files', 'Name');
      if (!file) return { skip: 'no journal file' };
      const f = await http('GET', `/v2/journal/file?file=${encodeURIComponent(file)}`, { auth: s.auth });
      const address = f.json?.result?.FirstRecordAddress;
      return address ? { file, address } : { skip: 'no record address' };
    }
    case '/v2/security/encryption/file/admins':
    case '/v2/security/encryption/file/keys':
      return { skip: 'needs a database encryption key file; none on this instance' };
    case '/v2/namespace/global-mappings':
    case '/v2/namespace/package-mappings':
    case '/v2/namespace/routine-mappings':
      return { namespace: 'USER' };
    case '/v2/namespace/global-mapping':
    case '/v2/namespace/package-mapping':
    case '/v2/namespace/routine-mapping': {
      const m = await mapping(p.split('/').pop().replace('-mapping', ''));
      return m ?? { skip: 'no mapping of this kind in any namespace' };
    }
    case '/v2/database-dir':
    case '/v2/database-dir/volumes': {
      const dir = await userDir();
      return dir ? { dir } : { skip: 'no USER directory' };
    }
    case '/v2/fs-access-purpose':
    case '/v2/fs-access-purpose/paths': {
      const purpose = await pick('/v2/fs-access-purposes', 'Purpose');
      return purpose ? { purpose } : { skip: 'no file system access purpose' };
    }
    case '/v2/security/oauth2/client/client-configurations':
    case '/v2/security/oauth2/client/server-definition': {
      const serverId = await pick('/v2/security/oauth2/client/server-definitions', 'ID');
      return serverId ? { serverId } : { skip: 'no OAuth 2.0 server definition' };
    }
    case '/v2/security/oauth2/client/client-configuration': {
      const applicationName = await pick(
        '/v2/security/oauth2/client/client-configurations',
        'ApplicationName',
      );
      return applicationName ? { applicationName } : { skip: 'no OAuth 2.0 client configuration' };
    }
    case '/v2/security/oauth2/server/client': {
      const clientId = await pick('/v2/security/oauth2/server/clients', 'ClientId');
      return clientId ? { clientId } : { skip: 'no client registered with an OAuth 2.0 server here' };
    }
    case '/v2/security/oauth2/resource-server/mappings':
      return { service: 'CSP' };
    case '/v2/security/oauth2/resource-server/mapping': {
      const key = await pick('/v2/security/oauth2/resource-server/mappings?service=CSP', 'Key');
      return key
        ? { service: 'CSP', key }
        : { skip: 'no resource server mapping (IRIS refused the documented body)' };
    }
    case '/v2/security/sql-admin-privileges':
    case '/v2/security/sql-privileges':
      return { grantee: account('admin').user, namespace: 'USER' };
    case '/v2/security/sql-column-privileges':
      return { skip: 'needs a table with column privileges' };
    case '/v2/security/x509-credential':
    case '/v2/security/x509-credential/certificate': {
      const alias = await pick('/v2/security/x509-credentials', 'Alias');
      return alias ? { alias } : { skip: 'no X.509 credential' };
    }
    case '/v2/doc-db': {
      const name = await pick('/v2/doc-dbs?namespace=USER', 'Name');
      return name ? { name, namespace: 'USER' } : { skip: 'no DocDB database in USER' };
    }
    case '/v2/security/audit/event': {
      // The list names an event as Source/Type/Name in one field.
      const rows = await list('/v2/security/audit/events');
      const [source, type, name] = String(rows.find((r) => r?.EventName)?.EventName ?? '').split('/');
      return source && type && name ? { source, type, name } : { skip: 'no audit event' };
    }
    case '/v2/security/audit/record': {
      // One record from a fresh audit query task, whose result is read once, when it ends.
      const queued = await http('POST', '/v2/security/audit/records?maxRows=1', { auth: s.auth, body: {} });
      const id = queued.headers.location
        ? new URL(queued.headers.location, 'http://x').searchParams.get('id')
        : null;
      const done = id ? await waitForTask(s.auth, id) : null;
      const rec = [done?.json?.result?.Result, done?.json?.result?.result, done?.json?.result]
        .flatMap((v) => (Array.isArray(v) ? v : []))
        .find((r) => r?.UTCTimeStamp);
      return rec
        ? { utcTimeStamp: rec.UTCTimeStamp, systemID: rec.SystemID, auditIndex: rec.AuditIndex }
        : { skip: 'the audit query returned no record' };
    }
    case '/v2/security/mft/connection':
    case '/v2/security/mft/connection/auth-code-url':
      return { skip: 'no managed file transfer connection' };
    case '/v2/security/superserver': {
      const port = await pick('/v2/security/superservers', 'Port');
      return port ? { port } : { skip: 'no superserver listed' };
    }
    case '/v2/wallet/secrets': {
      const collection = await pick('/v2/wallet/collections', 'Name');
      return collection ? { collection } : { skip: 'no wallet collection' };
    }
    case '/v2/web-app/pct-access':
      return { skip: 'needs a web application with a percent-class allow list' };
    default: {
      const required = op.params.filter((x) => x.required);
      return required.length ? { skip: `no resolver for ${required.map((x) => x.name).join(', ')}` } : {};
    }
  }
}

const results = [];
for (const op of index.operations.filter((o) => o.method === 'GET')) {
  const q = await resolve(op);
  if (q.skip) {
    results.push({ id: op.id, outcome: 'not called', reason: q.skip });
    continue;
  }
  const qs = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();
  const r = await http('GET', qs ? `${op.path}?${qs}` : op.path, { auth: s.auth });
  const result = r.json?.result;
  const entry = { id: op.id, status: r.status, params: Object.keys(q), ms: r.ms };
  if (r.status === 200) {
    const schema = resultSchema('GET', op.path);
    const out = { problems: [], undeclared: new Set() };
    if (schema && result !== undefined) check(schema, result, 'result', out);
    Object.assign(entry, {
      outcome: 'answered',
      shape: shape(result),
      specProblems: out.problems.slice(0, 5),
      undeclared: [...out.undeclared].slice(0, 8),
    });
  } else {
    const err = r.json?.status?.errors?.[0];
    Object.assign(entry, {
      outcome: r.status === 403 ? 'refused' : r.status === 404 ? 'not found' : 'error',
      error: err
        ? { code: err.code, id: err.id, text: String(err.error ?? '').slice(0, 200) }
        : (r.text ?? '').slice(0, 200),
    });
  }
  results.push(entry);
}
if (s.mode === 'jwt') await http('POST', '/logout', { auth: s.auth });

const info = await http('GET', '/info', {
  auth: `Basic ${Buffer.from(`${account('admin').user}:${account('admin').password}`).toString('base64')}`,
});
const write = evidenceWriter(OUT, {
  serverVersion: () => (info.json?.result ?? info.json)?.serverVersion ?? null,
});
const count = (o) => results.filter((x) => x.outcome === o).length;
const file = write('coverage-live', {
  about:
    'Every GET of the SysAdmin API v2 called as an administrator with parameters from the instance (scripts/live/coverage.mjs)',
  summary: {
    operations: results.length,
    answered: count('answered'),
    notFound: count('not found'),
    refused: count('refused'),
    error: count('error'),
    notCalled: count('not called'),
  },
  results,
});
console.log(
  `${results.length} GET operations: ${count('answered')} answered, ${count('not found')} not found, ${count('refused')} refused, ${count('error')} errors, ${count('not called')} not called → ${file}`,
);
for (const x of results.filter((r) => r.outcome === 'error' || r.outcome === 'refused'))
  console.log(`  ${x.id}: ${x.status} ${JSON.stringify(x.error).slice(0, 160)}`);
