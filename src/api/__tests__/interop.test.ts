import { beforeEach, describe, expect, it } from 'vitest';
import {
  categoriesOf,
  controlRefusal,
  countByStatus,
  fetchConnections,
  fetchHostLog,
  fetchHostMessages,
  fetchHostQueue,
  fetchHostSettings,
  fetchInteropInfo,
  fetchProduction,
  fetchProductions,
  fetchProductionStatus,
  HOST_LOG_LIMIT,
  hostErrors,
  hostStatus,
  isProductionActive,
  messageStatus,
  productionState,
  setProductionState,
  startRefusal,
  utcInstant,
  type EventLogEntry,
  type ProductionItem,
} from '../interop';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { resetInteropMock, setInteropPrivileges, troubleInteropMock } from '@/mocks/handlers/interop';
import { useActivity } from '@/stores/activity';
import { useReadOnly } from '@/stores/readOnly';
import { NotSentError } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { ApiError } from '@/lib/errors';

const signIn = (username: string, auth: 'jwt' | 'basic' = 'jwt') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth });

const item = (over: Partial<ProductionItem>): ProductionItem => ({
  name: 'H',
  itemId: '1',
  type: 'operation',
  classname: 'X',
  category: '',
  enabled: 1,
  poolsize: 1,
  status: 'ok',
  comment: '',
  ...over,
});

const entry = (over: Partial<EventLogEntry>): EventLogEntry => ({
  Id: 1,
  TimeLogged: '2026-10-18 00:38:25.977',
  Type: 'Info',
  Job: '1',
  Session: '',
  Source: 'H',
  Method: 'M',
  Text: 't',
  MessageId: '',
  ...over,
});

