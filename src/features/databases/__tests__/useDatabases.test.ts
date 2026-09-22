import { describe, expect, it } from 'vitest';
import { dirKey, joinDatabases, suggestDirectory } from '../useDatabases';

describe('database directories', () => {
  it('joins a configuration entry to its local database whatever the trailing separator or Windows case', () => {
    const rows = joinDatabases(
      [
        { Name: 'USER', Directory: 'C:\\InterSystems\\IRIS\\mgr\\user\\' },
        { Name: 'APP', Directory: '/usr/irissys/mgr/app' },
      ],
      [
        { Directory: 'c:\\intersystems\\iris\\mgr\\USER', Size: 11 },
        { Directory: '/usr/irissys/mgr/app/', Size: 22 },
      ],
    );
    expect(rows.map((r) => [r.Name, r.SizeMB])).toEqual([
      ['USER', 11],
      ['APP', 22],
    ]);
  });

  it('keeps Unix paths case-sensitive', () => {
    expect(dirKey('/data/User/')).not.toBe(dirKey('/data/user'));
    expect(dirKey('C:\\Data\\User\\')).toBe(dirKey('c:/data/user'));
  });

  it('suggests a directory next to the existing databases, in the instance style', () => {
    expect(suggestDirectory([], 'MyApp', '/usr/irissys/mgr/user/')).toBe('/usr/irissys/mgr/myapp/');
    expect(suggestDirectory(['D:\\IRIS\\mgr\\irislib\\'], 'Hl7')).toBe('D:\\IRIS\\mgr\\hl7\\');
    expect(suggestDirectory([], 'X')).toBeUndefined();
  });
});
