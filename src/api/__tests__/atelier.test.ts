import { beforeEach, describe, expect, it } from 'vitest';
import { fetchAtelierServer, NOTHING_TO_RUN, runSql, SqlError } from '../atelier';
import { basicCredentials } from '../base';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { resetSql } from '@/mocks/sql';
import { resetInstanceState, useSession } from '@/stores/session';
import { useAtelierAuth } from '@/stores/atelierAuth';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useReadOnly } from '@/stores/readOnly';
import { useActivity } from '@/stores/activity';
import { NotSentError } from '@/lib/errors';
import { server } from '@/mocks/node';

const signIn = (username: string, auth: 'jwt' | 'basic') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth });

describe('SQL through Atelier, on the demo instance', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    resetSql();
    useMgmntAuth.getState().clear();
    useAtelierAuth.getState().clear();
    useReadOnly.getState().setReadOnly(false);
    useActivity.getState().clear();
  });

  it('asks a JWT session for the password, and then runs a query with its column types', async () => {
    await signIn('_SYSTEM', 'jwt');
    await expect(fetchAtelierServer()).rejects.toMatchObject({ status: 401 });
    useMgmntAuth.getState().set(basicCredentials('_SYSTEM', 'SYS'));
    expect((await fetchAtelierServer()).api).toBe(8);
    const r = await runSql(
      'USER',
      'SELECT TOP 2 Name, City FROM Sample.Person WHERE City = ? ORDER BY Name',
      ['Leeds'],
    );
    expect(r.columns).toEqual([
      { name: 'Name', type: 'VARCHAR(50)' },
      { name: 'City', type: 'VARCHAR(50)' },
    ]);
    expect(r.rows).toEqual([
      ['Donald Knuth', 'Leeds'],
      ['Grace Hopper', 'Leeds'],
    ]);
    expect(r.truncated).toBe(false);
  });

  it('reads the information schema, says when rows were cut, and explains', async () => {
    await signIn('_SYSTEM', 'basic');
    const t = await runSql(
      'USER',
      'SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME',
    );
    expect(t.rows).toEqual([
      ['Sample', 'Company'],
      ['Sample', 'Person'],
    ]);
    expect((await runSql('USER', 'SELECT * FROM Sample.Person', [], 3)).truncated).toBe(true);
    const plan = await runSql('USER', 'EXPLAIN SELECT Name FROM Sample.Person');
    expect(String(plan.rows[0][0])).toContain('Read master map Sample.Person');
    expect(
      (await runSql('USER', "SELECT Name FROM Sample.Person WHERE Name %STARTSWITH 'Ada'")).rows,
    ).toEqual([['Ada Lovelace']]);
  });

  it('runs a change, records it, and keeps it for the next query; refuses it in a read-only tab', async () => {
    await signIn('_SYSTEM', 'basic');
    expect((await runSql('USER', "UPDATE Sample.Person SET City = 'Hull' WHERE ID = 1")).rows).toEqual([]);
    expect((await runSql('USER', 'SELECT City FROM Sample.Person WHERE ID = 1')).rows).toEqual([['Hull']]);
    expect(useActivity.getState().entries.map((e) => e.summary)).toEqual(['UPDATE done']);
    await runSql('USER', 'CREATE TABLE Scratch.Note (ID INTEGER, Body VARCHAR(50))');
    expect(
      (
        await runSql(
          'USER',
          "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'Scratch'",
        )
      ).rows,
    ).toEqual([['Note']]);
    useReadOnly.getState().setReadOnly(true);
    await expect(runSql('USER', 'DELETE FROM Sample.Person')).rejects.toBeInstanceOf(NotSentError);
    expect((await runSql('USER', 'SELECT COUNT(*) AS n FROM Sample.Person')).rows).toEqual([[8]]);
    // A comment's apostrophe hides no change.
    await expect(
      runSql('USER', "-- don't\nDELETE FROM Sample.Person WHERE City = 'Hull'"),
    ).rejects.toBeInstanceOf(NotSentError);
  });

  it('keeps no CSP session cookie: every request carries its own credentials', async () => {
    await signIn('_SYSTEM', 'basic');
    const seen: RequestCredentials[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/api/atelier/')) seen.push(request.credentials);
    });
    try {
      await fetchAtelierServer();
      await runSql('USER', 'SELECT 1 AS One');
    } finally {
      server.events.removeAllListeners();
    }
    expect(seen).toEqual(['omit', 'omit']);
  });

  it('sends nothing for a text with no statement in it', async () => {
    await signIn('_SYSTEM', 'basic');
    await expect(runSql('USER', '-- a note')).rejects.toThrow(NOTHING_TO_RUN);
    expect(useActivity.getState().entries).toEqual([]);
  });

  it('reports SQL errors with their SQLCODE, and refuses an account without %Development', async () => {
    await signIn('_SYSTEM', 'basic');
    const e = await runSql('USER', 'SELECT x FROM Sample.Nope').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SqlError);
    expect((e as SqlError).sqlcode).toBe(-30);
    expect((e as SqlError).message).toMatch(/^SQLCODE -30: Table 'SAMPLE.NOPE' not found/);
    await expect(runSql('USER', 'SELEC 1')).rejects.toMatchObject({ sqlcode: -1 });
    await signIn('operator', 'basic');
    await expect(runSql('USER', 'SELECT 1')).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('lacks %Development:USE') as unknown,
    });
  });

  it('keeps the shared password when Atelier refuses it, and does not send it there again', async () => {
    // IRIS answers an account without %Development with a 401, as for a wrong password.
    await signIn('operator', 'jwt');
    const shared = basicCredentials('operator', 'SYS');
    useMgmntAuth.getState().set(shared);
    let sent = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/api/atelier/')) sent++;
    });
    try {
      await expect(fetchAtelierServer()).rejects.toMatchObject({ status: 401 });
      await expect(runSql('USER', 'SELECT 1')).rejects.toMatchObject({ status: 401 });
      await expect(fetchAtelierServer()).rejects.toMatchObject({ status: 401 });
      expect(sent).toBe(1);
      // The log reader, REST services and the Health check still have it.
      expect(useMgmntAuth.getState().basic).toBe(shared);
      expect(useAtelierAuth.getState().refused).toBe(shared);
      // Another password is tried.
      useMgmntAuth.getState().set(basicCredentials('operator', 'other'));
      await expect(fetchAtelierServer()).rejects.toMatchObject({ status: 401 });
      expect(sent).toBe(2);
    } finally {
      server.events.removeAllListeners();
    }
    // Sign-out forgets the refusal.
    resetInstanceState();
    expect(useAtelierAuth.getState().refused).toBeNull();
  });
});
