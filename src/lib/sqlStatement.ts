/**
 * What an SQL statement does, judged from its text before it is sent: the SQL explorer asks before
 * anything that may change data, and a read-only tab refuses it. Atelier runs whatever the account's
 * SQL privileges allow, so this is a warning for the person typing, not a control: IRIS decides.
 *
 * Only a statement whose first keyword is SELECT, EXPLAIN or WITH (a common table expression feeding
 * a SELECT) is a read; everything else, a CALL included (a procedure may write), is a change. So is a
 * SELECT that calls a schema-qualified function (`%iKnow_Objects.DeleteDomain(1)`): IRIS runs SqlProc
 * class methods as stored functions, and some write. An unqualified stored function cannot be told
 * apart from a built-in one, so it still counts as a read.
 */
export interface StatementKind {
  read: boolean;
  /**
   * The first keyword, upper case (`SELECT`, `INSERT`, `CREATE`, ...); empty when there is no statement
   * (an empty text, or comments only), which is not a read: nothing is sent.
   */
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
  FUNCTION: 'calls a stored function, which may change data',
  SET: 'changes a setting',
  LOCK: 'locks a table',
  INSERT_OR_UPDATE: 'adds or changes rows',
};

/**
 * The text without comments (`-- ...` and `/* ... *\/`) and without the contents of string literals
 * (`'...'`) and delimited identifiers (`"..."`), read left to right in one pass, so an apostrophe in a
 * comment or `--` in a string hides nothing. An unclosed literal or comment runs to the end.
 */
export function stripSql(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      // A doubled quote inside is the quote itself.
      let j = i + 1;
      while (j < sql.length && (sql[j] !== c || sql[j + 1] === c)) j += sql[j] === c ? 2 : 1;
      out += c + c;
      i = j + 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      out += ' ';
      i = end < 0 ? sql.length : end;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      out += ' ';
      i = end < 0 ? sql.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out.trim();
}

/** A call of `schema.name(` (each part plain or delimited, which `stripSql` leaves as `""`). */
const STORED_FUNCTION = /(?:[A-Za-z_%][\w%]*|"")\s*\.\s*(?:[A-Za-z_%][\w%]*|"")\s*\(/;

export function classifyStatement(sql: string): StatementKind {
  const text = stripSql(sql);
  const words = text.toUpperCase().match(/[A-Z_%]+/g) ?? [];
  const first = words[0] ?? '';
  if (!first) return { read: false, keyword: '' };
  if (first === 'EXPLAIN') return { read: true, keyword: first };
  // A CTE reads unless the statement it feeds writes.
  const writes = first === 'WITH' && words.find((w) => ['INSERT', 'UPDATE', 'DELETE'].includes(w));
  if (writes) return { read: false, keyword: writes, effect: EFFECTS[writes] };
  if (first === 'SELECT' || first === 'WITH')
    return STORED_FUNCTION.test(text)
      ? { read: false, keyword: first, effect: EFFECTS.FUNCTION }
      : { read: true, keyword: first };
  const keyword =
    first === 'INSERT' && words[1] === 'OR' && words[2] === 'UPDATE' ? 'INSERT_OR_UPDATE' : first;
  return {
    read: false,
    keyword: keyword.replace('_OR_', ' OR '),
    effect: EFFECTS[keyword] ?? 'may change data',
  };
}

/** A name as a delimited identifier (`"Sample"."Person"`), so a reserved word or any character is fine. */
export const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** How many `?` placeholders a statement has (outside strings and comments). */
export const placeholders = (sql: string) => (stripSql(sql).match(/\?/g) ?? []).length;
