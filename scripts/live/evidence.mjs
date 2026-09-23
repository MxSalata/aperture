#!/usr/bin/env node
// Read-only evidence from a real instance for the assumptions Aperture makes (docs/VERIFICATION.md).
// It signs in, reads, and queues read-only tasks (database metrics, audit and journal queries,
// a journal integrity check); it creates, changes and deletes nothing. The one exception to
// "reads only" is that it signs in and out, which IRIS records in its audit log.
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/evidence.mjs --out docs/verification/<run>
//     --keep-lan   keep LAN addresses and host names (scratch runs that are not committed)
//     --reread     also show that re-reading an ended async task logs an alert (posts 2 alerts)
//
// Every file under --out is stamped with IRIS_IMAGE and the server's version string.
import {
  account,
  basicHeader,
  evidenceWriter,
  http,
  shape,
  signIn,
  waitForTask,
  IRIS_URL,
  PREFIX,
} from './lib.mjs';
import { check, index, resultSchema } from './spec.mjs';

const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'docs/verification/live';
const LAN = !argv.includes('--keep-lan');

const admin = account('admin');
const op = account('op');
if (!admin) {
  console.error('IRIS_USER / IRIS_PASSWORD are not set (use node --env-file=…)');
  process.exit(2);
}

let serverVersion = null;
const save = evidenceWriter(OUT, { serverVersion: () => serverVersion, lan: LAN });
const summary = [];
function note(id, detail, extra = {}) {
  summary.push({ id, detail, ...extra });
  console.log(`• ${id}: ${detail}`);
}

/** JWT claims without the signature: which fields the server puts in its tokens. */
function claims(jwt) {
  try {
    const [h, p] = jwt
      .split('.')
      .slice(0, 2)
      .map((x) => JSON.parse(Buffer.from(x, 'base64url').toString('utf8')));
    // The issuer is <host>/<instance>: the instance name is evidence, the host name is not published.
    const iss = typeof p.iss === 'string' ? p.iss.replace(/^[^/]*/, '<iris-hostname>') : p.iss;
    return { header: h, payload: { ...p, iss, jti: p.jti ? '<jti>' : undefined } };
  } catch {
    return null;
  }
}
const tokenSummary = (t) =>
  t && {
    keys: Object.keys(t),
    access: t.access_token ? `<jwt ${t.access_token.length} chars>` : null,
    refresh: t.refresh_token ? `<jwt ${t.refresh_token.length} chars>` : null,
    exp: t.exp,
    accessClaims: t.access_token ? claims(t.access_token) : null,
    refreshClaims: t.refresh_token ? claims(t.refresh_token) : null,
  };
/** Token answers are not enveloped on 2026.2 (the spec shows no envelope either); accept both. */
const tok = (r) => r.json?.result ?? r.json;
const strip = (r) => ({ ...r, json: r.json, text: r.text?.slice(0, 400) });

