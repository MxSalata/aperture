// Shared plumbing for the live probes in scripts/live/: an HTTP client for one IRIS account,
// redaction of secrets (always, before anything is written) and of LAN identity (before
// evidence is published), and an evidence writer that stamps every file with the image.
//
// Credentials come from the environment only, normally loaded with Node's own env-file
// support so they never appear on a command line:
//
//   node --env-file=$HOME/.aperture/iris-live.env scripts/live/evidence.mjs
//
//   IRIS_URL=http://iris.lan:52773   IRIS_API_PREFIX=/api/admin (default)
//   IRIS_USER / IRIS_PASSWORD         an administrator (%All)
//   IRIS_OP_USER / IRIS_OP_PASSWORD   an account holding %Operator only
//   IRIS_IMAGE                        image reference with digest, recorded in every file
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const IRIS_URL = (process.env.IRIS_URL ?? 'http://localhost:52773').replace(/\/+$/, '');
export const PREFIX = process.env.IRIS_API_PREFIX ?? '/api/admin';
export const IMAGE = process.env.IRIS_IMAGE ?? 'unknown';

export function account(kind) {
  const user = kind === 'op' ? process.env.IRIS_OP_USER : process.env.IRIS_USER;
  const password = kind === 'op' ? process.env.IRIS_OP_PASSWORD : process.env.IRIS_PASSWORD;
  if (!user || password === undefined) return null;
  return { user, password };
}

/** Basic credentials the way Aperture builds them: UTF-8 bytes, then Base64 (RFC 7617 charset=UTF-8). */
export const basicHeader = ({ user, password }) =>
  `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;

const KEPT_HEADERS = ['content-type', 'location', 'www-authenticate', 'server', 'content-length', 'allow'];

/**
 * One request. `auth` is a ready Authorization value or null. The answer keeps the headers
 * that matter to Aperture (never the request's own Authorization) and the parsed JSON.
 */
export async function http(method, path, { auth = null, body, rawBody, headers = {}, base } = {}) {
  // A browser names its languages; Node's fetch sends '*', which IRIS answers in the first
  // language it has (Arabic). Probes ask for English unless a test says otherwise.
  const h = { Accept: 'application/json', 'Accept-Language': 'en', ...headers };
  if (auth) h.Authorization = auth;
  let payload;
  if (rawBody !== undefined) payload = rawBody;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const url = `${base ?? IRIS_URL + PREFIX}${path}`;
  const started = Date.now();
  const res = await fetch(url, { method, headers: h, body: payload, redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  const kept = {};
  for (const k of KEPT_HEADERS) if (res.headers.get(k) !== null) kept[k] = res.headers.get(k);
  return {
    method,
    path,
    status: res.status,
    headers: kept,
    json,
    text: json ? undefined : text,
    ms: Date.now() - started,
  };
}

/** A signed-in client: JWT when the server offers it, Basic otherwise. */
export async function signIn(acct, { role } = {}) {
  const res = await http('POST', '/login', {
    body: { user: acct.user, password: acct.password, ...(role ? { role } : {}) },
  });
  const tokens = res.json?.result ?? res.json;
  if (res.status === 200 && tokens?.access_token) {
    return { mode: 'jwt', login: res, tokens, auth: `Bearer ${tokens.access_token}` };
  }
  return { mode: 'basic', login: res, tokens: null, auth: basicHeader(acct) };
}

// ---- redaction ------------------------------------------------------------------------------

const SECRET_KEY = /(password|passwd|passphrase|secret|token|privatekey$|apikey|authorization)/i;
const NOT_SECRET =
  /(interval|timeout|page|class|file|type|neverexpires|expires|enabled|required|policy|method|len|length)$/i;
const JWT = /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g;

/** Secrets never reach disk: string values under a secret key, and anything shaped like a JWT. */
export function redactSecrets(value, key) {
  const k = (key ?? '').replace(/[_-]/g, '');
  if (typeof value === 'string') {
    if (value !== '' && SECRET_KEY.test(k) && !NOT_SECRET.test(k)) return `<redacted ${value.length} chars>`;
    return value.replace(JWT, '<jwt>');
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, key));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([ck, v]) => [ck, redactSecrets(v, ck)]));
  return value;
}

const irisHost = new URL(IRIS_URL).hostname;
const PRIVATE_V4 = /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g;

/**
 * LAN identity is removed before evidence is published: the instance's address becomes
 * `<iris-host>`, other private addresses `<lan-ip>`, and every name in EVIDENCE_REDACT
 * (comma-separated `name=replacement`, e.g. `myhost=<docker-host>`) is replaced as a whole word.
 */
export function redactLan(value) {
  const names = (process.env.EVIDENCE_REDACT ?? '')
    .split(',')
    .map((p) => p.split('='))
    .filter(([n]) => n);
  const fix = (s) => {
    let out = s.split(irisHost).join('<iris-host>').replace(PRIVATE_V4, '<lan-ip>');
    for (const [n, r] of names)
      out = out.replace(
        new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
        r ?? '<redacted-host>',
      );
    return out;
  };
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [fix(k), walk(x)]));
    return v;
  };
  return walk(value);
}

// ---- evidence ---------------------------------------------------------------------------------

/**
 * Writer for one evidence directory. Every file carries the image (with digest), the server's
 * version string and the capture time, so a reader never has to guess what produced it.
 */
export function evidenceWriter(dir, { serverVersion, lan = true } = {}) {
  mkdirSync(dir, { recursive: true });
  const meta = () => ({
    image: IMAGE,
    serverVersion: serverVersion(),
    capturedAt: new Date().toISOString(),
    instance: `${new URL(IRIS_URL).protocol}//<iris-host>:${new URL(IRIS_URL).port || 80}${PREFIX}`,
  });
  return (name, data) => {
    const file = join(dir, `${name}.json`);
    mkdirSync(dirname(file), { recursive: true });
    let out = redactSecrets({ meta: meta(), ...data });
    if (lan) out = redactLan(out);
    writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    return file;
  };
}

/** A compact description of a value's shape, for console summaries that must not print data. */
export function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? `[${shape(v[0], depth + 1)}]×${v.length}` : '[]';
  if (v === null) return 'null';
  if (typeof v === 'object')
    return depth > 1
      ? '{…}'
      : `{${Object.entries(v)
          .map(([k, x]) => `${k}:${shape(x, depth + 1)}`)
          .join(', ')}}`;
  return typeof v;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll GET /v2/async-result until the task ends (or the budget runs out). */
export async function waitForTask(auth, id, { budgetMs = 60_000 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    last = await http('GET', `/v2/async-result?id=${encodeURIComponent(id)}`, { auth });
    const state = last.json?.result?.State;
    if (last.status !== 200 || ['Finished', 'Failed', 'Canceled'].includes(state)) return last;
    await sleep(1000);
  }
  return last;
}
