import { mockDb, type AuditRecordRec, type UserRec, type RoleRec } from '../db';
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
  accepted,
  hoursAgo,
  seeded,
  pick,
  autheMethodNames,
} from '../util';
import { route, SECURE, apiBasePath } from '../secure';
import { startAsyncTask } from '../async';
import { findAccount } from '../auth';

const userListShape = (u: UserRec) => ({
  Name: u.Name,
  FullName: u.FullName,
  Enabled: u.Enabled,
  Type: u.Type,
  Namespace: u.Namespace,
  Routine: u.Routine,
});
const userDetailShape = (u: UserRec) => {
  const { Name: _n, Type: _t, password: _p, ...rest } = u;
  return { ...rest, NameSpace: u.Namespace };
};
const findUser = (name: string | null) =>
  name ? mockDb.users.find((u) => u.Name.toLowerCase() === name.toLowerCase()) : undefined;
const findX509 = (alias: string | null) =>
  alias ? mockDb.x509.find((c) => c.Alias.toLowerCase() === alias.toLowerCase()) : undefined;
const findRole = (name: string | null) =>
  name ? mockDb.roles.find((r) => r.Name.toLowerCase() === name.toLowerCase()) : undefined;

function auditRecords(request: Request) {
  const q = new URL(request.url).searchParams;
  const rnd = seeded(2026);
  const users = ['_SYSTEM', 'jdoe', 'ops', 'analytics', 'auditor', 'UnknownUser'];
  const ips = ['127.0.0.1', '10.0.0.41', '10.0.0.52', '10.0.0.77'];
  const events = mockDb.auditEvents.filter((e) => e.Enabled);
  const max = Math.min(Number(q.get('maxRows') ?? 200) || 200, 500);
  const out = [];
  for (let i = 0; i < max; i++) {
    const e = pick(rnd, events);
    const user = pick(rnd, users);
    const failed = e.EventName === 'LoginFailure' || e.EventName === 'Protect';
    out.push({
      SystemID: 'iris-demo:IRIS',
      AuditIndex: 5_000_000 - i,
      TimeStamp: hoursAgo(i * 0.4),
      UTCTimeStamp: hoursAgo(i * 0.4),
      EventSource: e.EventSource,
      EventType: e.EventType,
      Event: e.EventName,
      Pid: 5400 + (i % 30),
      JobNumber: i % 30,
      JobId: 5400 + (i % 30),
      SessionID: '',
      Username: user,
      Description: `${e.Description}${failed ? ' - access denied' : ''}`,
      Authentication: pick(rnd, ['Password', 'JWT', 'OS', 'Unauthenticated']),
      ClientExecutableName: pick(rnd, ['CSPa24.so', 'irissession', 'java', 'python3', 'code']),
      ClientIPAddress: pick(rnd, ips),
      EventData: failed
        ? `Resource: %Admin_Secure:U\nUser: ${user}`
        : e.EventType === '%SQL'
          ? 'SELECT TOP 100 * FROM DICOM.Study WHERE Modality = ?'
          : '',
      Namespace: pick(rnd, ['%SYS', 'USER', 'IRISAPP', 'INTEROP', 'CLINICAL']),
      Roles: pick(rnd, ['%All', '%Developer,%DB_IRISAPP', '%Operator', '%SQL,%DB_CLINICAL']),
      RoutineSpec: e.EventSource === '%Ensemble' ? 'Ens.Director.1' : '%SYS.REST.1',
      UserInfo: '',
      Status: failed ? 'Failure' : 'Success',
      OSUsername: pick(rnd, ['irisowner', 'jdoe', 'tomcat']),
      StartupClientIPAddress: pick(rnd, ips),
    });
  }
  // Writes made through the mock come first (newest first), then the synthetic history;
  // the time window and the filters apply to both, as they do on a real instance.
  let rows: AuditRecordRec[] = [...mockDb.auditLog, ...(out as unknown as AuditRecordRec[])];
  const begin = q.get('beginDateTime');
  if (begin) rows = rows.filter((r) => r.TimeStamp >= begin);
  const end = q.get('endDateTime');
  if (end) rows = rows.filter((r) => r.TimeStamp <= end);
  const filterUser = q.get('usernames');
  if (filterUser) rows = rows.filter((r) => filterUser.split(',').includes(r.Username));
  const types = q.get('eventTypes');
  if (types) rows = rows.filter((r) => types.split(',').includes(r.EventType));
  const names = q.get('events');
  if (names) rows = rows.filter((r) => names.split(',').includes(r.Event));
  return rows.slice(0, max);
}