// ---- j. sign-in ---------------------------------------------------------------------------------
{
  const anon = await http('GET', '/info');
  const basic = await http('GET', '/info', { auth: basicHeader(admin) });
  const info = basic.json?.result ?? basic.json;
  serverVersion = info?.serverVersion ?? null;
  const wrongBasic = await http('GET', '/info', {
    auth: basicHeader({ user: admin.user, password: 'aperture-wrong-password' }),
  });

  const login = await http('POST', '/login', { body: { user: admin.user, password: admin.password } });
  const t1 = tok(login);
  const bearer = await http('GET', '/info', { auth: `Bearer ${t1?.access_token}` });

  // Refresh (rotation and replay are section k, each in a session of its own).
  const refresh = await http('POST', '/refresh', { body: { refresh_token: t1?.refresh_token } });
  const t2 = tok(refresh);

  // Logout the way Aperture does it (bearer + refresh token in a JSON body), then reuse both.
  const t2Access = t2?.access_token ?? t1?.access_token;
  const t2Refresh = t2?.refresh_token ?? t1?.refresh_token;
  const logout = await http('POST', '/logout', {
    auth: `Bearer ${t2Access}`,
    body: { refresh_token: t2Refresh },
  });
  const accessAfterLogout = await http('GET', '/info', { auth: `Bearer ${t2Access}` });
  const refreshAfterLogout = await http('POST', '/refresh', { body: { refresh_token: t2Refresh } });

  // Logout as the spec declares it (no body): is the refresh token still revoked?
  const l3 = await http('POST', '/login', { body: { user: admin.user, password: admin.password } });
  const t3 = tok(l3);
  const logoutNoBody = await http('POST', '/logout', { auth: `Bearer ${t3?.access_token}` });
  const accessAfterLogoutNoBody = await http('GET', '/info', { auth: `Bearer ${t3?.access_token}` });
  const refreshAfterLogoutNoBody = await http('POST', '/refresh', {
    body: { refresh_token: t3?.refresh_token },
  });
  if (accessAfterLogoutNoBody.status === 200)
    await http('POST', '/logout', {
      auth: `Bearer ${t3?.access_token}`,
      body: { refresh_token: t3?.refresh_token },
    });

  const badLogin = await http('POST', '/login', {
    body: { user: admin.user, password: 'aperture-wrong-password' },
  });
  const unknownRole = await http('POST', '/login', {
    body: { user: admin.user, password: admin.password, role: 'ApertureNoSuchRole' },
  });
  if (tok(unknownRole)?.access_token)
    await http('POST', '/logout', {
      auth: `Bearer ${tok(unknownRole).access_token}`,
      body: { refresh_token: tok(unknownRole).refresh_token },
    });

  let opPart = null;
  if (op) {
    const opBasic = await http('GET', '/info', { auth: basicHeader(op) });
    const opLogin = await http('POST', '/login', { body: { user: op.user, password: op.password } });
    const ot = tok(opLogin);
    const opRole = await http('POST', '/login', {
      body: { user: op.user, password: op.password, role: '%Manager' },
    });
    for (const t of [ot, tok(opRole)])
      if (t?.access_token)
        await http('POST', '/logout', {
          auth: `Bearer ${t.access_token}`,
          body: { refresh_token: t.refresh_token },
        });
    opPart = {
      basicInfo: strip(opBasic),
      login: { status: opLogin.status, headers: opLogin.headers, tokens: tokenSummary(ot) },
      loginWithNonEscalationRole: {
        request: { role: '%Manager' },
        status: opRole.status,
        body: opRole.json ?? opRole.text,
        tokens: tokenSummary(tok(opRole)),
      },
    };
  }

  save('j-sign-in', {
    assumption: 'JWT login, refresh, logout revocation, Basic fallback, error answers',
    unauthenticated: strip(anon),
    basicInfo: {
      status: basic.status,
      headers: basic.headers,
      enveloped: !!basic.json?.result,
      body: basic.json,
    },
    basicWrongPassword: strip(wrongBasic),
    login: { status: login.status, headers: login.headers, tokens: tokenSummary(t1) },
    bearerInfo: { status: bearer.status },
    refresh: {
      status: refresh.status,
      tokens: tokenSummary(t2),
      refreshTokenRotated: !!t2?.refresh_token && t2.refresh_token !== t1?.refresh_token,
    },
    logoutWithBody: { status: logout.status, headers: logout.headers, body: logout.json ?? logout.text },
    accessTokenAfterLogout: { status: accessAfterLogout.status },
    refreshTokenAfterLogout: {
      status: refreshAfterLogout.status,
      body: refreshAfterLogout.json ?? refreshAfterLogout.text,
    },
    logoutWithoutBody: {
      status: logoutNoBody.status,
      headers: logoutNoBody.headers,
      body: logoutNoBody.json ?? logoutNoBody.text,
    },
    accessTokenAfterLogoutWithoutBody: { status: accessAfterLogoutNoBody.status },
    refreshTokenAfterLogoutWithoutBody: { status: refreshAfterLogoutNoBody.status },
    wrongPasswordLogin: strip(badLogin),
    loginWithUnknownRole: {
      status: unknownRole.status,
      body: unknownRole.json ?? unknownRole.text,
      tokens: tokenSummary(tok(unknownRole)),
    },
    operator: opPart,
  });
  note(
    'j',
    `server ${serverVersion}; /info ${basic.status} (${basic.json?.result ? 'enveloped' : 'unwrapped'}); login ${login.status}; refresh ${refresh.status} (rotated ${t2?.refresh_token !== t1?.refresh_token}); logout ${logout.status} → access ${accessAfterLogout.status}, refresh ${refreshAfterLogout.status}; bodiless logout ${logoutNoBody.status} → access ${accessAfterLogoutNoBody.status}, refresh ${refreshAfterLogoutNoBody.status}; unknown role ${unknownRole.status}; wrong password ${badLogin.status} / Basic ${wrongBasic.status} (${wrongBasic.headers['www-authenticate'] ?? 'no WWW-Authenticate'})`,
  );
}

const session = await signIn(admin);
const A = session.auth;
const opSession = op ? await signIn(op) : null;
const get = (path, auth = A) => http('GET', path, { auth });
const resultOf = (r) => r.json?.result;

