import { mockDb, MGR, type DbLocal } from '../db';
import {
  ok,
  created,
  notFound,
  badRequest,
  requireParam,
  jsonBody,
  filterRows,
  accepted,
  fail,
  now,
} from '../util';
import { route, MANAGE, OPERATE, MANAGE_OR_OPERATE, apiBasePath } from '../secure';
import { startAsyncTask } from '../async';

const listShape = (d: DbLocal) => ({
  Directory: d.Directory,
  MaxSize: d.MaxSize,
  Size: d.Size,
  Status: d.Status,
  Resource: d.Resource,
  Encrypted: d.Encrypted,
  Mirrored: d.Mirrored,
  SFN: d.SFN,
  EncryptionKeyID: d.EncryptionKeyID,
  EncryptionVersion: d.EncryptionVersion,
});

const detailShape = (d: DbLocal) => ({
  ClusterMountMode: d.ClusterMountMode,
  ExpansionSize: d.ExpansionSize,
  MaxSize: d.MaxSize === 'Unlimited' ? 0 : Number(d.MaxSize),
  NewGlobalCollation: d.NewGlobalCollation,
  NewGlobalIsKeep: d.NewGlobalIsKeep,
  NewVolumeDirectory: d.NewVolumeDirectory,
  NewVolumeThreshold: d.NewVolumeThreshold,
  GlobalJournalState: d.GlobalJournalState,
  ReadOnly: d.ReadOnly,
  ResourceName: d.Resource,
});

function findLocal(dir: string | null) {
  if (!dir) return undefined;
  const norm = dir.endsWith('/') ? dir : `${dir}/`;
  return mockDb.localDbs.find((d) => d.Directory === norm || d.Directory === dir);
}

function metrics(d: DbLocal) {
  return {
    Blocks: d.Blocks,
    BlockSize: d.BlockSize,
    Encrypted: d.Encrypted,
    EncryptionKeyID: d.EncryptionKeyID,
    ExpansionSize: d.ExpansionSize,
    Full: d.Full,
    LastExpansionTime: d.LastExpansionTime,
    MaxSize: d.MaxSize === 'Unlimited' ? 0 : Number(d.MaxSize),
    Mirrored: d.Mirrored,
    MirrorSetName: '',
    ReadOnlyReason: d.ReadOnly ? 'Mounted read-only' : '',
    Size: d.Size,
    AvailableSpace: d.AvailableSpace,
    DiskFree: d.DiskFree,
    EndFree: d.EndFree,
    Mounted: d.Mounted,
    MirrorDBName: '',
    MirrorFailoverDB: false,
    SFN: d.SFN,
  };
}

