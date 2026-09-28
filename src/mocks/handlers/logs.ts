import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { findAccount } from '../auth';
import { fmtDate, seeded, pick } from '../util';
import { cosine, vectoriseLogText, VECTOR_DIMS } from '@/lib/logVectors';
import { parseLogLine, parseLogLines } from '@/lib/messagesLog';

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

/**
 * The messages of the generated log, most of them recurring with other numbers, so that
 * "similar entries" finds the same message seen at other times (and not the unrelated ones).
 */
const ROUTINE: [number, string, (rnd: () => number) => string][] = [
  [0, 'Utility.Event', () => 'Purging audit database'],
  [0, 'Generic.Event', () => 'Task Manager: Purge Tasks finished'],
  [
    0,
    'Utility.Event',
    (rnd) =>
      `Journal file switched to /usr/irissys/mgr/journal/2026${pick(rnd, ['0921', '0922', '0923', '0924'])}.${String(1 + Math.floor(rnd() * 9)).padStart(3, '0')}`,
  ],
  [
    0,
    'Generic.Event',
    (rnd) => `Web Gateway: connection established from 10.0.0.${41 + Math.floor(rnd() * 6)}`,
  ],
  [
    0,
    'Utility.Event',
    (rnd) =>
      `Database ${pick(rnd, ['USER', 'CLINICAL', 'IRISAPP'])} expanded by ${pick(rnd, [16, 32, 64, 128])}MB`,
  ],
  [
    0,
    'Utility.Event',
    (rnd) => {
      const n = 200 + Math.floor(rnd() * 6000);
      return `Ens.MessageHeader purge: ${n} headers, ${n} bodies removed`;
    },
  ],
  [1, 'Generic.Event', (rnd) => `License usage ${55 + Math.floor(rnd() * 30)}% of 20 units`],
  [
    1,
    'Utility.Event',
    (rnd) => `Global buffer pool ${88 + Math.floor(rnd() * 10)}% full; consider increasing globals`,
  ],
  [1, 'Generic.Event', () => 'HL7 TCP service HL7.In.ADT: peer closed connection (ADT feed)'],
  [2, 'Generic.Event', () => 'ERROR #5002: SFTP connection refused (task Nightly HL7 archive export)'],
  [2, 'Utility.Event', () => 'ERROR <ENSSFTP>: authentication failed for user hl7archive at sftp.lab.local'],
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
    out.push(`${stamp(t)} (${pid()}) ${sev} [${cat}] ${msg(rnd)}`);
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
  const lines: string[] = [];
  const offsets: number[] = [];
  let from = 0;
  for (let i = 0; i <= slice.length; i++) {
    if (i === slice.length || slice[i] === 10) {
      if (i === slice.length && from === slice.length && slice.length > 0) break; // ended with a newline
      offsets.push(start + from);
      lines.push(decoder.decode(slice.subarray(from, i)).replace(/\r$/, ''));
      from = i + 1;
    }
  }
  return { size, start, end, lines, offsets, hasMore: start > 0 };
}

/**
 * The wording index of the demo: every entry of the messages files with its vector, built on the
 * first refresh (POST /logs/index), like Aperture.LogIndex on an instance. GET /logs/index says
 * "stale" until then, so the screen's "indexing" state shows in the demo too.
 */
interface IndexedEntry {
  file: string;
  offset: number;
  time: string;
  severity: number | null;
  category: string;
  text: string;
  vector: number[];
}
let index: { startedAt: number; entries: IndexedEntry[]; indexedAt: string } | null = null;

/** Each entry of a file with the byte offset of its stamped line and the lines that continued it. */
function entriesOf(
  f: LogFile,
): { offset: number; text: string; time: string; severity: number | null; category: string }[] {
  const lines = f.text.split('\n');
  if (f.text.endsWith('\n')) lines.pop();
  const offsets: number[] = [];
  let position = 0;
  for (const line of lines) {
    offsets.push(position);
    position += encoder.encode(line).length + 1;
  }
  return parseLogLines(lines, offsets)
    .filter((e) => e.offset !== null && e.time)
    .map((e) => ({
      offset: e.offset!,
      text: e.raw,
      time: e.time,
      severity: e.severity,
      category: e.category,
    }));
}

function buildIndex() {
  const startedAt = mockDb.startedAt;
  if (index && index.startedAt === startedAt) return index;
  const entries: IndexedEntry[] = [];
  for (const f of files().filter((x) => x.kind === 'messages'))
    for (const e of entriesOf(f)) entries.push({ file: f.id, ...e, vector: vectoriseLogText(e.text) });
  index = { startedAt, entries, indexedAt: fmtDate(new Date()) };
  return index;
}

const isBuilt = () => !!index && index.startedAt === mockDb.startedAt;

function indexStatus() {
  const messages = files().filter((f) => f.kind === 'messages');
  const built = isBuilt();
  const perFile = messages.map((f) => {
    const size = encoder.encode(f.text).length;
    const lines = built ? index!.entries.filter((e) => e.file === f.id).length : 0;
    return {
      id: f.id,
      current: f.current,
      size,
      indexedTo: built ? size : 0,
      lines,
      indexedAt: built ? index!.indexedAt : '',
      pending: built ? 0 : size,
    };
  });
  const pending = perFile.reduce((a, f) => a + f.pending, 0);
  return {
    files: perFile,
    lines: built ? index!.entries.length : 0,
    stale: pending > 0,
    pendingBytes: pending,
    maxBytesPerCall: 2_097_152,
    maxLinesPerCall: 4000,
    firstTail: 8_388_608,
    dims: VECTOR_DIMS,
    index: 'HNSW',
    distance: 'cosine',
  };
}