// ---- a/b. role grants and owners ----------------------------------------------------------------
{
  const roles = await get('/v2/security/roles');
  const names = (resultOf(roles) ?? []).map((r) => r.Name);
  const details = {};
  const grantShapes = new Set();
  for (const name of names) {
    const r = await get(`/v2/security/role?name=${encodeURIComponent(name)}`);
    details[name] = { status: r.status, result: resultOf(r) };
    for (const g of resultOf(r)?.Resources ?? [])
      grantShapes.add(typeof g === 'object' ? Object.keys(g).sort().join(',') : typeof g);
  }
  const owners = {};
  const ownerShapes = new Set();
  for (const name of ['%All', '%Manager', '%Operator', '%Developer'].filter((n) => names.includes(n))) {
    const r = await get(`/v2/security/role/owners?name=${encodeURIComponent(name)}`);
    owners[name] = { status: r.status, result: resultOf(r) };
    for (const o of resultOf(r) ?? [])
      ownerShapes.add(typeof o === 'object' ? Object.keys(o).sort().join(',') : typeof o);
  }
  save('a-role-grants', {
    assumption: 'Role Resources is [{Name, Permissions}] on GET',
    list: { status: roles.status, result: resultOf(roles) },
    details,
  });
  save('b-role-owners', { assumption: 'Role owners are [{Name, Type, AdminOption}]', owners });
  note('a', `${names.length} roles; Resources items shaped ${[...grantShapes].join(' | ') || 'n/a'}`);
  note(
    'b',
    `owner items shaped ${[...ownerShapes].join(' | ') || 'n/a'}; types seen ${[...new Set(Object.values(owners).flatMap((o) => (o.result ?? []).map((x) => x.Type)))].join(', ')}`,
  );
}

// ---- c. databases, volumes, journal files ---------------------------------------------------------
let userDir = null;
let journalFile = null;
{
  const dbs = await get('/v2/databases');
  const dirs = await get('/v2/database-dirs');
  const dirList = Array.isArray(resultOf(dirs)) ? resultOf(dirs) : [resultOf(dirs)];
  userDir = dirList.find((d) => /\/user\/?$/i.test(d?.Directory ?? ''))?.Directory ?? dirList[0]?.Directory;
  const sample = dirList.slice(0, 40).map((d) => d.Directory);
  const perDir = {};
  const volumeShapes = new Set();
  for (const dir of sample) {
    const one = await get(`/v2/database-dir?dir=${encodeURIComponent(dir)}`);
    const vols = await get(`/v2/database-dir/volumes?dir=${encodeURIComponent(dir)}`);
    perDir[dir] = {
      dir: { status: one.status, result: resultOf(one) },
      volumes: { status: vols.status, result: resultOf(vols) },
    };
    const v = resultOf(vols);
    volumeShapes.add(Array.isArray(v) ? `array of {${Object.keys(v[0] ?? {}).join(',')}}` : shape(v));
  }
  const byName = await get('/v2/database?name=USER');
  const jfiles = await get('/v2/journal/files');
  const jlist = resultOf(jfiles) ?? [];
  journalFile = jlist.at(-1)?.Name ?? jlist[0]?.Name ?? null;
  const jOne = journalFile ? await get(`/v2/journal/file?file=${encodeURIComponent(journalFile)}`) : null;
  const specDirs = check(resultSchema('GET', '/v2/database-dirs'), resultOf(dirs));
  save('c-databases', {
    assumption:
      'Volumes are [{VolumeNumber, VolumeDirectory, File, Size, DiskFree}]; database-dirs differs from the spec',
    databases: { status: dbs.status, result: resultOf(dbs) },
    databaseDirs: {
      status: dirs.status,
      resultShape: shape(resultOf(dirs)),
      specProblems: specDirs.problems.slice(0, 20),
      result: resultOf(dirs),
    },
    databaseByName: { status: byName.status, result: resultOf(byName) },
    perDirectory: perDir,
  });
  save('c-journal', {
    assumption: 'Journal-file Databases are [{SFN, DatabasePathOrAlias}]',
    files: { status: jfiles.status, result: jlist },
    file: jOne && { name: journalFile, status: jOne.status, result: resultOf(jOne) },
  });
  const jdb = resultOf(jOne)?.Databases;
  note(
    'c',
    `database-dirs is ${shape(resultOf(dirs)).slice(0, 80)}; volumes ${[...volumeShapes].join(' | ')}; journal Databases ${Array.isArray(jdb) ? `array of {${Object.keys(jdb[0] ?? {}).join(',')}}` : shape(jdb)}`,
  );
}

