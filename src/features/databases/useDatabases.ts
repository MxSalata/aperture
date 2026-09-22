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

export function joinDatabases(
  config: ConfigDatabaseList | undefined,
  local: LocalRow[] | undefined,
): DatabaseRow[] {
  const byDir = new Map<string, LocalRow>();
  for (const l of local ?? []) if (l.Directory) byDir.set(l.Directory.replace(/\/+$/, ''), l);
  const rows: DatabaseRow[] = (config ?? []).map((c) => {
    const l = c.Directory ? byDir.get(c.Directory.replace(/\/+$/, '')) : undefined;
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
  const seen = new Set(rows.map((r) => r.Directory?.replace(/\/+$/, '')));
  for (const l of local ?? []) {
    const key = l.Directory?.replace(/\/+$/, '');
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
