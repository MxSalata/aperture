import { useSession } from '@/stores/session';
import { ApiError } from '@/lib/errors';
import { sessionFetch } from './sessionFetch';

/**
 * FHIR servers of IRIS for Health and Health Connect, through InterSystems' FHIR Server Management API
 * (`/csp/fhir-management/api`, documented as Swagger 2.0, the API of IRIS for Health's own FHIR Server
 * Management pages). It takes the session's own token (`api/sessionFetch.ts`); an instance without it
 * (IRIS) answers 404 and the screens say so.
 *
 * Recorded on IRIS for Health 2026.2 (`docs/verification/2026-10-18-irishealth-2026.2/`): an endpoint's
 * `serviceId` is a number in the lists and a string when it is read alone; a PUT merges, so it carries
 * only what changes; an unknown endpoint, job or namespace is a 404 with no body. An endpoint's own
 * FHIR API does not take this token. Its `/metadata` answers anyone, but its resources ask for a
 * sign-in (an anonymous search was refused with 401), so the CapabilityStatement is read without
 * credentials and an anonymous search says whether the endpoint is really open.
 */
export const FHIR_PREFIX = '/csp/fhir-management/api';
export const FHIR_MISSING =
  'This instance has no FHIR Server Management API (/csp/fhir-management/api): it is not IRIS for Health or Health Connect.';

export interface FhirServiceConfig {
  fhir_metadata_set?: string;
  fhir_version?: string;
  interactions_strategy_class?: string;
  default_search_page_size?: number;
  max_search_page_size?: number;
  max_search_results?: number;
  max_conditional_delete_results?: number;
  fhir_session_timeout?: number;
  default_prefer_handling?: string;
  debug_mode?: number;
  search_filtering?: boolean;
  resource_validation?: string;
  [other: string]: unknown;
}

export interface FhirEndpoint {
  serviceId: number | string;
  name: string;
  url: string;
  enabled: boolean;
  decommissioned: boolean;
  rsrc_db?: string;
  rsrc_db_location?: string;
  ver_db?: string;
  ver_db_location?: string;
  reindexing?: boolean;
  service_config_data?: FhirServiceConfig;
  strategy_config_data?: Record<string, unknown>;
  csp_config?: { oauth_client_name?: string; service_config_name?: string };
}

export interface FhirJob {
  job_key: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'internal_error' | string;
  namespace?: string;
  serviceId?: number | string;
  start_time?: string;
  end_time?: string;
  method?: string;
  error?: string;
}

export interface FhirMetrics {
  rsrc_count?: number;
  table_stats?: { tableName: string; resourceType: string; count: number; reindex_count?: number }[];
}

export interface EndpointEntry {
  endpoint: FhirEndpoint;
  endpoint_jobs?: FhirJob[];
  metrics?: FhirMetrics;
  base_url?: string;
}

export interface FhirNamespace {
  name: string;
  endpoints?: EndpointEntry[];
}

export interface FhirPackage {
  id: string;
  name?: string;
  version?: string;
  type?: string;
  core_version?: string;
  title?: string;
  inUse?: boolean;
  dependencies?: string[];
}

const enc = encodeURIComponent;

/**
 * What the management API knows of the instance. Behind a proxy that does not forward the API, the
 * app's own page answers 200; that is not the API, and is said so.
 */
export async function fetchFhirInfo() {
  const info = await sessionFetch<{
    namespaces?: FhirNamespace[];
    instance_info?: { system_mode?: string; product_version?: string };
  }>(`${FHIR_PREFIX}/info`, { missing: FHIR_MISSING });
  if (!info || typeof info !== 'object')
    throw new ApiError({
      status: 200,
      url: `${FHIR_PREFIX}/info`,
      summary: `${FHIR_PREFIX} is not reachable through this deployment: the answer was not the API's.`,
    });
  return info;
}

/** Every FHIR-enabled namespace with its endpoints and their resource counts. */
export const fetchFhirNamespaces = () =>
  sessionFetch<FhirNamespace[]>(`${FHIR_PREFIX}/namespaces?endpoints=true&metrics=rsrc-count`, {
    missing: FHIR_MISSING,
  });

const noEndpoint = (ns: string, id: string) => `IRIS has no FHIR server ${id} in ${ns}.`;
/** What a 404 for a job says: IRIS forgets jobs (a restart clears them). */
export const JOB_GONE = 'IRIS no longer knows this job; the server below shows what it holds now.';

export const fetchEndpoint = (ns: string, id: string) =>
  sessionFetch<EndpointEntry>(
    `${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}&metrics=all&jobs=true`,
    { missing: noEndpoint(ns, id) },
  );

export const fetchPackages = (ns: string) =>
  sessionFetch<FhirPackage[]>(`${FHIR_PREFIX}/packages?namespace=${enc(ns)}`, {
    missing: `${ns} is not a FHIR-enabled namespace.`,
  });

export const fetchJob = (key: string) =>
  sessionFetch<FhirJob>(`${FHIR_PREFIX}/jobs/${enc(key)}`, { missing: JOB_GONE });

/** A PUT merges: only what changes is sent. */
export const updateEndpoint = (ns: string, id: string, changes: Partial<FhirEndpoint>) =>
  sessionFetch<FhirEndpoint>(`${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}`, {
    method: 'PUT',
    body: { serviceId: Number(id), ...changes },
    missing: noEndpoint(ns, id),
  });

