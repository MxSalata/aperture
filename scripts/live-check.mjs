#!/usr/bin/env node
// Live conformance check of the SysAdmin API on a real IRIS instance.
//
// Verifies the assumptions Aperture makes against reality: login (JWT or Basic),
// /info shape, list endpoints, the 202 + Location / GUID pattern, error envelopes
// and the known spec quirks. Prints a report and optionally saves JSON evidence.
//
//   IRIS_URL=http://localhost:52773 IRIS_USER=_SYSTEM IRIS_PASSWORD=… node scripts/live-check.mjs [--save docs/verification/latest.json]
//   (without IRIS_PASSWORD, the password of the Docker image is read from .secrets/iris-password)
//   PORTAL_URL=http://localhost:52773/aperture/   (optional: also check the portal is served)
//   IRIS_API_PREFIX=/api/admin                    (or /iris/api/admin behind a web gateway)
//   --mutate                                      (opt-in: suspend and resume one task to check
//                                                  that the read-back reflects the change; CI passes it,
//                                                  a production instance should not)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const IRIS_URL = (process.env.IRIS_URL ?? 'http://localhost:52773').replace(/\/+$/, '');
const PREFIX = process.env.IRIS_API_PREFIX ?? '/api/admin';
const USER = process.env.IRIS_USER ?? '_SYSTEM';
// No default password: the Docker image has none that is well known (npm run iris:password).
const PASSWORD =
  process.env.IRIS_PASSWORD ??
  (existsSync('.secrets/iris-password') ? readFileSync('.secrets/iris-password', 'utf8').trim() : undefined);
if (!PASSWORD) {
  console.error(
    'Set IRIS_PASSWORD (or create .secrets/iris-password with npm run iris:password for the Docker image).',
  );
  process.exit(2);
}
const PORTAL_URL = process.env.PORTAL_URL;
const MUTATE = process.argv.includes('--mutate');
const saveIdx = process.argv.indexOf('--save');
const SAVE = saveIdx > 0 ? process.argv[saveIdx + 1] : null;
const base = `${IRIS_URL}${PREFIX}`;

/** The report is committed as evidence: a host other than this machine is named by role, not address. */
function publicUrl(url) {
  const u = new URL(url);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)) u.hostname = 'iris-host';
  return u.origin;
}

const report = {
  startedAt: new Date().toISOString(),
  irisUrl: publicUrl(IRIS_URL),
  prefix: PREFIX,
  user: USER,
  checks: [],
  serverVersion: null,
  auth: null,
  quirks: {},
};
let hardFailure = false;
let authHeader = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

