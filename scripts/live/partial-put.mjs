#!/usr/bin/env node
// Does a PUT that names only some fields leave the others alone? For the object types whose edit
// forms are not security settings: local database, database configuration, journal settings and
// namespace. Each probe reads the object, PUTs one field, reads it back, and restores the value it
// changed (the namespace is a throwaway, created and deleted). The security types are in
// e2e/live/writes.spec.ts.
//
//   node --env-file=… scripts/live/partial-put.mjs --out docs/verification/<run>
//     --keep-lan   keep LAN addresses and host names (scratch runs that are not committed)
//
// It changes the instance: run it on a disposable one or after a snapshot.
import { account, basicHeader, evidenceWriter, http } from './lib.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'docs/verification/live';
const LAN = !argv.includes('--keep-lan');
const admin = account('admin');
if (!admin) {
  console.error('IRIS_USER / IRIS_PASSWORD are not set (use node --env-file=…)');
  process.exit(2);
}
const auth = basicHeader(admin);
const get = async (path) => (await http('GET', path, { auth })).json?.result ?? null;
const put = (path, body) => http('PUT', path, { auth, body });
const answer = (r) => `${r.status}${r.json?.status?.summary ? ` ${r.json.status.summary}` : ''}`;

/** Fields whose value differs between two reads, apart from the ones the write named. */
function drift(before, after, named) {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((k) => !named.includes(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map((key) => ({ key, before: before?.[key], after: after?.[key] }));
}

/** PUT only `patch`, read back, restore `restore` (the named fields' old values). */
async function probe(path, patch) {
  const before = await get(path);
  const named = Object.keys(patch);
  const restore = Object.fromEntries(named.map((k) => [k, before?.[k]]));
  const written = await put(path, patch);
  const after = await get(path);
  const restored = await put(path, restore);
  const back = await get(path);
  return {
    path,
    patch,
    put: answer(written),
    applied: named.every((k) => JSON.stringify(after?.[k]) === JSON.stringify(patch[k])),
    otherFieldsChanged: drift(before, after, named),
    restore: answer(restored),
    restoredIdentical: drift(before, back, []).length === 0,
  };
}

const info = await get('/info');
const save = evidenceWriter(OUT, { serverVersion: () => info?.serverVersion ?? null, lan: LAN });
const results = {};

const dirs = (await get('/v2/database-dirs')) ?? [];
const userDir = dirs.find((d) => /[\\/]user[\\/]?$/i.test(d.Directory))?.Directory;
if (userDir) {
  const d = `/v2/database-dir?dir=${encodeURIComponent(userDir)}`;
  const cur = await get(d);
  results.databaseDir = await probe(d, { ExpansionSize: (cur?.ExpansionSize ?? 0) + 1 });
}
const c = `/v2/database?name=USER`;
const conf = await get(c);
results.database = await probe(c, { MountAtStartup: !conf?.MountAtStartup });
const j = '/v2/journal/settings';
const js = await get(j);
results.journalSettings = await probe(j, { DaysBeforePurge: (js?.DaysBeforePurge ?? 2) + 1 });

// A throwaway namespace on the USER database: created whole, then edited one field at a time.
const ns = '/v2/namespace?name=APERTUREPROBE';
const created = await put(ns, { Globals: 'USER', Routines: 'USER', TempGlobals: 'IRISTEMP' });
results.namespaceCreate = answer(created);
if (created.status < 300) {
  results.namespaceRoutinesOnly = await probe(ns, { Routines: 'IRISLIB' });
  results.namespaceEmptyBody = await probe(ns, {});
}
results.namespaceDelete = answer(await http('DELETE', ns, { auth }));

const file = save('partial-put', {
  assumption: 'A PUT that names only some fields leaves the others as they were (merge, not replace)',
  results,
});
console.log(`wrote ${file}`);
for (const [k, v] of Object.entries(results))
  console.log(
    `• ${k}: ${typeof v === 'string' ? v : `${v.put}, applied ${v.applied}, other fields changed: ${v.otherFieldsChanged.map((x) => x.key).join(', ') || 'none'}; restored ${v.restoredIdentical}`}`,
  );
