import { http, HttpResponse } from 'msw';
import { authenticate, type MockAccount } from '../auth';
import { seeded, unauthorized } from '../util';
import type {
  EventLogEntry,
  HostMessage,
  InteropPrivileges,
  ProductionItem,
  ProductionSetting,
  QueuedMessage,
} from '@/api/interop';

/**
 * `/api/interop-editors` (version 7), as IRIS for Health 2026.2 answers the reads the production view
 * makes (shapes recorded on 18 Oct 2026). The two productions are the ones the dashboard's metrics
 * report (`handlers/monitor.ts`): INTEROP's HL7.Production, fifteen hosts with one failing, and
 * CLINICAL's FHIR.Production, six. As on IRIS, a host's `status` is the outcome of its last message
 * (the failing host cannot connect at all, so it stays `error`), and every failure is in its event log.
 * Event log and queue times are the instance's clock; message dates are UTC without a designator, as
 * IRIS sends them.
 */
type Host = Omit<ProductionItem, 'itemId' | 'enabled' | 'isMissingClass' | 'hasDups'> & {
  enabled?: number;
  error?: string;
  /** Stopped by hand while its production runs (state=stop with its hostID). */
  stopped?: boolean;
};

interface MockProduction {
  namespace: string;
  name: string;
  running: boolean;
  /** Running but troubled (Ens.Director state 4), as after IRIS stopped without stopping it. */
  troubled?: boolean;
  /** Not running, but left suspended by a recovery (state 3): the only one its namespace may start. */
  suspended?: boolean;
  hosts: Host[];
}

const svc = (name: string, classname: string, extra: Partial<Host> = {}): Host => ({
  name,
  type: 'service',
  classname,
  category: '',
  poolsize: 1,
  status: 'ok',
  comment: '',
  ...extra,
});
const proc = (name: string, classname: string, extra: Partial<Host> = {}): Host =>
  svc(name, classname, { type: 'process', ...extra });
const op = (name: string, classname: string, extra: Partial<Host> = {}): Host =>
  svc(name, classname, { type: 'operation', ...extra });

const PRODUCTIONS: MockProduction[] = [
  {
    namespace: 'INTEROP',
    name: 'HL7.Production',
    running: true,
    hosts: [
      svc('HL7.In.ADT.TCP', 'EnsLib.HL7.Service.TCPService', {
        category: 'ADT',
        port: '5001',
        comment: 'Admissions from the PAS',
      }),
      svc('HL7.In.ORU.TCP', 'EnsLib.HL7.Service.TCPService', { category: 'Results', port: '5002' }),
      svc('HL7.In.SIU.File', 'EnsLib.HL7.Service.FileService', { category: 'Scheduling' }),
      svc('HL7.In.Batch.FTP', 'EnsLib.HL7.Service.FTPService', {
        category: 'Results',
        comment: 'Nightly batch from the lab',
      }),
      proc('HL7.Router.ADT', 'EnsLib.HL7.MsgRouter.RoutingEngine', { category: 'ADT', poolsize: 2 }),
      proc('HL7.Router.ORU', 'EnsLib.HL7.MsgRouter.RoutingEngine', { category: 'Results' }),
      proc('HL7.Router.SIU', 'EnsLib.HL7.MsgRouter.RoutingEngine', { category: 'Scheduling' }),
      op('HL7.Out.PAS.TCP', 'EnsLib.HL7.Operation.TCPOperation', {
        category: 'ADT',
        ipaddress: 'pas.example.org',
        port: '6661',
      }),
      op('HL7.Out.LIMS.TCP', 'EnsLib.HL7.Operation.TCPOperation', {
        category: 'Results',
        ipaddress: 'lims.example.org',
        port: '6662',
      }),
      op('HL7.Out.Results.TCP', 'EnsLib.HL7.Operation.TCPOperation', {
        category: 'Results',
        ipaddress: 'results.example.org',
        port: '6663',
        status: 'error',
        comment: 'Results to the EPR',
        error: 'ERROR #6059: Unable to open TCP/IP socket to server results.example.org:6663',
      }),
      op('HL7.Out.EPR.HTTP', 'EnsLib.HL7.Operation.HTTPOperation', { category: 'ADT,Results' }),
      op('HL7.Out.Archive.File', 'EnsLib.HL7.Operation.FileOperation', { category: 'Archive' }),
      op('HL7.Out.Scheduling.TCP', 'EnsLib.HL7.Operation.TCPOperation', {
        category: 'Scheduling',
        ipaddress: 'rota.example.org',
        port: '6664',
      }),
      op('HL7.Out.Audit.SQL', 'EnsLib.SQL.Operation.GenericOperation', { category: 'Archive' }),
      op('Ens.Alert', 'EnsLib.EMail.AlertOperation', { comment: 'Alerts to the on-call address' }),
    ],
  },
  {
    namespace: 'INTEROP',
    name: 'HL7.TestProduction',
    running: false,
    hosts: [
      svc('Test.In.File', 'EnsLib.HL7.Service.FileService', { status: 'stopped' }),
      op('Test.Out.File', 'EnsLib.HL7.Operation.FileOperation', { status: 'stopped' }),
    ],
  },
  {
    namespace: 'CLINICAL',
    name: 'FHIR.Production',
    running: true,
    hosts: [
      svc('FHIR.In.REST', 'HS.FHIRServer.Interop.Service', { category: 'FHIR' }),
      svc('HL7.In.ADT.TCP', 'EnsLib.HL7.Service.TCPService', { category: 'HL7', port: '5101' }),
      proc('HL7.To.FHIR', 'HS.FHIR.DTL.Util.HC.HL7v2.FHIR.Process', { category: 'HL7,FHIR' }),
      proc('FHIR.Router', 'EnsLib.MsgRouter.RoutingEngine', { category: 'FHIR' }),
      op('FHIR.Out.Repository', 'HS.FHIRServer.Interop.Operation', { category: 'FHIR' }),
      op('Ens.Alert', 'EnsLib.EMail.AlertOperation'),
    ],
  },
];