export const databaseHandlers = [
  // ---- Config.Databases ---------------------------------------------------
  route('get', '/v2/databases', MANAGE_OR_OPERATE, ({ request }) =>
    ok(filterRows(mockDb.configDbs as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/database', MANAGE, ({ request }) => {
    const name = requireParam(request, 'name');
    const db = mockDb.configDbs.find((d) => d.Name.toUpperCase() === name?.toUpperCase());
    if (!db) return notFound(`Database ${name}`);
    const { Name: _n, Status: _s, ...rest } = db;
    return ok(rest);
  }),

  route('put', '/v2/database', MANAGE, async ({ request }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<Record<string, unknown>>(request);
    const existing = mockDb.configDbs.find((d) => d.Name.toUpperCase() === name.toUpperCase());
    if (existing) {
      Object.assign(existing, body);
      return ok({}, { summary: `Database ${name} updated` });
    }
    const dir = String(body.Directory ?? `${MGR}${name.toLowerCase()}/`);
    mockDb.configDbs.push({
      Name: name.toUpperCase(),
      Directory: dir,
      Server: String(body.Server ?? ''),
      ClusterMountMode: false,
      MountRequired: !!body.MountRequired,
      MountAtStartup: body.MountAtStartup !== false,
      StreamLocation: `${dir}stream/`,
      Status: findLocal(dir) ? 'Mounted/RW' : 'Not Mounted',
    });
    return created({}, [`Database ${name.toUpperCase()} created`]);
  }),

  route('delete', '/v2/database', MANAGE, ({ request }) => {
    const name = requireParam(request, 'name');
    const i = mockDb.configDbs.findIndex((d) => d.Name.toUpperCase() === name?.toUpperCase());
    if (i < 0) return notFound(`Database ${name}`);
    if (mockDb.configDbs[i].Name.startsWith('IRIS'))
      return fail(400, `System database ${name} cannot be deleted`);
    mockDb.configDbs.splice(i, 1);
    return ok({}, { summary: `Database ${name} deleted` });
  }),

  // ---- Local databases (SYS.Database) ------------------------------------
  route('get', '/v2/database-dirs', MANAGE_OR_OPERATE, ({ request }) =>
    ok(filterRows(mockDb.localDbs.map(listShape) as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/database-dir', MANAGE_OR_OPERATE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    return d ? ok(detailShape(d)) : notFound('Local database');
  }),

  route('post', '/v2/database-dir', MANAGE, async ({ request }) => {
    const body = await jsonBody<Record<string, unknown>>(request);
    const dir = String(body.Directory ?? '');
    if (!dir) return badRequest('Directory is required');
    if (findLocal(dir)) return fail(400, `A database already exists in ${dir}`);
    const size = Number(body.Size ?? 1);
    const normDir = dir.endsWith('/') ? dir : `${dir}/`;
    mockDb.localDbs.push({
      Directory: normDir,
      MaxSize: 'Unlimited',
      Size: size,
      Status: 'Mounted/RW',
      Resource: String(body.ResourceName ?? '%DB_%DEFAULT'),
      Encrypted: !!body.Encrypted,
      Mirrored: false,
      SFN: 0,
      EncryptionKeyID: '',
      EncryptionVersion: '0',
      ClusterMountMode: false,
      ExpansionSize: 0,
      NewGlobalCollation: 5,
      NewGlobalIsKeep: false,
      NewVolumeDirectory: '',
      NewVolumeThreshold: Number(body.VolThreshold ?? 0),
      GlobalJournalState: body.GlobalJournalState !== false,
      ReadOnly: false,
      Blocks: Math.round((size * 1024) / 8),
      BlockSize: Number(body.BlockSize ?? 8192),
      Full: false,
      LastExpansionTime: now(),
      AvailableSpace: Math.round(size * 0.9),
      DiskFree: '41.2 GB',
      EndFree: Math.round(size * 0.9),
      Mounted: true,
    });
    return created({}, [`Database created in ${normDir}`]);
  }),

  route('put', '/v2/database-dir', MANAGE, async ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    const body = await jsonBody<Record<string, unknown>>(request);
    if (body.MaxSize !== undefined)
      d.MaxSize = Number(body.MaxSize) === 0 ? 'Unlimited' : String(body.MaxSize);
    if (body.ExpansionSize !== undefined) d.ExpansionSize = Number(body.ExpansionSize);
    if (body.GlobalJournalState !== undefined) d.GlobalJournalState = !!body.GlobalJournalState;
    if (body.ReadOnly !== undefined) {
      d.ReadOnly = !!body.ReadOnly;
      d.Status = d.ReadOnly ? 'Mounted/R' : 'Mounted/RW';
    }
    if (body.ResourceName !== undefined) d.Resource = String(body.ResourceName);
    if (body.NewVolumeThreshold !== undefined) d.NewVolumeThreshold = Number(body.NewVolumeThreshold);
    if (body.NewVolumeDirectory !== undefined) d.NewVolumeDirectory = String(body.NewVolumeDirectory);
    return ok({}, { summary: 'Database updated' });
  }),

  route('delete', '/v2/database-dir', MANAGE, ({ request }) => {
    const dir = requireParam(request, 'dir');
    const i = mockDb.localDbs.findIndex((d) => d.Directory === dir || d.Directory === `${dir}/`);
    if (i < 0) return notFound('Local database');
    if (
      mockDb.configDbs.some((c) => c.Directory === mockDb.localDbs[i].Directory && c.Name.startsWith('IRIS'))
    ) {
      return fail(400, 'System databases cannot be deleted');
    }
    mockDb.localDbs.splice(i, 1);
    return ok({}, { summary: 'Database deleted' });
  }),

  route('get', '/v2/database-dir/volumes', MANAGE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    return ok({
      Directory: d.Directory,
      Volumes: [{ Name: 'IRIS.DAT', Size: d.Size, Directory: d.Directory }],
    });
  }),

  route('post', '/v2/database-dir/info', MANAGE_OR_OPERATE, ({ request, account }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    const id = startAsyncTask({
      name: `POST /v2/database-dir/info ${d.Directory}`,
      owner: account.username,
      console: [`Collecting metrics for ${d.Directory}`],
      result: metrics(d),
      tickMs: 400,
    });
    return accepted(id, apiBasePath(request));
  }),

  route('post', '/v2/database-dir/mount', OPERATE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    if (d.Mounted) return fail(409, 'Database is already mounted');
    d.Mounted = true;
    d.Status = d.ReadOnly ? 'Mounted/R' : 'Mounted/RW';
    return ok({}, { summary: 'Database mounted' });
  }),

  route('post', '/v2/database-dir/dismount', OPERATE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    if (d.Directory === MGR) return fail(400, 'IRISSYS cannot be dismounted');
    if (!d.Mounted) return fail(409, 'Database is not mounted');
    d.Mounted = false;
    d.Status = 'Dismounted';
    return ok({}, { summary: 'Database dismounted' });
  }),

  route('post', '/v2/database-dir/modify-size', MANAGE, async ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    const body = await jsonBody<{ Size?: number }>(request);
    const size = Number(body.Size);
    if (!size || size < d.Size) return badRequest('Size must be larger than the current size');
    d.Size = size;
    d.Blocks = Math.round((size * 1024) / 8);
    d.LastExpansionTime = now();
    return ok({}, { summary: `Database expanded to ${size} MB` });
  }),

  route('post', '/v2/database-dir/expand-volume', MANAGE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    return ok({}, { summary: 'New volume created' });
  }),

  route('post', '/v2/database-dir/truncate', OPERATE, ({ request }) => {
    const d = findLocal(requireParam(request, 'dir'));
    if (!d) return notFound('Local database');
    const freed = d.EndFree;
    d.Size = Math.max(1, d.Size - freed);
    d.EndFree = 0;
    return ok({ Freed: freed }, { summary: `Truncated ${freed} MB from the end of the file` });
  }),

  ...(['compact', 'defragment', 'integrity-check'] as const).map((action) =>
    route('post', `/v2/database-dir/${action}`, OPERATE, async ({ request, account }) => {
      const body = await jsonBody<{
        TargetFreeSpace?: number;
        Databases?: { Directory?: string; Globals?: string[] }[];
        MaxProcesses?: number;
        PartialCheck?: boolean;
      }>(request);
      const d =
        action === 'integrity-check'
          ? findLocal(body.Databases?.[0]?.Directory ?? null)
          : findLocal(requireParam(request, 'dir'));
      if (!d)
        return action === 'integrity-check'
          ? badRequest('Databases[0].Directory is required')
          : notFound('Local database');
      const console =
        action === 'integrity-check'
          ? [
              'Integrity check started',
              'Checking directory blocks…',
              'Checking global ^%SYS…',
              'Checking global ^rOBJ…',
              'Checking global ^oddDEF…',
              'No errors found',
            ]
          : action === 'compact'
            ? [
                `Compacting ${d.Directory}`,
                `Target free space: ${body.TargetFreeSpace ?? 0} MB`,
                'Scanning blocks…',
                'Relocating big string blocks…',
                'Compaction complete',
              ]
            : [
                `Defragmenting ${d.Directory}`,
                'Analyzing global layout…',
                'Moving blocks…',
                'Defragmentation complete',
              ];
      const result =
        action === 'integrity-check'
          ? { GlobalsChecked: 143, ErrorCount: 0, Status: 'Completed', PercentComplete: 100 }
          : action === 'compact'
            ? { Database: d.Directory, BlocksScanned: d.Blocks, Status: 'Completed', PercentComplete: 100 }
            : { Database: d.Directory, Status: 'Completed', PercentComplete: 100 };
      const id = startAsyncTask({
        name: `POST /v2/database-dir/${action} ${d.Directory}`,
        owner: account.username,
        console,
        result,
        tickMs: 1200,
        progressUnits: action === 'integrity-check' ? 'globals' : 'blocks',
        progressTotal: action === 'integrity-check' ? 143 : d.Blocks,
      });
      return accepted(id, apiBasePath(request));
    }),
  ),
];
