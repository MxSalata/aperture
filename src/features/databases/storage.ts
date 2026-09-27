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
 * The disks behind the databases, least free space first. Volumes are put on one disk when they
 * report the same free space (and, on Windows, the same drive); a disk is named by the deepest
 * directory its volumes share.
 */
export function storageLocations(databases: { name: string; volumes: Volume[] }[]): StorageLocation[] {
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
    .map((d) => ({
      path: commonDirectory(d.dirs),
      freeMB: d.free,
      databases: [...d.names].sort(),
      usedMB: d.used,
      level: spaceLevel(d.free, d.used),
    }))
    .sort((a, b) => a.freeMB - b.freeMB);
}
