import { beforeEach, describe, expect, it } from 'vitest';
import { fetchRestApps, fetchRoutes, fetchSpecClasses, routeRequests, routesOf } from '../mgmnt';
import { basicCredentials } from '../base';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';

const signIn = (auth: 'jwt' | 'basic') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username: '_SYSTEM', password: 'SYS', auth });

describe('an OpenAPI 2.0 description as routes', () => {
  it('joins the base path, keeps only methods, and sorts by path then method', () => {
    const d = routesOf({
      info: { title: 'Demo' },
      basePath: '/api/demo/',
      paths: {
        '/items': {
          post: { summary: 'Create' },
          get: { description: '  List\n all  ' },
          parameters: {} as never,
        },
        '/a': { delete: { operationId: 'DropA' } },
      },
    });
    expect(d.title).toBe('Demo');
    expect(d.routes).toEqual([
      { method: 'DELETE', path: '/api/demo/a', summary: 'DropA', params: [] },
      { method: 'GET', path: '/api/demo/items', summary: 'List all', params: [] },
      // A write without a declared body still gets a skeleton to fill in.
      { method: 'POST', path: '/api/demo/items', summary: 'Create', params: [], body: '{}' },
    ]);
  });

  it('keeps the declared parameters, the path segments and an example body from the definitions', () => {
    const d = routesOf({
      basePath: '/api/demo',
      definitions: {
        Item: {
          type: 'object',
          properties: { Name: { type: 'string', example: 'first' }, Password: { type: 'string' } },
        },
      },
      paths: {
        '/items/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, type: 'integer', description: 'The id' }],
          get: {
            parameters: [
              { name: 'verbose', in: 'query', type: 'boolean', default: false, description: ' Say  more ' },
              { name: 'X-Trace', in: 'header', type: 'string' },
            ],
          },
          put: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                type: 'string',
                description: 'Overrides the shared one',
              },
              { name: 'item', in: 'body', required: true, schema: { $ref: '#/definitions/Item' } },
            ],
          },
        },
        '/ns/{namespace}/docs': { get: { summary: 'Undeclared path parameter' } },
      },
    });
    const [get, put, docs] = d.routes;
    expect(get.params).toEqual([
      { name: 'id', in: 'path', required: true, type: 'integer', description: 'The id' },
      {
        name: 'verbose',
        in: 'query',
        required: false,
        type: 'boolean',
        description: 'Say more',
        example: 'false',
      },
      { name: 'X-Trace', in: 'header', required: false, type: 'string', description: '' },
    ]);
    expect(get.body).toBeUndefined();
    expect(put.params).toEqual([
      { name: 'id', in: 'path', required: true, type: 'string', description: 'Overrides the shared one' },
    ]);
    expect(JSON.parse(put.body!)).toEqual({ Name: 'first', Password: '' });
    expect(docs.params).toEqual([
      { name: 'namespace', in: 'path', required: true, type: 'string', description: '' },
    ]);

    const [rGet, rPut, rDocs] = routeRequests(d);
    expect(rGet).toEqual({
      name: 'GET /items/{id}',
      method: 'GET',
      path: '/api/demo/items/{id}',
      notes: ['Path parameters to replace in the URL: id', 'Headers it reads: X-Trace'],
      query: [{ name: 'verbose', value: 'false', required: false, description: 'Say more', type: 'boolean' }],
    });
    expect(rPut.body).toBe(put.body);
    expect(rDocs.summary).toBe('Undeclared path parameter');
  });
});

describe('/api/mgmnt', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    useMgmntAuth.getState().clear();
  });

  it('is read with the credentials of a Basic session', async () => {
    await signIn('basic');
    const apps = await fetchRestApps();
    expect(apps.map((a) => a.name)).toContain('/api/atelier');
    expect((await fetchSpecClasses()).some((c) => !c.webApplications)).toBe(true);
  });

  it('asks a JWT session for the password, and forgets one the instance refuses', async () => {
    await signIn('jwt');
    expect(useSession.getState().mode).toBe('jwt');
    await expect(fetchRestApps()).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 401 && /needs your password/.test(e.summary),
    );
    useMgmntAuth.getState().set(basicCredentials('_SYSTEM', 'wrong'));
    await expect(fetchRestApps()).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && /refused the password/.test(e.summary),
    );
    expect(useMgmntAuth.getState().basic).toBeNull();
    useMgmntAuth.getState().set(basicCredentials('_SYSTEM', 'SYS'));
    expect((await fetchRestApps()).length).toBeGreaterThan(0);
  });

  it('describes a web application route by route, and follows only its own links', async () => {
    await signIn('basic');
    const admin = (await fetchRestApps()).find((a) => a.name === '/api/admin')!;
    const d = await fetchRoutes(admin.swaggerSpec);
    expect(d.routes.length).toBeGreaterThan(200);
    expect(d.routes).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/api/admin/v2/namespaces' }),
    );
    await expect(fetchRoutes('https://elsewhere.example/spec')).rejects.toThrow(/Not an \/api\/mgmnt/);
  });

  it('forgets the password at sign-out', async () => {
    await signIn('jwt');
    useMgmntAuth.getState().set(basicCredentials('_SYSTEM', 'SYS'));
    await useSession.getState().logout();
    expect(useMgmntAuth.getState().basic).toBeNull();
  });
});
