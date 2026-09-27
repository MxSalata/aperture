#!/usr/bin/env node
// docs/COVERAGE.md from four sources: the spec's 273 operations (src/api/spec-index.json), the
// screens that call each one (the typed client calls in src/), the demo's mock routes
// (src/mocks/handlers/), and what a real instance answered (the live GET sweep and the recorded
// writes in docs/verification/).
//
//   node scripts/coverage-doc.mjs docs/verification/2026-09-28-irishealth-2026.2/coverage-live.json > docs/COVERAGE.md
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const live = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const liveDir = relative('docs', join(process.argv[2], '..'));
const index = JSON.parse(readFileSync('src/api/spec-index.json', 'utf8'));

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'mocks') files(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Screens: every typed call of the client, by method and path, named after its file.
const screens = new Map();
for (const f of files('src')) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\.(GET|PUT|POST|DELETE)\(\s*'(\/(?:v2\/)?[a-z0-9/-]+)'/g)) {
    const id = `${m[1]} ${m[2]}`;
    const name = f
      .split('/')
      .pop()
      .replace(/\.(ts|tsx)$/, '')
      .replace(/Page$|Tab$/, '');
    if (!screens.has(id)) screens.set(id, new Set());
    screens.get(id).add(name);
  }
}

// Sign-in and sign-out go through the session store's own fetch, not the typed client.
for (const id of ['POST /login', 'POST /logout', 'POST /refresh']) screens.set(id, new Set(['Sign-in']));

