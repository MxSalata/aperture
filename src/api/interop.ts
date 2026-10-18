import { sessionFetch } from './sessionFetch';

/**
 * Interoperability productions, through `/api/interop-editors`: the API behind IRIS's own new
 * Interoperability UI (`/ui/interop/`), which ships with every IRIS since 2023.1 outside the SysAdmin
 * spec. It takes the session's own token (`api/sessionFetch.ts`) and reports the account's
 * interoperability privileges itself (`GET /info`).
 *
 * It is not documented: its dispatch classes are marked internal and `/api/mgmnt` cannot describe it.
 * The routes here are the ones IRIS's own UI calls, read from its bundle on IRIS for Health 2026.2,
 * which pins version 7 (the instance serves v1 to v7); the shapes were recorded on that instance
 * (`docs/verification/2026-10-18-irishealth-2026.2/`). Names come from the raw fields, never from the
 * `Localized*` ones: the API translates those into the request's language (`Accept-Language`).
 */
export const INTEROP_PREFIX = '/api/interop-editors';
export const INTEROP_API_VERSION = 7;
const V = `${INTEROP_PREFIX}/v${INTEROP_API_VERSION}`;

const MISSING = 'The /api/interop-editors web application is not enabled on this instance.';

export interface InteropPrivileges {
  production?: {
    read?: boolean;
    write?: boolean;
    run?: boolean;
    runItem?: boolean;
    monitor?: boolean;
    document?: boolean;
    export?: boolean;
  };
  readEventLog?: boolean;
  readQueue?: boolean;
  readJobs?: boolean;
  writeJobs?: boolean;
  readMessages?: boolean;
  readMessageTrace?: boolean;
  suspendMessage?: boolean;
  [other: string]: unknown;
}

export interface InteropInfo {
  username: string;
  serverVersion: string;
  systemMode?: string;
  language?: string;
  apiVersion: number;
  product?: string;
  /** The namespaces with interoperability the account may use. */
  namespaces: { name: string; portalPath?: string; sourceControlClass?: string }[];
  privileges: InteropPrivileges;
}

/** `GET /{ns}/productions/status`: the production running in the namespace, if any. */
export interface ProductionStatus {
  /** Ens.Director's state: 1 running, 2 stopped, 3 suspended, 4 troubled, 5 network stopped. */
  State: number;
  /** The class of the production running now; empty when none is. */
  ProdRunning: string;
}

export type HostType = 'service' | 'process' | 'operation';

export interface ProductionItem {
  name: string;
  /** The item's id inside the production; the host routes that take one (settings) want this. */
  itemId: string;
  type: HostType | string;
  classname: string;
  /** Comma-separated categories. */
  category: string;
  enabled: number | boolean;
  poolsize: number;
  /** As IRIS reports it: `ok`, `stopped`, `disabled`, `error`, ... */
  status: string;
  comment: string;
  port?: string;
  ipaddress?: string;
  adapterClassName?: string;
  isMissingClass?: number;
  hasDups?: number;
}

export interface ProductionSetting {
  Name: string;
  Value: unknown;
  DefaultValue?: unknown;
  /** Where the value comes from (IRIS's ValueSource codes). */
  ValueSource?: number;
  Description?: string;
  DataType?: string;
  Category?: string;
  IsAdapter?: string;
  IsRequired?: number;
}

export interface ProductionDefinition {
  State: number;
  ProdRunning: string;
  Items: ProductionItem[];
  Categories?: unknown;
  ReadOnly?: number | boolean;
  /** The production's own settings. */
  children?: ProductionSetting[];
  Settings?: unknown;
}

/** One entry of a host's event log (`Ens.Util.Log`), its time on the instance's clock. */
export interface EventLogEntry {
  Id: number;
  Seq?: number;
  TimeLogged: string;
  /** Error, Warning, Info, Trace, Assert, Alert. */
  Type: string;
  Job: string;
  Session: string | number;
  Source: string;
  Method: string;
  Text: string;
  Stack?: string;
  MessageId: string | number;
  TraceCat?: string;
}

