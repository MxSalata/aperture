/**
 * The demo's SQL, behind the mock of Atelier's query action (`handlers/atelier.ts`): a small evaluator
 * over a few tables per namespace, so a statement typed in the demo really runs, changes included (in
 * memory, until the demo restarts). An SQL engine that compiles queries to JavaScript would break the
 * portal's Content-Security-Policy (no `unsafe-eval`), and the demo runs inside the real portal.
 *
 * It reads the subset the screen and a visitor need, in IRIS's dialect:
 *   SELECT [TOP n] * | expr [AS alias], ... [FROM [schema.]table]
 *          [WHERE cond [AND|OR cond]...] [GROUP BY col, ...] [ORDER BY col [ASC|DESC], ...]
 *          (expr: a column, a literal, COUNT(*), COUNT/SUM/AVG/MIN/MAX(col);
 *           cond: col =, <>, !=, <, <=, >, >=, [NOT] LIKE, %STARTSWITH a value, col IS [NOT] NULL)
 *   INSERT INTO t [(cols)] VALUES (...), ...    UPDATE t SET col = value, ... [WHERE ...]
 *   DELETE FROM t [WHERE ...]    CREATE TABLE s.t (col TYPE, ...)    DROP TABLE s.t    EXPLAIN SELECT ...
 * Values are literals or `?` parameters. An unqualified table is in SQLUser. INFORMATION_SCHEMA
 * (SCHEMATA, TABLES, COLUMNS, CURRENT_STATEMENTS, STATEMENTS) is built from the tables as they are.
 * Errors carry the SQLCODE IRIS would use: -30 a missing table, -29 a missing field, -1 anything the
 * evaluator cannot read (it says what it reads).
 */
type Row = Record<string, unknown>;
type Column = [name: string, type: string];

interface Table {
  ns: string;
  schema: string;
  name: string;
  columns: Column[];
  rows: Row[];
}

const SEED: Record<string, Record<string, Record<string, { columns: Column[]; rows: unknown[][] }>>> = {
  USER: {
    Sample: {
      Person: {
        columns: [
          ['ID', 'INTEGER'],
          ['Name', 'VARCHAR(50)'],
          ['DOB', 'DATE'],
          ['City', 'VARCHAR(50)'],
          ['Company', 'INTEGER'],
        ],
        rows: [
          [1, 'Ada Lovelace', '1990-12-10', 'London', 1],
          [2, 'Alan Turing', '1985-06-23', 'Manchester', 2],
          [3, 'Grace Hopper', '1979-12-09', 'Leeds', 1],
          [4, 'Edsger Dijkstra', '1982-05-11', 'York', 3],
          [5, 'Barbara Liskov', '1988-11-07', 'Bristol', 2],
          [6, 'Donald Knuth', '1976-01-10', 'Leeds', 3],
          [7, 'Frances Allen', '1992-08-04', 'London', 1],
          [8, 'Ken Thompson', '1983-02-04', 'Glasgow', 2],
        ],
      },
      Company: {
        columns: [
          ['ID', 'INTEGER'],
          ['Name', 'VARCHAR(80)'],
          ['Revenue', 'NUMERIC(12,2)'],
        ],
        rows: [
          [1, 'Northern Analytics', 1250000.5],
          [2, 'Pennine Systems', 830000],
          [3, 'Humber Health Data', 2140000.75],
        ],
      },
    },
  },
  CLINICAL: {
    Clinical: {
      Patient: {
        columns: [
          ['ID', 'INTEGER'],
          ['MRN', 'VARCHAR(20)'],
          ['Name', 'VARCHAR(80)'],
          ['BirthDate', 'DATE'],
          ['Ward', 'VARCHAR(20)'],
        ],
        rows: [
          [1, 'MRN0001', 'Patient One', '1951-03-02', 'WARD-A'],
          [2, 'MRN0002', 'Patient Two', '1968-07-19', 'WARD-B'],
          [3, 'MRN0003', 'Patient Three', '1990-10-30', 'WARD-B'],
          [4, 'MRN0004', 'Patient Four', '2001-01-15', 'WARD-C'],
        ],
      },
      Encounter: {
        columns: [
          ['ID', 'INTEGER'],
          ['Patient', 'INTEGER'],
          ['Admitted', 'TIMESTAMP'],
          ['Discharged', 'TIMESTAMP'],
          ['Ward', 'VARCHAR(20)'],
        ],
        rows: [
          [1, 1, '2026-10-12 09:30:00', '2026-10-15 14:00:00', 'WARD-A'],
          [2, 2, '2026-10-16 22:10:00', null, 'WARD-B'],
          [3, 3, '2026-10-17 07:45:00', null, 'WARD-B'],
        ],
      },
    },
  },
};