// ---- d. AutheEnabled of web applications and services ---------------------------------------------
{
  const apps = await get('/v2/web-apps');
  const appRows = [];
  for (const a of resultOf(apps) ?? []) {
    const d = await get(`/v2/web-app?name=${encodeURIComponent(a.Name)}`);
    const r = resultOf(d) ?? {};
    appRows.push({
      name: a.Name,
      list: a,
      AutheEnabled: r.AutheEnabled,
      AuthenticationMethods: r.AuthenticationMethods ?? a.AuthenticationMethods,
      detail: r,
    });
  }
  const svcs = await get('/v2/security/services');
  const svcRows = [];
  for (const s of resultOf(svcs) ?? []) {
    const d = await get(`/v2/security/service?name=${encodeURIComponent(s.Name)}`);
    svcRows.push({ name: s.Name, list: s, detail: resultOf(d) });
  }
  // Which method names travel with which bits: for every bit, the method names of every app/service that has it.
  const byBit = {};
  for (const row of [
    ...appRows,
    ...svcRows.map((s) => ({
      ...s,
      AutheEnabled: s.detail?.AutheEnabled,
      AuthenticationMethods: s.list?.AuthenticationMethods ?? s.detail?.AuthenticationMethods,
    })),
  ]) {
    const v = Number(row.AutheEnabled);
    if (!Number.isFinite(v)) continue;
    for (let bit = 0; bit < 32; bit++)
      if (v & (1 << bit))
        (byBit[bit] ??= []).push({ name: row.name, methods: row.AuthenticationMethods ?? null });
  }
  save('d-authe-enabled', {
    assumption: 'AutheEnabled bit numbering (src/features/security/keys.ts) and round trip',
    webApps: appRows,
    services: svcRows,
    byBit,
  });
  note(
    'd',
    `${appRows.length} web apps, ${svcRows.length} services; bits in use: ${Object.keys(byBit).join(', ')}; list rows carry ${Object.keys((resultOf(apps) ?? [])[0] ?? {}).join(',')}`,
  );
}

// ---- e. native monitor: counters only (the alerts cursor is read by the mutating probe) -------------
{
  const res = await fetch(`${IRIS_URL}/api/monitor/metrics`);
  const text = await res.text();
  const lines = text.split('\n').filter((l) => /alert|iris_system_state/i.test(l));
  save('e-monitor-counters', {
    assumption: 'iris_system_alerts_log / _new are counters that /metrics does not consume',
    status: res.status,
    contentType: res.headers.get('content-type'),
    lines,
    metricNames: [
      ...new Set(
        text
          .split('\n')
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split(/[{ ]/)[0]),
      ),
    ],
  });
  note('e', lines.filter((l) => !l.startsWith('#')).join('; '));
}

// ---- g. async tasks --------------------------------------------------------------------------------
{
  const q = `/v2/database-dir/info?dir=${encodeURIComponent(userDir)}`;
  const accepted = await http('POST', q, { auth: A });
  const location = accepted.headers.location ?? null;
  const id = location ? new URL(location, IRIS_URL).searchParams.get('id') : accepted.json?.result?.GUID;
  const polled = id ? await waitForTask(A, id) : null;
  // The Location header as given (it names v1 on a v2 call): does it answer too?
  const viaLocation = location
    ? await http('GET', '', { auth: A, base: new URL(location, IRIS_URL).href })
    : null;
  const opOther =
    opSession && id
      ? await http('GET', `/v2/async-result?id=${encodeURIComponent(id)}`, { auth: opSession.auth })
      : null;
  const opOwn = opSession ? await http('POST', q, { auth: opSession.auth }) : null;
  const opOwnId = opOwn?.headers.location
    ? new URL(opOwn.headers.location, IRIS_URL).searchParams.get('id')
    : null;
  const opOwnPolled = opOwnId ? await waitForTask(opSession.auth, opOwnId) : null;
  const list = await get('/v2/async-results');
  // 415 check on an operation that declares an optional body: a journal integrity check is read-only.
  const jicNoBody = journalFile
    ? await http('POST', `/v2/journal/file/integrity-check?file=${encodeURIComponent(journalFile)}`, {
        auth: A,
      })
    : null;
  const jicEmpty = journalFile
    ? await http('POST', `/v2/journal/file/integrity-check?file=${encodeURIComponent(journalFile)}`, {
        auth: A,
        body: {},
      })
    : null;
  for (const r of [jicNoBody, jicEmpty]) {
    const jid = r?.headers.location ? new URL(r.headers.location, IRIS_URL).searchParams.get('id') : null;
    if (jid) r.task = strip(await waitForTask(A, jid));
  }
  save('g-async', {
    assumption:
      '202 carries the task id in Location (naming /v1/async-result even on v2); polling; privilege',
    accepted: {
      request: `POST ${q.replace(/dir=[^&]+/, 'dir=<user database>')}`,
      status: accepted.status,
      headers: accepted.headers,
      body: accepted.json ?? accepted.text,
    },
    polled: polled && strip(polled),
    locationAsGiven: viaLocation && { status: viaLocation.status, state: viaLocation.json?.result?.State },
    operatorReadsAdminTask: opOther && strip(opOther),
    operatorOwnTask: opOwn && {
      status: opOwn.status,
      headers: opOwn.headers,
      polled: opOwnPolled && strip(opOwnPolled),
    },
    list: { status: list.status, result: resultOf(list) },
    optionalBody415: {
      operation: 'POST /v2/journal/file/integrity-check (body {CheckDetails} optional)',
      withoutBody: jicNoBody && strip(jicNoBody),
      withEmptyObject: jicEmpty && strip(jicEmpty),
    },
  });
  note(
    'g',
    `202=${accepted.status} Location=${location}; poll → ${polled?.json?.result?.State}; Location as given → ${viaLocation?.status}; %Operator reads admin task → ${opOther?.status}; own → ${opOwn?.status}/${opOwnPolled?.status}; integrity check without body → ${jicNoBody?.status}, with {} → ${jicEmpty?.status}`,
  );
}

