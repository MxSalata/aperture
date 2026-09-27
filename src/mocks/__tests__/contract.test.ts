/**
 * The mock is the oracle of the unit tests, the end-to-end tests and the online demo, so a
 * mock that answers in a shape the specification does not declare hides exactly the bugs a
 * real IRIS would expose (a role editor written against `Resources: string[]` while the API
 * sends `{ Name, Permissions }[]`). This walks the hand-written handlers and checks every
 * answer against two oracles: the response schema of its operation, and the shapes a real
 * IRIS for Health 2026.2 answered in (iris-shapes.json, recorded by scripts/live/shapes.mjs).
 * The second exists because the spec is wrong in places, and a mock that follows the spec there
 * hid real bugs: a Services screen reading `EnabledBoolean` (IRIS sends none), a Processes column
 * bound to `EXEName` (IRIS writes `EXEname`), SQL privileges read as `Name`/`Privilege`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { resetClients } from '@/api/client';
import { loadSpec, resolveSchema, resultSchema, type JsonSchema, type OpenApiDoc } from '@/lib/openapi';
import { index } from '@/lib/specIndex';
import iris from './iris-shapes.json';

const BASE = 'http://iris.test';

/**
 * Where real servers are known to differ from the spec, the mock follows the servers. Each entry
 * names the answer paths that may differ and where the server's behaviour was recorded
 * (docs/verification/, lib/quirks.ts). An entry the mock no longer needs fails the test, so the
 * list cannot outlive the divergence.
 */
const DOCUMENTED_DIVERGENCE: Record<string, { paths: RegExp; evidence: string }[]> = {
  '/v2/database-dirs': [
    {
      paths: /^result: spec says object/,
      evidence: 'an array on every server (quirk local-database-list-shape)',
    },
  ],
  '/v2/namespace/global-mappings': [
    {
      paths: /^result\[\d+\]\.Collation: spec says string, mock sent integer/,
      evidence: 'an integer (5) on IRIS 2026.2 (iris-shapes.json); the spec says a string like "5"',
    },
  ],
  '/v2/locks': [
    {
      paths: /^result\[\d+\]\.Pid: spec says string, mock sent integer/,
      evidence: 'an integer on IRIS 2026.2 (iris-shapes.json)',
    },
  ],
  '/v2/security/role/owners': [
    {
      paths: /^result\[\d+\]\.AdminOption: spec says boolean, mock sent string/,
      evidence: '"0" or "1" on IRIS 2026.2 (iris-shapes.json, b-role-owners.json)',
    },
  ],
  '/v2/task': [
    {
      paths: /^result\.Expires(Days|Hours|Minutes): spec says integer, mock sent string/,
      evidence: 'strings on IRIS 2026.2 (iris-shapes.json)',
    },
    {
      paths: /^result\.TimePeriodEvery: spec says string, mock sent integer/,
      evidence: 'an integer on IRIS 2026.2 (iris-shapes.json)',
    },
  ],
  '/v2/monitor/dashboard/main': [
    {
      paths: /^result\.SystemUsage\.BusyProcesses\[\d+\]\.Process: spec says integer, mock sent string ""/,
      evidence:
        'ten rows always, padded with { Process: "", Commands: 0 } on IRIS 2026.2 (docs/verification)',
    },
  ],
  '/v2/security/services': [
    {
      paths: /^result\[\d+\]\.Enabled: spec says string, mock sent boolean/,
      evidence: 'a boolean on IRIS 2026.2, and no EnabledBoolean (docs/verification, d-authe-enabled.json)',
    },
  ],
};

/** The divergences some answer needed, across the tests of this file. */
const used = new Set<string>();

/** Problems the documented divergences do not cover; marks the divergences that were used. */
function undocumented(path: string, problems: string[], used: Set<string>): string[] {
  const allowed = DOCUMENTED_DIVERGENCE[path] ?? [];
  return problems.filter((p) => {
    const hit = allowed.find((d) => d.paths.test(p));
    if (hit) used.add(`${path} ${hit.paths}`);
    return !hit;
  });
}

