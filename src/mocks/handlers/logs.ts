import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { findAccount } from '../auth';
import { fmtDate, seeded, pick } from '../util';

/**
 * Aperture's log reader (`/api/aperture`, ipm/cls/Aperture/API.cls) as it answers on an
 * instance with the package: a password only (a missing or refused one is a bodiless 401),
 * %Admin_Operate:USE, a catalogue of log files and bounded windows of whole lines, paged
 * backwards by byte offset. The files are generated to look like a container's messages.log,
 * alerts.log and SystemMonitor.log over the days since the mock instance started.
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
const refuse = (status: number, error: string) => HttpResponse.json({ error, status }, { status });

const MGR = '/usr/irissys/mgr/';

/** MM/DD/YY-HH:MM:SS:mmm, the stamp of messages.log, on the instance's wall clock. */
function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)}-${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${p(d.getMilliseconds(), 3)}`;
}

interface LogFile {
  id: string;
  kind: 'messages' | 'alerts' | 'monitor';
  path: string;
  current: boolean;
  modifiedAt: number;
  text: string;
}

const ROUTINE: [number, string, string][] = [
  [0, 'Utility.Event', 'Purging audit database'],
  [0, 'Generic.Event', 'Task Manager: Purge Tasks finished'],
  [0, 'Utility.Event', 'Journal file switched to /usr/irissys/mgr/journal/20260924.003'],
  [0, 'Generic.Event', 'Web Gateway: connection established from 10.0.0.41'],
  [0, 'Utility.Event', 'Database USER expanded by 32MB'],
  [0, 'Utility.Event', 'Ens.MessageHeader purge: 4210 headers, 4210 bodies removed'],
  [1, 'Generic.Event', 'License usage 61% of 20 units'],
  [1, 'Utility.Event', 'Global buffer pool 92% full; consider increasing globals'],
  [1, 'Generic.Event', 'HL7 TCP service HL7.In.ADT: peer closed connection (ADT feed)'],
  [2, 'Generic.Event', 'ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)'],
  [2, 'Utility.Event', 'ERROR <ENSSFTP>: authentication failed for user hl7archive at sftp.lab.local'],
];

/** One messages.log for the instance's lifetime, deterministic for its start time. */
function generateMessages(startedAt: number, lines: number, rnd: () => number, until = Date.now()): string {
  const out: string[] = [];
  // Stamps spread over the file's lifetime, strictly increasing and never later than `until`.
  const span = Math.max(lines * 20_000, until - startedAt - 60_000);
  let t = startedAt;
  const pid = () => 1200 + Math.floor(rnd() * 400);
  out.push('');
  out.push(`*** Recovery started at ${new Date(startedAt).toString().replace(/ GMT.*$/, '')}`);
  out.push(`    Current default directory: ${MGR}`);
  out.push(`    Log file directory: ${MGR}`);
  out.push(`    WIJ file spec: ${MGR}IRIS.WIJ`);
  out.push(`${stamp(t)} (${pid()}) 0 [Utility.Event] Recovery complete`);
  out.push(`${stamp(t + 400)} (${pid()}) 0 [Generic.Event] Starting IRIS`);
  out.push(`${stamp(t + 900)} (${pid()}) 0 [Utility.Event] Private webserver started on 52773`);
  out.push(`${stamp(t + 1300)} (${pid()}) 0 [Utility.Event] Superserver started on 1972`);
  out.push(
    `${stamp(t + 2100)} (${pid()}) 0 [Generic.Event] Ens.Director: production HL7Router started in namespace CLINICAL`,
  );
  for (let i = 0; i < lines; i++) {
    t = startedAt + 5_000 + Math.floor((span * (i + 0.1 + rnd() * 0.8)) / lines);
    const r = rnd();
    const [sev, cat, msg] =
      r < 0.02
        ? ROUTINE[9]
        : r < 0.05
          ? ROUTINE[10]
          : r < 0.2
            ? pick(rnd, ROUTINE.slice(6, 9))
            : pick(rnd, ROUTINE.slice(0, 6));
    out.push(`${stamp(t)} (${pid()}) ${sev} [${cat}] ${msg}`);
    if (sev === 2 && rnd() < 0.5)
      out.push(
        `    at ${cat === 'Generic.Event' ? 'zRunTask+42^%SYS.Task.1' : 'zConnect+18^EnsLib.FTP.SFTPOutboundAdapter.1'}`,
      );
  }
  return `${out.join('\n')}\n`;
}

function generateAlerts(startedAt: number, rnd: () => number): string {
  const out: string[] = [];
  const events = [
    [
      1,
      'Utility.Event',
      'Journal file /usr/irissys/mgr/journal/20260915.002 switched: file size limit reached',
    ],
    [2, 'Generic.Event', 'ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)'],
    [1, 'Generic.Event', 'License usage 61% of 20 units'],
    [2, 'Utility.Event', 'Write daemon has been unable to write for 60 seconds (disk /iris-data 97% full)'],
  ] as const;
  let t = startedAt + 3_600_000;
  for (let i = 0; i < 14; i++) {
    t += 4 * 3_600_000 + Math.floor(rnd() * 6 * 3_600_000);
    if (t > Date.now()) break;
    const [sev, cat, msg] = pick(rnd, events);
    out.push(`${stamp(t)} (${1200 + Math.floor(rnd() * 400)}) ${sev} [${cat}] ${msg}`);
  }
  return `${out.join('\n')}\n`;
}

function generateMonitor(startedAt: number, rnd: () => number): string {
  const out: string[] = [];
  let t = startedAt + 60_000;
  out.push(`${stamp(t)} (${1300 + Math.floor(rnd() * 50)}) 0 [Utility.Event] System Monitor started in %SYS`);
  for (let i = 0; i < 30; i++) {
    t += 8 * 3_600_000 + Math.floor(rnd() * 3_600_000);
    if (t > Date.now()) break;
    const r = rnd();
    out.push(
      r < 0.7
        ? `${stamp(t)} (${1300 + Math.floor(rnd() * 50)}) 0 [Utility.Event] %SYS.Monitor.SystemSensors: CPU 12%, memory 81%, disk /iris-data 63%`
        : `${stamp(t)} (${1300 + Math.floor(rnd() * 50)}) 1 [Utility.Event] %SYS.Monitor.SystemSensors: disk /iris-data above 90% (97%)`,
    );
  }
  return `${out.join('\n')}\n`;
}

let cache: { startedAt: number; files: LogFile[] } | null = null;

function files(): LogFile[] {
  const startedAt = mockDb.startedAt;
  if (cache && cache.startedAt === startedAt) return cache.files;
  const rnd = seeded(20260924);
  const rotatedAt = startedAt - 6 * 86_400_000;
  const list: LogFile[] = [
    {
      id: 'messages.log',
      kind: 'messages',
      path: `${MGR}messages.log`,
      current: true,
      modifiedAt: Date.now() - 90_000,
      text: generateMessages(startedAt, 1500, rnd),
    },
    {
      id: 'alerts.log',
      kind: 'alerts',
      path: `${MGR}alerts.log`,
      current: true,
      modifiedAt: Date.now() - 20 * 3_600_000,
      text: generateAlerts(startedAt, rnd),
    },
    {
      id: 'SystemMonitor.log',
      kind: 'monitor',
      path: `${MGR}SystemMonitor.log`,
      current: true,
      modifiedAt: Date.now() - 2 * 3_600_000,
      text: generateMonitor(startedAt, rnd),
    },
    {
      id: 'messages.old_20260918_101502',
      kind: 'messages',
      path: `${MGR}messages.old_20260918_101502`,
      current: false,
      modifiedAt: rotatedAt,
      text: generateMessages(rotatedAt - 12 * 86_400_000, 1400, seeded(20260918), rotatedAt),
    },
  ];
  cache = { startedAt, files: list };
  return list;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The same window algorithm as Aperture.Logs.WindowPython, over the generated bytes. */
export function windowOf(text: string, before: number, nbytes: number) {
  const data = encoder.encode(text);
  const size = data.length;
  const want = Math.max(1024, Math.min(nbytes || 65536, 262144));
  const end = before > 0 && before <= size ? before : size;
  let start = Math.max(0, end - want);
  let slice = data.subarray(start, end);
  if (start > 0) {
    const cut = slice.indexOf(10);
    if (cut < 0) {
      slice = new Uint8Array();
      start = end;
    } else {
      start += cut + 1;
      slice = slice.subarray(cut + 1);
    }
  }
  const chunk = decoder.decode(slice);
  const lines = chunk.split('\n');
  if (chunk.endsWith('\n')) lines.pop();
  return { size, start, end, lines: lines.map((l) => l.replace(/\r$/, '')), hasMore: start > 0 };
}

const OPERATE = 'Operate';

export const logsHandlers = [
  http.get('*/api/aperture/', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    return HttpResponse.json({
      application: 'Aperture log reader',
      version: '1.0.0',
      readOnly: true,
      resource: '%Admin_Operate:USE',
      routes: ['GET /logs', 'GET /logs/read?file=&before=&bytes='],
      maxBytes: 262144,
    });
  }),
  http.get('*/api/aperture/logs', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    return HttpResponse.json(
      files().map((f) => ({
        id: f.id,
        kind: f.kind,
        path: f.path,
        size: encoder.encode(f.text).length,
        modified: fmtDate(new Date(f.modifiedAt)),
        current: f.current,
      })),
    );
  }),
  http.get('*/api/aperture/logs/read', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    const q = new URL(request.url).searchParams;
    const id = q.get('file') ?? '';
    if (!id) return refuse(400, 'file is required: the id of a catalogued log file (GET /logs)');
    const f = files().find((x) => x.id === id);
    if (!f) return refuse(404, `Not a catalogued log file: ${id}`);
    return HttpResponse.json(
      windowOf(f.text, Number(q.get('before') ?? 0) || 0, Number(q.get('bytes') ?? 0) || 0),
    );
  }),
];
