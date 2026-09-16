import { mockDb } from '../db';
import { ok, created, notFound, badRequest, requireParam, jsonBody, fail } from '../util';
import { route, MANAGE } from '../secure';

function find(name: string | null) {
  return name ? mockDb.namespaces.find((n) => n.Name.toUpperCase() === name.toUpperCase()) : undefined;
}

export const namespaceHandlers = [
  route('get', '/v2/namespaces', MANAGE, () =>
    ok(mockDb.namespaces.map(({ Name, Globals, Routines, SysGlobals, SysRoutines, Library, TempGlobals }) => ({ Name, Globals, Routines, SysGlobals, SysRoutines, Library, TempGlobals }))),
  ),

  route('get', '/v2/namespace', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'name'));
    return n ? ok({ Globals: n.Globals, Routines: n.Routines, TempGlobals: n.TempGlobals }) : notFound('Namespace');
  }),

  route('put', '/v2/namespace', MANAGE, async ({ request }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<{ Globals?: string; Routines?: string; TempGlobals?: string }>(request);
    const existing = find(name);
    if (existing) {
      if (body.Globals) existing.Globals = body.Globals;
      if (body.Routines) existing.Routines = body.Routines;
      if (body.TempGlobals) existing.TempGlobals = body.TempGlobals;
      return ok({}, { summary: `Namespace ${name} updated` });
    }
    if (!body.Globals) return badRequest('Globals database is required');
    if (!mockDb.configDbs.some((d) => d.Name === body.Globals)) return fail(400, `Database ${body.Globals} does not exist`);
    mockDb.namespaces.push({
      Name: name.toUpperCase(),
      Globals: body.Globals,
      Routines: body.Routines || body.Globals,
      SysGlobals: 'IRISSYS',
      SysRoutines: 'IRISSYS',
      Library: 'IRISLIB',
      TempGlobals: body.TempGlobals || 'IRISTEMP',
      interop: false,
      globalMappings: [],
      packageMappings: [],
      routineMappings: [],
    });
    mockDb.webApps.push({
      ...mockDb.webApps.find((w) => w.Name === '/csp/user')!,
      Name: `/csp/${name.toLowerCase()}`,
      Namespace: name.toUpperCase(),
      NamespaceDefault: true,
      Description: `${name.toUpperCase()} default web app`,
    });
    return created({}, [`Namespace ${name.toUpperCase()} created`, `Web application /csp/${name.toLowerCase()} created`]);
  }),

  route('delete', '/v2/namespace', MANAGE, ({ request }) => {
    const name = requireParam(request, 'name');
    const i = mockDb.namespaces.findIndex((n) => n.Name.toUpperCase() === name?.toUpperCase());
    if (i < 0) return notFound('Namespace');
    if (mockDb.namespaces[i].Name === '%SYS') return fail(400, '%SYS cannot be deleted');
    const removed = mockDb.namespaces.splice(i, 1)[0];
    mockDb.webApps = mockDb.webApps.filter((w) => w.Namespace !== removed.Name || w.IsSystemApp);
    return ok({}, { summary: `Namespace ${removed.Name} and its web applications deleted` });
  }),

  route('post', '/v2/namespace/enable-interop', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'name'));
    if (!n) return notFound('Namespace');
    if (n.interop) return fail(409, 'Interoperability is already enabled');
    n.interop = true;
    n.packageMappings.push({ Name: 'Ens', Database: 'ENSLIB' }, { Name: 'EnsLib', Database: 'ENSLIB' });
    n.globalMappings.push({ Name: 'Ens.*', Subscript: '', Database: 'ENSLIB', Collation: 'IRIS standard', LockDatabase: 'ENSLIB' });
    return ok({}, { summary: `Interoperability enabled in ${n.Name}`, console: ['Mapping Ens* packages…', 'Creating %Ens_* resources…', 'Done'] });
  }),

  route('post', '/v2/namespace/copy-mappings', MANAGE, async ({ request }) => {
    const body = await jsonBody<{ SourceNamespace?: string; DestinationNamespace?: string }>(request);
    const src = find(body.SourceNamespace ?? null);
    const dst = find(body.DestinationNamespace ?? null);
    if (!src || !dst) return badRequest('SourceNamespace and DestinationNamespace are required');
    dst.globalMappings = [...src.globalMappings];
    dst.packageMappings = [...src.packageMappings];
    dst.routineMappings = [...src.routineMappings];
    return ok({}, { summary: `Mappings copied from ${src.Name} to ${dst.Name}` });
  }),

  // ---- mappings -----------------------------------------------------------
  route('get', '/v2/namespace/global-mappings', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    return n ? ok(n.globalMappings) : notFound('Namespace');
  }),
  route('get', '/v2/namespace/global-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const m = n?.globalMappings.find((g) => g.Name === requireParam(request, 'name'));
    return m ? ok({ Collation: 5, Database: m.Database, LockDatabase: m.LockDatabase }) : notFound('Global mapping');
  }),
  route('put', '/v2/namespace/global-mapping', MANAGE, async ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const name = requireParam(request, 'name');
    if (!n || !name) return badRequest('namespace and name are required');
    const body = await jsonBody<{ Database?: string; LockDatabase?: string; Collation?: number }>(request);
    if (!body.Database) return badRequest('Database is required');
    const existing = n.globalMappings.find((g) => g.Name === name);
    const rec = { Name: name, Subscript: '', Database: body.Database, Collation: 'IRIS standard', LockDatabase: body.LockDatabase || body.Database };
    if (existing) Object.assign(existing, rec);
    else n.globalMappings.push(rec);
    return existing ? ok({}, { summary: 'Mapping updated' }) : created({}, ['Mapping created']);
  }),
  route('delete', '/v2/namespace/global-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const name = requireParam(request, 'name');
    if (!n) return notFound('Namespace');
    const i = n.globalMappings.findIndex((g) => g.Name === name);
    if (i < 0) return notFound('Global mapping');
    n.globalMappings.splice(i, 1);
    return ok({}, { summary: 'Mapping deleted' });
  }),

  route('get', '/v2/namespace/package-mappings', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    return n ? ok(n.packageMappings) : notFound('Namespace');
  }),
  route('get', '/v2/namespace/package-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const m = n?.packageMappings.find((g) => g.Name === requireParam(request, 'name'));
    return m ? ok({ Database: m.Database }) : notFound('Package mapping');
  }),
  route('put', '/v2/namespace/package-mapping', MANAGE, async ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const name = requireParam(request, 'name');
    if (!n || !name) return badRequest('namespace and name are required');
    const body = await jsonBody<{ Database?: string }>(request);
    if (!body.Database) return badRequest('Database is required');
    const existing = n.packageMappings.find((g) => g.Name === name);
    if (existing) existing.Database = body.Database;
    else n.packageMappings.push({ Name: name, Database: body.Database });
    return existing ? ok({}, { summary: 'Mapping updated' }) : created({}, ['Mapping created']);
  }),
  route('delete', '/v2/namespace/package-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    if (!n) return notFound('Namespace');
    const i = n.packageMappings.findIndex((g) => g.Name === requireParam(request, 'name'));
    if (i < 0) return notFound('Package mapping');
    n.packageMappings.splice(i, 1);
    return ok({}, { summary: 'Mapping deleted' });
  }),

  route('get', '/v2/namespace/routine-mappings', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    return n ? ok(n.routineMappings) : notFound('Namespace');
  }),
  route('get', '/v2/namespace/routine-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const m = n?.routineMappings.find((g) => g.Name === requireParam(request, 'name'));
    return m ? ok({ Database: m.Database, Type: m.Type }) : notFound('Routine mapping');
  }),
  route('put', '/v2/namespace/routine-mapping', MANAGE, async ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    const name = requireParam(request, 'name');
    if (!n || !name) return badRequest('namespace and name are required');
    const body = await jsonBody<{ Database?: string; Type?: string }>(request);
    if (!body.Database) return badRequest('Database is required');
    const existing = n.routineMappings.find((g) => g.Name === name);
    const rec = { Name: name, Type: body.Type || 'ALL', Database: body.Database };
    if (existing) Object.assign(existing, rec);
    else n.routineMappings.push(rec);
    return existing ? ok({}, { summary: 'Mapping updated' }) : created({}, ['Mapping created']);
  }),
  route('delete', '/v2/namespace/routine-mapping', MANAGE, ({ request }) => {
    const n = find(requireParam(request, 'namespace'));
    if (!n) return notFound('Namespace');
    const i = n.routineMappings.findIndex((g) => g.Name === requireParam(request, 'name'));
    if (i < 0) return notFound('Routine mapping');
    n.routineMappings.splice(i, 1);
    return ok({}, { summary: 'Mapping deleted' });
  }),
];
