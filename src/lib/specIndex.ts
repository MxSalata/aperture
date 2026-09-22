/**
 * The compact operation index generated from the OpenAPI document by
 * `scripts/build-spec-index.mjs` (273 operations, ~175 KB minified).
 *
 * Kept out of `lib/openapi.ts` on purpose: everything that imports this module lands in
 * a lazy chunk (Explorer, About, the demo mock, the command palette's on-demand load),
 * so the eager entry bundle carries none of it.
 */
import specIndex from '@/api/spec-index.json';
import type { IndexedOperation, SpecIndex } from './openapi';

export const index = specIndex as unknown as SpecIndex;

export const operationsByGroup: Record<string, IndexedOperation[]> = {};
for (const op of index.operations) (operationsByGroup[op.group] ??= []).push(op);

export function findIndexedOperation(method: string, path: string): IndexedOperation | undefined {
  const m = method.toUpperCase();
  return index.operations.find((o) => o.method === m && o.path === path);
}
