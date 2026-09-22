import { useQuery } from '@tanstack/react-query';
import { api, result } from '@/api/client';
import type { ConfigDatabaseList, Schemas } from '@/api/types';

export type ConfigRow = ConfigDatabaseList[number];
/** The spec declares LocalDatabaseList as an object; the server returns an array. Accept both. */
export type LocalRow = Schemas['LocalDatabaseList'];

export interface DatabaseRow extends ConfigRow {
  local?: LocalRow;
  SizeMB?: number;
  MaxSize?: string;
  Resource?: string;
  Encrypted?: boolean;
  Mirrored?: boolean;
}

export function normalizeLocal(raw: unknown): LocalRow[] {
  if (Array.isArray(raw)) return raw as LocalRow[];
  if (raw && typeof raw === 'object') return [raw as LocalRow];
  return [];
}

export const dbKeys = {
  config: ['databases', 'config'] as const,
  local: ['databases', 'local'] as const,
  configOne: (name: string) => ['databases', 'config', name] as const,
  localOne: (dir: string) => ['databases', 'local', dir] as const,
};

export function useConfigDatabases() {
  return useQuery({ queryKey: dbKeys.config, queryFn: () => result(api().GET('/v2/databases')) });
}

export function useLocalDatabases() {
  return useQuery({
    queryKey: dbKeys.local,
    queryFn: async () => normalizeLocal(await result(api().GET('/v2/database-dirs'))),
  });
}

/**
 * A directory as a join key: without its trailing separator, and case-folded when it is a
 * Windows path (`C:\InterSystems\IRIS\mgr\user\` and `c:\intersystems\iris\mgr\USER` are
 * one database; Windows file names are case-insensitive, Unix ones are not).
 */
export function dirKey(dir: string): string {
  const trimmed = dir.replace(/[\\/]+$/, '');
  return /^[a-z]:[\\/]|\\/i.test(trimmed) ? trimmed.toLowerCase().replace(/\//g, '\\') : trimmed;
}

/**
 * Where a new database called `name` would normally go on this instance: next to the
 * existing ones (the parent of USER's directory, or of the first database), in the
 * separator style the instance uses. Undefined when no database directory is known.
 */
export function suggestDirectory(
  dirs: (string | undefined)[],
  name: string,
  userDir?: string,
): string | undefined {
  const sample = userDir ?? dirs.find(Boolean);
  if (!sample || !name) return undefined;
  const sep = sample.includes('\\') ? '\\' : '/';
  const parent = sample.replace(/[\\/]+$/, '').replace(/[^\\/]*$/, '');
  return `${parent}${name.toLowerCase()}${sep}`;
}

export function joinDatabases(
  config: ConfigDatabaseList | undefined,
  local: LocalRow[] | undefined,
): DatabaseRow[] {
  const byDir = new Map<string, LocalRow>();
  for (const l of local ?? []) if (l.Directory) byDir.set(dirKey(l.Directory), l);
  const rows: DatabaseRow[] = (config ?? []).map((c) => {
    const l = c.Directory ? byDir.get(dirKey(c.Directory)) : undefined;
    return {
      ...c,
      local: l,
      SizeMB: l?.Size,
      MaxSize: l?.MaxSize,
      Resource: l?.Resource,
      Encrypted: l?.Encrypted,
      Mirrored: l?.Mirrored,
      Status: c.Status ?? l?.Status,
    };
  });
  // Local databases without a Config.Databases entry (e.g. dismounted or orphaned).
  const seen = new Set(rows.map((r) => (r.Directory ? dirKey(r.Directory) : undefined)));
  for (const l of local ?? []) {
    const key = l.Directory ? dirKey(l.Directory) : undefined;
    if (key && !seen.has(key))
      rows.push({
        Name: '',
        Directory: l.Directory,
        Status: l.Status,
        local: l,
        SizeMB: l.Size,
        MaxSize: l.MaxSize,
        Resource: l.Resource,
        Encrypted: l.Encrypted,
        Mirrored: l.Mirrored,
      });
  }
  return rows;
}
