/**
 * The mock is the oracle of the unit tests, the end-to-end tests and the online demo, so a
 * mock that answers in a shape the specification does not declare hides exactly the bugs a
 * real IRIS would expose (a role editor written against `Resources: string[]` while the API
 * sends `{ Name, Permissions }[]`). This walks the hand-written handlers and checks every
 * answer against the response schema of its operation.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { resetClients } from '@/api/client';
import { loadSpec, resolveSchema, resultSchema, type JsonSchema, type OpenApiDoc } from '@/lib/openapi';
import { index } from '@/lib/specIndex';

const BASE = 'http://iris.test';

/** Where real servers are known to differ from the spec, and the mock follows the servers (lib/quirks.ts). */
const DOCUMENTED_DIVERGENCE = new Set(['/v2/database-dirs']);

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
      if (DOCUMENTED_DIVERGENCE.has(op.path)) continue;
      const { status, result } = await read(op.path);
      if (status !== 200) continue; // privilege-gated or not seeded: nothing to compare
      const out: string[] = [];
      check(resultSchema(doc, 'GET', op.path), result, 'result', out);
      problems.push(...out.map((p) => `GET ${op.path} ${p}`));
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
      problems.push(...out.map((p) => `GET ${path} ${p}`));
    }
    expect(problems).toEqual([]);
  });
});