const DEFAULT_SCHEMA = 'SQLUser';
const tables: Table[] = [];
const statements: { text: string; ns: string; count: number; total: number; rows: number; first: string }[] =
  [];

export class SqlCode extends Error {
  constructor(
    readonly sqlcode: number,
    message: string,
  ) {
    super(message);
  }
}

const READS =
  'the demo reads SELECT (one table, WHERE, GROUP BY, ORDER BY, TOP, COUNT, SUM, AVG, MIN, MAX), INSERT, UPDATE, DELETE, CREATE TABLE, DROP TABLE and EXPLAIN';
const invalid = (what: string) => new SqlCode(-1, `Invalid SQL statement: ${what} (${READS})`);

/** Back to the seeded tables (the demo's start, and the tests). */
export function resetSql() {
  tables.length = 0;
  statements.length = 0;
  for (const [ns, schemas] of Object.entries(SEED))
    for (const [schema, ts] of Object.entries(schemas))
      for (const [name, t] of Object.entries(ts))
        tables.push({
          ns,
          schema,
          name,
          columns: t.columns,
          rows: t.rows.map((r) => Object.fromEntries(t.columns.map(([c], i) => [c, r[i]]))),
        });
}
resetSql();

// ---- tokens -------------------------------------------------------------------------------------

type Token = { t: 'word' | 'str' | 'num' | 'param' | 'op'; v: string };

function tokenize(sql: string): Token[] {
  const out: Token[] = [];
  const re = /\s+|('(?:[^']|'')*')|(\d+(?:\.\d+)?)|(\?)|(<>|!=|<=|>=|[=<>(),.*;-])|(%?[A-Za-z_][\w%]*)/y;
  let at = 0;
  while (at < sql.length) {
    re.lastIndex = at;
    const m = re.exec(sql);
    if (!m) throw invalid(`cannot read "${sql.slice(at, at + 12)}"`);
    at = re.lastIndex;
    if (m[1]) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2]) out.push({ t: 'num', v: m[2] });
    else if (m[3]) out.push({ t: 'param', v: '?' });
    else if (m[4]) out.push({ t: 'op', v: m[4] });
    else if (m[5]) out.push({ t: 'word', v: m[5] });
  }
  return out;
}

class Cursor {
  i = 0;
  private p = 0;
  constructor(
    readonly tokens: Token[],
    readonly params: unknown[],
  ) {}
  peek(n = 0) {
    return this.tokens[this.i + n];
  }
  is(word: string, n = 0) {
    const t = this.peek(n);
    return !!t && (t.t === 'word' || t.t === 'op') && t.v.toUpperCase() === word;
  }
  eat(word: string) {
    if (this.is(word)) {
      this.i++;
      return true;
    }
    return false;
  }
  expect(word: string) {
    if (!this.eat(word)) throw invalid(`${word} expected${this.peek() ? ` before "${this.peek()!.v}"` : ''}`);
  }
  name(): string {
    const t = this.tokens[this.i++];
    if (!t || t.t !== 'word') throw invalid(`a name expected${t ? `, found "${t.v}"` : ''}`);
    return t.v;
  }
  value(): unknown {
    const t = this.tokens[this.i++];
    if (!t) throw invalid('a value expected');
    if (t.t === 'str') return t.v;
    if (t.t === 'num') return Number(t.v);
    if (t.t === 'param') return this.params[this.p++] ?? null;
    if (t.t === 'word' && t.v.toUpperCase() === 'NULL') return null;
    if (t.t === 'op' && t.v === '-' && this.peek()?.t === 'num') return -Number(this.tokens[this.i++].v);
    throw invalid(`a value expected, found "${t.v}"`);
  }
  done() {
    this.eat(';');
    if (this.i < this.tokens.length) throw invalid(`unexpected "${this.peek()!.v}"`);
  }
}

