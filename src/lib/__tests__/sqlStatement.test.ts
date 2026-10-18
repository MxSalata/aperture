import { describe, expect, it } from 'vitest';
import { classifyStatement, placeholders, stripSql } from '../sqlStatement';

describe('what a statement does', () => {
  it('reads with SELECT, EXPLAIN and a CTE that feeds a SELECT', () => {
    expect(classifyStatement('SELECT 1')).toMatchObject({ read: true, keyword: 'SELECT' });
    expect(classifyStatement('  explain select * from t')).toMatchObject({ read: true, keyword: 'EXPLAIN' });
    expect(classifyStatement('WITH x AS (SELECT 1 AS a) SELECT a FROM x')).toMatchObject({ read: true });
    expect(classifyStatement('')).toMatchObject({ read: true, keyword: '' });
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
});