function record(name, ok, detail, extra = {}) {
  report.checks.push({ name, ok, detail, ...extra });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` - ${detail}` : ''}`);
  return ok;
}

async function http(method, path, { body, auth = true, accept = 'application/json' } = {}) {
  // Browsers name their languages; without the header IRIS answers errors in the first
  // language it has (Arabic), which makes the saved evidence unreadable.
  const headers = { Accept: accept, 'Accept-Language': 'en' };
  if (auth) headers.Authorization = authHeader;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const started = Date.now();
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, ok: res.ok, headers: res.headers, json, text, ms: Date.now() - started };
}

const shape = (v) =>
  Array.isArray(v)
    ? `array[${v.length}]`
    : v === null
      ? 'null'
      : typeof v === 'object'
        ? `object{${Object.keys(v).slice(0, 6).join(',')}${Object.keys(v).length > 6 ? ',…' : ''}}`
        : typeof v;
const envelopeErrors = (j) => j?.status?.Errors ?? j?.status?.errors ?? j?.errors ?? null;

try {
  // 1. /info with Basic (works on every version that has the API)
  const info = await http('GET', '/info');
  const infoBody = info.json?.result ?? info.json;
  hardFailure |= !record(
    'GET /info with Basic auth',
    info.status === 200,
    `HTTP ${info.status} in ${info.ms} ms`,
    { status: info.status },
  );
  if (info.status === 200) {
    report.serverVersion = infoBody?.serverVersion ?? null;
    report.quirks.infoEnveloped = !!info.json?.result;
    record(
      '/info envelope',
      true,
      info.json?.result ? 'wrapped in {result} (differs from spec)' : 'unwrapped Info object (as documented)',
    );
    record(
      '/info privileges',
      !!infoBody?.privileges,
      `keys: ${Object.keys(infoBody?.privileges ?? {}).join(', ') || 'none'}`,
    );
    console.log(`   server: ${report.serverVersion}`);
  }

  // 2. JWT login
  const login = await http('POST', '/login', { body: { user: USER, password: PASSWORD }, auth: false });
  const tokens = login.json?.result ?? login.json;
  if (login.status === 200 && tokens?.access_token) {
    report.auth = 'jwt';
    record(
      'POST /login (JWT)',
      true,
      `access token ${tokens.access_token.length} chars, refresh ${tokens.refresh_token ? 'present' : 'absent'}, exp ${tokens.exp ?? '?'}`,
    );
    authHeader = `Bearer ${tokens.access_token}`;
    const bearer = await http('GET', '/info');
    record('Bearer token accepted on /info', bearer.status === 200, `HTTP ${bearer.status}`);
    if (tokens.refresh_token) {
      const refresh = await http('POST', '/refresh', {
        body: { refresh_token: tokens.refresh_token },
        auth: false,
      });
      const r2 = refresh.json?.result ?? refresh.json;
      record('POST /refresh', refresh.status === 200 && !!r2?.access_token, `HTTP ${refresh.status}`);
      if (r2?.access_token) authHeader = `Bearer ${r2.access_token}`;
    }
  } else {
    report.auth = 'basic';
    record(
      'POST /login (JWT)',
      login.status === 404 || login.status === 405,
      `HTTP ${login.status} - ${login.status === 404 || login.status === 405 ? 'endpoint absent (IRIS < 2026.2?), Basic fallback in use' : 'unexpected answer'}`,
      { status: login.status, body: login.json ?? login.text?.slice(0, 200) },
    );
  }

  // 3. Lists and shapes
  const lists = [
    ['/v2/databases', 'array'],
    ['/v2/database-dirs', 'array'],
    ['/v2/namespaces', 'array'],
    ['/v2/processes', 'array'],
    ['/v2/tasks', 'array'],
    ['/v2/monitor/dashboard/main', 'object'],
    ['/v2/async-results', 'array'],
    ['/v2/security/users', 'array'],
    ['/v2/web-apps', 'array'],
    ['/v2/journal/files', 'array'],
    ['/v2/locks', 'array'],
  ];
  let firstDbDir = null;
  for (const [path, expected] of lists) {
    const r = await http('GET', path);
    const result = r.json?.result;
    const got = shape(result);
    const ok =
      r.status === 200 && (expected === 'array' ? Array.isArray(result) : typeof result === 'object');
    record(
      `GET ${path}`,
      r.status === 200,
      `HTTP ${r.status} result=${got}${r.status === 403 ? ' (privilege not held - acceptable)' : ''}`,
      { status: r.status, shape: got },
    );
    if (path === '/v2/database-dirs' && r.status === 200) {
      report.quirks.localDatabaseListIsArray = Array.isArray(result);
      record(
        'LocalDatabaseList shape',
        true,
        Array.isArray(result) ? 'array (spec says object) - Aperture handles both' : 'object as documented',
      );
      firstDbDir = Array.isArray(result)
        ? (result.find((d) => /user/i.test(d.Directory ?? ''))?.Directory ?? result[0]?.Directory)
        : result?.Directory;
    }
    if (!ok && r.status !== 403) hardFailure = true;
  }

  // 3b. Role grants: the spec declares Resources as [{ Name, Permissions }] and the role
  // editor writes that shape. Recorded, not fatal: a different answer is a finding to report.
  const role = await http('GET', '/v2/security/role?name=%25Manager');
  const grants = role.json?.result?.Resources;
  report.quirks.roleResourcesShape = Array.isArray(grants)
    ? grants.length === 0 || typeof grants[0] === 'object'
      ? 'objects'
      : typeof grants[0]
    : shape(grants);
  record(
    'Role grants shape',
    role.status !== 200 || report.quirks.roleResourcesShape === 'objects',
    `HTTP ${role.status}, Resources as ${report.quirks.roleResourcesShape}${role.status === 200 && Array.isArray(grants) && grants[0] ? ` (e.g. ${JSON.stringify(grants[0])})` : ''}`,
  );

  // 4. Error envelope shape
  const notFound = await http('GET', '/v2/namespace?name=APERTURE_DOES_NOT_EXIST');
  const errs = envelopeErrors(notFound.json);
  report.quirks.errorEnvelope = notFound.json?.status?.Errors
    ? 'status.Errors'
    : notFound.json?.status?.errors
      ? 'status.errors'
      : notFound.json?.errors
        ? 'errors'
        : 'none';
  record(
    'Error envelope',
    notFound.status === 404 || notFound.status === 400,
    `HTTP ${notFound.status}, errors in ${report.quirks.errorEnvelope}: ${JSON.stringify(errs)?.slice(0, 160)}`,
  );

  // 5. 202 pattern via database metrics
  if (firstDbDir) {
    const accepted = await http('POST', `/v2/database-dir/info?dir=${encodeURIComponent(firstDbDir)}`);
    const location = accepted.headers.get('location');
    const guid =
      accepted.json?.result?.GUID ?? (location ? new URL(location, IRIS_URL).searchParams.get('id') : null);
    report.quirks.asyncLocationHeader = !!location;
    report.quirks.asyncGuidInBody = !!accepted.json?.result?.GUID;
    hardFailure |= !record(
      'POST /v2/database-dir/info → 202',
      accepted.status === 202,
      `HTTP ${accepted.status}, Location ${location ?? 'absent'}, body GUID ${accepted.json?.result?.GUID ?? 'absent'}`,
    );
    if (guid) {
      let task = null;
      for (let i = 0; i < 30; i++) {
        const poll = await http('GET', `/v2/async-result?id=${encodeURIComponent(guid)}`);
        task = poll.json?.result;
        if (['Finished', 'Failed', 'Canceled'].includes(task?.State)) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      hardFailure |= !record(
        'Async task completes',
        task?.State === 'Finished',
        `state ${task?.State}, result ${shape(task?.Result)}, console ${task?.Console?.length ?? 0} lines`,
        { result: task?.Result },
      );
    }
  } else {
    record('202 pattern', false, 'no database directory available to probe');
  }

  // 5b. Opt-in: is a task suspend visible on the next read? Another entry's verification
  // saw /v2/tasks keep reporting Suspended=false after a successful suspend on 2026.2.
  // Aperture re-reads and reports a disagreement; this records what this instance does.
  if (MUTATE) {
    const tasks = await http('GET', '/v2/tasks');
    const list = Array.isArray(tasks.json?.result) ? tasks.json.result : [];
    const candidate =
      list.find((t) => t.Suspended === false && /purge/i.test(t.Name ?? '')) ??
      list.find((t) => t.Suspended === false);
    if (!candidate) {
      record('Task suspend/resume round trip', false, 'no unsuspended task to probe (skipped)');
    } else {
      const id = candidate.Id;
      const readBack = async () => {
        const one = await http('GET', `/v2/task/info?id=${id}`);
        const all = await http('GET', '/v2/tasks');
        const row = (Array.isArray(all.json?.result) ? all.json.result : []).find((t) => t.Id === id);
        return { info: one.json?.result?.Suspended, list: row?.Suspended };
      };
      try {
        // The spec declares an optional body; without one the server answers 415 (quirk
        // optional-body-415), so the probe sends what the portal sends: an empty object.
        const sus = await http('POST', `/v2/task/suspend?id=${id}`, { body: {} });
        hardFailure |= !record(
          `POST /v2/task/suspend (${candidate.Name})`,
          sus.status === 200,
          `HTTP ${sus.status}`,
        );
        const after = await readBack();
        report.quirks.taskSuspendReflected = { info: after.info ?? null, list: after.list ?? null };
        const reflected = after.info === true && after.list === true;
        // An observation rather than a pass/fail: the portal handles both outcomes.
        record(
          'Read-back right after suspend',
          true,
          reflected
            ? '/v2/task/info and /v2/tasks both report Suspended=true at once'
            : `/v2/task/info says ${after.info}, /v2/tasks says ${after.list} - the list lags behind the object (quirk task-suspended-lag; Aperture re-reads both and says so)`,
        );
      } finally {
        const res = await http('POST', `/v2/task/resume?id=${id}`);
        const after = await readBack();
        hardFailure |= !record(
          `POST /v2/task/resume (${candidate.Name})`,
          res.status === 200 && after.info !== true,
          `HTTP ${res.status}, /v2/task/info says Suspended=${after.info}`,
        );
      }
    }
  }

  // 6. Optional: the portal itself
  if (PORTAL_URL) {
    // IRIS's built-in web server does not map a directory URL to index.html, so the
    // portal is opened as .../aperture/index.html; record what the directory URL does too.
    let res = await fetch(PORTAL_URL);
    let html = await res.text();
    let detail = `HTTP ${res.status}, ${html.length} bytes`;
    if (!(res.status === 200 && /Aperture/.test(html)) && PORTAL_URL.endsWith('/')) {
      const dirStatus = res.status;
      res = await fetch(PORTAL_URL + 'index.html');
      html = await res.text();
      detail = `directory URL HTTP ${dirStatus}; index.html HTTP ${res.status}, ${html.length} bytes`;
    }
    hardFailure |= !record(
      `Portal served at ${PORTAL_URL}`,
      res.status === 200 && /Aperture/.test(html),
      detail,
    );
  }
} catch (e) {
  hardFailure = true;
  record('Unexpected failure', false, e instanceof Error ? e.message : String(e));
}

report.finishedAt = new Date().toISOString();
report.passed = !hardFailure;
console.log(
  `\n${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks passed · auth=${report.auth} · ${report.serverVersion ?? 'unknown version'}`,
);
if (SAVE) {
  mkdirSync(dirname(SAVE), { recursive: true });
  writeFileSync(SAVE, JSON.stringify(report, null, 2));
  console.log(`report saved to ${SAVE}`);
}
process.exit(hardFailure ? 1 : 0);
