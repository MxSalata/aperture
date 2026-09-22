// Builds a compact operation index from the OpenAPI document.
//
// The full spec (≈1 MB) is lazy-loaded by the Explorer only when needed; the index
// (≈175 KB minified) lives in lazy chunks too (see src/lib/specIndex.ts) and powers the
// Explorer, the command palette and privilege hints for every one of the 273 operations.
// The output is deterministic: provenance is the SHA-256 of the spec, not a timestamp.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../spec/mainspec_v2.json');
const outPath = resolve(here, '../src/api/spec-index.json');

const specText = readFileSync(specPath, 'utf8');
const spec = JSON.parse(specText);
const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** Resolve a local `$ref` such as `#/components/parameters/maxRows`. */
function deref(node) {
  if (node && typeof node === 'object' && typeof node.$ref === 'string') {
    const parts = node.$ref.replace(/^#\//, '').split('/');
    let cur = spec;
    for (const p of parts) cur = cur?.[p];
    return cur ?? {};
  }
  return node;
}

/** Extract the `(%Admin_X:U or %Admin_Y:U)` prefix that every summary carries. */
function parsePrivilege(summary = '') {
  const m = summary.match(/^\(([^)]+)\)\s*/);
  if (!m) return { privileges: [], text: summary };
  const privileges = m[1]
    .split(/\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return { privileges, text: summary.slice(m[0].length) };
}

function compactParam(p) {
  const r = deref(p);
  const schema = r.schema ?? {};
  return {
    name: r.name,
    in: r.in,
    required: !!r.required,
    description: r.description ?? '',
    type: schema.type ?? 'string',
    enum: schema.enum,
    example: r.example ?? schema.example,
  };
}

/** Name of the schema referenced by the `result` property of the success response, if any. */
function resultRef(op) {
  for (const code of ['200', '201', '202']) {
    const content = op.responses?.[code]?.content?.['application/json']?.schema;
    if (!content) continue;
    const parts = content.allOf ?? [content];
    for (const part of parts) {
      const result = part?.properties?.result;
      if (result?.$ref) return result.$ref.split('/').pop();
      if (result?.type === 'array' && result.items?.$ref) return result.items.$ref.split('/').pop();
    }
  }
  return undefined;
}

function bodyRef(op) {
  const schema = op.requestBody?.content?.['application/json']?.schema;
  if (!schema) return undefined;
  if (schema.$ref) return { ref: schema.$ref.split('/').pop() };
  return { inline: true, properties: Object.keys(schema.properties ?? {}) };
}

const operations = [];
for (const [path, item] of Object.entries(spec.paths)) {
  const pathParams = (item.parameters ?? []).map(compactParam);
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    const { privileges, text } = parsePrivilege(op.summary ?? op.description ?? '');
    const params = [...pathParams, ...(op.parameters ?? []).map(compactParam)];
    operations.push({
      id: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      path,
      group: op.tags?.[0] ?? 'general',
      summary: text,
      privileges,
      params,
      body: bodyRef(op),
      result: resultRef(op),
      async: !!op.responses?.['202'],
      responses: Object.fromEntries(
        Object.entries(op.responses ?? {}).map(([code, r]) => [code, deref(r).description ?? '']),
      ),
    });
  }
}

const groups = {};
for (const op of operations) groups[op.group] = (groups[op.group] ?? 0) + 1;

const index = {
  title: spec.info?.title,
  version: spec.info?.version,
  basePath: spec.servers?.[0]?.url ?? '/api/admin',
  specSha256: createHash('sha256').update(specText).digest('hex'),
  groups,
  operations,
};

writeFileSync(outPath, JSON.stringify(index));
console.log(`spec-index: ${operations.length} operations, ${Object.keys(groups).length} groups → ${outPath}`);