describe('reading what IRIS reports', () => {
  it('names a production state from Ens.Director codes, and a stopped one beside the running one', () => {
    expect(productionState({ State: 1, ProdRunning: 'A' }, 'A')).toBe('Running');
    expect(productionState({ State: 1, ProdRunning: 'A' }, 'B')).toBe('Stopped');
    expect(productionState({ State: 2, ProdRunning: '' }, 'A')).toBe('Stopped');
    expect(productionState({ State: 4, ProdRunning: 'A' }, 'A')).toBe('Troubled');
    expect(productionState({ State: 9, ProdRunning: 'A' }, 'A')).toBe('State 9');
    expect(productionState(undefined, 'A')).toBe('Unknown');
  });

  it('says why Ens.Director would not start a production while another holds the namespace', () => {
    expect(startRefusal({ State: 1, ProdRunning: 'A' }, 'B', 'NS')).toBe(
      'A is running in NS, and IRIS starts no other production until it is stopped',
    );
    expect(startRefusal({ State: 4, ProdRunning: 'A' }, 'B', 'NS')).toMatch(
      /^A is troubled .* until it is recovered$/,
    );
    expect(startRefusal({ State: 3, ProdRunning: 'A' }, 'B', 'NS')).toMatch(
      /^A is suspended .* has run again$/,
    );
    // A suspended production starts again, and with none named any starts.
    expect(startRefusal({ State: 3, ProdRunning: 'A' }, 'A', 'NS')).toBeUndefined();
    expect(startRefusal({ State: 2, ProdRunning: '' }, 'A', 'NS')).toBeUndefined();
    expect(startRefusal(undefined, 'A', 'NS')).toBeUndefined();
  });

  it('counts a troubled or suspended production as the one its namespace names, and no other', () => {
    expect(isProductionActive({ State: 1, ProdRunning: 'A' }, 'A')).toBe(true);
    expect(isProductionActive({ State: 4, ProdRunning: 'A' }, 'A')).toBe(true);
    expect(isProductionActive({ State: 3, ProdRunning: 'A' }, 'A')).toBe(true);
    expect(isProductionActive({ State: 1, ProdRunning: 'A' }, 'B')).toBe(false);
    expect(isProductionActive({ State: 2, ProdRunning: '' }, 'A')).toBe(false);
    expect(isProductionActive(undefined, 'A')).toBe(false);
  });

  it('says why IRIS would refuse a start or stop: both run privileges, and a class that is not read-only', () => {
    const all = { read: true, write: true, run: true, runItem: true };
    expect(controlRefusal(all, 0)).toBeUndefined();
    expect(controlRefusal(undefined, 0)).toBeUndefined();
    expect(controlRefusal({ ...all, runItem: false }, 0)).toMatch(/both run privileges/);
    expect(controlRefusal({ ...all, run: false }, 0)).toMatch(/both run privileges/);
    expect(controlRefusal(all, 1)).toMatch(/read-only/);
    // Without the write privilege IRIS reads every production as read-only, whatever its class.
    expect(controlRefusal({ ...all, write: false }, 1)).toBeUndefined();
  });

  it('labels host statuses, a disabled host whatever its status says', () => {
    expect(hostStatus(item({ status: 'ok' }))).toBe('OK');
    expect(hostStatus(item({ status: 'stopped' }))).toBe('Stopped');
    expect(hostStatus(item({ status: 'ok', enabled: 0 }))).toBe('Disabled');
    expect(hostStatus(item({ status: '' }))).toBe('Unknown');
  });

  it('counts hosts by status, trouble first', () => {
    const counts = countByStatus([
      item({ status: 'ok' }),
      item({ status: 'ok' }),
      item({ enabled: 0 }),
      item({ status: 'error' }),
    ]);
    expect(counts).toEqual([
      { status: 'Error', count: 1 },
      { status: 'OK', count: 2 },
      { status: 'Disabled', count: 1 },
    ]);
  });

  it('counts the errors of an event log in a window, and finds the newest', () => {
    const toMs = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
    const log = [
      entry({ Id: 3, Type: 'Error', TimeLogged: '2026-10-18 00:40:00.000', Text: 'newest' }),
      entry({ Id: 2, Type: 'Warning', TimeLogged: '2026-10-18 00:39:00.000' }),
      entry({ Id: 1, Type: 'Error', TimeLogged: '2026-10-18 00:30:00.000', Text: 'older' }),
      entry({ Id: 0, Type: 'Error', TimeLogged: '2026-10-16 00:30:00.000', Text: 'outside the window' }),
    ];
    const r = hostErrors({ entries: log, more: false }, toMs('2026-10-17 01:00:00.000'), toMs);
    expect(r.count).toBe(2);
    expect(r.atLeast).toBe(false);
    expect(r.last?.Text).toBe('newest');
    expect(hostErrors({ entries: [], more: false }, 0, toMs)).toEqual({
      count: 0,
      atLeast: false,
      last: undefined,
    });
  });

  it('counts a cut-off log as a lower bound only while its oldest entry is inside the window', () => {
    const toMs = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
    const entries = [
      entry({ Id: 2, Type: 'Error', TimeLogged: '2026-10-18 00:40:00.000' }),
      entry({ Id: 1, Type: 'Error', TimeLogged: '2026-10-18 00:30:00.000' }),
    ];
    const inside = hostErrors({ entries, more: true }, toMs('2026-10-17 01:00:00.000'), toMs);
    expect(inside).toMatchObject({ count: 2, atLeast: true });
    const reaches = hostErrors({ entries, more: true }, toMs('2026-10-18 00:35:00.000'), toMs);
    expect(reaches).toMatchObject({ count: 1, atLeast: false });
  });

  it('reads message statuses, categories and UTC message dates', () => {
    expect(messageStatus(9)).toBe('Completed');
    expect(messageStatus(8)).toBe('Error');
    expect(messageStatus(42)).toBe('Status 42');
    expect(categoriesOf(item({ category: 'Lab, Faults,' }))).toEqual(['Lab', 'Faults']);
    expect(utcInstant('2026-10-17 23:38:25.972')).toBe('2026-10-17T23:38:25.972Z');
    expect(utcInstant(undefined)).toBe('');
  });
});