// ---- h + spec sweep: every parameterless GET, as both accounts ---------------------------------------
const sweep = {};
const bodies = {};
{
  const ops = index.operations.filter(
    (o) => o.method === 'GET' && o.path.startsWith('/v2/') && !o.params.some((p) => p.required),
  );
  for (const o of ops) {
    const r = await get(o.path);
    const res = resultOf(r);
    const c =
      r.status === 200 ? check(resultSchema('GET', o.path), res) : { problems: [], undeclared: new Set() };
    const hasMax = o.params.some((p) => p.name === 'maxRows');
    const one = hasMax && Array.isArray(res) && res.length > 1 ? await get(`${o.path}?maxRows=1`) : null;
    const opR = opSession ? await get(o.path, opSession.auth) : null;
    sweep[o.path] = {
      status: r.status,
      operatorStatus: opR?.status ?? null,
      count: Array.isArray(res) ? res.length : null,
      atDefaultLimit: Array.isArray(res) && res.length === 1000,
      maxRows1: one ? (Array.isArray(resultOf(one)) ? resultOf(one).length : shape(resultOf(one))) : null,
      specProblems: c.problems.slice(0, 15),
      specProblemCount: c.problems.length,
      undeclared: [...c.undeclared].slice(0, 40),
      error: r.status >= 400 ? (r.json?.status ?? r.text?.slice(0, 200)) : undefined,
    };
    if (r.status === 200) bodies[o.path] = res;
  }
  // Journal records: the natural candidate for a list longer than the default maxRows.
  if (journalFile) {
    const rec = await http('POST', `/v2/journal/file/records?file=${encodeURIComponent(journalFile)}`, {
      auth: A,
    });
    const rid = rec.headers.location ? new URL(rec.headers.location, IRIS_URL).searchParams.get('id') : null;
    const done = rid ? await waitForTask(A, rid, { budgetMs: 120_000 }) : null;
    const rows = done?.json?.result?.Result;
    sweep['POST /v2/journal/file/records (no maxRows)'] = {
      status: rec.status,
      taskState: done?.json?.result?.State,
      count: Array.isArray(rows) ? rows.length : shape(rows),
      atDefaultLimit: Array.isArray(rows) && rows.length === 1000,
    };
    bodies['POST /v2/journal/file/records'] = Array.isArray(rows) ? rows.slice(0, 5) : rows;
  }
  // Audit records carry TimeStamp next to UTCTimeStamp: the instance's offset, measured.
  const aud = await http('POST', '/v2/security/audit/records?maxRows=25', { auth: A });
  const aid = aud.headers.location ? new URL(aud.headers.location, IRIS_URL).searchParams.get('id') : null;
  const adone = aid ? await waitForTask(A, aid) : null;
  bodies['POST /v2/security/audit/records'] = adone?.json?.result?.Result ?? adone?.json?.result ?? null;
  save('h-lists-and-spec-sweep', {
    assumption: 'Lists stop at maxRows (default 1000); every parameterless GET against the spec',
    sweep,
  });
  const limited = Object.entries(sweep)
    .filter(([, v]) => v.atDefaultLimit)
    .map(([k]) => k);
  const problems = Object.entries(sweep)
    .filter(([, v]) => v.specProblemCount)
    .map(([k, v]) => `${k} (${v.specProblemCount})`);
  note(
    'h',
    `${Object.keys(sweep).length} reads; at 1000: ${limited.join(', ') || 'none'}; maxRows=1 honoured by ${Object.values(sweep).filter((v) => v.maxRows1 === 1).length}; spec problems in ${problems.join(', ') || 'none'}`,
  );
}

