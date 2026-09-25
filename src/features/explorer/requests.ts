import { applyQuirks, servedPath } from '@/lib/quirks';
import {
  exampleFromSchema,
  groupLabel,
  requestBodySchema,
  type IndexedOperation,
  type OpenApiDoc,
} from '@/lib/openapi';
import { index } from '@/lib/specIndex';
import { redactDeep } from '@/lib/redact';
import type { GeneratedRequest } from '@/lib/requestExport';

/**
 * The request the Explorer would send for an operation, as `lib/requestExport.ts` writes it for
 * Postman, a `.http` file or curl: the values typed into the panel where there are any, the
 * spec's examples for the required parameters, an example body from the schema (with the quirk
 * adapters applied, as the panel does), and the privileges and 202 as notes. Secret values in
 * the body are redacted, so a copied request never carries a password.
 */
export function operationRequest(
  op: IndexedOperation,
  doc: OpenApiDoc | null,
  query: Record<string, string> = {},
  body?: string,
): GeneratedRequest {
  const notes: string[] = [];
  if (op.privileges.length) notes.push(`Needs ${op.privileges.join(', ')}`);
  if (op.async) notes.push('Answers 202 Accepted: poll the Location header (/v2/async-result?id=…)');
  let text: string | undefined;
  if (op.body) {
    let parsed: unknown = {};
    if (body !== undefined) {
      try {
        parsed = body.trim() ? JSON.parse(body) : {};
      } catch {
        parsed = body;
      }
    } else if (doc) {
      const schema = requestBodySchema(doc, op.method, op.path);
      parsed = (schema ? exampleFromSchema(doc, schema) : {}) ?? {};
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      parsed = applyQuirks(op, parsed as Record<string, unknown>);
    text = typeof parsed === 'string' ? parsed : JSON.stringify(redactDeep(parsed).value, null, 2);
  }
  return {
    name: `${op.method} ${op.path}`,
    method: op.method,
    path: `${index.basePath}${servedPath(op)}`,
    summary: op.summary,
    notes,
    query: op.params.map((p) => ({
      name: p.name,
      value: query[p.name] ?? (p.required && p.example !== undefined ? String(p.example) : ''),
      required: p.required,
      ...(p.description ? { description: p.description } : {}),
      type: p.type,
    })),
    ...(text !== undefined ? { body: text } : {}),
    folder: groupLabel(op.group),
  };
}

export function operationRequests(ops: IndexedOperation[], doc: OpenApiDoc | null): GeneratedRequest[] {
  return ops.map((op) => operationRequest(op, doc));
}
