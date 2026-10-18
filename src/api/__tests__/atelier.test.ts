import { beforeEach, describe, expect, it } from 'vitest';
import { fetchAtelierServer, NOTHING_TO_RUN, runSql, SqlError } from '../atelier';
import { basicCredentials } from '../base';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { resetSql } from '@/mocks/sql';
import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useReadOnly } from '@/stores/readOnly';
import { useActivity } from '@/stores/activity';
import { NotSentError } from '@/lib/errors';

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
    await expect(runSql('USER', 'SELECT 1')).rejects.toMatchObject({ status: 403 });
  });
});