/** Privileges a test gives an account instead of its role's (`setInteropPrivileges`). */
const overrides = new Map<string, InteropPrivileges>();

/** Report `privileges` for `username` until the next `resetInteropMock` (tests). */
export function setInteropPrivileges(username: string, privileges: InteropPrivileges) {
  overrides.set(username.toLowerCase(), privileges);
}

/** What IRIS reports for each demo account: the security-only auditor has no interoperability. */
function privilegesOf(account: MockAccount): InteropPrivileges {
  const own = overrides.get(account.username.toLowerCase());
  if (own) return own;
  const all = account.roles.includes('%All');
  const operator = account.roles.includes('%Operator');
  const yes = all || operator;
  return {
    production: { read: yes, write: all, run: all, runItem: all, monitor: yes, document: all, export: all },
    readEventLog: yes,
    readQueue: yes,
    readJobs: yes,
    writeJobs: all,
    readMessages: yes,
    readMessageTrace: yes,
    suspendMessage: all,
    defaultNewUI: false,
  };
}

const forbidden = () =>
  HttpResponse.json({ summary: 'ERROR #5916: Access denied', errors: [] }, { status: 403 });
const refused = (error: string) =>
  HttpResponse.json({ summary: error, errors: [{ error }] }, { status: 400 });
const notFound = (what: string) =>
  HttpResponse.json({ summary: `Invalid status code structure ("${what}")`, errors: [] }, { status: 404 });

