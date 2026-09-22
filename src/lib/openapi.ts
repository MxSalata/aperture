/**
 * Runtime helpers over the OpenAPI document: schema resolution, example generation and
 * labels. Pure functions and types only; the operation index itself is in `specIndex.ts`
 * so that this module can be imported eagerly without dragging 175 KB into the entry chunk.
 *
 * The full spec is ~1 MB, so it is loaded lazily (Vite splits it into its own
 * chunk) and only by the Explorer and the demo-mode mock.
 */

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  example?: unknown;
  description?: string;
  format?: string;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  $ref?: string;
  default?: unknown;
  readOnly?: boolean;
  nullable?: boolean;
  additionalProperties?: boolean | JsonSchema;
};

export interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, JsonSchema>;
    parameters: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
}

export interface IndexedParam {
  name: string;
  in: string;
  required: boolean;
  description: string;
  type: string;
  enum?: string[];
  example?: unknown;
}

export interface IndexedOperation {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  group: string;
  summary: string;
  privileges: string[];
  params: IndexedParam[];
  body?: { ref?: string; inline?: boolean; properties?: string[] };
  result?: string;
  async: boolean;
  responses: Record<string, string>;
}

export interface SpecIndex {
  title: string;
  version: string;
  basePath: string;
  /** SHA-256 of spec/mainspec_v2.json the index was built from. */
  specSha256: string;
  groups: Record<string, number>;
  operations: IndexedOperation[];
}

let specPromise: Promise<OpenApiDoc> | null = null;

export function loadSpec(): Promise<OpenApiDoc> {
  if (!specPromise) {
    specPromise = import('../../spec/mainspec_v2.json').then(
      (m) => (m.default ?? m) as unknown as OpenApiDoc,
    );
  }
  return specPromise;
}

export function deref<T>(doc: OpenApiDoc, node: T): T {
  const ref = (node as { $ref?: string } | null)?.$ref;
  if (!ref) return node;
  const parts = ref.replace(/^#\//, '').split('/');
  let cur: unknown = doc;
  for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
  return (cur ?? {}) as T;
}

export function schemaName(ref: string | undefined): string | undefined {
  return ref?.split('/').pop();
}

/** Flatten `$ref` and `allOf` into a single object schema (one level of nesting per call site). */
export function resolveSchema(doc: OpenApiDoc, schema: JsonSchema | undefined): JsonSchema {
  if (!schema) return {};
  const base = deref(doc, schema);
  if (base.allOf) {
    const merged: JsonSchema = { type: 'object', properties: {}, required: [] };
    for (const part of base.allOf) {
      const r = resolveSchema(doc, part);
      Object.assign(merged.properties!, r.properties ?? {});
      merged.required!.push(...(r.required ?? []));
      if (r.description && !merged.description) merged.description = r.description;
    }
    return merged;
  }
  return base;
}

/** Schema of the `result` property in the success response of an operation. */
export function resultSchema(doc: OpenApiDoc, method: string, path: string): JsonSchema | undefined {
  const op = doc.paths[path]?.[method.toLowerCase()] as { responses?: Record<string, unknown> } | undefined;
  if (!op) return undefined;
  for (const code of ['200', '201', '202']) {
    const res = deref(doc, op.responses?.[code]) as
      { content?: Record<string, { schema?: JsonSchema }> } | undefined;
    const schema = res?.content?.['application/json']?.schema;
    if (!schema) continue;
    const resolved = resolveSchema(doc, schema);
    const result = resolved.properties?.result;
    if (result) return result;
  }
  return undefined;
}

export function requestBodySchema(doc: OpenApiDoc, method: string, path: string): JsonSchema | undefined {
  const op = doc.paths[path]?.[method.toLowerCase()] as
    { requestBody?: { content?: Record<string, { schema?: JsonSchema }> } } | undefined;
  return op?.requestBody?.content?.['application/json']?.schema;
}

interface ExampleOptions {
  /** Index used to vary list items. */
  seed?: number;
  depth?: number;
}

/** Produce a plausible value for a schema, preferring the spec's own `example`s. */
export function exampleFromSchema(
  doc: OpenApiDoc,
  schema: JsonSchema | undefined,
  opts: ExampleOptions = {},
): unknown {
  const seed = opts.seed ?? 0;
  const depth = opts.depth ?? 0;
  if (!schema || depth > 8) return null;
  const s = resolveSchema(doc, schema);
  if (s.example !== undefined && !(s.type === 'object' && s.properties)) {
    return varyExample(s.example, seed);
  }
  if (s.oneOf || s.anyOf) {
    const options = (s.oneOf ?? s.anyOf)!;
    return exampleFromSchema(doc, options[seed % options.length], { seed, depth: depth + 1 });
  }
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (s.enum) return s.enum[seed % s.enum.length];
  switch (type) {
    case 'string':
      if (s.format === 'date-time') return '2026-09-16 12:00:00';
      if (s.format === 'password') return '';
      return s.default !== undefined ? String(s.default) : '';
    case 'integer':
    case 'number':
      return s.default !== undefined ? Number(s.default) : (seed * 7) % 100;
    case 'boolean':
      return s.default !== undefined ? Boolean(s.default) : seed % 2 === 0;
    case 'array': {
      const n = depth === 0 ? 3 : 2;
      return Array.from({ length: n }, (_, i) =>
        exampleFromSchema(doc, s.items, { seed: seed + i, depth: depth + 1 }),
      );
    }
    case 'object':
    default: {
      if (!s.properties) return s.type === 'object' || !s.type ? {} : null;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties)) {
        if (v.readOnly && depth > 0) continue;
        out[k] = exampleFromSchema(doc, v, { seed, depth: depth + 1 });
      }
      return out;
    }
  }
}

function varyExample(example: unknown, seed: number): unknown {
  if (seed === 0) return example;
  if (typeof example === 'number') return example + seed;
  if (typeof example === 'string' && example && !/[/:]/.test(example) && example.length < 40)
    return `${example}${seed + 1}`;
  return example;
}

/** Human labels for the spec's tag names (`/v2/database-dir` → `Local databases`). */
export const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  '/v2/async-result': 'Async tasks',
  '/v2/database': 'Database configuration',
  '/v2/database-dir': 'Local databases',
  '/v2/device': 'Devices',
  '/v2/doc-db': 'Document databases',
  '/v2/ecp': 'ECP',
  '/v2/ext-lang-server': 'External language servers',
  '/v2/fs-access-purpose': 'File system access',
  '/v2/journal': 'Journaling',
  '/v2/license': 'Licensing',
  '/v2/lock': 'Locks',
  '/v2/monitor': 'Monitoring',
  '/v2/namespace': 'Namespaces',
  '/v2/process': 'Processes',
  '/v2/security': 'Security',
  '/v2/task': 'Task manager',
  '/v2/wallet': 'Wallet',
  '/v2/web-app': 'Web applications',
  '/v2/web-session': 'Web sessions',
  '/v2/wqm-category': 'Work queue manager',
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.replace(/^\/v2\//, '').replace(/-/g, ' ');
}

/** Sub-area inside a group, derived from the path: `/v2/security/oauth2/server/client` → `oauth2`. */
export function subGroup(op: IndexedOperation): string {
  const rest = op.path.replace(/^\/v2\/[^/]+\/?/, '');
  const first = rest.split('/')[0];
  return first || '';
}
