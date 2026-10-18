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

/** What IRIS reports for each demo account: the security-only auditor has no interoperability. */
function privilegesOf(account: MockAccount): InteropPrivileges {
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

/** The host's event log, newest first: its start, its work, and for a host in error the failures. */
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
    for (let k = 12; k >= 1; k--) {
      const at = new Date(Date.now() - k * (4 + rnd() * 3) * 60_000);
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

/** The last messages the host sent or received, newest first. */
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
      Header: String(50000 + index * 100 + (20 - k)),
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

/** Authenticate (JWT or Basic, like /api/admin) and require the production read privilege. */
function readable(resolver: (ctx: Ctx) => Response | Promise<Response>) {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, string | readonly string[] | undefined>;
  }) => {
    const account = authenticate(request);
    if (!account) return unauthorized();
    if (!privilegesOf(account).production?.read) return forbidden();
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) flat[k] = decodeURIComponent(String(v ?? ''));
    return resolver({ account, params: flat, request });
  };
}

const V = '*/api/interop-editors/v7';

const INITIAL = PRODUCTIONS.map((p) => p.running);

/** Back to the seeded states (tests). */
export function resetInteropMock() {
  PRODUCTIONS.forEach((p, i) => {
    p.running = INITIAL[i];
    for (const h of p.hosts) h.stopped = false;
  });
}

export const interopHandlers = [
  // Start or stop a production, or one host (hostID, the item id). As on IRIS, the answer is
  // {"Success":1} whatever the state says: anything but start stops a host, and a production only
  // changes for start or stop.
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
    if (!(hostId ? allowed?.runItem : allowed?.run)) return forbidden();
    const p = find(String(params.ns), decodeURIComponent(String(params.production)));
    if (!p) return notFound('Cannot open production');
    if (hostId) {
      const host = p.hosts[Number(hostId) - 1];
      if (host && p.running) host.stopped = state !== 'start';
    } else if (state === 'start' || state === 'stop') {
      for (const q of PRODUCTIONS) if (q.namespace === p.namespace && state === 'start') q.running = false;
      p.running = state === 'start';
      for (const h of p.hosts) h.stopped = false;
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
      const running = PRODUCTIONS.find(
        (p) => p.namespace.toLowerCase() === params.ns.toLowerCase() && p.running,
      );
      return HttpResponse.json({ State: running ? 1 : 2, ProdRunning: running?.name ?? '' });
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      if (!p) return notFound('Cannot open production');
      return HttpResponse.json({
        children: [],
        State: p.running ? 1 : 2,
        ProdRunning: PRODUCTIONS.find((q) => q.namespace === p.namespace && q.running)?.name ?? '',
        Settings: [],
        Items: itemsOf(p),
        Categories: [...new Set(p.hosts.flatMap((h) => h.category.split(',').filter(Boolean)))].sort(),
        ReadOnly: 0,
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
      return HttpResponse.json(log.length ? { children: log } : {});
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production/:host/messages`,
    readable(({ params }) => {
      const p = find(params.ns, params.production);
      const h = p && hostOf(p, params.host);
      return HttpResponse.json({ messages: p && h ? messagesOf(p, h.host, h.index) : [] });
    }),
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
    }),
  ),
  http.get(
    `${V}/:ns/productions/:production/:host/jobs`,
    readable(() => HttpResponse.json({})),
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
