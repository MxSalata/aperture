import { beforeEach, describe, expect, it } from 'vitest';
import { fetchRestApps, fetchRoutes, fetchSpecClasses, routesOf } from '../mgmnt';
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
      { method: 'DELETE', path: '/api/demo/a', summary: 'DropA' },
      { method: 'GET', path: '/api/demo/items', summary: 'List all' },
      { method: 'POST', path: '/api/demo/items', summary: 'Create' },
    ]);
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
