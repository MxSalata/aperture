#!/usr/bin/env node
// The test production of the live checks: creates the APERTURELAB namespace when it is missing (a
// database of its own, then interoperability, through the SysAdmin API), loads and compiles the
// classes in scripts/live/lab/ through the Atelier API, and starts Aperture.Lab.Production through
// /api/interop-editors, the route the production screens use. It changes the instance: run it on a
// test instance only.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/lab.mjs           set up and start
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/lab.mjs --stop    stop the production
//
// The production sends about three messages every ten seconds, so its namespace grows while it
// runs: stop it when the checks are done. It does not start by itself after IRIS restarts.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { account, basicHeader, http, IRIS_URL, signIn, sleep, waitForTask } from './lib.mjs';

const NS = 'APERTURELAB';
const PRODUCTION = 'Aperture.Lab.Production';
const CLASSES = join(dirname(fileURLToPath(import.meta.url)), 'lab');
const argv = process.argv.slice(2);
const admin = account('admin');
if (!admin) {
  console.error('IRIS_USER / IRIS_PASSWORD are not set (use node --env-file=…)');
  process.exit(2);
}

const session = await signIn(admin);
const interop = (method, path) =>
  http(method, path, { auth: session.auth, base: `${IRIS_URL}/api/interop-editors/v7/${NS}` });
const state = (value) =>
  interop('POST', `/productions/production/state/${encodeURIComponent(PRODUCTION)}?state=${value}`);
const status = async () => (await interop('GET', '/productions/status')).json;

if (argv.includes('--stop')) {
  // Ens.Director stops whichever production runs in the namespace, whatever the URL names.
  const running = await status();
  if (running?.ProdRunning !== PRODUCTION) {
    console.log(
      `stop: ${PRODUCTION} is not the production of ${NS}, left alone`,
      JSON.stringify(running ?? {}),
    );
    process.exit(running?.ProdRunning ? 1 : 0);
  }
  const r = await state('stop');
  const after = await status();
  console.log(`stop: HTTP ${r.status}`, JSON.stringify(after ?? {}));
  process.exit(r.status === 200 && !after?.ProdRunning ? 0 : 1);
}

const namespaces = await http('GET', '/v2/namespaces', { auth: session.auth });
if (!(namespaces.json?.result ?? []).some((n) => n.Name === NS)) {
  // The directory beside USER's, whatever the instance's manager directory is.
  const dbs = await http('GET', '/v2/database-dirs', { auth: session.auth });
  const user = (dbs.json?.result ?? []).find((d) => /\/user\/?$/i.test(d.Directory ?? ''));
  if (!user) throw new Error('USER database directory not found');
  const dir = user.Directory.replace(/user\/?$/i, `${NS.toLowerCase()}/`);
  const steps = [
    [
      'POST',
      '/v2/database-dir',
      { Directory: dir, Size: 1, GlobalJournalState: true, Encrypted: false, BlockSize: 8192 },
    ],
    [
      'PUT',
      `/v2/database?name=${NS}`,
      { Directory: dir, MountAtStartup: true, MountRequired: false, ClusterMountMode: false },
    ],
    ['PUT', `/v2/namespace?name=${NS}`, { Globals: NS, Routines: NS, TempGlobals: 'IRISTEMP' }],
  ];
  for (const [method, path, body] of steps) {
    const r = await http(method, path, { auth: session.auth, body });
    console.log(`${method} ${path}: HTTP ${r.status}`);
    if (r.status >= 300) throw new Error(`${method} ${path} failed: ${JSON.stringify(r.json)}`);
  }
  const enable = await http('POST', `/v2/namespace/enable-interop?name=${NS}`, { auth: session.auth });
  const id = new URL(enable.headers.location ?? '/?id=', 'http://x').searchParams.get('id');
  const done = id ? await waitForTask(session.auth, id, { budgetMs: 120_000 }) : enable;
  console.log(`enable interoperability: ${done.json?.result?.State ?? done.status}`);
}

// Atelier takes a password only (JWT is off on /api/atelier).
const atelier = (method, path, body) =>
  http(method, path, { auth: basicHeader(admin), body, base: `${IRIS_URL}/api/atelier/v8/${NS}` });
const files = readdirSync(CLASSES)
  .filter((f) => f.endsWith('.cls'))
  .sort();
for (const f of files) {
  const content = readFileSync(join(CLASSES, f), 'utf8').replace(/\n$/, '').split('\n');
  const r = await atelier('PUT', `/doc/${f}?ignoreConflict=1`, { enc: false, content });
  if (r.status >= 300) throw new Error(`PUT ${f}: HTTP ${r.status}`);
}
const compiled = await atelier('POST', '/action/compile?flags=cuk&source=0', files);
const failed = (compiled.json?.result?.content ?? []).filter((d) => d.status);
if (compiled.status !== 200 || failed.length || compiled.json?.status?.errors?.length)
  throw new Error(`compile failed: ${JSON.stringify(failed.length ? failed : compiled.json?.status)}`);
console.log(`${files.length} classes loaded and compiled`);

const before = await status();
if (before?.ProdRunning !== PRODUCTION) {
  const r = await state('start');
  console.log(`start: HTTP ${r.status} ${JSON.stringify(r.json)}`);
  if (r.status !== 200) process.exit(1);
  await sleep(3000);
}
// The route answers success whatever happened: only the status says whether the production runs.
const after = await status();
console.log('status:', JSON.stringify(after));
if (after?.ProdRunning !== PRODUCTION || after?.State !== 1) {
  console.error(`${PRODUCTION} is not running in ${NS}`);
  process.exit(1);
}
