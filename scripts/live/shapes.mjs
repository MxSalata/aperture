#!/usr/bin/env node
// Record the shapes a real instance answers in, for the contract test's second oracle
// (src/mocks/__tests__/contract.test.ts): for every parameterless GET and the detail reads the
// screens make, each JSON path of the result (array indices as []) with the types seen there.
// Keys and types only, no values: nothing of the instance (names, addresses, secrets) is kept.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/shapes.mjs [--out src/mocks/__tests__/iris-shapes.json]
import { writeFileSync } from 'node:fs';
import { account, http, signIn, IMAGE } from './lib.mjs';
import { index } from './spec.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'src/mocks/__tests__/iris-shapes.json';

const typeOf = (v) =>
  Array.isArray(v)
    ? 'array'
    : v === null
      ? 'null'
      : typeof v === 'number'
        ? Number.isInteger(v)
          ? 'integer'
          : 'number'
        : typeof v;

/** path → set of types; arrays that came back empty are marked so their items are not judged. */
function walk(v, path, out) {
  const t = typeOf(v);
  (out[path] ??= new Set()).add(t);
  if (t === 'array') {
    if (!v.length) (out[`${path}[]`] ??= new Set()).add('unseen');
    for (const item of v.slice(0, 200)) walk(item, `${path}[]`, out);
  } else if (t === 'object') {
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
  }
  return out;
}

const s = await signIn(account('admin'));
const get = async (path) => {
  const r = await http('GET', path, { auth: s.auth });
  return r.status === 200 ? (r.json?.result ?? null) : null;
};
const first = async (path, key, pick = (rows) => rows[0]) => {
  const rows = await get(path);
  return Array.isArray(rows) && rows.length ? pick(rows)?.[key] : undefined;
};

const reads = [];
for (const o of index.operations.filter(
  (o) => o.method === 'GET' && o.path.startsWith('/v2/') && !o.params.some((p) => p.required),
))
  reads.push([o.path, {}]);
const dir = await first('/v2/database-dirs', 'Directory', (rows) =>
  rows.find((d) => /\/user\/?$/i.test(d.Directory)),
);
const task = await first('/v2/tasks', 'Id');
const detail = [
  ['/v2/security/user', { name: account('admin').user }],
  ['/v2/security/role', { name: '%Manager' }],
  ['/v2/security/role/owners', { name: '%Manager' }],
  ['/v2/security/resource', { name: await first('/v2/security/resources', 'Name') }],
  ['/v2/security/service', { name: '%Service_Bindings' }],
  ['/v2/security/ssl-configuration', { name: await first('/v2/security/ssl-configurations', 'Name') }],
  [
    '/v2/security/x509-credential/certificate',
    { alias: await first('/v2/security/x509-credentials', 'Alias') },
  ],
  ['/v2/security/sql-privileges', { namespace: 'USER', grantee: account('admin').user }],
  ['/v2/web-app', { name: '/api/admin' }],
  ['/v2/namespace', { name: 'USER' }],
  ['/v2/namespace/global-mappings', { namespace: 'USER' }],
  ['/v2/namespace/package-mappings', { namespace: 'USER' }],
  ['/v2/namespace/routine-mappings', { namespace: 'USER' }],
  ['/v2/database', { name: 'USER' }],
  ['/v2/database-dir', { dir }],
  ['/v2/database-dir/volumes', { dir }],
  ['/v2/journal/file', { file: await first('/v2/journal/files', 'Name') }],
  ['/v2/process', { id: await first('/v2/processes', 'Pid') }],
  ['/v2/task', { id: task }],
  ['/v2/task/info', { id: task }],
  ['/v2/task/history', { taskId: task }],
];
reads.push(
  ...detail.filter(([, q]) => Object.values(q).every((v) => v !== undefined && v !== null && v !== '')),
);

const shapes = {};
for (const [path, query] of reads) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const result = await get(qs ? `${path}?${qs}` : path);
  if (result === null) continue;
  const seen = walk(result, 'result', {});
  shapes[path] = Object.fromEntries(Object.entries(seen).map(([p, types]) => [p, [...types].sort()]));
}
if (s.mode === 'jwt') await http('POST', '/logout', { auth: s.auth });

const info = await http('GET', '/info', {
  auth: `Basic ${Buffer.from(`${account('admin').user}:${account('admin').password}`, 'utf8').toString('base64')}`,
});
const doc = {
  about:
    'Result shapes (JSON paths and types, no values) of a real instance, recorded by scripts/live/shapes.mjs; the mock must not answer in other shapes.',
  image: IMAGE,
  serverVersion: (info.json?.result ?? info.json)?.serverVersion ?? null,
  capturedAt: new Date().toISOString().slice(0, 10),
  shapes,
};
writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`${Object.keys(shapes).length} operations → ${OUT}`);
