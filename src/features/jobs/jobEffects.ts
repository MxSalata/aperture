import type { QueryKey } from '@tanstack/react-query';
import { isReadOperation } from '@/api/readOnly';

/**
 * What a finished async task may have changed, as the query-key prefixes to refetch. Refetching
 * every screen's data whenever any task ended (a database metrics lookup, an integrity check)
 * re-read everything the open screens show for nothing. Read-only operations change nothing;
 * an operation not listed here (the Explorer can queue any) refetches everything but the task
 * polls and the session, as before.
 */
const EFFECTS: [RegExp, QueryKey[]][] = [
  // Database maintenance: sizes, free space and the dashboard's view of them.
  [
    /^\/v2\/database-dir\/(compact|defragment|expand-volume|modify-size|truncate)$/,
    [['databases'], ['dashboard']],
  ],
  [/^\/v2\/namespace\/(copy-mappings|enable-interop)$/, [['namespaces']]],
  [/^\/v2\/security\/audit\/record\/(copy|purge)$/, [['security', 'audit'], ['audit']]],
];

/** The query-key prefixes a task queued by `path` may have changed, or 'all' when unknown. */
export function affectedBy(path: string | undefined): QueryKey[] | 'all' {
  if (!path) return 'all';
  // Reads: their result is on the task.
  if (isReadOperation('POST', path)) return [];
  const hit = EFFECTS.find(([re]) => re.test(path));
  return hit ? hit[1] : 'all';
}
