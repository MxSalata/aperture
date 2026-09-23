import { mockDb, type WebAppRec } from '../db';
import { recordAudit } from '../audit';
import {
  ok,
  created,
  notFound,
  badRequest,
  requireParam,
  jsonBody,
  filterRows,
  fail,
  autheMethodNames,
} from '../util';
import { route, SECURE } from '../secure';

const listShape = (w: WebAppRec) => ({
  Name: w.Name,
  Namespace: w.Namespace,
  NamespaceDefault: w.NamespaceDefault,
  Enabled: w.Enabled,
  Type: w.Type,
  Resource: w.Resource,
  AuthenticationMethods: autheMethodNames(w.AutheEnabled),
  IsSystemApp: w.IsSystemApp,
  DispatchClass: w.DispatchClass,
});

const find = (name: string | null) =>
  name ? mockDb.webApps.find((w) => w.Name.toLowerCase() === name.toLowerCase()) : undefined;

export const webAppHandlers = [
  route('get', '/v2/web-apps', SECURE, ({ request }) =>
    ok(filterRows(mockDb.webApps.map(listShape) as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/web-app', SECURE, ({ request }) => {
    const w = find(requireParam(request, 'name'));
    if (!w) return notFound('Web application');
    const { Name: _n, Namespace, NamespaceDefault, Type: _t, IsSystemApp: _s, ...rest } = w;
    return ok({
      ...rest,
      NameSpace: Namespace,
      IsNameSpaceDefault: NamespaceDefault,
      AutoCompile: true,
      ChangePasswordPage: '',
      CookiePath: w.Name + '/',
      CSPZENEnabled: w.Type === 'CSP',
      DeepSeeEnabled: false,
      ErrorPage: '',
      EventClass: '',
      GroupById: '',
      iKnowEnabled: false,
      InbndWebServicesEnabled: true,
      LockCSPName: true,
      LoginPage: '',
      Package: '',
      PermittedClasses: '',
      RedirectEmptyPath: false,
      ServeFilesTimeout: 3600,
      SuperClass: '',
      TwoFactorEnabled: false,
    });
  }),

  route('put', '/v2/web-app', SECURE, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    if (!name.startsWith('/')) return badRequest('Web application names must start with /');
    const body = await jsonBody<Record<string, unknown>>(request);
    const existing = find(name);
    if (existing) {
      const { NameSpace, IsNameSpaceDefault, ...rest } = body;
      Object.assign(existing, rest);
      if (NameSpace) existing.Namespace = String(NameSpace);
      if (IsNameSpaceDefault !== undefined) existing.NamespaceDefault = !!IsNameSpaceDefault;
      recordAudit(
        account,
        'ApplicationChange',
        `Web application ${name} modified`,
        Object.keys(body).join(', '),
      );
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
      IsSystemApp: false,
      Description: String(body.Description ?? ''),
      DispatchClass: String(body.DispatchClass ?? ''),
      Enabled: body.Enabled !== false,
      Resource: String(body.Resource ?? ''),
      Path: String(body.Path ?? ''),
    });
    recordAudit(account, 'ApplicationChange', `Web application ${name} created`);
    return created({}, [`Web application ${name} created`]);
  }),

  route('delete', '/v2/web-app', SECURE, ({ request, account }) => {
    const w = find(requireParam(request, 'name'));
    if (!w) return notFound('Web application');
    if (w.IsSystemApp) return fail(400, `System application ${w.Name} cannot be deleted`);
    mockDb.webApps = mockDb.webApps.filter((x) => x !== w);
    recordAudit(account, 'ApplicationChange', `Web application ${w.Name} deleted`);
    return ok({}, { summary: `Web application ${w.Name} deleted` });
  }),

  route('get', '/v2/web-app/pct-accesses', SECURE, () =>
    ok([{ Name: '/csp/sys', AllowType: 'Prefix', Class: '%CSP.UI.', AllowAccess: true, System: true }]),
  ),
  route('get', '/v2/web-app/pct-access', SECURE, ({ request }) =>
    ok({
      Name: requireParam(request, 'name'),
      AllowType: requireParam(request, 'allowType'),
      Class: requireParam(request, 'class'),
    }),
  ),
  route('put', '/v2/web-app/pct-access', SECURE, () => created({}, ['Percent class access created'])),
  route('delete', '/v2/web-app/pct-access', SECURE, () =>
    ok({}, { summary: 'Percent class access deleted' }),
  ),
];
