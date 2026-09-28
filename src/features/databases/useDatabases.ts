import { useQuery } from '@tanstack/react-query';
import { api, result } from '@/api/client';
import type { ConfigDatabaseList, Schemas } from '@/api/types';
import { mapLimit } from '@/lib/limiter';
import { dirKey, type SpaceLevel, type Volume } from './storage';

export { dirKey };

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
  /** Free space on the disk the database grows on, in MB (from its volumes). */
  DiskFreeMB?: number;
  DiskLevel?: SpaceLevel;
  /** Per cent of that disk free, when /api/monitor reports how full it is. */
  DiskPercentFree?: number;
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
  volumes: (dirs: string[]) => ['databases', 'volumes', dirs] as const,
};

/**
 * The volumes of each database directory, by `dirKey`: one GET /v2/database-dir/volumes per
 * directory, four at a time. A directory whose read fails (a dismounted database, a missing
 * privilege) is left out rather than failing the others.
 */
export async function fetchVolumes(dirs: string[]): Promise<Map<string, Volume[]>> {
  const read = await mapLimit(dirs, 4, async (dir) => {
    try {
      const v = await result(api().GET('/v2/database-dir/volumes', { params: { query: { dir } } }));
      return [dirKey(dir), (Array.isArray(v) ? v : []) as Volume[]] as const;
    } catch {
      return null;
    }
  });
  return new Map(read.filter((r) => r !== null));
}

export function useDatabaseVolumes(dirs: string[]) {
  return useQuery({
    queryKey: dbKeys.volumes(dirs),
    queryFn: () => fetchVolumes(dirs),
    enabled: dirs.length > 0,
    staleTime: 60_000,
  });
}

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
