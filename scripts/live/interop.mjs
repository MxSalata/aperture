#!/usr/bin/env node
// Read-only evidence for the production screens: what /api/interop-editors (outside the SysAdmin API)
// answers, to which credentials, and in which shapes. It signs in and out and reads; the message
// search it starts is a read too. Nothing of the instance changes.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/interop.mjs --out docs/verification/<run>
//     --production NS/Class   the production to describe (default APERTURELAB/Aperture.Lab.Production,
//                             the test production of scripts/live/lab.mjs)
//     --keep-lan              keep LAN addresses and host names (scratch runs that are not committed)
// Writes p-interop.json.
import { account, basicHeader, evidenceWriter, http, IRIS_URL, signIn } from './lib.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const OUT = arg('--out', 'docs/verification/live');
const [NS, PRODUCTION] = arg('--production', 'APERTURELAB/Aperture.Lab.Production').split('/');
const LAN = !argv.includes('--keep-lan');
const admin = account('admin');
if (!admin) {
  console.error('IRIS_USER / IRIS_PASSWORD are not set (use node --env-file=…)');
  process.exit(2);
}

const base = `${IRIS_URL}/api/interop-editors`;
const first = (v, n = 3) => (Array.isArray(v) ? v.slice(0, n) : v);
// The first entries and the last one, which ends a log longer than IRIS returns ({"Id":"more..."}).
const ends = (v) => (Array.isArray(v) && v.length > 3 ? [...first(v), v.at(-1)] : v);
const brief = (r, keep = (j) => j) => ({
  status: r.status,
  contentType: r.headers['content-type'],
  body: keep(r.json ?? r.text),
});

const session = await signIn(admin);
const info = await http('GET', '/info', { auth: session.auth });
const write = evidenceWriter(OUT, { serverVersion: () => info.json?.result?.serverVersion ?? '', lan: LAN });
const claims = session.tokens?.access_token
  ? JSON.parse(Buffer.from(session.tokens.access_token.split('.')[1], 'base64url').toString())
  : null;
const get = (path, auth = session.auth) => http('GET', path, { auth, base });

// The session's own token on this application of the same by-ID group, and the password beside it.
const withToken = await get('/info');
const withBasic = await get('/info', basicHeader(admin));
const permissions = await get('/v7/%25SYS/permissions');
const languages = {};
for (const lang of ['*', 'en', 'fr'])
  languages[lang] = (
    await http('GET', '/v7/%25SYS/session/language', {
      auth: session.auth,
      base,
      headers: { 'Accept-Language': lang },
    })
  ).json;

const namespaces = {};
for (const { name } of withToken.json?.namespaces ?? []) {
  const ns = encodeURIComponent(name);
  namespaces[name] = {
    productions: (await get(`/v7/${ns}/productions`)).json,
    status: (await get(`/v7/${ns}/productions/status`)).json,
  };
}

const p = `/v7/${encodeURIComponent(NS)}/productions/${encodeURIComponent(PRODUCTION)}`;
const definition = await get(p);
const items = definition.json?.Items ?? [];
const hosts = {};
for (const it of items) {
  const h = encodeURIComponent(it.name);
  hosts[it.name] = {
    log: brief(await get(`${p}/${h}/log`), (j) => ({ ...j, children: ends(j?.children) })),
    messages: brief(await get(`${p}/${h}/messages`), (j) => ({ ...j, messages: first(j?.messages) })),
    queue: brief(await get(`${p}/${h}/queue`), (j) => ({ ...j, children: first(j?.children) })),
    jobs: brief(await get(`${p}/${h}/jobs`)),
  };
}
const byName = items[0] ? await get(`${p}/${encodeURIComponent(items[0].name)}`) : null;
const byId = items[0] ? await get(`${p}/${encodeURIComponent(items[0].itemId)}`) : null;
const search = await http('POST', `/v7/${encodeURIComponent(NS)}/messages`, {
  auth: session.auth,
  base,
  body: {},
});
const searchId = search.json?.searchID;
const results = searchId
  ? await get(
      `/v7/${encodeURIComponent(NS)}/messages?searchID=${encodeURIComponent(searchId)}&offset=0&limit=3`,
    )
  : null;

const file = write('p-interop', {
  assumption:
    "/api/interop-editors (the API of IRIS's own Interoperability UI) takes the token of /api/admin/login, reports the account's privileges, and answers the reads of the production screens in these shapes",
  token: {
    claims: claims && {
      app: claims.app,
      iss: claims.iss,
      lifetimeSeconds: claims.exp - Math.floor(claims.iat),
    },
    info: {
      status: withToken.status,
      apiVersion: withToken.json?.apiVersion,
      product: withToken.json?.product,
    },
    infoWithBasic: { status: withBasic.status },
    permissions: brief(permissions),
  },
  privileges: withToken.json?.privileges,
  languageFollowsAcceptLanguage: languages,
  namespaces,
  production: {
    name: `${NS}/${PRODUCTION}`,
    definition: brief(definition, (j) => ({ ...j, children: first(j?.children, 2), Items: j?.Items })),
    connections: brief(await get(`${p}/connections`)),
    categories: brief(await get(`${p}/categories`)),
    hostByName: byName && brief(byName),
    hostById: byId && brief(byId, (j) => ({ ...j, children: first(j?.children, 2) })),
    settings: items[0]
      ? brief(
          await get(
            `${p}/${items[0].type}/${encodeURIComponent(items[0].classname)}/settings?hostName=${encodeURIComponent(items[0].name)}`,
          ),
          (j) => first(j, 2),
        )
      : null,
    hosts,
  },
  messageSearch: { start: brief(search), results: results && brief(results) },
});
await http('POST', '/logout', { auth: session.auth });
console.log(
  `wrote ${file}: ${Object.keys(namespaces).length} namespaces, ${items.length} hosts of ${PRODUCTION}`,
);
