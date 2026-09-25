import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { findAccount } from '../auth';
import specIndex from '@/api/spec-index.json';

/**
 * The REST management API (`/api/mgmnt`), as IRIS for Health 2026.2 answers it: a password only
 * (no JWT; a missing or refused one is a bodiless 401), `/v1/{ns}/restapps` lists the REST web
 * applications of the whole instance whatever the namespace, `/v2/` the spec-first classes, and
 * each description is Swagger 2.0 generated from the dispatch class.
 */
function basicAccount(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const [user, ...rest] = atob(header.slice(6)).split(':');
    return findAccount(user, rest.join(':')) ?? null;
  } catch {
    return null;
  }
}

const unauthorized = () =>
  new HttpResponse(null, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="IRIS"' } });

function knownNamespace(ns: string) {
  return mockDb.namespaces.some((n) => n.Name.toLowerCase() === ns.toLowerCase());
}

const badNamespace = (ns: string) =>
  HttpResponse.json({ msg: `ERROR #8754: Unable to use namespace: ${ns}.` }, { status: 403 });

const SPEC_CLASSES = [
  { name: '%Api.IAM.v1', dispatchClass: '%Api.IAM.v1.disp', namespace: '%SYS', webApplications: '/api/iam' },
  { name: '%Api.InteropEditors.v2', dispatchClass: '%Api.InteropEditors.v2.disp', namespace: '%SYS' },
  { name: 'clinical.api', dispatchClass: 'clinical.api.disp', namespace: 'CLINICAL' },
];

type Param = {
  name: string;
  in: 'path' | 'query' | 'body';
  required?: boolean;
  type?: string;
  description?: string;
  'x-example'?: unknown;
  schema?: unknown;
};
type Op = { summary?: string; operationId?: string; parameters?: Param[] };

/** The `{name}` segments of a path, as the generated description declares them. */
const pathParams = (path: string): Param[] =>
  [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, type: 'string' }));

const bodyParam = (schema: unknown): Param => ({ name: 'payload', in: 'body', required: true, schema });

/** A small, plausible description for a web application the mock has no spec for. */
const ROUTES: Record<string, [string, string, string][]> = {
  '/api/atelier': [
    ['get', '/', 'Server information'],
    ['get', '/v1/{namespace}/docnames/{category}', 'List documents'],
    ['get', '/v1/{namespace}/doc/{docname}', 'Get a document'],
    ['put', '/v1/{namespace}/doc/{docname}', 'Save a document'],
    ['post', '/v1/{namespace}/action/compile', 'Compile documents'],
  ],
  '/api/monitor': [
    ['get', '/metrics', 'Metrics in OpenMetrics text'],
    ['get', '/alerts', 'alerts.log entries since the last call'],
  ],
  '/api/mgmnt': [
    ['get', '/v1/{namespace}/restapps', 'List REST applications'],
    ['get', '/v1/{namespace}/spec/{webApplication}', 'OpenAPI description of a REST application'],
    ['get', '/v2/', 'List spec-first REST applications'],
    ['get', '/v2/{namespace}/{application}', 'OpenAPI description of a spec-first application'],
  ],
};

function describe(title: string, basePath: string, routes: [string, string, string][]) {
  const paths: Record<string, Record<string, Op>> = {};
  for (const [method, path, summary] of routes)
    (paths[path] ??= {})[method] = {
      summary,
      parameters: [
        ...pathParams(path),
        ...(method === 'post' || method === 'put' ? [bodyParam({ type: 'object' })] : []),
      ],
    };
  return { swagger: '2.0', info: { title, version: '1' }, basePath, paths };
}

function describeWebApp(name: string) {
  if (name === '/api/admin') {
    const paths: Record<string, Record<string, Op>> = {};
    for (const op of specIndex.operations)
      (paths[op.path] ??= {})[op.method.toLowerCase()] = {
        operationId: op.id,
        summary: op.summary,
        parameters: [
          ...op.params.map((p) => ({
            name: p.name,
            in: 'query' as const,
            required: p.required,
            type: p.type,
            description: p.description,
            ...('example' in p && p.example !== undefined ? { 'x-example': p.example } : {}),
          })),
          ...(op.body
            ? [
                bodyParam({
                  type: 'object',
                  properties: Object.fromEntries(
                    (op.body.properties ?? []).map((n) => [n, { type: 'string' }]),
                  ),
                }),
              ]
            : []),
        ],
      };
    return { swagger: '2.0', info: { title: specIndex.title, version: '2' }, basePath: name, paths };
  }
  return describe(name, name, ROUTES[name] ?? [['get', '/', 'Dispatch root']]);
}

export const mgmntHandlers = [
  http.get('*/api/mgmnt/v1/:ns/restapps', ({ request, params }) => {
    if (!basicAccount(request)) return unauthorized();
    const ns = String(params.ns);
    if (!knownNamespace(ns)) return badNamespace(ns);
    return HttpResponse.json(
      mockDb.webApps
        .filter((w) => w.DispatchClass)
        .map((w) => ({
          name: w.Name,
          dispatchClass: w.DispatchClass,
          namespace: w.Namespace,
          swaggerSpec: `/api/mgmnt/v1/${encodeURIComponent(ns)}/spec${w.Name}`,
          enabled: w.Enabled,
          ...(w.Resource ? { resource: w.Resource } : {}),
        })),
    );
  }),

  http.get('*/api/mgmnt/v1/:ns/spec/*', ({ request, params }) => {
    if (!basicAccount(request)) return unauthorized();
    const ns = String(params.ns);
    if (!knownNamespace(ns)) return badNamespace(ns);
    // The leading * of the pattern is params[0]; the web application is the trailing one.
    const name = `/${String(params[1])}`;
    const app = mockDb.webApps.find((w) => w.Name === name && w.DispatchClass);
    if (!app)
      return HttpResponse.json({ msg: `ERROR #8726: Web application ${name} not found.` }, { status: 404 });
    return HttpResponse.json(describeWebApp(name));
  }),

  http.get('*/api/mgmnt/v2/', ({ request }) => {
    if (!basicAccount(request)) return unauthorized();
    return HttpResponse.json(
      SPEC_CLASSES.map((c) => ({
        ...c,
        swaggerSpec: `/api/mgmnt/v2/${encodeURIComponent(c.namespace)}/${encodeURIComponent(c.name)}`,
      })),
    );
  }),

  http.get('*/api/mgmnt/v2/:ns/:app', ({ request, params }) => {
    if (!basicAccount(request)) return unauthorized();
    const c = SPEC_CLASSES.find((x) => x.name === params.app && x.namespace === params.ns);
    if (!c) return HttpResponse.json({ msg: 'ERROR #8726: Application not found.' }, { status: 404 });
    return HttpResponse.json(
      describe(c.name, c.webApplications ?? '', [
        ['get', '/items', 'List items'],
        ['post', '/items', 'Create an item'],
        ['get', '/items/{id}', 'Get an item'],
      ]),
    );
  }),
];
