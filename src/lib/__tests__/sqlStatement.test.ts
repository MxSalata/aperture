import { describe, expect, it } from 'vitest';
import { classifyStatement, placeholders, quoteIdentifier, stripSql } from '../sqlStatement';

describe('what a statement does', () => {
  it('reads with SELECT, EXPLAIN and a CTE that feeds a SELECT', () => {
    expect(classifyStatement('SELECT 1')).toMatchObject({ read: true, keyword: 'SELECT' });
    expect(classifyStatement('  explain select * from t')).toMatchObject({ read: true, keyword: 'EXPLAIN' });
    expect(classifyStatement('WITH x AS (SELECT 1 AS a) SELECT a FROM x')).toMatchObject({ read: true });
  });

  it('changes data with everything else, a CALL and a writing CTE included', () => {
    expect(classifyStatement('DELETE FROM t')).toMatchObject({
      read: false,
      keyword: 'DELETE',
      effect: 'deletes rows',
    });
    expect(classifyStatement('insert or update into t (a) values (1)')).toMatchObject({
      read: false,
      keyword: 'INSERT OR UPDATE',
    });
    expect(classifyStatement('CALL Sample.Purge()')).toMatchObject({ read: false, keyword: 'CALL' });
    expect(classifyStatement('WITH x AS (SELECT 1 AS a) DELETE FROM t')).toMatchObject({
      read: false,
      keyword: 'DELETE',
    });
    expect(classifyStatement('VACUUM')).toMatchObject({ read: false, effect: 'may change data' });
  });

  it('is not fooled by comments or strings', () => {
    expect(classifyStatement("-- DELETE FROM t\nSELECT 'DROP TABLE x' FROM t")).toMatchObject({ read: true });
    expect(classifyStatement('/* SELECT */ DROP TABLE t')).toMatchObject({ read: false, keyword: 'DROP' });
    expect(stripSql("SELECT 'it''s' -- c")).toBe("SELECT ''");
    expect(placeholders("SELECT ? FROM t WHERE a = '?' AND b = ?")).toBe(2);
  });

  it('reads comments, strings and delimited names in one pass, left to right', () => {
    // An apostrophe in a comment opens no string.
    expect(classifyStatement("-- don't\nDELETE FROM t WHERE a = 'x'")).toMatchObject({
      read: false,
      keyword: 'DELETE',
    });
    expect(classifyStatement("/* it's */ UPDATE t SET a = 1")).toMatchObject({ keyword: 'UPDATE' });
    // `--` and `/*` in a string or a delimited name start no comment.
    expect(stripSql('SELECT \'--\' AS a, "/*" FROM t -- c')).toBe('SELECT \'\' AS a, "" FROM t');
    expect(classifyStatement('WITH "DELETE" AS (SELECT 1 AS a) SELECT a FROM "DELETE"')).toMatchObject({
      read: true,
    });
    expect(stripSql('SELECT "a""b", \'c\'\'d\' FROM t')).toBe('SELECT "", \'\' FROM t');
    expect(placeholders('SELECT "?" FROM t /* ? */ WHERE a = ? -- ?')).toBe(1);
    // An unclosed comment or literal runs to the end.
    expect(stripSql('SELECT 1 /* DELETE FROM t')).toBe('SELECT 1');
    expect(stripSql("SELECT 'x -- y")).toBe("SELECT ''");
  });

  it('has nothing to run in an empty text or one of comments only, and it is no read', () => {
    expect(classifyStatement('')).toEqual({ read: false, keyword: '' });
    expect(classifyStatement('  -- just a note\n/* and another */ ')).toEqual({ read: false, keyword: '' });
  });

  it('quotes a name as a delimited identifier, doubling its quotes', () => {
    expect(quoteIdentifier('Person')).toBe('"Person"');
    expect(quoteIdentifier('Order')).toBe('"Order"');
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
  });
});