/**
 * Every parameterised read a screen makes, with an identifier taken from the seeded instance
 * (from a list where the list names one, so the test follows the seed data).
 */
async function detailReads(): Promise<[string, Record<string, string>][]> {
  const first = async (path: string, key: string) =>
    String((((await read(path)).result as Record<string, unknown>[] | undefined) ?? [])[0]?.[key] ?? '');
  const dir = await first('/v2/database-dirs', 'Directory');
  const task = await first('/v2/tasks', 'Id');
  return [
    ['/v2/security/user', { name: '_SYSTEM' }],
    ['/v2/security/role', { name: '%Manager' }],
    ['/v2/security/role/owners', { name: '%Manager' }],
    ['/v2/security/resource', { name: await first('/v2/security/resources', 'Name') }],
    ['/v2/security/service', { name: '%Service_Bindings' }],
    ['/v2/security/ssl-configuration', { name: await first('/v2/security/ssl-configurations', 'Name') }],
    [
      '/v2/security/x509-credential/certificate',
      { alias: await first('/v2/security/x509-credentials', 'Alias') },
    ],
    ['/v2/security/sql-privileges', { namespace: 'USER', grantee: '_SYSTEM' }],
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
}

let doc: OpenApiDoc;
beforeAll(async () => {
  resetDb();
  resetClients();
  doc = await loadSpec();
  await useSession
    .getState()
    .login({ connectionId: 't', baseUrl: BASE, username: '_SYSTEM', password: 'SYS' });
});

function typeOf(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

/** Structural check: type, enum, array items and declared properties ($ref / allOf resolved). */
function check(schema: JsonSchema | undefined, value: unknown, path: string, out: string[], depth = 0): void {
  if (!schema || depth > 12 || value === undefined || value === null) return;
  const s = resolveSchema(doc, schema);
  const expected = Array.isArray(s.type) ? s.type[0] : s.type;
  const actual = typeOf(value);
  if (expected && expected !== actual && !(expected === 'number' && actual === 'integer')) {
    out.push(`${path}: spec says ${expected}, mock sent ${actual} ${JSON.stringify(value).slice(0, 60)}`);
    return;
  }
  // IRIS writes "" for a setting that does not apply (DailyFrequencyTime of a run-once task),
  // which the spec's enums omit although its descriptions say so.
  if (s.enum && value !== '' && !s.enum.includes(value))
    out.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  if (actual === 'array' && s.items)
    (value as unknown[]).forEach((item, i) => check(s.items, item, `${path}[${i}]`, out, depth + 1));
  if (actual === 'object' && s.properties)
    for (const [key, sub] of Object.entries(s.properties))
      check(sub, (value as Record<string, unknown>)[key], `${path}.${key}`, out, depth + 1);
}

async function read(
  path: string,
  query: Record<string, string> = {},
): Promise<{ status: number; result: unknown }> {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${BASE}/api/admin${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: useSession.getState().authorizationHeader() ?? '', Accept: 'application/json' },
  });
  return { status: res.status, result: ((await res.json()) as { result?: unknown }).result };
}