// The demo: the routes the in-browser mock answers.
const mock = new Set(['GET /info', 'POST /login', 'POST /logout', 'POST /refresh']);
for (const f of readdirSync('src/mocks/handlers')) {
  const text = readFileSync(join('src/mocks/handlers', f), 'utf8');
  for (const m of text.matchAll(/route\(\s*'(get|put|post|delete)',\s*'(\/v2\/[a-z0-9/-]+)'/g))
    mock.add(`${m[1].toUpperCase()} ${m[2]}`);
}

// Writes and asynchronous tasks verified on real instances, with their evidence.
const H27 = 'verification/2026-09-27-irishealth-2026.2';
const H28 = 'verification/2026-09-28-irishealth-2026.2';
const H23 = 'verification/2026-09-23-irishealth-2026.2';
const C23 = 'verification/2026-09-23-iris-community-2026.2-local';
const ev = (file, what) => `✓ ${what} ([${file.split('/').pop()}](${file}))`;
const WRITES = {
  'POST /login': ev(`${H23}/j-sign-in.json`, 'JWT sign-in, escalation, wrong role 401'),
  'POST /refresh': ev(`${H23}/k-token-lifetime.json`, 'rotation, replay revokes the session'),
  'POST /logout': ev(`${H23}/k-token-lifetime.json`, 'needs the access token'),
  'PUT /v2/security/role': ev(`${H27}/writes.json`, 'create, partial PUTs, read back'),
  'DELETE /v2/security/role': ev(`${H27}/writes.json`, 'deleted, read back'),
  'PUT /v2/security/resource': ev(`${H27}/writes.json`, 'create with R, partial PUT; "" and null refused'),
  'DELETE /v2/security/resource': ev(`${H27}/writes.json`, 'deleted'),
  'POST /v2/security/user': ev(`${H27}/writes.json`, 'create with a password beyond Latin-1'),
  'PUT /v2/security/user': ev(`${H27}/writes.json`, 'partial PUTs, read back'),
  'DELETE /v2/security/user': ev(`${H27}/writes.json`, 'deleted'),
  'PUT /v2/web-app': ev(`${H27}/writes.json`, 'create, partial PUT, edit in the UI'),
  'DELETE /v2/web-app': ev(`${H27}/writes.json`, 'deleted'),
  'PUT /v2/security/service': ev(`${H27}/writes.json`, 'partial PUT, edit in the UI, restored'),
  'PUT /v2/security/ssl-configuration': ev(`${H27}/writes.json`, 'create, partial PUT'),
  'DELETE /v2/security/ssl-configuration': ev(`${H27}/writes.json`, 'deleted'),
  'PUT /v2/database-dir': ev(`${H27}/writes.json`, 'partial PUT, restored'),
  'PUT /v2/database': ev(`${H27}/writes.json`, 'partial PUT, restored'),
  'PUT /v2/journal/settings': ev(`${H27}/writes.json`, 'partial PUT, restored'),
  'PUT /v2/namespace': ev(`${C23}/partial-put.json`, 'partial PUT on IRIS Community, restored'),
  'POST /v2/security/audit/records': ev(
    `${H27}/writes.json`,
    '202 task; its owner without %Admin_Operate gets 403',
  ),
  'POST /v2/database-dir/info': ev(`${H27}/verify-live.json`, '202 task read to Finished'),
  'POST /v2/task/suspend': ev(`${H23}/verify-live-mutate.json`, 'suspended and read back'),
  'POST /v2/task/resume': ev(`${H23}/verify-live-mutate.json`, 'resumed'),
  'POST /v2/journal/file/records': ev(`${H23}/m-list-limits.json`, 'returns half of maxRows'),
  'POST /v2/journal/file/integrity-check': ev(`${H23}/g-async.json`, '202 with {}, 415 without a body'),
  'PUT /v2/wallet/collection': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/wallet/collection': ev(`${H28}/sample-data.json`, 'deleted, then 404'),
  'PUT /v2/wallet/secret': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/wallet/secret': ev(`${H28}/sample-data.json`, 'deleted'),
  'PUT /v2/security/oauth2/resource-server': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/security/oauth2/resource-server': ev(`${H28}/sample-data.json`, 'deleted, then 404'),
  'POST /v2/security/oauth2/client/server-definition': ev(
    `${H28}/sample-data.json`,
    'created with discover=0 (false: 500)',
  ),
  'PUT /v2/fs-access-purpose': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/fs-access-purpose': ev(`${H28}/sample-data.json`, 'deleted, then 404'),
  'PUT /v2/security/privileged-routine': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/security/privileged-routine': ev(`${H28}/sample-data.json`, 'deleted, then 404'),
  'PUT /v2/doc-db': ev(`${H28}/sample-data.json`, 'create, read back'),
  'DELETE /v2/doc-db': ev(`${H28}/sample-data.json`, 'deleted, then 404'),
  'PUT /v2/security/oauth2/client/client-configuration': `refused: the documented object \`RedirectionEndpoint\` answers 400 ("needs to be a literal type") ([sample-data.json](${H28}/sample-data.json))`,
  'PUT /v2/security/oauth2/resource-server/mapping': `refused: \`Service\` "CSP" answers 500 (datatype validation) ([sample-data.json](${H28}/sample-data.json))`,
};

const byId = new Map(live.results.map((r) => [r.id, r]));
function liveCell(op) {
  if (WRITES[op.id]) return WRITES[op.id];
  const r = byId.get(op.id);
  if (op.id === 'GET /v2/async-result')
    return ev(`${H27}/verify-live.json`, 'one task read once to Finished');
  if (!r) return op.method === 'GET' ? '-' : 'not run: changes the instance';
  if (r.outcome === 'answered') {
    const n = r.specProblems?.length ?? 0;
    return `✓ 200${
      n
        ? `; differs from the spec: ${r.specProblems[0]
            .replace(/^result/, '')
            .replace(/ \[.*$|\{.*$/, '')
            .trim()}`
        : ''
    }`;
  }
  if (r.outcome === 'not found') return `404: ${String(r.error?.text ?? '').replace(/^ERROR #\d+: /, '')}`;
  if (r.outcome === 'not called') return `not run: ${r.reason}`;
  return `${r.status}: ${String(r.error?.text ?? r.error ?? '').slice(0, 80)}`;
}

const ops = index.operations;
const verified = (op) => liveCell(op).startsWith('✓');
const groups = new Map();
for (const op of ops) {
  if (!groups.has(op.group)) groups.set(op.group, []);
  groups.get(op.group).push(op);
}
const count = (pred) => ops.filter(pred).length;
const methods = ['GET', 'POST', 'PUT', 'DELETE'];
const row = (label, pred) =>
  `| ${label} | ${methods.map((m) => count((o) => o.method === m && pred(o))).join(' | ')} | ${count(pred)} |`;

const out = [];
out.push('# API coverage');
out.push('');
out.push(
  `Every operation of the SysAdmin API v2 specification (${ops.length}), with the screen of Aperture that calls it, what a real IRIS for Health 2026.2 (Build 221U) instance answered, and whether the online demo answers it. The API Explorer reaches every operation in any case; "Screen" names the hand-made screens that call it directly. Generated by \`scripts/coverage-doc.mjs\` from the spec index, the source, the demo's mock and [the live sweep](${liveDir}/coverage-live.json) of ${live.meta?.capturedAt?.slice(0, 10) ?? 'the run'}.`,
);
out.push('');
out.push('## Summary');
out.push('');
out.push('| | GET | POST | PUT | DELETE | All |');
out.push('| --- | ---: | ---: | ---: | ---: | ---: |');
out.push(row('Operations in the specification', () => true));
out.push(row('Called by a hand-made screen', (o) => screens.has(o.id)));
out.push(row('Verified on the real instance', verified));
out.push(row('Answered by the online demo', (o) => mock.has(o.id)));
out.push('');
out.push(
  '"Verified" means an answer read back from the instance: every GET that could be called with an object that exists (sample objects were created for the ones that had none, see `scripts/live/sample-data.mjs`), and every write in the evidence folders, each undone after its check. Writes that stop, delete or reconfigure what an instance runs on (terminating processes, dismounting or deleting databases, switching journals, licence and mirror changes) were not run here; the demo answers most of them.',
);
out.push('');
out.push('## Differences from the specification seen in this run');
out.push('');
out.push(
  'The sweep checked every answer against the schema the spec declares; the sample data met the rest:',
);
out.push('');
// Differences already recorded (README spec findings, or the evidence of 23 September).
const KNOWN = {
  'GET /v2/database-dirs': 'spec finding 1',
  'GET /v2/monitor/dashboard/main': 'spec finding 11',
  'GET /v2/security/services': 'spec finding 9',
  'GET /v2/locks': 'recorded on 23 September',
  'GET /v2/namespace/global-mappings': 'recorded on 23 September',
  'GET /v2/security/role/owners': 'recorded on 23 September',
};
const diffs = live.results.filter((r) => r.outcome === 'answered' && r.specProblems?.length);
for (const r of diffs)
  out.push(
    `- \`${r.id}\`: ${r.specProblems[0].replace(/ \[.*$| \{.*$/, '')}${KNOWN[r.id] ? ` (known: ${KNOWN[r.id]})` : ' (new)'}.`,
  );
out.push(
  '- `POST /v2/security/oauth2/client/server-definition?discover=false` answers 500 ("Datatype value \'false\' is not a valid boolean"); `discover=0` works.',
);
out.push(
  '- `PUT /v2/security/oauth2/client/client-configuration` refuses the body the spec describes: `OAuth2ServerDefinition` is not expected (IRIS takes `ServerDefinition`, spec finding 6), and `RedirectionEndpoint` must be a literal, not the documented object.',
);
out.push(
  '- `PUT /v2/security/oauth2/resource-server/mapping` answers 500 on `Service` "CSP" (datatype validation) instead of 400; `PUT /v2/security/oauth2/resource-server` needs an `IssuerEndpoint` that names an existing server definition (422 otherwise).',
);
out.push('');
for (const [group, list] of groups) {
  out.push(`## \`${group}\``);
  out.push('');
  out.push('| Operation | Screen | On IRIS for Health 2026.2 | Demo |');
  out.push('| --- | --- | --- | :-: |');
  for (const op of list) {
    const scr = screens.has(op.id) ? [...screens.get(op.id)].sort().join(', ') : '';
    out.push(`| \`${op.method} ${op.path}\` | ${scr} | ${liveCell(op)} | ${mock.has(op.id) ? '✓' : ''} |`);
  }
  out.push('');
}
out.push('## Reproduce');
out.push('');
out.push('```bash');
out.push(
  'node --env-file=$HOME/.aperture/iris-live.env scripts/live/sample-data.mjs --out docs/verification/<run>   # writes: sample objects',
);
out.push(
  'node --env-file=$HOME/.aperture/iris-live.env scripts/live/coverage.mjs --out docs/verification/<run>      # read-only',
);
out.push('node scripts/coverage-doc.mjs docs/verification/<run>/coverage-live.json > docs/COVERAGE.md');
out.push('```');
out.push('');
console.log(out.join('\n'));
