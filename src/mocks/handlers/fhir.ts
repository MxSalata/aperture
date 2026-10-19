import { http, HttpResponse } from 'msw';
import { authenticate } from '../auth';
import { unauthorized } from '../util';
import type { EndpointEntry, FhirEndpoint, FhirJob } from '@/api/fhir';

/**
 * The FHIR Server Management API (`/csp/fhir-management/api`) as IRIS for Health 2026.2 answers it, for
 * one R4 server in the demo's CLINICAL namespace, beside the FHIR.Production its dashboard charts: the
 * session's token or a password, `%HSAdmin_InstallationManagement` (the demo's %All accounts), a PUT
 * that merges, removals that run as jobs for a few seconds, a second FHIR-enabled namespace with no
 * server, an empty 404 for an unknown endpoint, job or namespace, and the endpoint's own FHIR API: its
 * CapabilityStatement answers without credentials (503 while it is disabled), its resources only with
 * a sign-in (an anonymous search is a 401, as on IRIS).
 */
interface MockEndpoint extends FhirEndpoint {
  counts: Record<string, number>;
}

const URL_R4 = '/csp/healthshare/clinical/fhir/r4';
const COUNTS = { Patient: 4, Encounter: 3, Observation: 128, Condition: 9, MedicationRequest: 17 };

function seed(): MockEndpoint[] {
  return [
    {
      serviceId: 1,
      name: 'Clinical R4',
      url: URL_R4,
      enabled: true,
      decommissioned: false,
      rsrc_db: '',
      rsrc_db_location: '',
      ver_db: '',
      ver_db_location: '',
      reindexing: false,
      service_config_data: {
        fhir_metadata_set: 'hl7.fhir.r4.core@4.0.1',
        fhir_version: '4.0.1',
        interactions_strategy_class: 'HS.FHIRServer.Storage.JsonAdvSQL.InteractionsStrategy',
        default_search_page_size: 100,
        max_search_page_size: 100,
        max_search_results: 1000,
        max_conditional_delete_results: 3,
        fhir_session_timeout: 300,
        default_prefer_handling: 'lenient',
        debug_mode: 0,
        search_filtering: true,
        resource_validation: 'always',
      },
      strategy_config_data: { smart_capabilities: '', silence_index_errors: false, paging_style: 'cached' },
      csp_config: { oauth_client_name: '', service_config_name: '' },
      counts: { ...COUNTS },
    },
  ];
}

let endpoints = seed();
let jobs: (FhirJob & { startedAt: number; apply: () => void })[] = [];

/** Back to the seeded server (tests). */
export function resetFhirMock() {
  endpoints = seed();
  jobs = [];
}

const NS = 'CLINICAL';
/** FHIR-enabled (its packages are loaded) but with no server. */
const NS_EMPTY = 'FHIRSTAGE';
const allowed = (request: Request) => {
  const account = authenticate(request);
  if (!account) return { refusal: unauthorized() };
  if (!account.roles.includes('%All'))
    return {
      refusal: HttpResponse.json(
        {
          errors: [{ error: 'ERROR #921: Operation requires %HSAdmin_InstallationManagement:USE privilege' }],
          summary: 'ERROR #921: Operation requires %HSAdmin_InstallationManagement:USE privilege',
        },
        { status: 403 },
      ),
    };
  return {};
};

const utcNow = (ms = Date.now()) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

function entry(e: MockEndpoint, withMetrics: boolean): EndpointEntry {
  const { counts, ...endpoint } = e;
  return {
    endpoint,
    endpoint_jobs: jobs
      .filter((j) => Number(j.serviceId) === Number(e.serviceId))
      .map(({ startedAt: _s, apply: _a, ...j }) => j),
    metrics: withMetrics
      ? {
          rsrc_count: Object.values(counts).reduce((a, b) => a + b, 0),
          table_stats: Object.entries(counts).map(([resourceType, count]) => ({
            tableName: `HSFHIR_X0001_S.${resourceType}`,
            resourceType,
            count,
            reindex_count: 0,
          })),
        }
      : undefined,
  };
}

/** A job's state from its age: pending, then running, then complete (and applied). */
function advance(j: (typeof jobs)[number]) {
  const age = Date.now() - j.startedAt;
  if (j.status !== 'complete' && age > 3000) {
    j.status = 'complete';
    j.end_time = utcNow();
    j.apply();
  } else if (j.status === 'pending' && age > 800) j.status = 'running';
}

const find = (id: string) => endpoints.find((e) => String(e.serviceId) === String(id));
const nsParam = (request: Request) => new URL(request.url).searchParams.get('namespace')?.toUpperCase();
const nsOk = (request: Request) => nsParam(request) === NS;

