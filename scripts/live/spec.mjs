// The specification as the live probes need it: schema resolution identical to src/lib/openapi.ts
// and the structural check of src/mocks/__tests__/contract.test.ts, so "the server differs from
// the spec" means the same thing here as "the mock differs from the spec" means there.
import { readFileSync } from 'node:fs';

export const doc = JSON.parse(readFileSync(new URL('../../spec/mainspec_v2.json', import.meta.url), 'utf8'));
export const index = JSON.parse(
  readFileSync(new URL('../../src/api/spec-index.json', import.meta.url), 'utf8'),
);

function deref(schema) {
  let s = schema;
  for (let i = 0; s && s.$ref && i < 20; i++) {
    s = s.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
  }
  return s ?? {};
}

export function resolveSchema(schema) {
  if (!schema) return {};
  const base = deref(schema);
  if (base.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of base.allOf) {
      const r = resolveSchema(part);
      Object.assign(merged.properties, r.properties ?? {});
      merged.required.push(...(r.required ?? []));
    }
    return merged;
  }
  return base;
}

export function resultSchema(method, path) {
  const op = doc.paths[path]?.[method.toLowerCase()];
  if (!op) return undefined;
  for (const code of ['200', '201', '202']) {
    const schema = deref(op.responses?.[code])?.content?.['application/json']?.schema;
    if (!schema) continue;
    const result = resolveSchema(schema).properties?.result;
    if (result) return result;
  }
  return undefined;
}

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

/**
 * Structural check (type, enum, items, declared properties), the contract test's rules. Also
 * lists properties the server sends that the spec does not declare: not an error, but the
 * vocabulary a screen may want and the mock should know.
 */
export function check(
  schema,
  value,
  path = 'result',
  out = { problems: [], undeclared: new Set() },
  depth = 0,
) {
  if (!schema || depth > 12 || value === undefined || value === null) return out;
  const s = resolveSchema(schema);
  const expected = Array.isArray(s.type) ? s.type[0] : s.type;
  const actual = typeOf(value);
  if (expected && expected !== actual && !(expected === 'number' && actual === 'integer')) {
    out.problems.push(
      `${path}: spec says ${expected}, server sent ${actual} ${JSON.stringify(value).slice(0, 80)}`,
    );
    return out;
  }
  if (s.enum && value !== '' && !s.enum.includes(value))
    out.problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  if (actual === 'array' && s.items)
    value.forEach((item, i) => check(s.items, item, `${path}[${i}]`, out, depth + 1));
  if (actual === 'object' && s.properties) {
    for (const [key, sub] of Object.entries(s.properties))
      check(sub, value[key], `${path}.${key}`, out, depth + 1);
    for (const key of Object.keys(value))
      if (!(key in s.properties)) out.undeclared.add(`${path.replace(/\[\d+\]/g, '[]')}.${key}`);
  }
  return out;
}
