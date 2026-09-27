import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import { commonDirectory, diskFreeOf, spaceLevel, storageLocations, type Volume } from '../storage';
import { dirKey, fetchVolumes } from '../useDatabases';

const vol = (VolumeDirectory: string, Size: number, DiskFree: number, VolumeNumber = 0): Volume => ({
  VolumeNumber,
  VolumeDirectory,
  File: 'IRIS.DAT',
  Size,
  VolumeDirectoryTotalSize: Size,
  DiskFree,
});

describe('where the databases live and how much room is left', () => {
  // GET /v2/database-dir/volumes on IRIS for Health 2026.2 in a container with durable %SYS
  // (docs/verification/2026-09-23-irishealth-2026.2/c-databases.json): the durable directory is a
  // bind mount of the host's disk, the libraries stay in the image's file system.
  const irisForHealth = [
    { name: 'IRISSYS', volumes: [vol('/durable/iris/mgr/', 70, 3_315_208)] },
    { name: 'HSCUSTOM', volumes: [vol('/durable/iris/mgr/HSCUSTOM/', 21, 3_315_208)] },
    { name: 'USER', volumes: [vol('/durable/iris/mgr/user/', 11, 3_315_208)] },
    { name: 'ENSLIB', volumes: [vol('/usr/irissys/mgr/enslib/', 214, 81_944)] },
    { name: 'HSLIB', volumes: [vol('/usr/irissys/mgr/hslib/', 1_627, 81_944)] },
    { name: 'IRISLIB', volumes: [vol('/usr/irissys/mgr/irislib/', 379, 81_944)] },
  ];

  it('tells the disks apart by the free space IRIS reports, least room first', () => {
    expect(storageLocations(irisForHealth)).toEqual([
      {
        path: '/usr/irissys/mgr/',
        freeMB: 81_944,
        databases: ['ENSLIB', 'HSLIB', 'IRISLIB'],
        usedMB: 2_220,
        level: 'ok',
      },
      {
        path: '/durable/iris/mgr/',
        freeMB: 3_315_208,
        databases: ['HSCUSTOM', 'IRISSYS', 'USER'],
        usedMB: 102,
        level: 'ok',
      },
    ]);
  });

  it('keeps one disk together when writes between the reads moved its free space a little', () => {
    const disks = storageLocations([
      { name: 'A', volumes: [vol('/data/a/', 10, 500_000)] },
      { name: 'B', volumes: [vol('/data/b/', 10, 499_980)] },
    ]);
    expect(disks).toHaveLength(1);
    expect(disks[0]).toMatchObject({ path: '/data/', freeMB: 499_980, databases: ['A', 'B'] });
  });

  it('never puts two Windows drives together, and names a disk in the instance style', () => {
    const disks = storageLocations([
      { name: 'USER', volumes: [vol('C:\\InterSystems\\IRIS\\mgr\\user\\', 11, 50_000)] },
      { name: 'APP', volumes: [vol('D:\\iris\\app\\', 11, 50_000)] },
    ]);
    expect(disks.map((d) => d.path).sort()).toEqual([
      'C:\\InterSystems\\IRIS\\mgr\\user\\',
      'D:\\iris\\app\\',
    ]);
    expect(
      commonDirectory(['C:\\InterSystems\\IRIS\\mgr\\user\\', 'c:\\intersystems\\IRIS\\mgr\\app\\']),
    ).toBe('C:\\InterSystems\\IRIS\\mgr\\');
    expect(commonDirectory(['/a/x/', '/b/y/'])).toBe('/');
  });

  it('calls a disk low under 10 GiB or under a tenth of its data, critical under 2 GiB', () => {
    expect(spaceLevel(1_500)).toBe('critical');
    expect(spaceLevel(9_421)).toBe('low');
    expect(spaceLevel(50_000, 600_000)).toBe('low');
    expect(spaceLevel(50_000, 100_000)).toBe('ok');
  });

  it('reads a database’s free space from the volume it grows in', () => {
    expect(diskFreeOf([vol('/a/', 1, 900, 0), vol('/b/', 1, 12, 1)])).toBe(12);
    expect(diskFreeOf([])).toBeUndefined();
    expect(diskFreeOf([{ VolumeDirectory: '/a/' }])).toBeUndefined();
  });
});

describe('reading the volumes of every database', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    await useSession
      .getState()
      .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS' });
  });

  it('keeps what it could read and leaves out a directory that failed', async () => {
    const volumes = await fetchVolumes(['/usr/irissys/mgr/user/', '/irisdata/clinical/', '/nowhere/']);
    expect([...volumes.keys()]).toEqual([dirKey('/usr/irissys/mgr/user/'), dirKey('/irisdata/clinical/')]);
    expect(volumes.get(dirKey('/irisdata/clinical/'))?.[0]).toMatchObject({ DiskFree: 9_421 });
    expect(volumes.get(dirKey('/usr/irissys/mgr/user/'))?.[0]).toMatchObject({ DiskFree: 184_320 });
  });
});
