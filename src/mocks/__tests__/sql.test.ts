import { beforeEach, describe, expect, it } from 'vitest';
import { resetSql, runStatement, SqlCode } from '../sql';

const run = (sql: string, params: unknown[] = []) => runStatement('USER', sql, params, 1000);

describe("the demo's SQL", () => {
  beforeEach(() => resetSql());

  it('groups, counts, orders and caps', () => {
    expect(
      run(
        'SELECT City, COUNT(*) AS People FROM Sample.Person GROUP BY City ORDER BY People DESC, City',
      ).rows.slice(0, 2),
    ).toEqual([
      ['Leeds', 2],
      ['London', 2],
    ]);
    expect(run('SELECT TOP 1 Name FROM Sample.Company ORDER BY Revenue DESC').rows).toEqual([
      ['Humber Health Data'],
    ]);
    expect(
      run('SELECT MIN(DOB) AS First, MAX(Name) AS Last, AVG(Company) AS A FROM Sample.Person').columns.map(
        (c) => c.name,
      ),
    ).toEqual(['First', 'Last', 'A']);
    expect(
      run(
        "SELECT Name FROM Sample.Person WHERE City = 'Leeds' OR (City LIKE 'Lon%' AND Company = ?) ORDER BY Name",
        [1],
      ).rows,
    ).toEqual([['Ada Lovelace'], ['Donald Knuth'], ['Frances Allen'], ['Grace Hopper']]);
    expect(run('SELECT 1 AS One').rows).toEqual([[1]]);
  });

  it('inserts with a new ID, updates, deletes and drops', () => {
    run("INSERT INTO Sample.Company (Name, Revenue) VALUES ('Tees Data', 1), ('Wear Labs', 2)");
    expect(run("SELECT ID FROM Sample.Company WHERE Name = 'Wear Labs'").rows).toEqual([[5]]);
    run('DELETE FROM Sample.Company WHERE Revenue < 10');
    expect(run('SELECT COUNT(*) AS n FROM Sample.Company').rows).toEqual([[3]]);
    run('CREATE TABLE Scratch.T (ID INTEGER, Body VARCHAR(20))');
    expect(
      run(
        "SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'T' AND COLUMN_NAME = 'Body'",
      ).rows,
    ).toEqual([['varchar', 20]]);
    run('DROP TABLE Scratch.T');
    expect(() => run('SELECT * FROM Scratch.T')).toThrow(SqlCode);
  });

  it('answers what IRIS would for what it cannot do', () => {
    const code = (sql: string) => {
      try {
        run(sql);
        return 0;
      } catch (e) {
        return (e as SqlCode).sqlcode;
      }
    };
    expect(code('SELECT x FROM Sample.Person')).toBe(-29);
    expect(code('SELECT * FROM Sample.Nope')).toBe(-30);
    expect(code('SELECT * FROM Sample.Person p JOIN Sample.Company c ON 1 = 1')).toBe(-1);
    expect(code('MERGE INTO x')).toBe(-1);
    expect(String(run('EXPLAIN SELECT * FROM Sample.Person').rows[0][0])).toContain('Sample.Person.IDKEY');
  });

  it('refuses more values than the statement has parameters, and any value for an EXPLAIN', () => {
    expect(() => run('SELECT 1 AS One', ['a'])).toThrow(/more parameter values/);
    expect(() => run('EXPLAIN SELECT Name FROM Sample.Person WHERE City = ?', ['Leeds'])).toThrow(
      expect.objectContaining({ sqlcode: -400 }),
    );
    expect(String(run('EXPLAIN SELECT Name FROM Sample.Person WHERE City = ?').rows[0][0])).toContain(
      'Sample.Person',
    );
  });

  it('reads delimited names, whatever their case, and never as keywords', () => {
    expect(run('SELECT TOP 1 "Name" FROM "Sample"."Person" ORDER BY "Name"').rows).toEqual([
      ['Ada Lovelace'],
    ]);
    expect(run('SELECT COUNT(*) AS n FROM "sample"."person"').rows).toEqual([[8]]);
    run('CREATE TABLE Scratch."Order" (ID INTEGER, "Select" VARCHAR(20))');
    run('INSERT INTO Scratch."Order" ("Select") VALUES (\'x\')');
    expect(run('SELECT "Select" FROM Scratch."Order" "Where"').rows).toEqual([['x']]);
  });

  it('compares strings whatever their case and skips comments, as IRIS does', () => {
    expect(run("SELECT COUNT(*) AS n FROM Sample.Person WHERE City = 'leeds'").rows).toEqual([[2]]);
    expect(run("SELECT COUNT(*) AS n FROM Sample.Person WHERE City <> 'LEEDS'").rows).toEqual([[6]]);
    expect(run("SELECT Name FROM Sample.Person WHERE Name %STARTSWITH 'ada'").rows).toEqual([
      ['Ada Lovelace'],
    ]);
    expect(
      run("-- don't mind me\nSELECT /* the name */ Name FROM Sample.Person WHERE ID = 1 -- the first").rows,
    ).toEqual([['Ada Lovelace']]);
  });

  it('compares a number with a value written through a parameter as numbers', () => {
    // The parameter boxes send text, so the demo keeps '40'; IRIS stores the integer.
    run('INSERT INTO Sample.Person (Name, Company) VALUES (?, ?)', ['Zed', '40']);
    expect(run('SELECT Name FROM Sample.Person WHERE Company > 5 AND Company < 100').rows).toEqual([['Zed']]);
    expect(run('SELECT Name FROM Sample.Person WHERE Company = ?', ['40']).rows).toEqual([['Zed']]);
  });
});
