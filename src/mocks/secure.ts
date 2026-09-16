import { http, type HttpResponseResolver, type PathParams } from 'msw';
import { authenticate, holds, type MockAccount } from './auth';
import { forbidden, unauthorized } from './util';

export type SecuredResolver = (ctx: { account: MockAccount; request: Request; params: PathParams }) => Response | Promise<Response>;

/** Authenticate the caller and enforce the `%Admin_*` resources the spec requires. */
export function secured(resources: string[], resolver: SecuredResolver): HttpResponseResolver {
  return async ({ request, params }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    if (!holds(account, resources)) return forbidden(resources.join(' or '));
    return resolver({ account, request, params });
  };
}

type Method = 'get' | 'post' | 'put' | 'delete';

/** `route('get', '/v2/databases', ['%Admin_Manage:U'], fn)` registers an MSW handler for any origin + /api/admin + path. */
export function route(method: Method, path: string, resources: string[], resolver: SecuredResolver) {
  return http[method](`*/api/admin${path}`, secured(resources, resolver));
}

export const MANAGE = ['%Admin_Manage:U'];
export const OPERATE = ['%Admin_Operate:U'];
export const SECURE = ['%Admin_Secure:U'];
export const MANAGE_OR_OPERATE = ['%Admin_Manage:U', '%Admin_Operate:U'];
export const OPERATE_OR_TASK = ['%Admin_Operate:U', '%Admin_Task:U'];
export const TASK = ['%Admin_Task:U'];
export const JOURNAL = ['%Admin_Manage:U', '%Admin_Journal:U'];

export function apiBasePath(request: Request): string {
  const url = new URL(request.url);
  const i = url.pathname.indexOf('/api/admin');
  return url.pathname.slice(0, i + '/api/admin'.length);
}