export type EndpointRemoval = 'reset' | 'decommission' | 'delete';

/** Reset (empty it), decommission (keep only its data tables) or delete an endpoint: a job IRIS runs. */
export const removeEndpoint = (ns: string, id: string, action: EndpointRemoval) =>
  sessionFetch<FhirJob>(`${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}&action=${action}`, {
    method: 'DELETE',
    missing: noEndpoint(ns, id),
  });

export interface Capability {
  /** 200: the statement; 401: the endpoint asks for its own sign-in; 503: disabled. */
  status: number;
  /** An anonymous search of its resources answered 200: anyone who reaches it reads its data. */
  open: boolean;
  fhirVersion?: string;
  software?: string;
  resources: { type: string; interactions: string[]; searchParams: number }[];
  issue?: string;
}

const anonymous = (full: string) =>
  fetch(full, { headers: { Accept: 'application/fhir+json' }, credentials: 'omit' });

/** Said when the answer is not FHIR's: in Docker only `/csp/healthshare/<ns>/fhir/<version>` is forwarded. */
export const notReachable = (url: string) =>
  `${url} is not reachable through this deployment: its answer was not a FHIR CapabilityStatement. Aperture's proxy forwards only endpoints under /csp/healthshare/<namespace>/fhir/<version>.`;

/**
 * An endpoint's CapabilityStatement (`GET <url>/metadata`), asked for without credentials, and whether
 * it is open: IRIS serves `/metadata` to anyone, so that is decided by an anonymous search of the first
 * type it serves (`?_count=0`, which returns no resource).
 */
export async function fetchCapability(url: string): Promise<Capability> {
  const base = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${url.replace(/\/+$/, '')}`;
  const full = `${base}/metadata`;
  let res: Response;
  try {
    res = await anonymous(full);
  } catch (e) {
    throw new ApiError({ status: 0, url: full, summary: e instanceof Error ? e.message : 'Network error' });
  }
  const json = /json/i.test(res.headers.get('content-type') ?? '');
  const body = (json ? await res.json().catch(() => null) : null) as {
    resourceType?: string;
    fhirVersion?: string;
    software?: { name?: string; version?: string };
    rest?: { resource?: { type: string; interaction?: { code: string }[]; searchParam?: unknown[] }[] }[];
    issue?: { details?: { text?: string }; diagnostics?: string }[];
  } | null;
  if (res.ok && body?.resourceType !== 'CapabilityStatement')
    throw new ApiError({ status: res.status, url: full, summary: notReachable(url) });
  const resources = (body?.rest?.[0]?.resource ?? []).map((r) => ({
    type: r.type,
    interactions: (r.interaction ?? []).map((i) => i.code),
    searchParams: r.searchParam?.length ?? 0,
  }));
  let open = false;
  const probe = resources.find((r) => r.interactions.includes('search-type'));
  if (res.ok && probe) {
    try {
      open = (await anonymous(`${base}/${enc(probe.type)}?_count=0`)).ok;
    } catch {
      open = false;
    }
  }
  return {
    status: res.status,
    open,
    fhirVersion: body?.fhirVersion,
    software: body?.software?.name,
    resources,
    issue: body?.issue?.[0]?.details?.text ?? body?.issue?.[0]?.diagnostics,
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

/** A job's end as the screens tell it: `gone` when IRIS no longer knows it, `running` when the wait ran out. */
export type JobOutcome =
  | { kind: 'ended'; job: FhirJob }
  | { kind: 'running'; job: FhirJob }
  | { kind: 'gone' }
  | { kind: 'aborted' };

/**
 * Follow a job until it ends (at most `budgetMs`): creating, resetting or deleting takes a while. A
 * failed poll is tried again a few times before it counts; a 404 means IRIS has dropped the job, whose
 * outcome is then unknown.
 */
export async function waitForJob(
  key: string,
  {
    budgetMs = 180_000,
    intervalMs = 1500,
    signal,
  }: { budgetMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<JobOutcome> {
  const t0 = Date.now();
  let job: FhirJob = { job_key: key, status: 'pending' };
  let failures = 0;
  while (Date.now() - t0 < budgetMs) {
    if (signal?.aborted) return { kind: 'aborted' };
    try {
      job = await fetchJob(key);
      failures = 0;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { kind: 'gone' };
      if (++failures >= 3) throw e;
    }
    if (signal?.aborted) return { kind: 'aborted' };
    if (failures === 0 && !['pending', 'running'].includes(job.status)) return { kind: 'ended', job };
    await sleep(intervalMs, signal);
  }
  return { kind: 'running', job };
}

export const fhirKeys = {
  all: ['fhir'] as const,
  info: ['fhir', 'info'] as const,
  namespaces: ['fhir', 'namespaces'] as const,
  endpoint: (ns: string, id: string) => ['fhir', ns, 'endpoint', id] as const,
  packages: (ns: string) => ['fhir', ns, 'packages'] as const,
  capability: (url: string) => ['fhir', 'capability', url] as const,
};

/** The short name of an interactions strategy class (JsonAdvSQL, Json, ...). */
export const strategyName = (cls?: string) =>
  (cls ?? '').replace(/^.*\.Storage\./, '').replace(/\.InteractionsStrategy$/, '') || '-';
