import { mockDb, type WebAppRec } from '../db';
import { ok, created, notFound, badRequest, requireParam, jsonBody, filterRows, fail } from '../util';
import { route, SECURE } from '../secure';

const listShape = (w: WebAppRec) => ({
  Name: w.Name,
  Namespace: w.Namespace,
  NamespaceDefault: w.NamespaceDefault,
  Enabled: w.Enabled,
  Type: w.Type,
  Resource: w.Resource,
  AuthenticationMethods: w.AuthenticationMethods,
  IsSystemApp: w.IsSystemApp,
  DispatchClass: w.DispatchClass,
});

const find = (name: string | null) => (name ? mockDb.webApps.find((w) => w.Name.toLowerCase() === name.toLowerCase()) : undefined);

export const webAppHandlers = [
  route('get', '/v2/web-apps', SECURE, ({ request }) => ok(filterRows(mockDb.webApps.map(listShape) as unknown as Record<string, unknown>[], request))),

  route('get', '/v2/web-app', SECURE, ({ request }) => {
    const w = find(requireParam(request, 'name'));
    if (!w) return notFound('Web application');
    const { Name: _n, Namespace, NamespaceDefault, Type: _t, AuthenticationMethods: _a, IsSystemApp: _s, ...rest } = w;
    return ok({ ...rest, NameSpace: Namespace, IsNameSpaceDefault: NamespaceDefault, AutoCompile: true, ChangePasswordPage: '', CookiePath: w.Name + '/', CSPZENEnabled: w.Type === 'CSP', DeepSeeEnabled: false, ErrorPage: '', EventClass: '', GroupById: '', iKnowEnabled: false, InbndWebServicesEnabled: true, LockCSPName: true, LoginPage: '', Package: '', PermittedClasses: '', RedirectEmptyPath: false, ServeFilesTimeout: 3600, SuperClass: '', TwoFactorEnabled: false, UseSessionCookie: 2 });
  }),

  route('put', '/v2/web-app', SECURE, async ({ request }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    if (!name.startsWith('/')) return badRequest('Web application names must start with /');
    const body = await jsonBody<Record<string, unknown>>(request);
    const existing = find(name);
    const authe = Number(body.AutheEnabled ?? existing?.AutheEnabled ?? 32);
    const methods: string[] = [];
    if (authe & 32) methods.push('Password');
    if (authe & 64) methods.push('Unauthenticated');
    if (authe & 16) methods.push('OS');
    if (body.JWTAuthEnabled ?? existing?.JWTAuthEnabled) methods.push('JWT');
    if (existing) {
      const { NameSpace, IsNameSpaceDefault, ...rest } = body;
      Object.assign(existing, rest);
      if (NameSpace) existing.Namespace = String(NameSpace);
      if (IsNameSpaceDefault !== undefined) existing.NamespaceDefault = !!IsNameSpaceDefault;
      existing.AuthenticationMethods = methods;
      return ok({}, { summary: `Web application ${name} updated` });
    }
    const ns = String(body.NameSpace ?? 'USER');
    if (!mockDb.namespaces.some((n) => n.Name === ns)) return fail(400, `Namespace ${ns} does not exist`);
    mockDb.webApps.push({
      ...mockDb.webApps.find((w) => w.Name === '/csp/user')!,
      ...(body as Partial<WebAppRec>),
      Name: name,
      Namespace: ns,
      NamespaceDefault: !!body.IsNameSpaceDefault,
      Type: body.DispatchClass ? 'REST' : 'CSP',
      AuthenticationMethods: methods,
      IsSystemApp: false,
      Description: String(body.Description ?? ''),
      DispatchClass: String(body.DispatchClass ?? ''),
      Enabled: body.Enabled !== false,
      Resource: String(body.Resource ?? ''),
      Path: String(body.Path ?? ''),
    });
    return created({}, [`Web application ${name} created`]);
  }),

  route('delete', '/v2/web-app', SECURE, ({ request }) => {
    const w = find(requireParam(request, 'name'));
    if (!w) return notFound('Web application');
    if (w.IsSystemApp) return fail(400, `System application ${w.Name} cannot be deleted`);
    mockDb.webApps = mockDb.webApps.filter((x) => x !== w);
    return ok({}, { summary: `Web application ${w.Name} deleted` });
  }),

  route('get', '/v2/web-app/pct-accesses', SECURE, () => ok([{ Name: '/csp/sys', AllowType: 'Prefix', Class: '%CSP.UI.', Namespace: '%SYS' }])),
  route('get', '/v2/web-app/pct-access', SECURE, ({ request }) => ok({ Name: requireParam(request, 'name'), AllowType: requireParam(request, 'allowType'), Class: requireParam(request, 'class') })),
  route('put', '/v2/web-app/pct-access', SECURE, () => created({}, ['Percent class access created'])),
  route('delete', '/v2/web-app/pct-access', SECURE, () => ok({}, { summary: 'Percent class access deleted' })),
];