// ---- f. timestamps: every date-like string, where it came from, and its form ---------------------------
{
  const DATE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  const seen = {};
  const walk = (v, where) => {
    if (typeof v === 'string' && DATE.test(v.trim())) {
      const key = where.replace(/\[\d+\]/g, '[]');
      const m = v.trim().match(DATE);
      const entry = (seen[key] ??= { form: m[1] ? (m[1] === 'Z' ? 'Z' : 'offset') : 'naive', examples: [] });
      if (entry.examples.length < 3) entry.examples.push(v);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  for (const [path, body] of Object.entries(bodies)) walk(body, path);
  const httpDate = (await http('GET', '/info', { auth: A })).headers;
  // Offset between local and UTC, from audit records that carry both.
  const aud = bodies['POST /v2/security/audit/records'];
  const pairs = (Array.isArray(aud) ? aud : [])
    .filter((r) => r.TimeStamp && r.UTCTimeStamp)
    .slice(0, 5)
    .map((r) => ({
      TimeStamp: r.TimeStamp,
      UTCTimeStamp: r.UTCTimeStamp,
      offsetMinutes: Math.round(
        (Date.parse(r.TimeStamp.replace(' ', 'T') + 'Z') -
          Date.parse(r.UTCTimeStamp.replace(' ', 'T') + 'Z')) /
          60000,
      ),
    }));
  save('f-timestamps', {
    assumption: 'Which fields are zoned (Z/±hh:mm) and which are instance-local',
    capturedAtUtc: new Date().toISOString(),
    headersOfOneResponse: httpDate,
    auditOffset: pairs,
    fields: seen,
  });
  const forms = Object.values(seen).reduce((a, f) => ({ ...a, [f.form]: (a[f.form] ?? 0) + 1 }), {});
  note(
    'f',
    `${Object.keys(seen).length} timestamp fields: ${JSON.stringify(forms)}; audit local−UTC offset ${pairs.map((p) => p.offsetMinutes).join(',') || 'n/a'} min`,
  );
}

// ---- i. error envelope ----------------------------------------------------------------------------
{
  const nf = await get('/v2/namespace?name=APERTURE_DOES_NOT_EXIST');
  const nr = await get('/v2/security/resource?name=ApertureDoesNotExist');
  // Error texts follow Accept-Language: what a browser in another language, and Node's '*', get.
  const lang = {};
  for (const l of ['*', 'de-DE,de;q=0.9', 'en-GB,en;q=0.9'])
    lang[l] = (
      await http('GET', '/v2/namespace?name=APERTURE_DOES_NOT_EXIST', {
        auth: A,
        headers: { 'Accept-Language': l },
      })
    ).json;
  save('i-error-envelope', {
    assumption: 'Error envelope shape (quirk error-envelope-variants)',
    namespaceNotFound: strip(nf),
    resourceNotFound: strip(nr),
    byAcceptLanguage: lang,
  });
  note('i', `missing namespace → ${nf.status} ${JSON.stringify(nf.json?.status ?? nf.text).slice(0, 160)}`);
}

// ---- k. token lifetime: each rule in a session of its own ---------------------------------------------
{
  const loginAs = async () =>
    tok(await http('POST', '/login', { body: { user: admin.user, password: admin.password } }));
  const infoWith = async (t) => (await http('GET', '/info', { auth: `Bearer ${t}` })).status;
  const refreshWith = async (rt) => {
    const r = await http('POST', '/refresh', { body: { refresh_token: rt } });
    return { status: r.status, t: tok(r) };
  };
  const out = {};
  {
    const t = await loginAs();
    const lo = await http('POST', '/logout', {
      auth: `Bearer ${t.access_token}`,
      body: { refresh_token: t.refresh_token },
    });
    out.logoutBearerAndBody = {
      logout: lo.status,
      accessAfter: await infoWith(t.access_token),
      refreshAfter: (await refreshWith(t.refresh_token)).status,
    };
  }
  {
    const t = await loginAs();
    const r = await refreshWith(t.refresh_token);
    const x = {
      refresh: r.status,
      newAccess: await infoWith(r.t.access_token),
      oldAccessAfterRefresh: await infoWith(t.access_token),
    };
    x.replayOldRefresh = (await refreshWith(t.refresh_token)).status;
    x.newAccessAfterReplay = await infoWith(r.t.access_token);
    x.newRefreshAfterReplay = (await refreshWith(r.t.refresh_token)).status;
    out.rotation = x;
  }
  {
    const t = await loginAs();
    const lo = await http('POST', '/logout', { auth: `Bearer ${t.access_token}` });
    out.logoutBearerOnly = {
      logout: lo.status,
      accessAfter: await infoWith(t.access_token),
      refreshAfter: (await refreshWith(t.refresh_token)).status,
    };
  }
  {
    const t = await loginAs();
    const lo = await http('POST', '/logout', { body: { refresh_token: t.refresh_token } });
    out.logoutBodyOnly = {
      logout: lo.status,
      accessAfter: await infoWith(t.access_token),
      refreshAfter: (await refreshWith(t.refresh_token)).status,
    };
    if (out.logoutBodyOnly.accessAfter === 200)
      await http('POST', '/logout', { auth: `Bearer ${t.access_token}` });
  }
  {
    const t = await loginAs();
    const c = (j) => JSON.parse(Buffer.from(j.split('.')[1], 'base64url'));
    const [ac, rc] = [c(t.access_token), c(t.refresh_token)];
    out.lifetimes = {
      accessSeconds: ac.exp - ac.iat,
      refreshSeconds: rc.exp - rc.iat,
      accessClaims: Object.keys(ac),
      refreshClaims: Object.keys(rc),
    };
    await http('POST', '/logout', { auth: `Bearer ${t.access_token}` });
  }
  save('k-token-lifetime', {
    assumption: 'JWT lifetimes, rotation, reuse revocation and logout variants (one fresh session per rule)',
    ...out,
  });
  note(
    'k',
    `access ${Math.round(out.lifetimes.accessSeconds)} s, refresh ${Math.round(out.lifetimes.refreshSeconds)} s; refresh → old access ${out.rotation.oldAccessAfterRefresh}; replayed refresh ${out.rotation.replayOldRefresh} → new pair ${out.rotation.newAccessAfterReplay}/${out.rotation.newRefreshAfterReplay}; logout bearer+body ${out.logoutBearerAndBody.logout}, bearer only ${out.logoutBearerOnly.logout}, body only ${out.logoutBodyOnly.logout}`,
  );
}

// ---- l. what an operator may read, against what the spec says ----------------------------------------
if (opSession) {
  const firstOf = async (path, key) => {
    const r = resultOf(await get(path));
    return Array.isArray(r) && r.length ? r[0]?.[key] : undefined;
  };
  const ids = {
    dir: userDir,
    file: journalFile,
    taskId: await firstOf('/v2/tasks', 'Id'),
    pid: await firstOf('/v2/processes', 'Pid'),
  };
  const names = {
    '/v2/security/user': admin.user,
    '/v2/security/role': '%Manager',
    '/v2/security/role/owners': '%Manager',
    '/v2/security/resource': '%DB_USER',
    '/v2/security/service': '%Service_Bindings',
    '/v2/web-app': '/api/admin',
    '/v2/namespace': 'USER',
    '/v2/database': 'USER',
  };
  const valueFor = (path, param) => {
    if (param === 'name') return names[path];
    if (param === 'id') return path.startsWith('/v2/process') ? ids.pid : ids.taskId;
    if (param === 'namespace') return 'USER';
    if (param === 'grantee') return admin.user;
    return ids[param];
  };
  const rows = [];
  for (const o of index.operations.filter((o) => o.method === 'GET' && o.path.startsWith('/v2/'))) {
    const q = new URLSearchParams();
    let complete = true;
    for (const p of o.params.filter((p) => p.required)) {
      const v = valueFor(o.path, p.name);
      if (v === undefined || v === null) {
        complete = false;
        break;
      }
      q.set(p.name, String(v));
    }
    if (!complete) continue;
    const path = q.toString() ? `${o.path}?${q}` : o.path;
    const [a, b] = [await get(path), await get(path, opSession.auth)];
    const specAllows = !o.privileges?.length || o.privileges.includes('%Admin_Operate:U');
    rows.push({
      path: o.path,
      spec: o.privileges.join(' or '),
      admin: a.status,
      operator: b.status,
      differs: a.status === 200 && specAllows !== (b.status === 200),
    });
  }
  save('l-operator-privileges', {
    assumption: 'An account holding %Operator gets what the spec says %Admin_Operate may read',
    rows,
  });
  note(
    'l',
    `${rows.length} reads; differ from the spec: ${
      rows
        .filter((r) => r.differs)
        .map((r) => `${r.path} (${r.operator})`)
        .join(', ') || 'none'
    }`,
  );
}

// ---- m. row limits the spec does not document ------------------------------------------------------------
{
  const count = async (p) => {
    const r = await get(p);
    return Array.isArray(resultOf(r)) ? resultOf(r).length : r.status;
  };
  const upcoming = {
    default: await count('/v2/task/upcoming'),
    maxRows150: await count('/v2/task/upcoming?maxRows=150'),
    maxRows1000: await count('/v2/task/upcoming?maxRows=1000'),
  };
  const journal = {};
  if (journalFile)
    for (const n of [null, 10, 20, 600, 1000]) {
      const r = await http(
        'POST',
        `/v2/journal/file/records?file=${encodeURIComponent(journalFile)}${n ? `&maxRows=${n}` : ''}`,
        { auth: A },
      );
      const id = r.headers.location ? new URL(r.headers.location, IRIS_URL).searchParams.get('id') : null;
      const done = id ? await waitForTask(A, id, { budgetMs: 120_000 }) : null;
      const rows = done?.json?.result?.Result;
      journal[n ? `maxRows${n}` : 'default'] = {
        returned: Array.isArray(rows) ? rows.length : null,
        firstAddresses: Array.isArray(rows) ? rows.slice(0, 5).map((x) => x.Address) : null,
      };
    }
  save('m-list-limits', {
    assumption: 'Lists stop at maxRows, default 1000 (spec)',
    taskUpcoming: upcoming,
    journalRecords: journal,
  });
  note(
    'm',
    `task/upcoming ${JSON.stringify(upcoming)}; journal records ${Object.entries(journal)
      .map(([k, v]) => `${k}→${v.returned}`)
      .join(', ')}`,
  );
}

// ---- n. (opt-in, posts alerts) reading an ended async task again ----------------------------------------
if (argv.includes('--reread')) {
  const alerts = async () => {
    const t = await (await fetch(`${IRIS_URL}/api/monitor/metrics`)).text();
    return Number(t.match(/^iris_system_alerts (\d+)/m)?.[1] ?? NaN);
  };
  const queue = async () => {
    const r = await http('POST', `/v2/database-dir/info?dir=${encodeURIComponent(userDir)}`, { auth: A });
    return new URL(r.headers.location, IRIS_URL).searchParams.get('id');
  };
  const read = async (id, v = 'v2') =>
    (await http('GET', '', { auth: A, base: `${IRIS_URL}${PREFIX}/${v}/async-result?id=${id}` })).json?.result
      ?.State;
  const untilEnded = async (id) => {
    for (let i = 0; i < 60; i++) {
      const s = await read(id);
      if (['Finished', 'Failed', 'Canceled'].includes(s)) return s;
      await new Promise((r) => setTimeout(r, 700));
    }
    return null;
  };
  const scenarios = {
    singleReadAfterEnd: async (id) => {
      await new Promise((r) => setTimeout(r, 4000));
      return [await read(id)];
    },
    readUntilEndThenV2Again: async (id) => [await untilEnded(id), await read(id)],
    readUntilEndThenV1Location: async (id) => [await untilEnded(id), await read(id, 'v1')],
  };
  const cases = {};
  for (const [name, run] of Object.entries(scenarios)) {
    const before = await alerts();
    const reads = await run(await queue());
    await new Promise((r) => setTimeout(r, 1500));
    cases[name] = { reads, newAlerts: (await alerts()) - before };
  }
  save('n-async-reread-alert', {
    assumption: 'Reading an ended async task again is harmless',
    cases,
    note: 'counted with iris_system_alerts of /api/monitor/metrics; each re-read logs ERROR #7846 "WQM attach passed invalid token" at severity 2 in messages.log',
  });
  note(
    'n',
    Object.entries(cases)
      .map(([k, v]) => `${k}: ${v.newAlerts} alert(s)`)
      .join('; '),
  );
}

for (const s of [session, opSession])
  if (s?.mode === 'jwt')
    await http('POST', '/logout', { auth: s.auth, body: { refresh_token: s.tokens.refresh_token } });

save('summary', { prefix: PREFIX, summary });
console.log(`\nwritten to ${OUT}`);