function itemsOf(p: MockProduction): ProductionItem[] {
  return p.hosts.map((h, i) => ({
    name: h.name,
    isMissingClass: 0,
    type: h.type,
    enabled: h.enabled ?? 1,
    itemId: String(i + 1),
    classname: h.classname,
    category: h.category,
    comment: h.comment,
    port: h.port ?? '',
    adapterClassName: '',
    ipaddress: h.ipaddress ?? '',
    poolsize: h.poolsize,
    status:
      !p.running || h.stopped
        ? h.enabled === 0
          ? 'disabled'
          : 'stopped'
        : h.enabled === 0
          ? 'disabled'
          : h.status,
    hasDups: 0,
  }));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const wallClock = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const utc = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;

/** As on IRIS (EnsPortal.Utils.ItemEventLog(host, ..., 0, 50)): a host's log route returns its newest 50. */
const LOG_LIMIT = 50;

/**
 * The host's event log, newest first: its start, its work, and for a host in error a failure every few
 * minutes since then, more than the route returns.
 */
function logOf(p: MockProduction, host: Host, index: number): EventLogEntry[] {
  if (!p.running) return [];
  const rnd = seeded(index * 7919 + p.name.length);
  const started = new Date(Date.now() - 6 * 3_600_000 - index * 1_300);
  const job = String(1400 + index * 3);
  const out: EventLogEntry[] = [];
  let id = (index + 1) * 1000;
  out.push({
    Id: id++,
    TimeLogged: wallClock(started),
    TraceCat: '',
    Type: 'Info',
    Job: job,
    Session: '',
    Source: host.name,
    Method: 'Ens.Job:Start()',
    Stack: '',
    MessageId: 1,
    Text: `ConfigItem '${host.name}' (${host.classname}) started in job ${job}`,
  });
  if (host.error) {
    for (let k = 72; k >= 1; k--) {
      const at = new Date(Date.now() - (k * 5 - rnd() * 2) * 60_000);
      out.push({
        Id: id++,
        TimeLogged: wallClock(at),
        TraceCat: '',
        Type: k % 4 === 0 ? 'Warning' : 'Error',
        Job: job,
        Session: 9000 + index * 50 + k,
        Source: host.name,
        Method: `${host.classname}:OnMessage()`,
        Stack: '',
        MessageId: 20000 + index * 50 + k,
        Text:
          k % 4 === 0 ? `Retrying connection to ${host.ipaddress}:${host.port} (attempt ${k})` : host.error,
      });
    }
  }
  return out.reverse().map((e, i) => ({ ...e, Seq: i + 1 }));
}

/**
 * The last messages the host sent or received, newest first. As on IRIS, `Header` is the body's id
 * (MessageBodyId): a router sends each body it receives on to two targets, so pairs of its rows share one.
 */
function messagesOf(p: MockProduction, host: Host, index: number): HostMessage[] {
  if (!p.running) return [];
  const rnd = seeded(index * 104729 + 17);
  const peers = p.hosts.filter((h) => h !== host && h.name !== 'Ens.Alert');
  const out: HostMessage[] = [];
  for (let k = 0; k < 20; k++) {
    const at = new Date(Date.now() - (k * 37 + Math.floor(rnd() * 30)) * 1000);
    const peer = peers[Math.floor(rnd() * peers.length)];
    const outbound = host.type !== 'operation';
    out.push({
      Date: utc(at),
      Status: host.error && k % 3 === 0 ? 8 : 9,
      Source: outbound ? host.name : peer.name,
      Target: outbound ? peer.name : host.name,
      MessageBodyClassName:
        p.namespace === 'CLINICAL' && host.name.startsWith('FHIR')
          ? 'HS.FHIRServer.Interop.Request'
          : 'EnsLib.HL7.Message',
      Header: String(1500 + index * 40 + (host.type === 'process' ? Math.floor((19 - k) / 2) : 20 - k)),
    });
  }
  return out;
}

const SETTINGS: Omit<ProductionSetting, 'Value'>[] = [
  {
    Name: 'Comment',
    DefaultValue: '',
    ValueSource: 1,
    DataType: '%Library.String',
    Category: 'Info',
    IsAdapter: 'Core',
  },
  {
    Name: 'Category',
    DefaultValue: '',
    ValueSource: 1,
    DataType: '%Library.String',
    Category: 'Info',
    IsAdapter: 'Core',
  },
  {
    Name: 'PoolSize',
    DefaultValue: 1,
    ValueSource: 1,
    DataType: '%Library.Integer',
    Category: 'Basic',
    IsAdapter: 'Core',
  },
  {
    Name: 'Enabled',
    DefaultValue: 1,
    ValueSource: 1,
    DataType: '%Library.Boolean',
    Category: 'Basic',
    IsAdapter: 'Core',
  },
  {
    Name: 'ArchiveIO',
    DefaultValue: 0,
    ValueSource: 3,
    DataType: '%Library.Boolean',
    Category: 'Dev',
    IsAdapter: '',
  },
];

function find(namespace: string, production: string) {
  return PRODUCTIONS.find(
    (p) => p.namespace.toLowerCase() === namespace.toLowerCase() && p.name === production,
  );
}

function hostOf(p: MockProduction, name: string) {
  const index = p.hosts.findIndex((h) => h.name === name);
  return index < 0 ? null : { host: p.hosts[index], index };
}

type Ctx = { account: MockAccount; params: Record<string, string>; request: Request };

/**
 * Authenticate (JWT or Basic, like /api/admin) and require the production read privilege, and for a
 * host's log, messages, queue or jobs the privilege IRIS checks for it (403 InteropAPIInsufficientPerm).
 */
function readable(
  resolver: (ctx: Ctx) => Response | Promise<Response>,
  privilege?: 'readEventLog' | 'readMessages' | 'readQueue' | 'readJobs',
) {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, string | readonly string[] | undefined>;
  }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    const privileges = privilegesOf(account);
    if (!privileges.production?.read || (privilege && !privileges[privilege])) return forbidden();
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) flat[k] = decodeURIComponent(String(v ?? ''));
    return resolver({ account, params: flat, request });
  };
}

const V = '*/api/interop-editors/v7';

const INITIAL = PRODUCTIONS.map((p) => p.running);

