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
 * only what changes; an endpoint's own FHIR API (its `/metadata`) does not take this token, and a new
 * endpoint's answers anyone (no credentials needed), so the CapabilityStatement is asked for without
 * credentials and a 401 there says the endpoint wants its own sign-in.
 */
export const FHIR_PREFIX = '/csp/fhir-management/api';
const MISSING =
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

export const fetchFhirInfo = () =>
  sessionFetch<{
    namespaces?: FhirNamespace[];
    instance_info?: { system_mode?: string; product_version?: string };
  }>(`${FHIR_PREFIX}/info`, { missing: MISSING });

/** Every FHIR-enabled namespace with its endpoints and their resource counts. */
export const fetchFhirNamespaces = () =>
  sessionFetch<FhirNamespace[]>(`${FHIR_PREFIX}/namespaces?endpoints=true&metrics=rsrc-count`, {
    missing: MISSING,
  });

export const fetchEndpoint = (ns: string, id: string) =>
  sessionFetch<EndpointEntry>(
    `${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}&metrics=all&jobs=true`,
    {
      missing: MISSING,
    },
  );

export const fetchPackages = (ns: string) =>
  sessionFetch<FhirPackage[]>(`${FHIR_PREFIX}/packages?namespace=${enc(ns)}`, { missing: MISSING });

export const fetchJob = (key: string) =>
  sessionFetch<FhirJob>(`${FHIR_PREFIX}/jobs/${enc(key)}`, { missing: MISSING });

/** A PUT merges: only what changes is sent. */
export const updateEndpoint = (ns: string, id: string, changes: Partial<FhirEndpoint>) =>
  sessionFetch<FhirEndpoint>(`${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}`, {
    method: 'PUT',
    body: { serviceId: Number(id), ...changes },
    missing: MISSING,
  });

export type EndpointRemoval = 'reset' | 'decommission' | 'delete';

/** Reset (empty it), decommission (keep only its data tables) or delete an endpoint: a job IRIS runs. */
export const removeEndpoint = (ns: string, id: string, action: EndpointRemoval) =>
  sessionFetch<FhirJob>(`${FHIR_PREFIX}/endpoints/${enc(id)}?namespace=${enc(ns)}&action=${action}`, {
    method: 'DELETE',
    missing: MISSING,
  });

export interface Capability {
  /** 200: the statement; 401: the endpoint asks for its own sign-in; 503: disabled. */
  status: number;
  /** The endpoint answered without credentials. */
  open: boolean;
  fhirVersion?: string;
  software?: string;
  resources: { type: string; interactions: string[]; searchParams: number }[];
  issue?: string;
}

/** An endpoint's CapabilityStatement (`GET <url>/metadata`), asked for without credentials. */
export async function fetchCapability(url: string): Promise<Capability> {
  const full = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${url.replace(/\/+$/, '')}/metadata`;
  let res: Response;
  try {
    res = await fetch(full, { headers: { Accept: 'application/fhir+json' }, credentials: 'omit' });
  } catch (e) {
    throw new ApiError({ status: 0, url: full, summary: e instanceof Error ? e.message : 'Network error' });
  }
  const body = (await res.json().catch(() => null)) as {
    fhirVersion?: string;
    software?: { name?: string; version?: string };
    rest?: { resource?: { type: string; interaction?: { code: string }[]; searchParam?: unknown[] }[] }[];
    issue?: { details?: { text?: string }; diagnostics?: string }[];
  } | null;
  return {
    status: res.status,
    open: res.ok,
    fhirVersion: body?.fhirVersion,
    software: body?.software?.name,
    resources: (body?.rest?.[0]?.resource ?? []).map((r) => ({
      type: r.type,
      interactions: (r.interaction ?? []).map((i) => i.code),
      searchParams: r.searchParam?.length ?? 0,
    })),
    issue: body?.issue?.[0]?.details?.text ?? body?.issue?.[0]?.diagnostics,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Follow a job until it ends (at most `budgetMs`): creating, resetting or deleting takes a while. */
export async function waitForJob(
  key: string,
  budgetMs = 180_000,
  onUpdate?: (j: FhirJob) => void,
): Promise<FhirJob> {
  const t0 = Date.now();
  let job: FhirJob = { job_key: key, status: 'pending' };
  while (Date.now() - t0 < budgetMs) {
    job = await fetchJob(key);
    onUpdate?.(job);
    if (!['pending', 'running'].includes(job.status)) return job;
    await sleep(1500);
  }
  return job;
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