/** A message a host sent or received (`Ens.MessageHeader`). `Date` is UTC, without a designator. */
export interface HostMessage {
  Date: string;
  Status: number;
  Source: string;
  Target: string;
  MessageBodyClassName: string;
  /** The message header's id. */
  Header: string;
}

export interface ItemConnections {
  itemId: string;
  connections: { itemName: string; isTarget: number; itemId: string | number }[];
}

const enc = encodeURIComponent;

export const fetchInteropInfo = () =>
  sessionFetch<InteropInfo>(`${INTEROP_PREFIX}/info`, { missing: MISSING });

export const fetchProductions = (ns: string) =>
  sessionFetch<{ productions: string[] }>(`${V}/${enc(ns)}/productions`, { missing: MISSING }).then(
    (r) => r?.productions ?? [],
  );

export const fetchProductionStatus = (ns: string) =>
  sessionFetch<ProductionStatus>(`${V}/${enc(ns)}/productions/status`, { missing: MISSING });

export const fetchProduction = (ns: string, production: string) =>
  sessionFetch<ProductionDefinition>(`${V}/${enc(ns)}/productions/${enc(production)}`, { missing: MISSING });

export const fetchConnections = (ns: string, production: string) =>
  sessionFetch<ItemConnections[]>(`${V}/${enc(ns)}/productions/${enc(production)}/connections`, {
    missing: MISSING,
  });

/** The event log of one host, newest first. */
export const fetchHostLog = (ns: string, production: string, host: string) =>
  sessionFetch<{ children?: EventLogEntry[] }>(
    `${V}/${enc(ns)}/productions/${enc(production)}/${enc(host)}/log`,
    { missing: MISSING },
  ).then((r) => r?.children ?? []);

/** The messages a host sent or received lately, newest first. */
export const fetchHostMessages = (ns: string, production: string, host: string) =>
  sessionFetch<{ messages?: HostMessage[] }>(
    `${V}/${enc(ns)}/productions/${enc(production)}/${enc(host)}/messages`,
    { missing: MISSING },
  ).then((r) => r?.messages ?? []);

/** A message waiting in a host's queue. `TimeCreated` is the instance's clock here (not UTC). */
export interface QueuedMessage {
  QId: string;
  /** How many wait in the queue, repeated on every entry. */
  QCount: number;
  HeaderId: string;
  IsRequest: number;
  TimeCreated: string;
  Source: string;
  Target: string;
  Status: number;
  Error: number;
  BPId?: number | string;
  BodyClass: string;
  Priority: string;
  Index?: string;
}

/** The messages waiting for a host: IRIS answers `{}` when none do. */
export const fetchHostQueue = (ns: string, production: string, host: string) =>
  sessionFetch<{ children?: QueuedMessage[] }>(
    `${V}/${enc(ns)}/productions/${enc(production)}/${enc(host)}/queue`,
    { missing: MISSING },
  ).then((r) => r?.children ?? []);

/** A host's jobs as IRIS reports them: `{}` when it has none. */
export const fetchHostJobs = (ns: string, production: string, host: string) =>
  sessionFetch<Record<string, unknown>>(`${V}/${enc(ns)}/productions/${enc(production)}/${enc(host)}/jobs`, {
    missing: MISSING,
  });

/** A host's settings, by its item id (the name answers 404). */
export const fetchHostSettings = (ns: string, production: string, itemId: string) =>
  sessionFetch<{ children?: ProductionSetting[] }>(
    `${V}/${enc(ns)}/productions/${enc(production)}/${enc(itemId)}`,
    { missing: MISSING },
  ).then((r) => r?.children ?? []);

/**
 * Start or stop a production, or one of its hosts (`hostId`, the item id). The route answers
 * `{"Success":1}` to any value of `state` (on 2026.2 `restart` stopped a host), so only these two are
 * ever sent, and the caller reads the state back: the answer itself proves nothing.
 */
export const setProductionState = (
  ns: string,
  production: string,
  state: 'start' | 'stop',
  hostId?: string,
) =>
  sessionFetch<{ Success?: number }>(
    `${V}/${enc(ns)}/productions/production/state/${enc(production)}?state=${state}${
      hostId ? `&hostID=${enc(hostId)}` : ''
    }`,
    { method: 'POST', missing: MISSING },
  );

