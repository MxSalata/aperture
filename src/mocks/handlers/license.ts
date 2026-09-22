import { ok, jsonBody, badRequest, created, notFound, requireParam } from '../util';
import { route, MANAGE } from '../secure';

let licenseServers = [
  { Name: 'LOCAL', Address: '127.0.0.1', Port: 4002, Description: 'Local license server' },
  { Name: 'DR-SITE', Address: '10.0.9.20', Port: 4002, Description: 'Disaster-recovery license server' },
];

export const licenseHandlers = [
  route('get', '/v2/license/key', MANAGE, () =>
    ok({
      LicenseCapacity: 'InterSystems IRIS Community 2026.2, Server:20, Core Capacity, all non-container',
      CustomerName: 'InterSystems IRIS Community',
      OrderNumber: 0,
      AuthorizationKey: '(community edition - no key installed)',
      Product: 'Server',
      LicenseType: 'Core Capacity',
      Server: 'Single',
      Platform: 'Heterogeneous',
      LicenseUnits: 20,
      CoresLicensed: 8,
      CoresEnforced: 8,
      ExpirationDate: '2027-09-14 23:59:59',
      ExtendedFeaturesList: ['Interoperability', 'BI User', 'Vector Search', 'Web Add-on'],
      AuthorizedFeatures: ['Interoperability', 'BI User'],
      MachineID: 'iris-demo',
      KeyFile: '/usr/irissys/mgr/iris.key',
      Status: 'Community edition',
    }),
  ),
  route('put', '/v2/license/key', MANAGE, async ({ request }) => {
    const body = await jsonBody<{ Key?: string }>(request);
    if (!body.Key) return badRequest('Key is required');
    return ok({}, { summary: 'License key activated', console: ['Key validated', 'License activated'] });
  }),
  route('post', '/v2/license/key/validate', MANAGE, async ({ request }) => {
    const body = await jsonBody<{ Key?: string }>(request);
    if (!body.Key) return badRequest('Key is required');
    if (!/FileType=InterSystems/i.test(body.Key))
      return ok({ Valid: false }, { summary: 'Key is not valid: header missing' });
    return ok(
      { Valid: true, Product: 'Server', LicenseUnits: 1024, ExpirationDate: '2027-12-31 23:59:59' },
      { summary: 'Key is valid' },
    );
  }),
  route('get', '/v2/license/servers', MANAGE, () => ok(licenseServers)),
  route('get', '/v2/license/server', MANAGE, ({ request }) => {
    const s = licenseServers.find((x) => x.Name === requireParam(request, 'name'));
    return s ? ok(s) : notFound('License server');
  }),
  route('put', '/v2/license/server', MANAGE, async ({ request }) => {
    const name = requireParam(request, 'name');
    if (!name) return badRequest('Missing name');
    const body = await jsonBody<{ Address?: string; Port?: number; Description?: string }>(request);
    const existing = licenseServers.find((x) => x.Name === name);
    if (existing) {
      Object.assign(existing, body);
      return ok({}, { summary: `License server ${name} updated` });
    }
    licenseServers.push({
      Name: name,
      Address: body.Address ?? '',
      Port: body.Port ?? 4002,
      Description: body.Description ?? '',
    });
    return created({}, [`License server ${name} created`]);
  }),
  route('delete', '/v2/license/server', MANAGE, ({ request }) => {
    const name = requireParam(request, 'name');
    if (!licenseServers.some((x) => x.Name === name)) return notFound('License server');
    licenseServers = licenseServers.filter((x) => x.Name !== name);
    return ok({}, { summary: `License server ${name} deleted` });
  }),
];
