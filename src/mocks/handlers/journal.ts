import { mockDb } from '../db';
import { ok, notFound, requireParam, jsonBody, accepted, filterRows, now, hoursAgo } from '../util';
import { route, OPERATE, JOURNAL, apiBasePath } from '../secure';
import { startAsyncTask } from '../async';

function findFile(request: Request) {
  const file = requireParam(request, 'file');
  return mockDb.journals.find((j) => j.Name === file);
}

function journalRecords(file: string, n: number) {
  const globals = [
    '^Ens.MessageHeaderD',
    '^HL7.Archive',
    '^DICOM.StudyD',
    '^MyGlobal',
    '^%SYS("TaskManager")',
    '^dc.ConfigD',
    '^oddDEF',
  ];
  const types = ['SET', 'SET', 'SET', 'KILL', 'BEGTRANS', 'COMMIT', 'SET', 'BITSET'];
  const out = [];
  let address = 131072;
  for (let i = 0; i < n; i++) {
    const type = types[i % types.length];
    const g = globals[(i * 7) % globals.length];
    out.push({
      Address: address,
      TypeName: type,
      ExtTypeName: type,
      PrevAddress: address - 64,
      NextAddress: address + 64,
      TimeStamp: hoursAgo(n - i),
      InTransaction: i % 4 !== 0,
      ProcessID: String(5400 + (i % 9)),
      JobID: 5400 + (i % 9),
      RemoteSystemID: 0,
      ECPSystemID: null,
      GlobalNode: type === 'SET' || type === 'KILL' ? `${g}(${1000 + i})` : '',
      Database: file.includes('journal') ? '/usr/irissys/mgr/interop/' : '',
      NewValue: type === 'SET' ? `value-${i}` : '',
      OldValue: type === 'SET' && i % 3 === 0 ? `value-${i - 1}` : '',
    });
    address += 64;
  }
  return out;
}

export const journalHandlers = [
  route('get', '/v2/journal/files', OPERATE, ({ request }) =>
    ok(filterRows([...mockDb.journals].reverse() as unknown as Record<string, unknown>[], request)),
  ),

  route('get', '/v2/journal/file', OPERATE, ({ request }) => {
    const f = findFile(request);
    if (!f) return notFound('Journal file');
    const idx = mockDb.journals.indexOf(f);
    return ok({
      FirstRecordAddress: '131072',
      LastRecordAddress: String(f.DataSize),
      Databases: [
        '/usr/irissys/mgr/',
        '/usr/irissys/mgr/user/',
        '/usr/irissys/mgr/interop/',
        '/usr/irissys/mgr/clinical/',
      ].map((DatabasePathOrAlias, SFN) => ({ SFN, DatabasePathOrAlias })),
      ClusterStartTime: '',
      End: f.DataSize,
      FileCount: mockDb.journals.length,
      MaxSize: 1024 * 1024 * 1024,
      MinTransFileCount: 1,
      MinTransFileIndex: idx,
      FileGUID: `JRN-${idx}-${f.Name.slice(-12).replace(/\W/g, '')}`,
      CreationTime: f.CreationTime,
      EncryptionKeyID: '',
      MirrorInfo: {},
      PrevFile: idx > 0 ? { Name: mockDb.journals[idx - 1].Name } : {},
      NextFile: idx < mockDb.journals.length - 1 ? { Name: mockDb.journals[idx + 1].Name } : {},
    });
  }),

  route('post', '/v2/journal/file/integrity-check', OPERATE, ({ request, account }) => {
    const f = findFile(request);
    if (!f) return notFound('Journal file');
    const id = startAsyncTask({
      name: `POST /v2/journal/file/integrity-check ${f.Name}`,
      owner: account.username,
      console: [`Checking ${f.Name}`, 'Reading header…', 'Scanning records…', 'Journal file is intact'],
      result: { Status: 'Completed', Errors: 0 },
    });
    return accepted(id, apiBasePath(request));
  }),

  route('post', '/v2/journal/file/records', OPERATE, ({ request, account }) => {
    const f = findFile(request);
    if (!f) return notFound('Journal file');
    // IRIS 2026.2 returns half the maxRows it is given (default 1000 → 500); the file here holds 600.
    const max = Number(new URL(request.url).searchParams.get('maxRows') ?? 1000) || 1000;
    const id = startAsyncTask({
      name: `POST /v2/journal/file/records ${f.Name}`,
      owner: account.username,
      console: [`Reading ${f.Name}`],
      result: journalRecords(f.Name, Math.min(Math.floor(max / 2), 600)),
      tickMs: 400,
    });
    return accepted(id, apiBasePath(request));
  }),

  route('get', '/v2/journal/file/record', OPERATE, ({ request }) => {
    const f = findFile(request);
    if (!f) return notFound('Journal file');
    const addr = Number(new URL(request.url).searchParams.get('address') ?? 131072);
    const rec = journalRecords(f.Name, 60).find((r) => r.Address === addr) ?? journalRecords(f.Name, 1)[0];
    return ok(rec);
  }),

  route('get', '/v2/journal/settings', JOURNAL, () => ok(mockDb.journalSettings)),

  route('put', '/v2/journal/settings', JOURNAL, async ({ request }) => {
    const body = await jsonBody<Record<string, unknown>>(request);
    Object.assign(mockDb.journalSettings, body);
    return ok({}, { summary: 'Journal settings updated' });
  }),

  route('post', '/v2/journal/switch-file', OPERATE, () => {
    const last = mockDb.journals[mockDb.journals.length - 1];
    const [stamp, seq] = last.Name.split('/').pop()!.split('.');
    const next = `${last.Name.slice(0, last.Name.lastIndexOf('/') + 1)}${stamp}.${String(Number(seq) + 1).padStart(3, '0')}`;
    last.Reason = 'journal switch requested';
    mockDb.journals.push({ Name: next, Size: 65536, CreationTime: now(), Reason: '', DataSize: 32768 });
    return ok({ NewFile: next }, { summary: `Switched to ${next}` });
  }),

  route('post', '/v2/journal/switch-dir', OPERATE, () => {
    const dir = String(mockDb.journalSettings.AlternateDirectory);
    mockDb.journalSettings.CurrentDirectory = dir;
    return ok({}, { summary: `Journal directory switched to ${dir}` });
  }),
];