export const securityHandlers = [
  // ---- users ------------------------------------------------------------
  route('get', '/v2/security/users', SECURE, ({ request }) =>
    ok(filterRows(mockDb.users.map(userListShape) as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/security/user', SECURE, ({ request }) => {
    const u = findUser(requireParam(request, 'name'));
    return u ? ok(userDetailShape(u)) : notFound('User');
  }),

  route('post', '/v2/security/user', SECURE, async ({ request, account }) => {
    const body = await jsonBody<{
      User?: Record<string, unknown> & { Name?: string };
      Password?: string;
      Name?: string;
    }>(request);
    const name = String(body.User?.Name ?? body.Name ?? new URL(request.url).searchParams.get('name') ?? '');
    if (!name) return badRequest('User.Name is required');
    if (!body.Password) return badRequest('Password is required');
    if (findUser(name)) return fail(400, `User ${name} already exists`);
    const u = body.User ?? {};
    mockDb.users.push({
      Name: name,
      FullName: String(u.FullName ?? ''),
      Enabled: u.Enabled !== false,
      Type: 'Password user',
      Namespace: String(u.NameSpace ?? u.Namespace ?? 'USER'),
      Routine: String(u.Routine ?? ''),
      Comment: String(u.Comment ?? ''),
      EmailAddress: String(u.EmailAddress ?? ''),
      Roles: (u.Roles as string[]) ?? [],
      EscalationRoles: (u.EscalationRoles as string[]) ?? [],
      AccountNeverExpires: !!u.AccountNeverExpires,
      PasswordNeverExpires: !!u.PasswordNeverExpires,
      ChangePassword: !!u.ChangePassword,
      ExpirationDate: String(u.ExpirationDate ?? ''),
      AutheEnabled: 0,
      PhoneNumber: String(u.PhoneNumber ?? ''),
      PhoneProvider: String(u.PhoneProvider ?? ''),
      HOTPKeyDisplay: false,
      password: body.Password,
    });
    recordAudit(account, 'UserChange', `User ${name} created`);
    return created({}, [`User ${name} created`]);
  }),

  route('put', '/v2/security/user', SECURE, async ({ request, account }) => {
    const u = findUser(requireParam(request, 'name'));
    if (!u) return notFound('User');
    const body = await jsonBody<Record<string, unknown>>(request);
    const { Name: _n, NameSpace, ...rest } = body;
    Object.assign(u, rest);
    if (NameSpace) u.Namespace = String(NameSpace);
    recordAudit(account, 'UserChange', `User ${u.Name} modified`, Object.keys(body).join(', '));
    return ok({}, { summary: `User ${u.Name} updated` });
  }),

  route('delete', '/v2/security/user', SECURE, ({ request, account }) => {
    const name = requireParam(request, 'name');
    const u = findUser(name);
    if (!u) return notFound('User');
    if (u.Name.startsWith('_') || u.Name === 'SuperUser')
      return fail(400, `System user ${u.Name} cannot be deleted`);
    mockDb.users = mockDb.users.filter((x) => x !== u);
    recordAudit(account, 'UserChange', `User ${u.Name} deleted`);
    return ok({}, { summary: `User ${u.Name} deleted` });
  }),

  route('post', '/v2/security/user/password', SECURE, async ({ request, account }) => {
    const u = findUser(requireParam(request, 'name'));
    if (!u) return notFound('User');
    const body = await jsonBody<{ Password?: string; NewPassword?: string; password?: string }>(request);
    const pw = body.Password ?? body.NewPassword ?? body.password;
    if (!pw) return badRequest('Password is required');
    if (pw.length < 3) return fail(400, 'Password does not satisfy the password policy (min. 3 characters)');
    u.password = pw;
    const acct = findAccount(u.Name);
    if (acct) acct.password = pw;
    recordAudit(account, 'UserChange', `Password changed for user ${u.Name}`);
    return ok({}, { summary: `Password changed for ${u.Name}` });
  }),

  // ---- roles ------------------------------------------------------------
  route('get', '/v2/security/roles', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.roles.map(({ Name, Description, CreatedBy, EscalationOnly }) => ({
          Name,
          Description,
          CreatedBy,
          EscalationOnly,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/role', SECURE, ({ request }) => {
    const r = findRole(requireParam(request, 'name'));
    if (!r) return notFound('Role');
    const { Name: _n, CreatedBy: _c, ...rest } = r;
    return ok(rest);
  }),
  route('get', '/v2/security/role/owners', SECURE, ({ request }) => {
    const r = findRole(requireParam(request, 'name'));
    if (!r) return notFound('Role');
    // RoleOwnerList: direct holders only, users and roles alike (as IRIS 2026.2 answers).
    return ok([
      ...mockDb.users
        .filter((u) => u.Roles.includes(r.Name))
        .map((u) => ({ Name: u.Name, Type: 'User', AdminOption: false })),
      ...mockDb.users
        .filter((u) => u.EscalationRoles.includes(r.Name))
        .map((u) => ({ Name: u.Name, Type: 'User (escalation)', AdminOption: false })),
      ...mockDb.roles
        .filter((x) => x.GrantedRoles.includes(r.Name))
        .map((x) => ({ Name: x.Name, Type: 'Role', AdminOption: false })),
    ]);
  }),
  route('put', '/v2/security/role', SECURE, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<Partial<RoleRec>>(request);
    const existing = findRole(name);
    if (existing) {
      Object.assign(existing, body);
      recordAudit(account, 'RoleChange', `Role ${name} modified`, Object.keys(body).join(', '));
      return ok({}, { summary: `Role ${name} updated` });
    }
    mockDb.roles.push({
      Name: name,
      Description: body.Description ?? '',
      CreatedBy: account.username,
      EscalationOnly: !!body.EscalationOnly,
      GrantedRoles: body.GrantedRoles ?? [],
      Resources: body.Resources ?? [],
    });
    recordAudit(account, 'RoleChange', `Role ${name} created`);
    return created({}, [`Role ${name} created`]);
  }),
  route('delete', '/v2/security/role', SECURE, ({ request, account }) => {
    const r = findRole(requireParam(request, 'name'));
    if (!r) return notFound('Role');
    if (r.Name.startsWith('%')) return fail(400, `System role ${r.Name} cannot be deleted`);
    mockDb.roles = mockDb.roles.filter((x) => x !== r);
    recordAudit(account, 'RoleChange', `Role ${r.Name} deleted`);
    return ok({}, { summary: `Role ${r.Name} deleted` });
  }),

  // ---- resources ----------------------------------------------------------
  route('get', '/v2/security/resources', SECURE, ({ request }) =>
    ok(filterRows(mockDb.resources as unknown as Record<string, unknown>[], request)),
  ),
  route('get', '/v2/security/resource', SECURE, ({ request }) => {
    const r = mockDb.resources.find((x) => x.Name === requireParam(request, 'name'));
    return r
      ? ok({ Description: r.Description, PublicPermission: r.PublicPermission })
      : notFound('Resource');
  }),
  route('put', '/v2/security/resource', SECURE, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<{ Description?: string; PublicPermission?: string }>(request);
    const existing = mockDb.resources.find((x) => x.Name === name);
    if (existing) {
      Object.assign(existing, body);
      recordAudit(account, 'ResourceChange', `Resource ${name} modified`);
      return ok({}, { summary: `Resource ${name} updated` });
    }
    mockDb.resources.push({
      Name: name,
      Description: body.Description ?? '',
      PublicPermission: body.PublicPermission ?? '',
      ResourceType: name.startsWith('%DB_') ? 'Database' : 'Application',
      AllowDelete: true,
    });
    recordAudit(account, 'ResourceChange', `Resource ${name} created`);
    return created({}, [`Resource ${name} created`]);
  }),
  route('delete', '/v2/security/resource', SECURE, ({ request, account }) => {
    const r = mockDb.resources.find((x) => x.Name === requireParam(request, 'name'));
    if (!r) return notFound('Resource');
    if (!r.AllowDelete) return fail(400, `System resource ${r.Name} cannot be deleted`);
    mockDb.resources = mockDb.resources.filter((x) => x !== r);
    recordAudit(account, 'ResourceChange', `Resource ${r.Name} deleted`);
    return ok({}, { summary: `Resource ${r.Name} deleted` });
  }),

  // ---- services -----------------------------------------------------------
  route('get', '/v2/security/services', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.services.map((s) => ({
          Name: s.Name,
          Enabled: s.Enabled,
          Public: s.Public,
          AuthenticationMethods: autheMethodNames(s.AutheEnabled),
          AllowedConnections: s.ClientSystems,
          Description: s.Description,
          HttpOnlyCookies: s.HttpOnlyCookies,
          TwoFactorEnabled: s.TwoFactorEnabled,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/service', SECURE, ({ request }) => {
    const s = mockDb.services.find((x) => x.Name === requireParam(request, 'name'));
    return s
      ? ok({
          AutheEnabled: s.AutheEnabled,
          ClientSystems: s.ClientSystems,
          Description: s.Description,
          Enabled: s.Enabled,
        })
      : notFound('Service');
  }),
  route('put', '/v2/security/service', SECURE, async ({ request, account }) => {
    const s = mockDb.services.find((x) => x.Name === requireParam(request, 'name'));
    if (!s) return notFound('Service');
    const body = await jsonBody<{
      Enabled?: boolean;
      Description?: string;
      AutheEnabled?: number;
      ClientSystems?: string[];
    }>(request);
    if (body.Enabled !== undefined) s.Enabled = !!body.Enabled;
    if (body.Description !== undefined) s.Description = body.Description;
    if (body.AutheEnabled !== undefined) s.AutheEnabled = body.AutheEnabled;
    if (body.ClientSystems !== undefined) s.ClientSystems = body.ClientSystems;
    recordAudit(account, 'ServiceChange', `Service ${s.Name} modified`, Object.keys(body).join(', '));
    return ok({}, { summary: `Service ${s.Name} updated` });
  }),

  // ---- audit --------------------------------------------------------------
  route('get', '/v2/security/audit/enabled', SECURE, () => ok({ Enabled: mockDb.auditEnabled })),
  route('put', '/v2/security/audit/enabled', SECURE, async ({ request, account }) => {
    const body = await jsonBody<{ Enabled?: boolean }>(request);
    mockDb.auditEnabled = !!body.Enabled;
    recordAudit(account, 'AuditChange', `Auditing ${mockDb.auditEnabled ? 'enabled' : 'disabled'}`);
    return ok({}, { summary: `Auditing ${mockDb.auditEnabled ? 'enabled' : 'disabled'}` });
  }),
  route('get', '/v2/security/audit/events', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.auditEvents.map((e) => ({
          EventName: `${e.EventSource}/${e.EventType}/${e.EventName}`,
          Enabled: e.Enabled,
          Total: e.Total,
          Written: e.Written,
          Lost: e.Lost,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/audit/event', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const e = mockDb.auditEvents.find(
      (x) =>
        x.EventSource === q.get('source') && x.EventType === q.get('type') && x.EventName === q.get('name'),
    );
    return e ? ok({ Description: e.Description, Enabled: e.Enabled }) : notFound('Audit event');
  }),
  route('put', '/v2/security/audit/event', SECURE, async ({ request }) => {
    const q = new URL(request.url).searchParams;
    const body = await jsonBody<{ Description?: string; Enabled?: boolean }>(request);
    const e = mockDb.auditEvents.find(
      (x) =>
        x.EventSource === q.get('source') && x.EventType === q.get('type') && x.EventName === q.get('name'),
    );
    if (e) {
      if (body.Enabled !== undefined) e.Enabled = body.Enabled;
      if (body.Description !== undefined) e.Description = body.Description;
      return ok({}, { summary: 'Audit event updated' });
    }
    mockDb.auditEvents.push({
      EventSource: q.get('source')!,
      EventType: q.get('type')!,
      EventName: q.get('name')!,
      Description: body.Description ?? '',
      Enabled: body.Enabled ?? true,
      Total: 0,
      Written: 0,
      Lost: 0,
    });
    return created({}, ['Audit event created']);
  }),
  route('delete', '/v2/security/audit/event', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const i = mockDb.auditEvents.findIndex(
      (x) =>
        x.EventSource === q.get('source') && x.EventType === q.get('type') && x.EventName === q.get('name'),
    );
    if (i < 0) return notFound('Audit event');
    if (mockDb.auditEvents[i].EventSource === '%System')
      return fail(400, 'System audit events cannot be deleted');
    mockDb.auditEvents.splice(i, 1);
    return ok({}, { summary: 'Audit event deleted' });
  }),
  route('post', '/v2/security/audit/event/clear-count', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const e = mockDb.auditEvents.find(
      (x) =>
        x.EventSource === q.get('source') && x.EventType === q.get('type') && x.EventName === q.get('name'),
    );
    if (!e) return notFound('Audit event');
    e.Total = 0;
    e.Written = 0;
    e.Lost = 0;
    return ok({}, { summary: 'Counters cleared' });
  }),
  route('post', '/v2/security/audit/records', SECURE, ({ request, account }) => {
    const rows = auditRecords(request);
    const id = startAsyncTask({
      name: 'POST /v2/security/audit/records',
      owner: account.username,
      console: [`Querying audit log (${rows.length} records)`],
      result: rows,
      tickMs: 500,
    });
    return accepted(id, apiBasePath(request));
  }),
  route('get', '/v2/security/audit/record', SECURE, ({ request }) => {
    const idx = Number(new URL(request.url).searchParams.get('auditIndex'));
    const rec = auditRecords(request).find((r) => r.AuditIndex === idx) ?? auditRecords(request)[0];
    return ok(rec);
  }),
  route('post', '/v2/security/audit/record/purge', SECURE, async ({ request }) => {
    const body = await jsonBody<{ BeginDateTime?: string; EndDateTime?: string }>(request);
    return ok(
      { Purged: 12_403 },
      {
        summary: `Purged audit records from ${body.BeginDateTime || 'the first record'} to ${body.EndDateTime || 'the last record'}`,
      },
    );
  }),
  route('post', '/v2/security/audit/record/copy', SECURE, async ({ request }) => {
    const body = await jsonBody<{ Namespace?: string }>(request);
    return ok({ Copied: 4_210 }, { summary: `Copied audit records to ${body.Namespace ?? 'USER'}` });
  }),

  // ---- OAuth 2.0 server clients (explicit so the demo carries a secret to redact) ------
  route('get', '/v2/security/oauth2/server/clients', SECURE, ({ request }) =>
    ok(
      filterRows(
        [
          {
            Name: 'aperture-portal',
            ClientId: 'aperture-portal',
            ClientSecret: 'k9T2xq7VwPZm3LcH1nRb8sYd0uFa5GeJ',
            ClientType: 'confidential',
            RedirectURL: ['https://iris.example.org/aperture/'],
            Description: 'Aperture management portal',
            Enabled: true,
          },
          {
            Name: 'hl7-router',
            ClientId: 'hl7-router',
            ClientSecret: 'Q4vB7nM2xR9tL0kP6sW3yE8uC1hZ5aGd',
            ClientType: 'confidential',
            RedirectURL: ['https://hl7-gw.hospital.local/callback'],
            Description: 'Interoperability HL7 router',
            Enabled: true,
          },
        ],
        request,
      ),
    ),
  ),

  // ---- X.509 credentials --------------------------------------------------
  route('get', '/v2/security/x509-credentials', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.x509.map(({ Alias, HasPrivateKey, OwnerList, PeerNames, CAFile }) => ({
          Alias,
          HasPrivateKey,
          OwnerList,
          PeerNames,
          CAFile,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/x509-credential', SECURE, ({ request }) => {
    const c = findX509(requireParam(request, 'alias'));
    return c
      ? ok({ OwnerList: c.OwnerList, CAFile: c.CAFile, PeerNames: c.PeerNames })
      : notFound('X.509 credential');
  }),
  route('get', '/v2/security/x509-credential/certificate', SECURE, ({ request }) => {
    const c = findX509(requireParam(request, 'alias'));
    if (!c) return notFound('X.509 credential');
    const { HasPrivateKey, SerialNumber, IssuerDN, SubjectDN, ValidityNotBefore, ValidityNotAfter } = c;
    return ok({ HasPrivateKey, SerialNumber, IssuerDN, SubjectDN, ValidityNotBefore, ValidityNotAfter });
  }),
  route('delete', '/v2/security/x509-credential', SECURE, ({ request, account }) => {
    const c = findX509(requireParam(request, 'alias'));
    if (!c) return notFound('X.509 credential');
    mockDb.x509 = mockDb.x509.filter((x) => x !== c);
    recordAudit(account, 'X509CredentialChange', `X.509 credential ${c.Alias} deleted`);
    return ok({}, { summary: `X.509 credential ${c.Alias} deleted` });
  }),

  // ---- SSL ----------------------------------------------------------------
  route('get', '/v2/security/ssl-configurations', SECURE, ({ request }) =>
    ok(
      filterRows(
        mockDb.sslConfigs.map(({ Name, Description, Enabled, Type }) => ({
          Name,
          Description,
          Enabled,
          Type,
        })),
        request,
      ),
    ),
  ),
  route('get', '/v2/security/ssl-configuration', SECURE, ({ request }) => {
    const s = mockDb.sslConfigs.find((x) => x.Name === requireParam(request, 'name'));
    if (!s) return notFound('SSL configuration');
    const { Name: _n, Type, ...rest } = s;
    return ok({
      ...rest,
      Type: Type === 'Server' ? 1 : 0,
      AuthorizeCN: false,
      CAPath: '',
      DiffieHellmanBits: 2048,
      OCSP: 0,
      OCSPIssuerCert: '',
      OCSPResponseFile: '',
      OCSPTimeout: 0,
      OCSPURL: '',
      PrivateKeyType: 2,
      VerifyDepth: 9,
    });
  }),
  route('put', '/v2/security/ssl-configuration', SECURE, async ({ request, account }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<Record<string, unknown>>(request);
    const existing = mockDb.sslConfigs.find((x) => x.Name === name);
    const rec = {
      Name: name,
      Description: String(body.Description ?? existing?.Description ?? ''),
      Enabled: body.Enabled !== undefined ? !!body.Enabled : (existing?.Enabled ?? true),
      Type: body.Type === 1 || body.Type === 'Server' ? 'Server' : 'Client',
      CAFile: String(body.CAFile ?? existing?.CAFile ?? ''),
      CertificateFile: String(body.CertificateFile ?? existing?.CertificateFile ?? ''),
      PrivateKeyFile: String(body.PrivateKeyFile ?? existing?.PrivateKeyFile ?? ''),
      TLSMinVersion: Number(body.TLSMinVersion ?? existing?.TLSMinVersion ?? 16),
      TLSMaxVersion: Number(body.TLSMaxVersion ?? existing?.TLSMaxVersion ?? 32),
      VerifyPeer: Number(body.VerifyPeer ?? existing?.VerifyPeer ?? 0),
      CipherList: (body.CipherList as string[]) ?? existing?.CipherList ?? ['HIGH'],
      Ciphersuites: (body.Ciphersuites as string[]) ?? existing?.Ciphersuites ?? [],
    };
    if (existing) Object.assign(existing, rec);
    else mockDb.sslConfigs.push(rec);
    recordAudit(account, 'SSLConfigChange', `SSL configuration ${name} ${existing ? 'modified' : 'created'}`);
    return existing
      ? ok({}, { summary: `SSL configuration ${name} updated` })
      : created({}, [`SSL configuration ${name} created`]);
  }),
  route('delete', '/v2/security/ssl-configuration', SECURE, ({ request, account }) => {
    const s = mockDb.sslConfigs.find((x) => x.Name === requireParam(request, 'name'));
    if (!s) return notFound('SSL configuration');
    if (s.Name.startsWith('%')) return fail(400, 'System SSL configurations cannot be deleted');
    mockDb.sslConfigs = mockDb.sslConfigs.filter((x) => x !== s);
    recordAudit(account, 'SSLConfigChange', `SSL configuration ${s.Name} deleted`);
    return ok({}, { summary: `SSL configuration ${s.Name} deleted` });
  }),
  route('post', '/v2/security/ssl-configuration/test', SECURE, async ({ request }) => {
    const s = mockDb.sslConfigs.find((x) => x.Name === requireParam(request, 'name'));
    if (!s) return notFound('SSL configuration');
    const body = await jsonBody<{ Host?: string; Port?: number; host?: string; port?: number }>(request);
    const host = body.Host ?? body.host ?? 'localhost';
    if (!s.Enabled) return fail(400, `SSL configuration ${s.Name} is disabled`);
    return ok(
      {
        Result: `Connected to ${host}:${body.Port ?? body.port ?? 443} using TLSv1.3 (TLS_AES_256_GCM_SHA384)`,
      },
      {
        summary: 'Connection succeeded',
        console: ['Resolving host…', 'TLS handshake…', 'Peer certificate verified'],
      },
    );
  }),

  // ---- SQL privileges -----------------------------------------------------
  route('get', '/v2/security/sql-privileges', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const grantee = q.get('grantee') ?? '';
    const ns = q.get('namespace') ?? 'USER';
    // IRIS 2026.2 names the object and the action Object and Action; the spec says Name and Privilege.
    const base = [
      {
        Type: 'TABLE',
        Object: 'SQLUser.Person',
        Action: 'SELECT',
        GrantedBy: '_SYSTEM',
        GrantOption: false,
        GrantedVia: grantee,
        HasColumnPriv: false,
      },
      {
        Type: 'TABLE',
        Object: 'SQLUser.Person',
        Action: 'INSERT',
        GrantedBy: '_SYSTEM',
        GrantOption: false,
        GrantedVia: grantee,
        HasColumnPriv: true,
      },
      {
        Type: 'TABLE',
        Object: 'DICOM.Study',
        Action: 'SELECT',
        GrantedBy: 'Admin',
        GrantOption: true,
        GrantedVia: '%SQL',
        HasColumnPriv: false,
      },
      {
        Type: 'VIEW',
        Object: 'HL7.Archive_View',
        Action: 'SELECT',
        GrantedBy: 'Admin',
        GrantOption: false,
        GrantedVia: grantee,
        HasColumnPriv: false,
      },
      {
        Type: 'STORED PROCEDURE',
        Object: 'dc.Reports_Nightly',
        Action: 'EXECUTE',
        GrantedBy: '_SYSTEM',
        GrantOption: false,
        GrantedVia: grantee,
        HasColumnPriv: false,
      },
    ];
    return ok(
      ns === 'CLINICAL'
        ? base.filter((b) => b.Object.startsWith('DICOM') || b.Object.startsWith('HL7'))
        : base,
    );
  }),
  route('post', '/v2/security/sql-privilege/grant', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    return ok(
      {},
      {
        summary: `Granted ${q.get('action')} on ${q.get('object')} to ${q.get('grantee')} in ${q.get('namespace')}`,
      },
    );
  }),
  route('post', '/v2/security/sql-privilege/revoke', SECURE, ({ request }) => {
    const q = new URL(request.url).searchParams;
    return ok(
      {},
      {
        summary: `Revoked ${q.get('action')} on ${q.get('object')} from ${q.get('grantee')} in ${q.get('namespace')}`,
      },
    );
  }),
  route('get', '/v2/security/sql-admin-privileges', SECURE, () =>
    ok([
      { Privilege: '%CREATE_TABLE', GrantOption: false, GrantedVia: '' },
      { Privilege: '%ALTER_TABLE', GrantOption: false, GrantedVia: '' },
      { Privilege: '%CREATE_VIEW', GrantOption: true, GrantedVia: '%Developer' },
    ]),
  ),
  route('post', '/v2/security/sql-admin-privilege/grant', SECURE, ({ request }) =>
    ok({}, { summary: `Granted ${new URL(request.url).searchParams.get('privilege')}` }),
  ),
  route('post', '/v2/security/sql-admin-privilege/revoke', SECURE, ({ request }) =>
    ok({}, { summary: `Revoked ${new URL(request.url).searchParams.get('privilege')}` }),
  ),

  // ---- web auth settings ---------------------------------------------------
  route('get', '/v2/security/web-auth', SECURE, () =>
    ok({
      AutheUnauthenticated: false,
      AutheOS: true,
      AutheOSDelegated: false,
      AutheOSLDAP: false,
      AutheCache: true,
      AutheDelegated: false,
      AutheAlwaysTryDelegated: false,
      AutheKB: false,
      AutheLDAP: false,
      AutheLDAPCache: false,
      AutheOAuth2: false,
      AutheLoginToken: true,
      AutheTwoFactorSMS: false,
      AutheTwoFactorPW: false,
      LoginCookieTimeout: 900,
      SMTPServer: '',
      SMTPUsername: '',
      TwoFactorFrom: '',
      TwoFactorTimeout: 300,
      JWTIssuer: 'iris-demo/IRIS',
      JWTSigAlg: 'ES256',
    }),
  ),
  route('put', '/v2/security/web-auth', SECURE, () =>
    ok({}, { summary: 'Web authentication settings updated' }),
  ),
];
