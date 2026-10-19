import { beforeEach, describe, expect, it } from 'vitest';
import { useSqlHistory } from '../sqlHistory';
import { resetInstanceState } from '../session';

const KEY = 'aperture.sql.history';

describe("the SQL explorer's recent statements", () => {
  beforeEach(() => useSqlHistory.getState().clear());

  it('keeps the newest first, once each, in the tab', () => {
    const { add } = useSqlHistory.getState();
    add('SELECT 1');
    add('SELECT 2');
    add('SELECT 1');
    expect(useSqlHistory.getState().statements).toEqual(['SELECT 1', 'SELECT 2']);
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps no statement that may carry a password', () => {
    const { add } = useSqlHistory.getState();
    add("CREATE USER ada IDENTIFIED BY 'secret'");
    add("ALTER USER ada identified  by 'other'");
    add('CREATE USER bob IDENTIFY BY secret');
    add("SET PASSWORD = 'x'");
    expect(useSqlHistory.getState().statements).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('is forgotten at sign-out', () => {
    useSqlHistory.getState().add('SELECT Name FROM Sample.Person');
    resetInstanceState();
    expect(useSqlHistory.getState().statements).toEqual([]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});
