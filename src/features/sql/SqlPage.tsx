import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Menu,
  NavLink,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconHistory, IconPlayerPlay, IconRoute } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchAtelierServer, isSystemSchema, runSql, sqlKeys, type SqlResult } from '@/api/atelier';
import { mgmntCredentials } from '@/api/mgmnt';
import { confirmDanger } from '@/components/ConfirmDanger';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { ErrorAlert } from '@/components/ErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { PasswordGate } from '@/components/PasswordGate';
import { classifyStatement, placeholders, quoteIdentifier } from '@/lib/sqlStatement';
import { useAtelierAuth } from '@/stores/atelierAuth';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { useReadOnly } from '@/stores/readOnly';
import { useSession } from '@/stores/session';
import { useSqlHistory } from '@/stores/sqlHistory';

const LIMITS = ['100', '500', '1000', '5000'];

type Row = Record<string, unknown>;

/** A result as table rows: each column by its name (a second column of the same name gets a suffix). */
function asRows(result: SqlResult): { columns: ColumnDef<Row, unknown>[]; rows: Row[] } {
  const ids = result.columns.map((c, i) =>
    result.columns.findIndex((d) => d.name === c.name) === i ? c.name : `${c.name}_${i + 1}`,
  );
  const columns: ColumnDef<Row, unknown>[] = result.columns.map((c, i) => ({
    id: ids[i],
    accessorFn: (r) => r[ids[i]],
    // The SQL type under the name; CSV export names the column by its id, the name.
    header: () => (
      <span>
        {c.name}{' '}
        <Text span size="xs" c="dimmed" fw={400}>
          {c.type}
        </Text>
      </span>
    ),
    cell: (cell) => {
      const v = cell.getValue();
      if (v === null || v === undefined)
        return (
          <Text span size="sm" c="dimmed">
            NULL
          </Text>
        );
      const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return (
        <Text span size="sm" className="mono" title={text.length > 120 ? text : undefined}>
          {text.length > 120 ? `${text.slice(0, 120)}…` : text}
        </Text>
      );
    },
  }));
  return { columns, rows: result.rows.map((r) => Object.fromEntries(ids.map((id, i) => [id, r[i]]))) };
}

/** A fixed query of the catalogue or the diagnostics, as a table. */
function QueryTable({
  ns,
  sql,
  params = [],
  queryKey,
  empty,
  exportName,
  onRow,
}: {
  ns: string;
  sql: string;
  params?: unknown[];
  queryKey: readonly unknown[];
  empty: string;
  exportName: string;
  onRow?: (row: Row) => void;
}) {
  const q = useQuery({ queryKey, queryFn: () => runSql(ns, sql, params, 1000), enabled: !!ns });
  const shaped = useMemo(() => (q.data ? asRows(q.data) : null), [q.data]);
  return (
    <DataTable
      data={shaped?.rows}
      columns={shaped?.columns ?? []}
      loading={q.isPending}
      error={q.error}
      onRowClick={onRow}
      getRowLabel={onRow ? (r) => `Open ${String(Object.values(r)[0])}` : undefined}
      searchable
      exportName={exportName}
      emptyMessage={empty}
      dense
    />
  );
}