export const fhirHandlers = [
  http.get('*/csp/fhir-management/api/info', ({ request }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    return HttpResponse.json({
      namespaces: [
        { name: NS, endpoints: endpoints.map((e) => entry(e, false)) },
        { name: NS_EMPTY, endpoints: [] },
      ],
      instance_info: {
        system_mode: 'DEVELOPMENT',
        product_version:
          'IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2 (Build 221U) [Health:8.0.0]',
      },
    });
  }),
  http.get('*/csp/fhir-management/api/namespaces', ({ request }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    return HttpResponse.json([
      { name: NS, endpoints: endpoints.map((e) => entry(e, true)) },
      { name: NS_EMPTY, endpoints: [] },
    ]);
  }),
  http.get('*/csp/fhir-management/api/packages', ({ request }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    const ns = nsParam(request);
    if (ns !== NS && ns !== NS_EMPTY) return new HttpResponse(null, { status: 404 });
    // Only CLINICAL's server uses a package.
    const used = ns === NS && endpoints.length > 0;
    return HttpResponse.json([
      {
        id: 'hl7.fhir.r5.core@5.0.0',
        name: 'hl7.fhir.r5.core',
        version: '5.0.0',
        type: 'Core',
        core_version: '5.0.0',
        inUse: false,
      },
      {
        id: 'hl7.fhir.r4.core@4.0.1',
        name: 'hl7.fhir.r4.core',
        version: '4.0.1',
        type: 'fhir.core',
        core_version: '4.0.1',
        inUse: used,
      },
      {
        id: 'hl7.fhir.us.core@3.1.0',
        name: 'hl7.fhir.us.core',
        version: '3.1.0',
        type: 'fhir.ig',
        core_version: '4.0.1',
        inUse: false,
        dependencies: ['hl7.fhir.r4.core@4.0.1'],
      },
      {
        id: 'hl7.fhir.r3.core@3.0.2',
        name: 'hl7.fhir.r3.core',
        version: '3.0.2',
        type: 'fhir.core',
        core_version: '3.0.2',
        inUse: false,
      },
    ]);
  }),
  http.get('*/csp/fhir-management/api/jobs/:key', ({ request, params }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    const j = jobs.find((x) => x.job_key === decodeURIComponent(String(params.key)));
    if (!j) return new HttpResponse(null, { status: 404 });
    advance(j);
    const { startedAt: _s, apply: _a, ...job } = j;
    return HttpResponse.json(job);
  }),
  http.get('*/csp/fhir-management/api/endpoints/:id', ({ request, params }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    for (const j of jobs) advance(j);
    const e = find(String(params.id));
    if (!e || !nsOk(request)) return new HttpResponse(null, { status: 404 });
    // Read alone, IRIS gives the id as a string.
    const one = entry(e, true);
    return HttpResponse.json({
      ...one,
      endpoint: { ...one.endpoint, serviceId: String(e.serviceId) },
      base_url: `http://iris.example${e.url}`,
    });
  }),
  http.put('*/csp/fhir-management/api/endpoints/:id', async ({ request, params }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    const e = find(String(params.id));
    if (!e || !nsOk(request)) return new HttpResponse(null, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Partial<FhirEndpoint>;
    if (typeof body.enabled === 'boolean') e.enabled = body.enabled;
    if (body.name) e.name = body.name;
    if (body.service_config_data)
      e.service_config_data = { ...e.service_config_data, ...body.service_config_data };
    const { counts: _c, ...out } = e;
    return HttpResponse.json({ ...out, serviceId: String(e.serviceId) });
  }),
  http.delete('*/csp/fhir-management/api/endpoints/:id', ({ request, params }) => {
    const { refusal } = allowed(request);
    if (refusal) return refusal;
    const e = find(String(params.id));
    if (!e || !nsOk(request)) return new HttpResponse(null, { status: 404 });
    const action = new URL(request.url).searchParams.get('action');
    if (!action || !['reset', 'decommission', 'delete'].includes(action))
      return HttpResponse.json(
        {
          errors: [{ error: 'ERROR #8727: Parameter required: action.' }],
          summary: 'ERROR #8727: Parameter required: action.',
        },
        { status: 400 },
      );
    const key = btoa(`${Date.now()}||${e.serviceId}`);
    jobs.push({
      job_key: key,
      status: 'pending',
      namespace: NS,
      serviceId: e.serviceId,
      start_time: utcNow(),
      method:
        action === 'reset'
          ? 'ResetEndpoint'
          : action === 'decommission'
            ? 'DecommissionEndpoint'
            : 'DeleteEndpoint',
      startedAt: Date.now(),
      apply: () => {
        if (action === 'reset') e.counts = Object.fromEntries(Object.keys(e.counts).map((k) => [k, 0]));
        else if (action === 'decommission') {
          e.decommissioned = true;
          e.enabled = false;
        } else endpoints = endpoints.filter((x) => x !== e);
      },
    });
    return HttpResponse.json(
      { job_key: key, status: 'pending', start_time: utcNow(), method: jobs.at(-1)!.method },
      { status: 202, headers: { Location: `/csp/fhir-management/api/jobs/${key}` } },
    );
  }),
  // The endpoint's own FHIR API: its CapabilityStatement answers anyone, and 503 while it is disabled.
  http.get(`*${URL_R4}/metadata`, () => {
    const e = endpoints.find((x) => x.url === URL_R4);
    if (!e) return new HttpResponse(null, { status: 404 });
    if (!e.enabled)
      return HttpResponse.json(
        {
          resourceType: 'OperationOutcome',
          issue: [
            { severity: 'error', code: 'disabled', details: { text: 'The service is currently disabled' } },
          ],
        },
        { status: 503 },
      );
    return HttpResponse.json({
      resourceType: 'CapabilityStatement',
      status: 'active',
      kind: 'instance',
      fhirVersion: '4.0.1',
      software: { name: 'InterSystems IRIS for Health' },
      rest: [
        {
          mode: 'server',
          resource: Object.keys(COUNTS).map((type) => ({
            type,
            interaction: [
              'read',
              'vread',
              'update',
              'delete',
              'history-instance',
              'create',
              'search-type',
            ].map((code) => ({ code })),
            searchParam: Array.from({ length: type === 'Observation' ? 34 : 18 }, (_, i) => ({
              name: `p${i}`,
            })),
          })),
        },
      ],
    });
  }),
  // Its resources ask for a sign-in: an anonymous search is refused before it reaches the server.
  http.get(
    `*${URL_R4}/:type`,
    () => new HttpResponse(null, { status: 401, headers: { 'Content-Type': 'text/html' } }),
  ),
];