describe('mock ⇄ specification contract', () => {
  it('answers every parameterless GET in the declared shape', async () => {
    const problems: string[] = [];
    const ops = index.operations.filter(
      (o) => o.method === 'GET' && o.path.startsWith('/v2/') && !o.params.some((p) => p.required),
    );
    expect(ops.length).toBeGreaterThan(50);
    for (const op of ops) {
      const { status, result } = await read(op.path);
      if (status !== 200) continue; // privilege-gated or not seeded: nothing to compare
      const out: string[] = [];
      check(resultSchema(doc, 'GET', op.path), result, 'result', out);
      problems.push(...undocumented(op.path, out, used).map((p) => `GET ${op.path} ${p}`));
    }
    expect(problems).toEqual([]);
  }, 60_000);

  it('answers the parameterised reads of the screens in the declared shape', async () => {
    const problems: string[] = [];
    for (const [path, query] of await detailReads()) {
      expect(Object.values(query).every(Boolean), `${path}: no seeded identifier`).toBe(true);
      const { status, result } = await read(path, query);
      expect(status, `${path} ${JSON.stringify(query)}`).toBe(200);
      const out: string[] = [];
      check(resultSchema(doc, 'GET', path), result, 'result', out);
      problems.push(...undocumented(path, out, used).map((p) => `GET ${path} ${p}`));
    }
    expect(problems).toEqual([]);
  });

  it('needs every documented divergence it lists', () => {
    const declared = Object.entries(DOCUMENTED_DIVERGENCE).flatMap(([p, ds]) =>
      ds.map((d) => `${p} ${d.paths}`),
    );
    expect(
      declared.filter((d) => !used.has(d)),
      'documented divergences the mock no longer shows',
    ).toEqual([]);
  });

  it('answers in the shapes a real IRIS sends', async () => {
    // The spec is wrong in places (Enabled, EXEname, BusyProcesses…), so the mock is also held to
    // what IRIS for Health 2026.2 answered (iris-shapes.json, scripts/live/shapes.mjs): no field
    // IRIS does not send, no type IRIS did not send there.
    const queries = new Map(await detailReads());
    const problems: string[] = [];
    for (const [path, real] of Object.entries(iris.shapes as Record<string, Record<string, string[]>>)) {
      const { status, result } = await read(path, queries.get(path) ?? {});
      if (status !== 200) continue; // not seeded in the mock
      for (const [p, types] of Object.entries(shapeOf(result))) {
        const at = realAt(real, p);
        const known = at === 'unseen' || !at ? at : [...at, ...(SEEN_ELSEWHERE[path]?.[p]?.types ?? [])];
        if (known === 'unseen') continue; // IRIS's array was empty: nothing to compare with
        if (!known) problems.push(`GET ${path} ${p}: IRIS sends no such field`);
        else if (!types.every((t) => known.includes(t) || (t === 'integer' && known.includes('number'))))
          problems.push(`GET ${path} ${p}: mock sent ${types.join('|')}, IRIS ${known.join('|')}`);
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});

/** JSON path (array items as []) → the types of the values found there. */
function shapeOf(v: unknown, path = 'result', out: Record<string, string[]> = {}): Record<string, string[]> {
  const t = typeOf(v);
  if (!(out[path] ??= []).includes(t)) out[path].push(t);
  if (t === 'array') for (const item of v as unknown[]) shapeOf(item, `${path}[]`, out);
  else if (t === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) shapeOf(x, `${path}.${k}`, out);
  return out;
}

/**
 * Types IRIS sends at a path at other times than when iris-shapes.json was recorded (a snapshot
 * holds only the values of that moment), with where they were seen.
 */
const SEEN_ELSEWHERE: Record<string, Record<string, { types: string[]; evidence: string }>> = {
  '/v2/monitor/dashboard/main': {
    'result.SystemUsage.BusyProcesses[].Process': {
      types: ['integer'],
      evidence: 'a busy process is { Process: 1054, Commands: 777266 } (docs/verification)',
    },
  },
};

/** The types IRIS sent at a path; 'unseen' when it lies inside an array IRIS returned empty. */
function realAt(real: Record<string, string[]>, path: string): string[] | 'unseen' | undefined {
  const own = real[path];
  if (own) return own.length === 1 && own[0] === 'unseen' ? 'unseen' : own;
  for (let i = path.lastIndexOf('[]'); i > 0; i = path.lastIndexOf('[]', i - 1)) {
    const items = real[path.slice(0, i + 2)];
    if (items) return items.length === 1 && items[0] === 'unseen' ? 'unseen' : undefined;
  }
  return undefined;
}