/** The entry at a byte offset of a file (any kind), as the instance reads it: 404 when no stamped line starts there. */
function entryAt(f: LogFile, offset: number) {
  const data = encoder.encode(f.text);
  if (offset < 0 || offset >= data.length) return null;
  const rest = decoder.decode(data.subarray(offset, offset + 8192)).split('\n');
  const first = rest[0].replace(/\r$/, '');
  const parsed = parseLogLine(first);
  if (!parsed) return null;
  let text = first;
  for (const line of rest.slice(1, 9)) {
    const clean = line.replace(/\r$/, '');
    if (parseLogLine(clean)) break;
    if (clean.trim()) text += `\n${clean}`;
  }
  return {
    file: f.id,
    offset,
    time: parsed.time,
    severity: parsed.severity,
    category: parsed.category,
    text,
  };
}

const TOPK = 250;
const SAME = 0.9;
export const SIMILARITY_METHOD = 'cosine similarity over hashed words (IRIS Vector Search, HNSW index)';

function similarTo(f: LogFile, offset: number, limit: number) {
  const entry = entryAt(f, offset);
  if (!entry) return null;
  const vector = vectoriseLogText(entry.text);
  // A query reads what is indexed; POST /logs/index builds it, as on an instance.
  const indexed = isBuilt() ? index!.entries : [];
  const rows = indexed
    .map((e) => ({ ...e, score: Math.round(cosine(vector, e.vector) * 10_000) / 10_000 }))
    .sort((a, b) => b.score - a.score || b.time.localeCompare(a.time))
    .slice(0, TOPK)
    .map(({ vector: _v, ...r }) => r);
  const matches = rows.filter((r) => !(r.file === f.id && r.offset === offset)).slice(0, limit);
  const alike = rows.filter((r) => r.score >= SAME);
  const times = alike.map((r) => r.time).sort();
  const seenSelf = rows.some((r) => r.file === f.id && r.offset === offset);
  return {
    entry: { ...entry, template: '' },
    matches,
    summary: {
      similar: alike.length + (seenSelf ? 0 : 1),
      of: rows.length,
      first: times.length ? (times[0] < entry.time ? times[0] : entry.time) : entry.time,
      last: times.length
        ? times[times.length - 1] > entry.time
          ? times[times.length - 1]
          : entry.time
        : entry.time,
      threshold: SAME,
      capped: rows.length >= TOPK && alike.length >= TOPK,
    },
    method: SIMILARITY_METHOD,
  };
}

const OPERATE = 'Operate';

export const logsHandlers = [
  http.get('*/api/aperture/', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    return HttpResponse.json({
      application: 'Aperture log reader',
      version: __APP_VERSION__,
      readerApiVersion: '1.2.0',
      readOnly: true,
      resource: '%Admin_Operate:USE',
      routes: [
        'GET /logs',
        'GET /logs/read?file=&before=&bytes=',
        'GET /logs/index',
        'POST /logs/index',
        'GET /logs/similar?file=&offset=&limit=',
      ],
      maxBytes: 262144,
      similarity: { dims: VECTOR_DIMS, index: 'HNSW', distance: 'cosine', method: 'hashed words' },
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
  http.get('*/api/aperture/logs/index', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    return HttpResponse.json(indexStatus());
  }),
  http.post('*/api/aperture/logs/index', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    const before = indexStatus();
    buildIndex();
    const after = indexStatus();
    return HttpResponse.json({
      files: after.files.map((f, i) => ({
        id: f.id,
        added: f.lines - before.files[i].lines,
        indexedTo: f.indexedTo,
        size: f.size,
        pending: f.pending,
      })),
      lines: after.lines - before.lines,
      indexedAt: after.files[0]?.indexedAt ?? '',
      stale: after.stale,
    });
  }),
  http.get('*/api/aperture/logs/similar', ({ request }) => {
    const account = basicAccount(request);
    if (!account) return unauthorized();
    if (!account.privileges.includes(OPERATE)) return refuse(403, 'Requires %Admin_Operate:USE');
    const q = new URL(request.url).searchParams;
    const id = q.get('file') ?? '';
    const offset = q.get('offset');
    if (!id) return refuse(400, 'file is required: the id of a catalogued log file (GET /logs)');
    if (offset === null || !/^\d+$/.test(offset))
      return refuse(
        400,
        "offset is required: the byte offset of the entry's stamped line (GET /logs/read answers them)",
      );
    const f = files().find((x) => x.id === id);
    if (!f) return refuse(404, `Not a catalogued log file: ${id}`);
    const limit = Math.min(100, Math.max(1, Number(q.get('limit') ?? 20) || 20));
    const answer = similarTo(f, Number(offset), limit);
    if (!answer) return refuse(404, `No stamped entry starts at offset ${offset} of ${id}`);
    return HttpResponse.json(answer);
  }),
];