/** Ens.Director's state and production of a namespace, as GetProductionStatus reports them. */
function statusOf(namespace: string) {
  const running = PRODUCTIONS.find((q) => q.namespace === namespace && q.running);
  const suspended = PRODUCTIONS.find((q) => q.namespace === namespace && q.suspended);
  if (running) return { State: running.troubled ? 4 : 1, ProdRunning: running.name };
  return suspended ? { State: 3, ProdRunning: suspended.name } : { State: 2, ProdRunning: '' };
}

/** Back to the seeded states and privileges (tests). */
export function resetInteropMock() {
  PRODUCTIONS.forEach((p, i) => {
    p.running = INITIAL[i];
    p.troubled = false;
    p.suspended = false;
    for (const h of p.hosts) h.stopped = false;
  });
  overrides.clear();
}

/** Leave a running production troubled, as IRIS finds it after stopping without stopping it (tests). */
export function troubleInteropMock(namespace: string, production: string) {
  const p = find(namespace, production);
  if (p?.running) p.troubled = true;
}

export const interopHandlers = [
  // Start, stop or recover a production, or start or stop one host (hostID, the item id). As on IRIS
  // (%Api.InteropEditors.v4.impl), either needs both run privileges, and the answer is {"Success":1}
  // whatever the state says: anything but start stops a host, and a production only changes for start,
  // stop or recover. As Ens.Director does, start refuses while a production runs or is troubled, or
  // while another is suspended; stop stops whichever production runs, whatever the URL names, and does
  // nothing to a troubled one; recover leaves a troubled one suspended.
  http.post(`${V}/:ns/productions/production/state/:production`, async ({ request, params }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const hostId = url.searchParams.get('hostID');
    if (!state)
      return HttpResponse.json(
        {
          errors: [{ code: 8727, error: 'ERROR #8727: Parameter required: state.' }],
          summary: 'ERROR #8727: Parameter required: state.',
        },
        { status: 400 },
      );
    const allowed = privilegesOf(account).production;
    if (!allowed?.run || !allowed.runItem) return forbidden();
    const p = find(String(params.ns), decodeURIComponent(String(params.production)));
    if (!p) return notFound('Cannot open production');
    const running = PRODUCTIONS.find((q) => q.namespace === p.namespace && q.running);
    const suspended = PRODUCTIONS.find((q) => q.namespace === p.namespace && q.suspended);
    if (hostId) {
      const host = p.hosts[Number(hostId) - 1];
      if (host && p.running) host.stopped = state !== 'start';
    } else if (state === 'start') {
      if (running?.troubled)
        return refused(
          `ERROR <Ens>ErrProductionNotShutdownCleanly: Production '${running.name}' was not shut down cleanly`,
        );
      if (running)
        return refused(
          `ERROR <Ens>ErrProductionAlreadyRunning: Production '${running.name}' is already running`,
        );
      if (suspended && suspended !== p)
        return refused(
          `ERROR <Ens>ErrProductionSuspendedMismatch: Production '${suspended.name}' is suspended`,
        );
      Object.assign(p, { running: true, suspended: false });
      for (const h of p.hosts) h.stopped = false;
    } else if (state === 'stop') {
      if (running && !running.troubled) running.running = false;
    } else if (state === 'recover') {
      if (running?.troubled) Object.assign(running, { running: false, troubled: false, suspended: true });
    }
    return HttpResponse.json({ Success: 1 });
  }),
  http.get('*/api/interop-editors/info', ({ request }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    const privileges = privilegesOf(account);
    const names = privileges.production?.read ? [...new Set(PRODUCTIONS.map((p) => p.namespace))] : [];
    return HttpResponse.json({
      username: account.username,
      serverVersion:
        'IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2 (Build 221U) Fri Jun 26 2026 09:58:52 EDT',
      systemMode: '',
      language: 'en',
      apiVersion: 7,
      namespaces: names.map((name) => ({
        name,
        portalPath: `/csp/${name.toLowerCase()}/`,
        sourceControlClass: '',
      })),
      product: 'iris',
      privileges,
    });
  }),
  http.get(
    `${V}/:ns/productions`,
    readable(({ params }) =>
      HttpResponse.json({
        productions: PRODUCTIONS.filter((p) => p.namespace.toLowerCase() === params.ns.toLowerCase()).map(
          (p) => p.name,
        ),
      }),
    ),
  ),
  http.get(
    `${V}/:ns/productions/status`,
    readable(({ params }) => {
      const p = PRODUCTIONS.find((q) => q.namespace.toLowerCase() === params.ns.toLowerCase());
      return HttpResponse.json(p ? statusOf(p.namespace) : { State: 2, ProdRunning: '' });
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production`,
    readable(({ account, params }) => {
      const p = find(params.ns, params.production);
      if (!p) return notFound('Cannot open production');
      return HttpResponse.json({
        children: [],
        ...statusOf(p.namespace),
        Settings: [],
        Items: itemsOf(p),
        Categories: [...new Set(p.hosts.flatMap((h) => h.category.split(',').filter(Boolean)))].sort(),
        // As v3.impl sets it: an account that may not edit productions reads every one as read-only.
        ReadOnly: privilegesOf(account).production?.write ? 0 : 1,
      });
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production/connections`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      if (!p) return notFound('Cannot open production');
      const items = itemsOf(p);
      const id = (name: string) => items.find((i) => i.name === name)?.itemId ?? '';
      // Services send to the routers of their category, routers to the operations of theirs.
      return HttpResponse.json(
        p.hosts.map((h) => {
          const cats = h.category.split(',').filter(Boolean);
          const shares = (o: Host) => o !== h && o.category.split(',').some((c) => cats.includes(c));
          const targets =
            h.type === 'service'
              ? p.hosts.filter((o) => o.type === 'process' && shares(o))
              : h.type === 'process'
                ? p.hosts.filter((o) => o.type === 'operation' && shares(o))
                : [];
          const sources =
            h.type === 'process'
              ? p.hosts.filter((o) => o.type === 'service' && shares(o))
              : h.type === 'operation'
                ? p.hosts.filter((o) => o.type === 'process' && shares(o))
                : [];
          return {
            itemId: id(h.name),
            connections: [
              ...(h.type !== 'process' ? [{ itemName: 'Ens.Alert', isTarget: 1, itemId: '' }] : []),
              ...targets.map((o) => ({ itemName: o.name, isTarget: 1, itemId: Number(id(o.name)) })),
              ...sources.map((o) => ({ itemName: o.name, isTarget: 0, itemId: Number(id(o.name)) })),
            ],
          };
        }),
      );
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production/:host/log`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      const h = p && hostOf(p, params.host);
      if (!p || !h) return HttpResponse.json({});
      const log = logOf(p, h.host, h.index);
      if (!log.length) return HttpResponse.json({});
      const more = log.length > LOG_LIMIT ? [{ Id: 'more...' }] : [];
      return HttpResponse.json({ children: [...log.slice(0, LOG_LIMIT), ...more] });
    }, 'readEventLog'),
  ),
  http.get(
    `${V}/:ns/productions/:production/:host/messages`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      const h = p && hostOf(p, params.host);
      return HttpResponse.json({ messages: p && h ? messagesOf(p, h.host, h.index) : [] });
    }, 'readMessages'),
  ),
  // Only the host in error has a queue: what it could not send waits (IRIS answers {} for an empty one).
  http.get(
    `${V}/:ns/productions/:production/:host/queue`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      const h = p && hostOf(p, params.host);
      if (!p || !h || !p.running || !h.host.error) return HttpResponse.json({});
      const waiting = 3;
      const children: QueuedMessage[] = Array.from({ length: waiting }, (_, k) => ({
        QId: `${h.index + 1}:${k + 1}`,
        QCount: waiting,
        HeaderId: String(70000 + k),
        IsRequest: 1,
        TimeCreated: wallClock(new Date(Date.now() - (waiting - k) * 95_000)),
        Source: 'HL7.Router.ORU',
        Target: h.host.name,
        Status: 2,
        Error: 0,
        BPId: '',
        BodyClass: 'EnsLib.HL7.Message',
        Priority: '6',
        Index: String(k + 1),
      }));
      return HttpResponse.json({ children });
    }, 'readQueue'),
  ),
  http.get(
    `${V}/:ns/productions/:production/:host/jobs`,
    readable(() => HttpResponse.json({}), 'readJobs'),
  ),
  // A host's settings by item id (a name answers 404, as on IRIS).
  http.get(
    `${V}/:ns/productions/:production/:item`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      const host = p?.hosts[Number(params.item) - 1];
      if (!p || !host || !/^\d+$/.test(params.item)) return notFound('Cannot open production item');
      const values: Record<string, unknown> = {
        Comment: host.comment,
        Category: host.category,
        PoolSize: host.poolsize,
        Enabled: host.enabled ?? 1,
        ArchiveIO: 0,
      };
      return HttpResponse.json({ children: SETTINGS.map((s) => ({ ...s, Value: values[s.Name] })) });
    }),
  ),
];
