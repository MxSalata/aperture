import { http, HttpResponse } from 'msw';
import { authenticate, holds } from '../auth';
import { forbidden, unauthorized, accepted } from '../util';
import { apiBasePath } from '../secure';
import { exampleFromSchema, loadSpec, resultSchema } from '@/lib/openapi';
import { findIndexedOperation } from '@/lib/specIndex';
import { startAsyncTask } from '../async';

/**
 * Fallback for every operation without a dedicated handler: authenticate,
 * enforce the privileges from the spec, then answer with an example generated
 * from the response schema. This is what keeps the demo at 100 % API coverage.
 */
export const genericHandler = http.all('*/api/admin/v2/*', async ({ request }) => {
  const url = new URL(request.url);
  const i = url.pathname.indexOf('/api/admin');
  const path = url.pathname.slice(i + '/api/admin'.length).replace(/\/+$/, '');
  const op = findIndexedOperation(request.method, path);
  if (!op) {
    return HttpResponse.json(
      {
        status: { Errors: [`No such endpoint: ${request.method} ${path}`], summary: 'Not found' },
        console: [],
        result: {},
      },
      { status: 404 },
    );
  }
  const account = authenticate(request);
  if (!account) return unauthorized();
  if (!holds(account, op.privileges)) return forbidden(op.privileges.join(' or '));

  const doc = await loadSpec();
  const schema = resultSchema(doc, op.method, op.path);
  const result = schema ? exampleFromSchema(doc, schema) : {};

  if (op.async) {
    const id = startAsyncTask({
      name: `${op.method} ${op.path}`,
      owner: account.username,
      console: [`${op.summary} (simulated)`],
      result,
      tickMs: 500,
    });
    return accepted(id, apiBasePath(request));
  }

  const write = op.method !== 'GET';
  const status = op.method === 'PUT' || (op.method === 'POST' && op.responses['201']) ? 201 : 200;
  return HttpResponse.json(
    {
      status: { Errors: [], summary: write ? `${op.summary} (simulated in demo mode)` : '' },
      console: write ? [`${op.method} ${op.path} executed against the demo instance`] : [],
      result: result ?? {},
    },
    { status: write ? status : 200 },
  );
});
