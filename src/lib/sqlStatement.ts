/**
 * What an SQL statement does, judged from its text before it is sent: the SQL explorer asks before
 * anything that may change data, and a read-only tab refuses it. Atelier runs whatever the account's
 * SQL privileges allow, so this is a warning for the person typing, not a control: IRIS decides.
 *
 * Only a statement whose first keyword is SELECT, EXPLAIN or WITH (a common table expression feeding
 * a SELECT) is a read; everything else, a CALL included (a procedure may write), is a change.
 */
export interface StatementKind {
  read: boolean;
  /** The first keyword, upper case (`SELECT`, `INSERT`, `CREATE`, ...); empty for an empty text. */
  keyword: string;
  /** For a change: what it touches, in a few words, for the warning. */
  effect?: string;
}

const EFFECTS: Record<string, string> = {
  INSERT: 'adds rows',
  UPDATE: 'changes rows',
  DELETE: 'deletes rows',
  TRUNCATE: 'deletes every row of a table',
  CREATE: 'creates an object (table, view, index, procedure...)',
  DROP: 'drops an object and, for a table, its data',
  ALTER: 'changes the definition of an object',
  GRANT: 'gives privileges',
  REVOKE: 'takes privileges away',
  CALL: 'runs a stored procedure, which may change data',
  SET: 'changes a setting',
  LOCK: 'locks a table',
  INSERT_OR_UPDATE: 'adds or changes rows',
};

/** The text without comments (`-- ...` and `/* ... *\/`) and without string literals' contents. */
export function stripSql(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim();
}

export function classifyStatement(sql: string): StatementKind {
  const text = stripSql(sql);
  const words = text.toUpperCase().match(/[A-Z_%]+/g) ?? [];
  const first = words[0] ?? '';
  if (!first) return { read: true, keyword: '' };
  if (first === 'SELECT' || first === 'EXPLAIN') return { read: true, keyword: first };
  if (first === 'WITH') {
    // A CTE reads unless the statement it feeds writes.
    const writes = words.find((w) => ['INSERT', 'UPDATE', 'DELETE'].includes(w));
    return writes
      ? { read: false, keyword: writes, effect: EFFECTS[writes] }
      : { read: true, keyword: first };
  }
  const keyword =
    first === 'INSERT' && words[1] === 'OR' && words[2] === 'UPDATE' ? 'INSERT_OR_UPDATE' : first;
  return {
    read: false,
    keyword: keyword.replace('_OR_', ' OR '),
    effect: EFFECTS[keyword] ?? 'may change data',
  };
}

/** How many `?` placeholders a statement has (outside strings and comments). */
export const placeholders = (sql: string) => (stripSql(sql).match(/\?/g) ?? []).length;