export default function SqlPage() {
  const basic = useMgmntAuth((s) => s.basic);
  const refused = useAtelierAuth((s) => s.refused);
  const mode = useSession((s) => s.mode);
  const readOnly = useReadOnly((s) => s.readOnly);
  const credentials = basic ?? mgmntCredentials();
  // A JWT session whose password Atelier refused may give another one; the other screens keep theirs.
  const unlocked = !!credentials && !(mode === 'jwt' && credentials === refused);
  // While the gate shows, a new shared password is the one given on it (see stores/atelierAuth.ts).
  useEffect(() => {
    if (unlocked) return;
    return useMgmntAuth.subscribe((s, prev) => {
      if (s.basic && s.basic !== prev.basic) useAtelierAuth.getState().type(s.basic);
    });
  }, [unlocked]);
  const server = useQuery({
    queryKey: sqlKeys.server,
    queryFn: fetchAtelierServer,
    enabled: unlocked,
    retry: false,
  });
  const [params, setParams] = useSearchParams();
  const namespaces = (server.data?.namespaces ?? []).filter(
    (n) => n !== '%SYS' && !/^HSSYSLOCALTEMP$/.test(n),
  );
  // A namespace the instance does not list (a stale link, a typo) gives way to the default one.
  const asked = params.get('ns');
  const unknownNs = !!asked && !!server.data && !namespaces.includes(asked);
  const ns = asked && !unknownNs ? asked : namespaces.includes('USER') ? 'USER' : (namespaces[0] ?? '');

  const [tab, setTab] = useState<string | null>('query');
  const [sql, setSql] = useState(
    'SELECT TOP 10 TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE\nFROM INFORMATION_SCHEMA.TABLES',
  );
  const [values, setValues] = useState<string[]>([]);
  const [limit, setLimit] = useState('500');
  const history = useSqlHistory((s) => s.statements);
  const remember = useSqlHistory((s) => s.add);
  const [result, setResult] = useState<{
    sql: string;
    ns: string;
    kind: ReturnType<typeof classifyStatement>;
    data: SqlResult;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [system, setSystem] = useState(false);
  const [schema, setSchema] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const qc = useQueryClient();

  const kind = classifyStatement(sql);
  const count = placeholders(sql);
  const shaped = useMemo(() => (result ? asRows(result.data) : null), [result]);

  // Run, Ctrl+Enter, Explain and the catalogue's preview may overlap: only the newest run's answer is shown.
  const latest = useRef(0);
  const execute = async (text: string) => {
    const id = ++latest.current;
    setRunning(true);
    setError(null);
    const k = classifyStatement(text);
    try {
      const data = await runSql(ns, text, values.slice(0, placeholders(text)), Number(limit));
      remember(text);
      // A change may have altered the catalogue.
      if (!k.read) void qc.invalidateQueries({ queryKey: sqlKeys.all });
      if (id === latest.current) setResult({ sql: text, ns, kind: k, data });
    } catch (e) {
      if (id !== latest.current) return;
      setResult(null);
      setError(e);
    } finally {
      if (id === latest.current) setRunning(false);
    }
  };

  // What was chosen or run in one namespace says nothing about another.
  const setNs = (v: string | null) => {
    if (!v) return;
    const next = new URLSearchParams(params);
    next.set('ns', v);
    setParams(next, { replace: true });
    if (v === ns) return;
    latest.current++;
    setRunning(false);
    setResult(null);
    setError(null);
    setSchema(null);
    setTable(null);
  };

  const run = (text = sql) => {
    const k = classifyStatement(text);
    if (!k.keyword) return;
    if (k.read) return void execute(text);
    confirmDanger({
      title: 'Run a statement that changes data',
      message: (
        <Stack gap="xs">
          <Text size="sm">
            This <b>{k.keyword}</b> {k.effect} in <b>{ns}</b>. IRIS runs it with your own SQL privileges, at
            once, and nothing here can undo it.
          </Text>
          <Code block>{text.length > 400 ? `${text.slice(0, 400)}…` : text}</Code>
        </Stack>
      ),
      confirmLabel: `Run ${k.keyword}`,
      color: 'red',
      onConfirm: () => execute(text),
    });
  };

  const preview = (s: string, t: string) => {
    const text = `SELECT TOP 100 * FROM ${quoteIdentifier(s)}.${quoteIdentifier(t)}`;
    setSql(text);
    setTab('query');
    void execute(text);
  };

  if (!unlocked)
    return (
      <>
        <PageHeader
          title="SQL"
          description="Run SQL in any namespace as yourself, through the Atelier API."
        />
        {credentials ? (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="sm" maw={520}>
            The instance refused the password for /api/atelier: a wrong password, or the account lacks
            %Development:USE. It is not sent there again; the other screens keep it.
          </Alert>
        ) : refused ? (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="sm" maw={520}>
            The instance refused the password given here: a wrong password, or the account lacks
            %Development:USE. It is forgotten, so no other screen sends it.
          </Alert>
        ) : null}
        <PasswordGate application="/api/atelier" action="Open the SQL explorer" resetKeys={[sqlKeys.all]} />
      </>
    );

  return (
    <>
      <PageHeader
        title="SQL"
        description="Run SQL in any namespace as yourself: IRIS applies your SQL privileges. Through the Atelier API (VS Code's), with the catalogue, query plans, and the statements running now and run before."
      />
      {server.error ? <ErrorAlert error={server.error} onRetry={() => server.refetch()} /> : null}
      {unknownNs ? (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} mb="sm">
          There is no namespace {asked} on this instance, or this account may not use it: showing{' '}
          {ns || 'none'}.
        </Alert>
      ) : null}
      {server.data ? (
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List>
            <Tabs.Tab value="query">Query</Tabs.Tab>
            <Tabs.Tab value="catalogue">Catalogue</Tabs.Tab>
            <Tabs.Tab value="running">Running now</Tabs.Tab>
            <Tabs.Tab value="statements">Statement index</Tabs.Tab>
          </Tabs.List>
          <Group mt="sm" mb="sm" gap="sm" align="flex-end">
            <Select
              label="Namespace"
              data={namespaces}
              value={ns}
              onChange={setNs}
              allowDeselect={false}
              searchable
              w={220}
            />
          </Group>

          <Tabs.Panel value="query">
            <Stack gap="sm">
              <Textarea
                label="Statement"
                description="Ctrl+Enter runs it. One statement at a time; ? marks a parameter."
                value={sql}
                onChange={(e) => setSql(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    run();
                  }
                }}
                autosize
                minRows={5}
                maxRows={16}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                spellCheck={false}
              />
              {count ? (
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  {Array.from({ length: count }, (_, i) => (
                    <TextInput
                      key={i}
                      label={`Parameter ${i + 1}`}
                      value={values[i] ?? ''}
                      onChange={(e) => {
                        const next = [...values];
                        next[i] = e.currentTarget.value;
                        setValues(next);
                      }}
                    />
                  ))}
                </SimpleGrid>
              ) : null}
              {!kind.read && kind.keyword ? (
                <Alert
                  color="yellow"
                  icon={<IconAlertTriangle size={16} />}
                  title="This statement changes data"
                >
                  {kind.keyword} {kind.effect}. It runs in {ns} with your SQL privileges, and there is no undo
                  here: Aperture asks before sending it.
                  {readOnly ? ' This tab is read-only, so it will not be sent.' : ''}
                </Alert>
              ) : null}
              <Group gap="xs">
                <Button
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => run()}
                  loading={running}
                  disabled={!kind.keyword || (!kind.read && readOnly)}
                  color={kind.read || !kind.keyword ? undefined : 'red'}
                >
                  {kind.read || !kind.keyword ? 'Run' : `Run ${kind.keyword}`}
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconRoute size={14} />}
                  onClick={() => void execute(`EXPLAIN ${sql.trim().replace(/^EXPLAIN\s+/i, '')}`)}
                  disabled={!/^\s*(SELECT|WITH)\b/i.test(sql)}
                >
                  Explain
                </Button>
                <Select
                  aria-label="Row limit"
                  data={LIMITS.map((l) => ({ value: l, label: `${l} rows at most` }))}
                  value={limit}
                  onChange={(v) => v && setLimit(v)}
                  allowDeselect={false}
                  w={170}
                />
                <Menu withinPortal>
                  <Menu.Target>
                    <Button
                      variant="subtle"
                      leftSection={<IconHistory size={14} />}
                      disabled={!history.length}
                    >
                      Recent
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown maw={520}>
                    {history.map((h) => (
                      <Menu.Item key={h} onClick={() => setSql(h)}>
                        <Text size="xs" className="mono" lineClamp={2}>
                          {h}
                        </Text>
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </Group>
              {error ? <ErrorAlert error={error} title="The statement failed" /> : null}
              {result ? (
                result.kind.keyword === 'EXPLAIN' ? (
                  <Code block>
                    {String(result.data.rows[0]?.[0] ?? '')
                      .replace(/\r/g, '')
                      .replace(/<\/?plans?>/g, '')
                      .trim()}
                  </Code>
                ) : !result.data.columns.length ? (
                  // A change answers no result set; a procedure's result set is shown like a query's.
                  <Alert color="teal" title={`${result.kind.keyword} done`}>
                    In {Math.max(1, result.data.ms)} ms. IRIS reports no row count for a change through this
                    API: query the table to see the result.
                  </Alert>
                ) : (
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
                        {`${result.kind.read ? '' : `${result.kind.keyword} done: `}${result.data.rows.length} rows in ${Math.max(1, result.data.ms)} ms`}
                      </Badge>
                      {result.data.truncated ? (
                        <Text size="xs" c="dimmed">
                          {`More rows than the limit: the first ${result.data.rows.length} are shown.`}
                        </Text>
                      ) : null}
                    </Group>
                    <DataTable
                      data={shaped?.rows}
                      columns={shaped?.columns ?? []}
                      searchable
                      exportName={`sql-${result.ns}`}
                      emptyMessage="The query returned no rows."
                      dense
                    />
                  </Stack>
                )
              ) : null}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="catalogue">
            <Stack gap="sm">
              <Checkbox
                size="xs"
                label="Show system schemas (%, INFORMATION_SCHEMA, Ens, HS)"
                checked={system}
                onChange={(e) => setSystem(e.currentTarget.checked)}
              />
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    Schemas
                  </Text>
                  <SchemaList
                    ns={ns}
                    system={system}
                    selected={schema}
                    onSelect={(s) => {
                      setSchema(s);
                      setTable(null);
                    }}
                  />
                </Stack>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    {schema ? `Tables in ${schema}` : 'Tables'}
                  </Text>
                  {schema ? (
                    <QueryTable
                      ns={ns}
                      sql="SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME"
                      params={[schema]}
                      queryKey={sqlKeys.tables(ns, schema)}
                      empty="No table in this schema."
                      exportName={`tables-${schema}`}
                      onRow={(r) => setTable(String(r.TABLE_NAME))}
                    />
                  ) : (
                    <Text size="sm" c="dimmed">
                      Choose a schema.
                    </Text>
                  )}
                </Stack>
                <Stack gap={4}>
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      {table ? `Columns of ${schema}.${table}` : 'Columns'}
                    </Text>
                    {schema && table ? (
                      <Button size="compact-xs" variant="light" onClick={() => preview(schema, table)}>
                        First 100 rows
                      </Button>
                    ) : null}
                  </Group>
                  {schema && table ? (
                    <QueryTable
                      ns={ns}
                      sql="SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION"
                      params={[schema, table]}
                      queryKey={sqlKeys.columns(ns, schema, table)}
                      empty="No column."
                      exportName={`columns-${table}`}
                    />
                  ) : (
                    <Text size="sm" c="dimmed">
                      Choose a table.
                    </Text>
                  )}
                </Stack>
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="running">
            {tab === 'running' ? (
              <QueryTable
                ns={ns}
                sql="SELECT ProcessID, UserName, Namespace, QueryRunType, ExecutionStart, ExecutionDuration, Status, CachedQuery FROM INFORMATION_SCHEMA.CURRENT_STATEMENTS"
                queryKey={sqlKeys.diagnostics(ns, 'running')}
                empty="No statement is running."
                exportName={`running-${ns}`}
              />
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="statements">
            {tab === 'statements' ? (
              <QueryTable
                ns={ns}
                sql="SELECT TOP 100 Statement, StatCount, StatTotal, StatAverage, StatRowCount, Frozen, Timestamp FROM INFORMATION_SCHEMA.STATEMENTS ORDER BY StatTotal DESC"
                queryKey={sqlKeys.diagnostics(ns, 'statements')}
                empty="The statement index of this namespace is empty."
                exportName={`statements-${ns}`}
              />
            ) : null}
          </Tabs.Panel>
        </Tabs>
      ) : null}
    </>
  );
}

/** The schemas of the namespace with their table counts; system ones only when asked. */
function SchemaList({
  ns,
  system,
  selected,
  onSelect,
}: {
  ns: string;
  system: boolean;
  selected: string | null;
  onSelect: (s: string) => void;
}) {
  const q = useQuery({
    queryKey: sqlKeys.schemas(ns, true),
    queryFn: () =>
      runSql(
        ns,
        'SELECT TABLE_SCHEMA, COUNT(*) AS Tables FROM INFORMATION_SCHEMA.TABLES GROUP BY TABLE_SCHEMA ORDER BY TABLE_SCHEMA',
        [],
        5000,
      ),
    enabled: !!ns,
  });
  if (q.error) return <ErrorAlert error={q.error} />;
  const rows = (q.data?.rows ?? []).filter((r) => system || !isSystemSchema(String(r[0])));
  if (q.isPending)
    return (
      <Text size="sm" c="dimmed">
        Reading…
      </Text>
    );
  if (!rows.length)
    return (
      <Text size="sm" c="dimmed">
        No schema with tables{system ? '' : ' (system schemas hidden)'}.
      </Text>
    );
  return (
    <Stack gap={0}>
      {rows.map((r) => (
        <NavLink
          component="button"
          key={String(r[0])}
          label={<span className="mono">{String(r[0])}</span>}
          rightSection={
            <Badge size="xs" variant="light" color="gray">
              {String(r[1])}
            </Badge>
          }
          active={selected === r[0]}
          onClick={() => onSelect(String(r[0]))}
        />
      ))}
    </Stack>
  );
}
