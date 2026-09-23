#!/usr/bin/env node
// Read-only evidence for the REST services screen: what /api/mgmnt (outside the SysAdmin API)
// answers, and to which credentials. It signs in and out and reads; it changes nothing.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/mgmnt.mjs --out docs/verification/<run>
//     --keep-lan   keep LAN addresses and host names (scratch runs that are not committed)
import { account, basicHeader, evidenceWriter, http, IRIS_URL, signIn } from './lib.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'docs/verification/live';
const LAN = !argv.includes('--keep-lan');
const admin = account('admin');
if (!admin) {
  console.error('IRIS_USER / IRIS_PASSWORD are not set (use node --env-file=…)');
  process.exit(2);
}

const base = `${IRIS_URL}/api/mgmnt`;
const keysOf = (rows) =>
  [...new Set((Array.isArray(rows) ? rows : []).flatMap((r) => Object.keys(r)))].sort();
const brief = (r) => ({
  status: r.status,
  wwwAuthenticate: r.headers['www-authenticate'],
  contentType: r.headers['content-type'],
  ...(Array.isArray(r.json) ? { rows: r.json.length, keys: keysOf(r.json) } : { body: r.json ?? r.text }),
});

const first = await signIn(admin);
const info = await http('GET', '/info', { auth: first.auth });
const save = evidenceWriter(OUT, { serverVersion: () => info.json?.result?.serverVersion ?? null, lan: LAN });
const settings = await http('GET', `/v2/web-app?name=${encodeURIComponent('/api/mgmnt')}`, {
  auth: first.auth,
});
if (first.mode === 'jwt')
  await http('POST', '/logout', { auth: first.auth, body: { refresh_token: first.tokens.refresh_token } });

const accounts = {};
for (const [kind, acct] of [
  ['admin', admin],
  ['operator', account('op')],
]) {
  if (!acct) continue;
  const s = await signIn(acct);
  const basic = basicHeader(acct);
  const sys = await http('GET', '/v1/%25SYS/restapps', { auth: basic, base });
  const user = await http('GET', '/v1/USER/restapps', { auth: basic, base });
  const v2 = await http('GET', '/v2/', { auth: basic, base });
  accounts[kind] = {
    sessionMode: s.mode,
    v2WithSessionToken: brief(await http('GET', '/v2/', { auth: s.auth, base })),
    v2WithBasic: brief(v2),
    v1RestappsSys: brief(sys),
    v1RestappsUser: brief(user),
    v1SameListInEveryNamespace: user.status === 200 && JSON.stringify(sys.json) === JSON.stringify(user.json),
    v2Namespaces: Array.isArray(v2.json) ? [...new Set(v2.json.map((a) => a.namespace))].sort() : null,
  };
  if (kind === 'admin') {
    accounts[kind].restapps = Array.isArray(sys.json)
      ? sys.json.map(({ name, namespace, dispatchClass, enabled }) => ({
          name,
          namespace,
          dispatchClass,
          enabled,
        }))
      : null;
    const spec = await http('GET', '/v1/%25SYS/spec/api/admin', { auth: basic, base });
    accounts[kind].specOfApiAdmin = {
      status: spec.status,
      swagger: spec.json?.swagger,
      basePath: spec.json?.basePath,
      paths: Object.keys(spec.json?.paths ?? {}).length,
      operations: Object.values(spec.json?.paths ?? {}).reduce((n, ops) => n + Object.keys(ops).length, 0),
    };
    accounts[kind].unknownNamespace = brief(await http('GET', '/v1/NOPE/restapps', { auth: basic, base }));
  }
  if (s.mode === 'jwt')
    await http('POST', '/logout', { auth: s.auth, body: { refresh_token: s.tokens.refresh_token } });
}

const file = save('o-mgmnt', {
  assumption:
    '/api/mgmnt lists the REST applications and describes their routes; it takes the same credentials as /api/admin',
  webApplication: {
    status: settings.status,
    JWTAuthEnabled: settings.json?.result?.JWTAuthEnabled,
    AutheEnabled: settings.json?.result?.AutheEnabled,
    DispatchClass: settings.json?.result?.DispatchClass,
  },
  withoutCredentials: brief(await http('GET', '/v2/', { base })),
  accounts,
});
console.log(`wrote ${file}`);
for (const [kind, a] of Object.entries(accounts))
  console.log(
    `• ${kind}: session token ${a.v2WithSessionToken.status}, Basic ${a.v2WithBasic.status}; restapps %SYS ${a.v1RestappsSys.status}` +
      ` (${a.v1RestappsSys.rows ?? '-'}), USER ${a.v1RestappsUser.status}; same list: ${a.v1SameListInEveryNamespace}`,
  );