describe('the demo instance', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetInteropMock();
    useReadOnly.getState().setReadOnly(false);
    useActivity.getState().clear();
  });

  it('lists the namespaces and productions with the session token, as IRIS does', async () => {
    await signIn('_SYSTEM');
    expect(useSession.getState().mode).toBe('jwt');
    const info = await fetchInteropInfo();
    expect(info.apiVersion).toBe(7);
    expect(info.namespaces.map((n) => n.name)).toEqual(['INTEROP', 'CLINICAL']);
    expect(info.privileges.production?.read).toBe(true);
    expect(await fetchProductions('INTEROP')).toEqual(['HL7.Production', 'HL7.TestProduction']);
    expect(await fetchProductionStatus('INTEROP')).toEqual({ State: 1, ProdRunning: 'HL7.Production' });
  });

  it('agrees with the dashboard: fifteen hosts in HL7.Production, one of them failing in its event log', async () => {
    await signIn('_SYSTEM');
    const d = await fetchProduction('INTEROP', 'HL7.Production');
    expect(d.Items).toHaveLength(15);
    const failing = d.Items.find((i) => i.name === 'HL7.Out.Results.TCP')!;
    // As on IRIS, a host's status is the outcome of its last message: this one cannot connect at all.
    expect(d.Items.filter((i) => i.status === 'error')).toEqual([failing]);
    const log = await fetchHostLog('INTEROP', 'HL7.Production', failing.name);
    expect(log.entries.some((e) => e.Type === 'Error' && /6059/.test(e.Text))).toBe(true);
    expect((await fetchHostQueue('INTEROP', 'HL7.Production', failing.name)).length).toBe(3);
    expect(await fetchHostQueue('INTEROP', 'HL7.Production', 'HL7.Out.PAS.TCP')).toEqual([]);
    const messages = await fetchHostMessages('INTEROP', 'HL7.Production', failing.name);
    expect(messages[0].Date).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/);
    const settings = await fetchHostSettings('INTEROP', 'HL7.Production', failing.itemId);
    expect(settings.find((s) => s.Name === 'Comment')?.Value).toBe('Results to the EPR');
    const connections = await fetchConnections('INTEROP', 'HL7.Production');
    const router = d.Items.find((i) => i.name === 'HL7.Router.ORU')!;
    const mine = connections.find((c) => c.itemId === router.itemId)!.connections;
    expect(mine.filter((c) => c.isTarget).map((c) => c.itemName)).toContain('HL7.Out.Results.TCP');
  });

  it("returns a host's newest 50 log entries and drops the marker IRIS ends a longer log with", async () => {
    await signIn('_SYSTEM');
    const raw = (await (
      await fetch(
        'http://iris.test/api/interop-editors/v7/INTEROP/productions/HL7.Production/HL7.Out.Results.TCP/log',
        { headers: { Authorization: useSession.getState().authorizationHeader() ?? '' } },
      )
    ).json()) as { children: { Id: unknown }[] };
    expect(raw.children).toHaveLength(HOST_LOG_LIMIT + 1);
    expect(raw.children.at(-1)).toEqual({ Id: 'more...' });
    const busy = await fetchHostLog('INTEROP', 'HL7.Production', 'HL7.Out.Results.TCP');
    expect(busy.entries).toHaveLength(HOST_LOG_LIMIT);
    expect(busy.more).toBe(true);
    expect(busy.entries.every((e) => e.TimeLogged)).toBe(true);
    const quiet = await fetchHostLog('INTEROP', 'HL7.Production', 'HL7.Out.PAS.TCP');
    expect(quiet.more).toBe(false);
    expect(quiet.entries.length).toBeGreaterThan(0);
  });

  it("sends the body id as Header, as IRIS does: a router's rows share one per body it sends on", async () => {
    await signIn('_SYSTEM');
    const routed = await fetchHostMessages('INTEROP', 'HL7.Production', 'HL7.Router.ADT');
    expect(new Set(routed.map((m) => m.Header)).size).toBe(routed.length / 2);
  });

  it("refuses a host's log, messages and queue to an account IRIS does not let read them", async () => {
    setInteropPrivileges('operator', {
      production: { read: true },
      readEventLog: false,
      readMessages: false,
      readQueue: false,
    });
    await signIn('operator');
    for (const read of [fetchHostLog, fetchHostMessages, fetchHostQueue])
      await expect(read('INTEROP', 'HL7.Production', 'HL7.Out.PAS.TCP')).rejects.toMatchObject({
        status: 403,
      });
    expect((await fetchProduction('INTEROP', 'HL7.Production')).Items).toHaveLength(15);
  });

  it('answers a host by name with 404, as IRIS does: its routes take the item id', async () => {
    await signIn('_SYSTEM');
    await expect(fetchHostSettings('INTEROP', 'HL7.Production', 'HL7.Out.PAS.TCP')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('gives the security-only auditor no namespace, and refuses its reads', async () => {
    await signIn('auditor');
    const info = await fetchInteropInfo();
    expect(info.namespaces).toEqual([]);
    expect(info.privileges.production?.read).toBe(false);
    const refused = await fetchProductions('INTEROP').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).status).toBe(403);
  });

  it('works in a Basic session too', async () => {
    await signIn('operator', 'basic');
    expect(useSession.getState().mode).toBe('basic');
    expect(await fetchProductions('CLINICAL')).toEqual(['FHIR.Production']);
  });

  it('stops and starts a host and a production, and records each change', async () => {
    await signIn('_SYSTEM');
    const host = (await fetchProduction('INTEROP', 'HL7.Production')).Items.find(
      (i) => i.name === 'HL7.Out.PAS.TCP',
    )!;
    expect(await setProductionState('INTEROP', 'HL7.Production', 'stop', host.itemId)).toEqual({
      Success: 1,
    });
    const stopped = (await fetchProduction('INTEROP', 'HL7.Production')).Items.find(
      (i) => i.itemId === host.itemId,
    )!;
    expect(hostStatus(stopped)).toBe('Stopped');
    await setProductionState('INTEROP', 'HL7.Production', 'start', host.itemId);
    expect(
      hostStatus(
        (await fetchProduction('INTEROP', 'HL7.Production')).Items.find((i) => i.itemId === host.itemId)!,
      ),
    ).toBe('OK');
    await setProductionState('INTEROP', 'HL7.Production', 'stop');
    expect(await fetchProductionStatus('INTEROP')).toEqual({ State: 2, ProdRunning: '' });
    const recorded = useActivity.getState().entries;
    expect(recorded).toHaveLength(3);
    expect(recorded.map((e) => e.query)).toContain('state=stop');
    expect(recorded.every((e) => e.path.startsWith('/api/interop-editors/v7/INTEROP/'))).toBe(true);
  });

  it('refuses a change in a read-only tab before sending it, and refuses the operator', async () => {
    await signIn('_SYSTEM');
    useReadOnly.getState().setReadOnly(true);
    await expect(setProductionState('INTEROP', 'HL7.Production', 'stop')).rejects.toBeInstanceOf(
      NotSentError,
    );
    expect(await fetchProductionStatus('INTEROP')).toEqual({ State: 1, ProdRunning: 'HL7.Production' });
    useReadOnly.getState().setReadOnly(false);
    await signIn('operator');
    await expect(setProductionState('INTEROP', 'HL7.Production', 'stop')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('wants both run privileges for a production and for a host, and reports read-only without write', async () => {
    setInteropPrivileges('operator', { production: { read: true, run: true, runItem: false } });
    await signIn('operator');
    await expect(setProductionState('INTEROP', 'HL7.Production', 'stop')).rejects.toMatchObject({
      status: 403,
    });
    setInteropPrivileges('operator', { production: { read: true, run: false, runItem: true } });
    await expect(setProductionState('INTEROP', 'HL7.Production', 'stop', '8')).rejects.toMatchObject({
      status: 403,
    });
    expect((await fetchProduction('INTEROP', 'HL7.Production')).ReadOnly).toBe(1);
    await signIn('_SYSTEM');
    expect((await fetchProduction('INTEROP', 'HL7.Production')).ReadOnly).toBe(0);
  });

  it('refuses to start a production while another runs, as Ens.Director does', async () => {
    await signIn('_SYSTEM');
    await expect(setProductionState('INTEROP', 'HL7.TestProduction', 'start')).rejects.toMatchObject({
      status: 400,
    });
    expect(await fetchProductionStatus('INTEROP')).toEqual({ State: 1, ProdRunning: 'HL7.Production' });
  });

  it('recovers a troubled production, which neither starts nor stops, and starts it again', async () => {
    await signIn('_SYSTEM');
    troubleInteropMock('INTEROP', 'HL7.Production');
    const troubled = await fetchProductionStatus('INTEROP');
    expect(troubled).toEqual({ State: 4, ProdRunning: 'HL7.Production' });
    expect(productionState(troubled, 'HL7.Production')).toBe('Troubled');
    await expect(setProductionState('INTEROP', 'HL7.Production', 'start')).rejects.toMatchObject({
      status: 400,
    });
    // StopProduction does nothing unless the production is running.
    await setProductionState('INTEROP', 'HL7.Production', 'stop');
    expect(await fetchProductionStatus('INTEROP')).toEqual(troubled);
    await setProductionState('INTEROP', 'HL7.Production', 'recover');
    const suspended = await fetchProductionStatus('INTEROP');
    expect(productionState(suspended, 'HL7.Production')).toBe('Suspended');
    await expect(setProductionState('INTEROP', 'HL7.TestProduction', 'start')).rejects.toMatchObject({
      status: 400,
    });
    await setProductionState('INTEROP', 'HL7.Production', 'start');
    expect(await fetchProductionStatus('INTEROP')).toEqual({ State: 1, ProdRunning: 'HL7.Production' });
  });
});
