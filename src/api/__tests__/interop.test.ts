import { beforeEach, describe, expect, it } from 'vitest';
import {
  categoriesOf,
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
  hostErrors,
  hostStatus,
  messageStatus,
  productionState,
  utcInstant,
  type EventLogEntry,
  type ProductionItem,
} from '../interop';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
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
    const r = hostErrors(log, toMs('2026-10-17 01:00:00.000'), toMs);
    expect(r.count).toBe(2);
    expect(r.last?.Text).toBe('newest');
    expect(hostErrors([], 0, toMs)).toEqual({ count: 0, last: undefined });
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
    expect(log.some((e) => e.Type === 'Error' && /6059/.test(e.Text))).toBe(true);
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
});
