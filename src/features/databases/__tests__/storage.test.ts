import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/mocks/db';
import { resetClients } from '@/api/client';
import { useSession } from '@/stores/session';
import {
  DiskUsage,
  commonDirectory,
  diskFreeOf,
  percentFreeFor,
  spaceLevel,
  storageLocations,
  type Volume,
} from '../storage';
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

describe('how full each disk is', () => {
  // /api/monitor/metrics on IRIS for Health 2026.2 (28 Sep): one sample per database, labelled with
  // its name and directory; every directory of a disk reports the disk's figure.
  const metrics = [
    { name: 'iris_disk_percent_full', labels: { id: 'USER', dir: '/durable/iris/mgr/user/' }, value: 27.7 },
    { name: 'iris_disk_percent_full', labels: { id: 'IRISSYS', dir: '/durable/iris/mgr/' }, value: 27.7 },
    { name: 'iris_disk_percent_full', labels: { id: 'HSLIB', dir: '/usr/irissys/mgr/hslib/' }, value: 22.69 },
    { name: 'iris_db_size_mb', labels: { id: 'USER', dir: '/durable/iris/mgr/user/' }, value: 11 },
  ];

  it('reads the share of the disk in use and free for a directory, with or without its trailing slash', () => {
    const usage = new DiskUsage(metrics);
    expect(usage.percentFull('/durable/iris/mgr/user/')).toBe(27.7);
    expect(usage.percentFree('/durable/iris/mgr/user')).toBeCloseTo(72.3);
    expect(usage.percentFree('/usr/irissys/mgr/hslib/')).toBeCloseTo(77.31);
    expect(usage.percentFree('/elsewhere/')).toBeUndefined();
    expect(usage.percentFree(undefined)).toBeUndefined();
    expect(new DiskUsage(undefined).percentFree('/durable/iris/mgr/')).toBeUndefined();
  });

  it('also takes a directory given as the id, and ignores an id that is a database name', () => {
    const usage = new DiskUsage([
      { name: 'iris_disk_percent_full', labels: { id: '/usr/irissys/mgr/user/' }, value: 77 },
      { name: 'iris_disk_percent_full', labels: { id: 'USER' }, value: 12 },
    ]);
    expect(usage.percentFull('/usr/irissys/mgr/user/')).toBe(77);
    expect(usage.percentFull('USER')).toBeUndefined();
  });

  it('gives each disk its share free and its size, from the fullest reading of its directories', () => {
    const usage = new DiskUsage([
      ...metrics,
      {
        name: 'iris_disk_percent_full',
        labels: { id: 'IRISTEMP', dir: '/durable/iris/mgr/iristemp/' },
        value: 28,
      },
    ]);
    const [image, durable] = storageLocations(
      [
        { name: 'USER', volumes: [vol('/durable/iris/mgr/user/', 11, 2_730_752)] },
        { name: 'IRISTEMP', volumes: [vol('/durable/iris/mgr/iristemp/', 21, 2_730_752)] },
        { name: 'HSLIB', volumes: [vol('/usr/irissys/mgr/hslib/', 1627, 79_109)] },
      ],
      usage,
    );
    expect(image).toMatchObject({ path: '/usr/irissys/mgr/hslib/', percentFree: expect.closeTo(77.31, 2) });
    expect(image.totalMB).toBe(Math.round(79_109 / 0.7731));
    expect(durable).toMatchObject({ path: '/durable/iris/mgr/', percentFree: 72 });
    expect(durable.totalMB).toBe(Math.round(2_730_752 / 0.72));
    // Without the monitor's figures, a disk has its free space only.
    const [bare] = storageLocations([
      { name: 'USER', volumes: [vol('/durable/iris/mgr/user/', 11, 2_730_752)] },
    ]);
    expect(bare.percentFree).toBeUndefined();
    expect(bare.totalMB).toBeUndefined();
  });
});

describe('a database the monitor does not report', () => {
  it('takes the share of its disk from the other databases on that disk', () => {
    // /api/monitor on IRIS for Health 2026.2: no iris_disk_percent_full for IRISLIB, none for
    // IRISLOCALDATA at 04:10, while their neighbours on the same disks have one.
    const usage = new DiskUsage([
      { name: 'iris_disk_percent_full', labels: { id: 'USER', dir: '/durable/iris/mgr/user/' }, value: 28 },
      { name: 'iris_disk_percent_full', labels: { id: 'HSLIB', dir: '/usr/irissys/mgr/hslib/' }, value: 23 },
    ]);
    const locations = storageLocations(
      [
        { name: 'USER', volumes: [vol('/durable/iris/mgr/user/', 11, 2_747_422)] },
        { name: 'IRISLOCALDATA', volumes: [vol('/durable/iris/mgr/irislocaldata/', 11, 2_747_422)] },
        { name: 'HSLIB', volumes: [vol('/usr/irissys/mgr/hslib/', 1627, 79_109)] },
        { name: 'IRISLIB', volumes: [vol('/usr/irissys/mgr/irislib/', 379, 79_109)] },
      ],
      usage,
    );
    expect(percentFreeFor('IRISLOCALDATA', '/durable/iris/mgr/irislocaldata/', locations, usage)).toBe(72);
    expect(percentFreeFor('IRISLIB', '/usr/irissys/mgr/irislib/', locations, usage)).toBe(77);
    expect(percentFreeFor('USER', '/durable/iris/mgr/user/', locations, usage)).toBe(72);
    // A disk where no database has a reading has no share.
    expect(
      percentFreeFor('USER', '/durable/iris/mgr/user/', storageLocations([]), new DiskUsage([])),
    ).toBeUndefined();
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