// ---- tables -------------------------------------------------------------------------------------

function informationSchema(ns: string, view: string): Table {
  const mine = tables.filter((t) => t.ns === ns);
  const schemas = [...new Set([DEFAULT_SCHEMA, ...mine.map((t) => t.schema)])];
  const make = (columns: Column[], rows: Row[]): Table => ({
    ns,
    schema: 'INFORMATION_SCHEMA',
    name: view,
    columns,
    rows,
  });
  const v = 'VARCHAR(128)';
  switch (view.toUpperCase()) {
    case 'SCHEMATA':
      return make(
        [
          ['CATALOG_NAME', v],
          ['SCHEMA_NAME', v],
          ['SCHEMA_OWNER', v],
        ],
        schemas.map((s) => ({ CATALOG_NAME: null, SCHEMA_NAME: s, SCHEMA_OWNER: '_SYSTEM' })),
      );
    case 'TABLES':
      return make(
        [
          ['TABLE_CATALOG', v],
          ['TABLE_SCHEMA', v],
          ['TABLE_NAME', v],
          ['TABLE_TYPE', 'VARCHAR(16)'],
        ],
        mine.map((t) => ({
          TABLE_CATALOG: null,
          TABLE_SCHEMA: t.schema,
          TABLE_NAME: t.name,
          TABLE_TYPE: 'BASE TABLE',
        })),
      );
    case 'COLUMNS':
      return make(
        [
          ['TABLE_SCHEMA', v],
          ['TABLE_NAME', v],
          ['COLUMN_NAME', v],
          ['ORDINAL_POSITION', 'INTEGER'],
          ['DATA_TYPE', v],
          ['CHARACTER_MAXIMUM_LENGTH', 'INTEGER'],
          ['IS_NULLABLE', 'VARCHAR(3)'],
        ],
        mine.flatMap((t) =>
          t.columns.map(([c, type], i) => ({
            TABLE_SCHEMA: t.schema,
            TABLE_NAME: t.name,
            COLUMN_NAME: c,
            ORDINAL_POSITION: i + 1,
            DATA_TYPE: type.replace(/\(.*$/, '').toLowerCase(),
            CHARACTER_MAXIMUM_LENGTH: /^VARCHAR\((\d+)\)/i.exec(type)
              ? Number(/\((\d+)\)/.exec(type)![1])
              : null,
            IS_NULLABLE: c === 'ID' ? 'NO' : 'YES',
          })),
        ),
      );
    case 'CURRENT_STATEMENTS':
      // As on IRIS, the view has no column with the statement's text.
      return make(
        [
          ['ProcessID', 'VARCHAR(50)'],
          ['UserName', 'VARCHAR(50)'],
          ['Namespace', 'VARCHAR(50)'],
          ['QueryRunType', 'VARCHAR(50)'],
          ['ExecutionStart', 'TIMESTAMP'],
          ['ExecutionDuration', 'NUMERIC(15,6)'],
          ['Status', 'VARCHAR(50)'],
          ['CachedQuery', 'VARCHAR(50)'],
        ],
        [
          {
            ProcessID: '4242',
            UserName: '_SYSTEM',
            Namespace: ns,
            QueryRunType: 'DynamicStatement',
            ExecutionStart: new Date().toISOString().replace('T', ' ').slice(0, 19),
            ExecutionDuration: 0.001,
            Status: 'Running',
            CachedQuery: `%sqlcq.${ns}.cls1`,
          },
        ],
      );
    case 'STATEMENTS':
      return make(
        [
          ['Statement', 'VARCHAR(262144)'],
          ['StatCount', 'INTEGER'],
          ['StatTotal', 'DOUBLE'],
          ['StatAverage', 'DOUBLE'],
          ['StatRowCount', 'INTEGER'],
          ['Frozen', 'INTEGER'],
          ['Timestamp', 'TIMESTAMP'],
        ],
        statements
          .filter((s) => s.ns === ns)
          .map((s) => ({
            Statement: s.text,
            StatCount: s.count,
            StatTotal: Number(s.total.toFixed(6)),
            StatAverage: Number((s.total / s.count).toFixed(6)),
            StatRowCount: s.rows,
            Frozen: 0,
            Timestamp: s.first,
          })),
      );
    default:
      throw new SqlCode(-30, `Table 'INFORMATION_SCHEMA.${view.toUpperCase()}' not found`);
  }
}

/** `[schema.]table` at the cursor. */
function tableName(c: Cursor): { schema: string; name: string } {
  const first = c.name();
  if (c.eat('.')) return { schema: first, name: c.name() };
  return { schema: DEFAULT_SCHEMA, name: first };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function findTable(ns: string, ref: { schema: string; name: string }): Table {
  if (same(ref.schema, 'INFORMATION_SCHEMA')) return informationSchema(ns, ref.name);
  const t = tables.find((x) => x.ns === ns && same(x.schema, ref.schema) && same(x.name, ref.name));
  if (!t) throw new SqlCode(-30, `Table '${ref.schema.toUpperCase()}.${ref.name.toUpperCase()}' not found`);
  return t;
}

function column(t: Table, name: string): Column {
  const c = t.columns.find(([n]) => same(n, name));
  if (!c) throw new SqlCode(-29, `Field '${name.toUpperCase()}' not found in the applicable tables`);
  return c;
}

// ---- conditions ---------------------------------------------------------------------------------

type Cond = (r: Row) => boolean;

function compare(a: unknown, op: string, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const x = typeof a === 'number' && typeof b === 'string' && b !== '' && !isNaN(Number(b)) ? Number(b) : b;
  const l = a as string | number;
  const r = x as string | number;
  switch (op) {
    case '=':
      return l === r || String(l) === String(r);
    case '<>':
    case '!=':
      return String(l) !== String(r);
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    default:
      return l >= r;
  }
}

function like(value: unknown, pattern: string): boolean {
  if (value === null || value === undefined) return false;
  const body = pattern
    .replace(/[.*+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${body}$`, 'is').test(String(value));
}

function condition(c: Cursor, t: Table): Cond {
  let left = term(c, t);
  for (;;) {
    if (c.eat('AND')) {
      const a = left;
      const b = term(c, t);
      left = (r) => a(r) && b(r);
    } else if (c.eat('OR')) {
      const a = left;
      const b = term(c, t);
      left = (r) => a(r) || b(r);
    } else return left;
  }
}

function term(c: Cursor, t: Table): Cond {
  if (c.eat('(')) {
    const inner = condition(c, t);
    c.expect(')');
    return inner;
  }
  const [col] = column(t, c.name());
  if (c.eat('IS')) {
    const not = c.eat('NOT');
    c.expect('NULL');
    return (r) => (r[col] === null || r[col] === undefined) !== not;
  }
  const not = c.eat('NOT');
  if (c.eat('LIKE')) {
    const pattern = String(c.value());
    return (r) => like(r[col], pattern) !== not;
  }
  if (c.eat('%STARTSWITH')) {
    const prefix = String(c.value());
    return (r) => (r[col] !== null && r[col] !== undefined && String(r[col]).startsWith(prefix)) !== not;
  }
  const op = c.peek();
  if (!op || op.t !== 'op' || !['=', '<>', '!=', '<', '<=', '>', '>='].includes(op.v))
    throw invalid('a comparison expected');
  c.i++;
  const v = c.value();
  return (r) => compare(r[col], op.v, v);
}

// ---- statements ---------------------------------------------------------------------------------

interface Item {
  label: string;
  type: string;
  agg?: { fn: string; col?: string };
  col?: string;
  value?: unknown;
}

const CLAUSES = ['WHERE', 'GROUP', 'ORDER'];

/** Numbers as numbers, everything else as text. */
const less = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? a < b : String(a) < String(b);

function select(c: Cursor, ns: string): { columns: Column[]; rows: unknown[][] } {
  let top = Infinity;
  if (c.eat('TOP')) top = Number(c.value());
  const raw: {
    star?: true;
    agg?: { fn: string; col?: string };
    col?: string;
    value?: unknown;
    alias?: string;
  }[] = [];
  do {
    if (c.eat('*')) raw.push({ star: true });
    else if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].some((f) => c.is(f)) && c.is('(', 1)) {
      const fn = c.name().toUpperCase();
      c.expect('(');
      const col = c.eat('*') ? undefined : c.name();
      c.expect(')');
      raw.push({ agg: { fn, col } });
    } else if (c.peek()?.t === 'word' && !c.is('NULL')) raw.push({ col: c.name() });
    else raw.push({ value: c.value() });
    if (c.eat('AS')) raw[raw.length - 1].alias = c.name();
  } while (c.eat(','));
  let t: Table = { ns, schema: '', name: '', columns: [], rows: [{}] };
  if (c.eat('FROM')) {
    t = findTable(ns, tableName(c));
    // A table alias is read and not needed: one table, so every column is its.
    if (c.peek()?.t === 'word' && !CLAUSES.includes(c.peek()!.v.toUpperCase())) c.name();
  }
  const where = c.eat('WHERE') ? condition(c, t) : () => true;
  const groups: string[] = [];
  if (c.eat('GROUP')) {
    c.expect('BY');
    do groups.push(column(t, c.name())[0]);
    while (c.eat(','));
  }
  const order: { key: string; desc: boolean }[] = [];
  if (c.eat('ORDER')) {
    c.expect('BY');
    do {
      const key = c.name();
      const desc = c.eat('DESC');
      if (!desc) c.eat('ASC');
      order.push({ key, desc });
    } while (c.eat(','));
  }
  c.done();

  const items: Item[] = raw.flatMap((x): Item[] => {
    if (x.star) return t.columns.map(([n, type]) => ({ label: n, type, col: n }));
    if (x.agg) {
      const base = x.agg.col ? column(t, x.agg.col) : undefined;
      const type =
        x.agg.fn === 'COUNT' ? 'INTEGER' : x.agg.fn === 'AVG' ? 'DOUBLE' : (base?.[1] ?? 'INTEGER');
      return [{ label: x.alias ?? `Aggregate_${x.agg.fn}`, type, agg: { fn: x.agg.fn, col: base?.[0] } }];
    }
    if (x.col) {
      const [n, type] = column(t, x.col);
      return [{ label: x.alias ?? n, type, col: n }];
    }
    return [
      {
        label: x.alias ?? 'Expression_1',
        type: typeof x.value === 'number' ? 'INTEGER' : 'VARCHAR(255)',
        value: x.value,
      },
    ];
  });

  const kept = t.rows.filter(where);
  const aggregate = (rows: Row[], it: Item): unknown => {
    const vals = it.agg!.col
      ? rows.map((r) => r[it.agg!.col!]).filter((v) => v !== null && v !== undefined)
      : rows;
    const nums = vals.map(Number);
    const sum = nums.reduce((a, b) => a + b, 0);
    switch (it.agg!.fn) {
      case 'COUNT':
        return vals.length;
      case 'SUM':
        return sum;
      case 'AVG':
        return nums.length ? sum / nums.length : null;
      case 'MIN':
        return vals.length ? vals.reduce((x, y) => (less(y, x) ? y : x)) : null;
      default:
        return vals.length ? vals.reduce((x, y) => (less(x, y) ? y : x)) : null;
    }
  };
  let out: { values: Row; source?: Row }[];
  if (groups.length || items.some((i) => i.agg)) {
    const buckets = new Map<string, Row[]>();
    for (const r of kept) {
      const key = JSON.stringify(groups.map((g) => r[g]));
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    if (!groups.length && !buckets.size) buckets.set('[]', []);
    out = [...buckets.values()].map((rows) => ({
      values: Object.fromEntries(
        items.map((it) => [it.label, it.agg ? aggregate(rows, it) : it.col ? rows[0]?.[it.col] : it.value]),
      ),
      source: rows[0],
    }));
  } else
    out = kept.map((r) => ({
      values: Object.fromEntries(items.map((it) => [it.label, it.col ? r[it.col] : it.value])),
      source: r,
    }));

  if (order.length) {
    const keys = order.map((o) => {
      const label = items.find((i) => same(i.label, o.key))?.label;
      return { ...o, label, col: label ? undefined : column(t, o.key)[0] };
    });
    out.sort((a, b) => {
      for (const k of keys) {
        const x = k.label ? a.values[k.label] : a.source?.[k.col!];
        const y = k.label ? b.values[k.label] : b.source?.[k.col!];
        if (x === y) continue;
        if (x === null || x === undefined) return k.desc ? 1 : -1;
        if (y === null || y === undefined) return k.desc ? -1 : 1;
        return ((x as string | number) < (y as string | number) ? -1 : 1) * (k.desc ? -1 : 1);
      }
      return 0;
    });
  }
  return {
    columns: items.map((i) => [i.label, i.type]),
    rows: out.slice(0, top).map((o) => items.map((i) => o.values[i.label] ?? null)),
  };
}

function change(c: Cursor, ns: string, verb: string): number {
  if (verb === 'INSERT') {
    c.expect('INTO');
    const t = findTable(ns, tableName(c));
    let cols = t.columns.map(([n]) => n);
    if (c.eat('(')) {
      cols = [];
      do cols.push(column(t, c.name())[0]);
      while (c.eat(','));
      c.expect(')');
    }
    c.expect('VALUES');
    let n = 0;
    do {
      c.expect('(');
      const vals: unknown[] = [];
      do vals.push(c.value());
      while (c.eat(','));
      c.expect(')');
      if (vals.length !== cols.length)
        throw new SqlCode(-116, 'Cardinality mismatch between the field list and the values');
      const row: Row = Object.fromEntries(t.columns.map(([k]) => [k, null]));
      cols.forEach((k, i) => (row[k] = vals[i]));
      if (t.columns.some(([k]) => k === 'ID') && (row.ID === null || row.ID === undefined))
        row.ID = Math.max(0, ...t.rows.map((r) => Number(r.ID) || 0)) + 1;
      t.rows.push(row);
      n++;
    } while (c.eat(','));
    c.done();
    return n;
  }
  if (verb === 'UPDATE') {
    const t = findTable(ns, tableName(c));
    c.expect('SET');
    const sets: [string, unknown][] = [];
    do {
      const col = column(t, c.name())[0];
      c.expect('=');
      sets.push([col, c.value()]);
    } while (c.eat(','));
    const where = c.eat('WHERE') ? condition(c, t) : () => true;
    c.done();
    let n = 0;
    for (const r of t.rows)
      if (where(r)) {
        for (const [k, v] of sets) r[k] = v;
        n++;
      }
    return n;
  }
  if (verb === 'DELETE') {
    c.expect('FROM');
    const t = findTable(ns, tableName(c));
    const where = c.eat('WHERE') ? condition(c, t) : () => true;
    c.done();
    const before = t.rows.length;
    t.rows = t.rows.filter((r) => !where(r));
    return before - t.rows.length;
  }
  if (verb === 'CREATE') {
    c.expect('TABLE');
    const ref = tableName(c);
    if (tables.some((x) => x.ns === ns && same(x.schema, ref.schema) && same(x.name, ref.name)))
      throw new SqlCode(-201, `Table '${ref.schema}.${ref.name}' already exists`);
    c.expect('(');
    const columns: Column[] = [];
    do {
      const name = c.name();
      let type = c.name().toUpperCase();
      if (c.eat('(')) {
        const size: unknown[] = [];
        do size.push(c.value());
        while (c.eat(','));
        c.expect(')');
        type += `(${size.join(',')})`;
      }
      columns.push([name, type]);
    } while (c.eat(','));
    c.expect(')');
    c.done();
    tables.push({ ns, schema: ref.schema, name: ref.name, columns, rows: [] });
    return 0;
  }
  // DROP
  c.expect('TABLE');
  const t = findTable(ns, tableName(c));
  c.done();
  tables.splice(tables.indexOf(t), 1);
  return 0;
}

function plan(sql: string): string {
  const refs = [...sql.matchAll(/\bFROM\s+([\w.]+)/gi)].map((m) =>
    m[1].includes('.') ? m[1] : `${DEFAULT_SCHEMA}.${m[1]}`,
  );
  return [
    '<plans>',
    ' <plan>',
    '   SQL:',
    `    ${sql.replace(/\s+/g, ' ').trim()}`,
    '   ',
    `   Cost: ${100 + refs.length * 1200}`,
    '   ',
    '   Module-FIRST:',
    ...refs.flatMap((t) => [
      `     Read master map ${t}.IDKEY, looping on ID.`,
      '     For each row:',
      '         Output the row.',
    ]),
    ' </plan>',
    '</plans>',
  ].join('\r\n');
}

/** Run one statement: the first result set's columns and rows; a change answers none, as on IRIS. */
export function runStatement(
  ns: string,
  sql: string,
  parameters: unknown[],
  max: number,
): { columns: { name: string; type: string }[]; rows: unknown[][] } {
  const text = sql.trim().replace(/;\s*$/, '');
  const started = performance.now();
  const c = new Cursor(tokenize(text), parameters);
  const verb = c.peek()?.v.toUpperCase() ?? '';
  let answer: { columns: Column[]; rows: unknown[][] } = { columns: [], rows: [] };
  let count = 0;
  if (verb === 'EXPLAIN') {
    c.i++;
    if (!c.eat('SELECT')) throw invalid('EXPLAIN takes a SELECT');
    // Read it, so an EXPLAIN of a missing table fails as IRIS's does.
    select(c, ns);
    answer = { columns: [['Plan', 'VARCHAR(50)']], rows: [[plan(text.replace(/^EXPLAIN\s+/i, ''))]] };
  } else if (verb === 'SELECT') {
    c.i++;
    answer = select(c, ns);
    count = answer.rows.length;
  } else if (['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'].includes(verb)) {
    c.i++;
    count = change(c, ns, verb);
  } else throw invalid(verb ? `${verb} is not one of them` : 'empty');
  const elapsed = (performance.now() - started) / 1000;
  const seen = statements.find((s) => s.ns === ns && s.text === text);
  if (seen) {
    seen.count++;
    seen.total += elapsed;
    seen.rows += count;
  } else
    statements.push({
      text,
      ns,
      count: 1,
      total: elapsed,
      rows: count,
      first: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
  return { columns: answer.columns.map(([name, type]) => ({ name, type })), rows: answer.rows.slice(0, max) };
}