export const PRODUCTION_STATES: Record<number, string> = {
  1: 'Running',
  2: 'Stopped',
  3: 'Suspended',
  4: 'Troubled',
  5: 'Network stopped',
};

/** The state of `production` in a namespace whose status is `status`. */
export function productionState(status: ProductionStatus | undefined, production: string): string {
  if (!status) return 'Unknown';
  if (status.ProdRunning && status.ProdRunning !== production) return 'Stopped';
  return PRODUCTION_STATES[status.State] ?? `State ${status.State}`;
}

/** Ens.DataType.MessageStatus. */
export const MESSAGE_STATUSES: Record<number, string> = {
  1: 'Created',
  2: 'Queued',
  3: 'Delivered',
  4: 'Discarded',
  5: 'Suspended',
  6: 'Deferred',
  7: 'Aborted',
  8: 'Error',
  9: 'Completed',
};

export const messageStatus = (status: number) => MESSAGE_STATUSES[status] ?? `Status ${status}`;

export const HOST_TYPES: Record<string, string> = {
  service: 'Service',
  process: 'Process',
  operation: 'Operation',
};

export const hostType = (type: string) => HOST_TYPES[type] ?? type;

/** A host status as a label: IRIS reports them in lower case (`ok`, `stopped`, `disabled`, `error`). */
export function hostStatus(item: Pick<ProductionItem, 'status' | 'enabled'>): string {
  if (!item.enabled) return 'Disabled';
  const s = (item.status || '').trim().toLowerCase();
  if (s === 'ok') return 'OK';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
}

const STATUS_ORDER = ['Error', 'Retry', 'Inactive', 'OK', 'Stopped', 'Disabled'];

/** Where a host status label sorts: trouble first, an unknown one after the known ones. */
export function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status);
  return i < 0 ? STATUS_ORDER.length : i;
}

/** Hosts counted by status label, in the order an administrator reads them: trouble first. */
export function countByStatus(items: readonly ProductionItem[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const s = hostStatus(it);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.status.localeCompare(b.status));
}

export interface HostErrors {
  count: number;
  /** The newest error in the window. */
  last?: EventLogEntry;
}

/**
 * The errors in a host's event log since `since` (epoch ms). A host's `status` is the outcome of its last
 * message (`error` after a failure, `ok` again after the next success: Lab.Flaky of scripts/live/lab.mjs
 * on IRIS for Health 2026.2), so it hides a host that fails now and then; the event log keeps every failure. `toMs` reads an
 * event log time, which is on the instance's clock.
 */
export function hostErrors(
  entries: readonly EventLogEntry[],
  since: number,
  toMs: (time: string) => number,
): HostErrors {
  let count = 0;
  let last: EventLogEntry | undefined;
  let lastAt = -Infinity;
  for (const e of entries) {
    if (e.Type !== 'Error') continue;
    const at = toMs(e.TimeLogged);
    if (!(at >= since)) continue;
    count++;
    if (at > lastAt) {
      lastAt = at;
      last = e;
    }
  }
  return { count, last };
}

/** The categories of an item: IRIS keeps them as one comma-separated string. */
export const categoriesOf = (item: Pick<ProductionItem, 'category'>) =>
  (item.category || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

/**
 * A message date (UTC, without a designator) as an instant, so `Timestamp` shows it on the instance's
 * clock like the event log beside it: a screen never mixes two clocks.
 */
export const utcInstant = (s: string | undefined) => (s ? `${s.trim().replace(' ', 'T')}Z` : '');

export const interopKeys = {
  all: ['interop'] as const,
  info: ['interop', 'info'] as const,
  productions: (ns: string) => ['interop', ns, 'productions'] as const,
  status: (ns: string) => ['interop', ns, 'status'] as const,
  production: (ns: string, production: string) => ['interop', ns, 'production', production] as const,
  connections: (ns: string, production: string) => ['interop', ns, 'connections', production] as const,
  host: (ns: string, production: string, host: string, part: string) =>
    ['interop', ns, 'host', production, host, part] as const,
};
