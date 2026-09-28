/**
 * Free disk space where the databases live. IRIS reports it per volume (GET
 * /v2/database-dir/volumes, `DiskFree` in MB) for the disk that holds the volume's directory,
 * which is also what a container sees: a bind-mounted data directory reports the host disk behind
 * it, the image's own directories the image's file system.
 */

/** One volume of a database, as GET /v2/database-dir/volumes answers it (sizes in MB). */
export interface Volume {
  VolumeNumber?: number;
  VolumeDirectory?: string;
  File?: string;
  Size?: number;
  VolumeDirectoryTotalSize?: number;
  DiskFree?: number;
}

export type SpaceLevel = 'ok' | 'low' | 'critical';

/** A disk that holds database volumes. */
export interface StorageLocation {
  /** The deepest directory all the volumes on this disk share, e.g. `/durable/iris/mgr/`. */
  path: string;
  freeMB: number;
  /** Per cent of the disk free, and its size in MB, when /api/monitor reports how full it is. */
  percentFree?: number;
  totalMB?: number;
  /** The databases with a volume here, by name. */
  databases: string[];
  /** What those volumes occupy, in MB. */
  usedMB: number;
  level: SpaceLevel;
}

const GIB = 1024;

/**
 * Critical under 2 GiB free; low under 10 GiB, or under a tenth of the data already on the disk.
 * Databases grow into this space, and one that cannot expand answers <FILEFULL> to every write.
 */
export function spaceLevel(freeMB: number, usedMB = 0): SpaceLevel {
  if (freeMB < 2 * GIB) return 'critical';
  if (freeMB < 10 * GIB || freeMB < usedMB / 10) return 'low';
  return 'ok';
}

/**
 * The free space of the disk a database grows on: its last volume's (a database expands in its
 * newest volume). Undefined when IRIS reported none.
 */
export function diskFreeOf(volumes: Volume[] | undefined): number | undefined {
  const last = [...(volumes ?? [])]
    .filter((v) => typeof v.DiskFree === 'number')
    .sort((a, b) => (a.VolumeNumber ?? 0) - (b.VolumeNumber ?? 0))
    .pop();
  return last?.DiskFree;
}

/**
 * Directories on one disk report the same free space when read together; the margin allows for
 * writes between two reads (64 MB, or a thousandth of the free space on large disks).
 */
function sameDisk(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(64, Math.max(a, b) / 1000);
}

/** The deepest common directory of `dirs`, in their separator style (`/` when they share none). */
export function commonDirectory(dirs: string[]): string {
  const sep = dirs.some((d) => d.includes('\\')) ? '\\' : '/';
  const windows = sep === '\\';
  const parts = dirs.map((d) => d.replace(/[\\/]+$/, '').split(/[\\/]/));
  const first = parts[0] ?? [];
  const same = (a: string | undefined, b: string) =>
    a !== undefined && (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  let n = 0;
  while (n < first.length && parts.every((p) => same(p[n], first[n]))) n++;
  const joined = first.slice(0, n).join(sep);
  return joined === '' ? sep : `${joined}${sep}`;
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

/** A sample of /api/monitor/metrics: its name, labels and value. */
interface Sample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/**
 * How full, in per cent, the disk behind each database directory is: `iris_disk_percent_full`
 * of /api/monitor, labelled `id` (the database) and `dir` (its directory). A sample that carries
 * the directory as its `id` instead is read too.
 */
export class DiskUsage {
  private readonly byDir = new Map<string, number>();

  constructor(samples: Sample[] | undefined) {
    for (const s of samples ?? []) {
      if (s.name !== 'iris_disk_percent_full' || !Number.isFinite(s.value)) continue;
      const dir = s.labels.dir ?? (/[\\/]/.test(s.labels.id ?? '') ? s.labels.id : undefined);
      if (dir) this.byDir.set(dirKey(dir), s.value);
    }
  }

  /** Per cent of the disk behind `dir` in use, when reported. */
  percentFull(dir: string | undefined): number | undefined {
    return dir === undefined ? undefined : this.byDir.get(dirKey(dir));
  }

  /** Per cent of the disk behind `dir` free, when reported. */
  percentFree(dir: string | undefined): number | undefined {
    const full = this.percentFull(dir);
    return full === undefined ? undefined : Math.max(0, 100 - full);
  }
}

/**
 * The share of its disk that is free for one database: its own reading of iris_disk_percent_full
 * when /api/monitor has one, else its disk's, taken from the other databases on that disk. IRIS
 * does not report every database there (IRISLIB never, on IRIS for Health 2026.2; others come and
 * go), and a disk's figure is the same for all of them.
 */
export function percentFreeFor(
  name: string,
  dir: string | undefined,
  locations: StorageLocation[],
  usage: DiskUsage,
): number | undefined {
  return usage.percentFree(dir) ?? locations.find((l) => l.databases.includes(name))?.percentFree;
}

/**
 * The disks behind the databases, least free space first. Volumes are put on one disk when they
 * report the same free space (and, on Windows, the same drive); a disk is named by the deepest
 * directory its volumes share.
 */
export function storageLocations(
  databases: { name: string; volumes: Volume[] }[],
  usage: DiskUsage = new DiskUsage([]),
): StorageLocation[] {
  const disks: { free: number; drive: string; dirs: string[]; names: Set<string>; used: number }[] = [];
  for (const db of databases)
    for (const v of db.volumes) {
      if (typeof v.DiskFree !== 'number' || !v.VolumeDirectory) continue;
      const drive = /^[a-z]:/i.exec(v.VolumeDirectory)?.[0].toLowerCase() ?? '';
      let disk = disks.find((d) => d.drive === drive && sameDisk(d.free, v.DiskFree!));
      if (!disk) {
        disk = { free: v.DiskFree, drive, dirs: [], names: new Set(), used: 0 };
        disks.push(disk);
      }
      disk.free = Math.min(disk.free, v.DiskFree);
      disk.dirs.push(v.VolumeDirectory);
      disk.names.add(db.name);
      disk.used += v.Size ?? 0;
    }
  return disks
    .map((d) => {
      // The directories of one disk report the same figure; the fullest reading wins.
      const full = Math.max(...d.dirs.map((dir) => usage.percentFull(dir) ?? -1));
      const percentFree = full < 0 ? undefined : Math.max(0, 100 - full);
      return {
        path: commonDirectory(d.dirs),
        freeMB: d.free,
        percentFree,
        // The disk's size follows from its free space and share; a full disk (0 %) gives none.
        totalMB: percentFree ? Math.round(d.free / (percentFree / 100)) : undefined,
        databases: [...d.names].sort(),
        usedMB: d.used,
        level: spaceLevel(d.free, d.used),
      };
    })
    .sort((a, b) => a.freeMB - b.freeMB);
}
