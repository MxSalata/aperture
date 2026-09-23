import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Grid,
  Group,
  NavLink,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlayerPlay, IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import { ApiError, normalizeErrors } from '@/lib/errors';
import { PageHeader } from '@/components/PageHeader';
import { PrivilegeBadge } from '@/components/PrivilegeBadge';
import { JsonViewer } from '@/components/JsonViewer';
import { redactDeep } from '@/lib/redact';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { KeyValueList, objectToItems } from '@/components/KeyValueList';
import { ErrorAlert } from '@/components/ErrorAlert';
import { confirmDanger } from '@/components/ConfirmDanger';
import {
  exampleFromSchema,
  groupLabel,
  loadSpec,
  requestBodySchema,
  resolveSchema,
  subGroup,
  type IndexedOperation,
  type JsonSchema,
  type OpenApiDoc,
} from '@/lib/openapi';
import { index, operationsByGroup } from '@/lib/specIndex';
import { useSession } from '@/stores/session';
import { canUse } from '@/api/privileges';
import { useJobs } from '@/stores/jobs';
import { jobIdFromResponse } from '@/api/client';
import { applyQuirks, quirksFor } from '@/lib/quirks';
import { humanize } from '@/components/KeyValueList';

const METHOD_COLOR: Record<string, string> = {
  GET: 'teal',
  POST: 'indigo',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'grape',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      size="sm"
      variant="filled"
      color={METHOD_COLOR[method] ?? 'gray'}
      w={62}
      style={{ fontFamily: 'var(--aperture-mono)' }}
    >
      {method}
    </Badge>
  );
}

interface ExecResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  ms: number;
  jobId?: string | null;
}

/** Schema-driven form for flat request bodies; nested objects fall back to JSON. */
function BodyEditor({
  doc,
  op,
  value,
  onChange,
}: {
  doc: OpenApiDoc | null;
  op: IndexedOperation;
  value: string;
  onChange: (v: string) => void;
}) {
  const schema = useMemo(
    () => (doc ? resolveSchema(doc, requestBodySchema(doc, op.method, op.path)) : undefined),
    [doc, op],
  );
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const props = schema?.properties ?? {};
  const flat = Object.entries(props).filter(([, s]) => {
    const r = doc ? resolveSchema(doc, s) : s;
    return ['string', 'number', 'integer', 'boolean'].includes(String(r.type)) || r.enum;
  });
  const parsed = useMemo(() => {
    try {
      return JSON.parse(value || '{}') as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [value]);
  if (!schema || !Object.keys(props).length) {
    return (
      <Textarea
        label="Request body (JSON)"
        autosize
        minRows={4}
        styles={{ input: { fontFamily: 'var(--aperture-mono)', fontSize: 12 } }}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  const setField = (k: string, v: unknown) => {
    const next = { ...(parsed ?? {}) };
    if (v === '' || v === undefined) delete next[k];
    else next[k] = v;
    onChange(JSON.stringify(next, null, 2));
  };
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Request body
          {schema.description ? (
            <Text span c="dimmed" size="xs">
              {' '}
              · {schema.description}
            </Text>
          ) : null}
        </Text>
        <Tabs value={mode} onChange={(v) => setMode((v as 'form' | 'json') ?? 'form')}>
          <Tabs.List>
            <Tabs.Tab value="form">Form</Tabs.Tab>
            <Tabs.Tab value="json">JSON</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Group>
      {mode === 'json' || !parsed ? (
        <Textarea
          autosize
          minRows={6}
          styles={{ input: { fontFamily: 'var(--aperture-mono)', fontSize: 12 } }}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          error={parsed ? undefined : 'Invalid JSON'}
        />
      ) : (
        <Grid gutter="xs">
          {flat.map(([k, s]) => {
            const r = doc ? resolveSchema(doc, s) : s;
            const required = schema.required?.includes(k) || /required/i.test(r.description ?? '');
            const label = `${humanize(k)}${required ? ' *' : ''}`;
            const desc = r.description;
            const cur = parsed[k];
            if (r.enum)
              return (
                <Grid.Col key={k} span={{ base: 12, sm: 6 }}>
                  <Select
                    label={label}
                    description={desc}
                    data={r.enum.map(String)}
                    value={cur === undefined ? null : String(cur)}
                    onChange={(v) => setField(k, v ?? undefined)}
                    clearable
                  />
                </Grid.Col>
              );
            if (r.type === 'boolean')
              return (
                <Grid.Col key={k} span={{ base: 12, sm: 6 }}>
                  <Checkbox
                    mt={26}
                    label={label}
                    description={desc}
                    checked={!!cur}
                    indeterminate={cur === undefined}
                    onChange={(e) => setField(k, e.currentTarget.checked)}
                  />
                </Grid.Col>
              );
            if (r.type === 'number' || r.type === 'integer')
              return (
                <Grid.Col key={k} span={{ base: 12, sm: 6 }}>
                  <NumberInput
                    label={label}
                    description={desc}
                    value={typeof cur === 'number' ? cur : ''}
                    onChange={(v) => setField(k, v === '' ? undefined : Number(v))}
                  />
                </Grid.Col>
              );
            return (
              <Grid.Col key={k} span={{ base: 12, sm: 6 }}>
                <TextInput
                  label={label}
                  description={desc}
                  placeholder={r.example !== undefined ? String(r.example) : undefined}
                  value={typeof cur === 'string' ? cur : ''}
                  onChange={(e) => setField(k, e.currentTarget.value)}
                />
              </Grid.Col>
            );
          })}
          {Object.keys(props).length > flat.length ? (
            <Grid.Col span={12}>
              <Text size="xs" c="dimmed">
                Nested fields (
                {Object.keys(props)
                  .filter((k) => !flat.some(([f]) => f === k))
                  .join(', ')}
                ) are editable in the JSON tab.
              </Text>
            </Grid.Col>
          ) : null}
        </Grid>
      )}
    </Stack>
  );
}

function ResultView({ res }: { res: ExecResult }) {
  const body = res.body as {
    status?: { summary?: string };
    console?: string[];
    result?: unknown;
  } | null;
  const result = body?.result;
  // IRIS answers status.errors (objects), the spec documents status.Errors (strings): read both.
  const errors = res.ok ? [] : normalizeErrors(body).errors;
  const isTable =
    Array.isArray(result) && result.length > 0 && typeof result[0] === 'object' && result[0] !== null;
  const columns: ColumnDef<Record<string, unknown>, unknown>[] = isTable
    ? Object.keys(result[0] as object)
        .slice(0, 12)
        .map((k) => ({
          accessorKey: k,
          header: k,
          cell: (c) => {
            const v = c.getValue();
            return (
              <span style={{ whiteSpace: 'nowrap' }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
              </span>
            );
          },
        }))
    : [];
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge color={res.ok ? (res.status === 202 ? 'indigo' : 'teal') : 'red'} variant="filled">
          HTTP {res.status}
        </Badge>
        <Text size="xs" c="dimmed" className="tabular">
          {res.ms} ms
        </Text>
        {body?.status?.summary ? <Text size="sm">{body.status.summary}</Text> : null}
        {res.jobId ? (
          <Badge color="indigo" variant="light">
            async task {res.jobId} → Job Center
          </Badge>
        ) : null}
      </Group>
      {errors.length ? (
        <Code block color="red">
          {errors.join('\n')}
        </Code>
      ) : null}
      {body?.console?.length ? <Code block>{body.console.join('\n')}</Code> : null}
      <Tabs
        defaultValue={
          isTable
            ? 'table'
            : result && typeof result === 'object' && !Array.isArray(result)
              ? 'fields'
              : 'json'
        }
      >
        <Tabs.List>
          {isTable ? <Tabs.Tab value="table">Table ({(result as unknown[]).length})</Tabs.Tab> : null}
          {result && typeof result === 'object' && !Array.isArray(result) ? (
            <Tabs.Tab value="fields">Fields</Tabs.Tab>
          ) : null}
          <Tabs.Tab value="json">JSON</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
        </Tabs.List>
        {isTable ? (
          <Tabs.Panel value="table" pt="xs">
            <DataTable
              data={redactDeep(result).value as Record<string, unknown>[]}
              columns={columns}
              dense
              pageSize={20}
            />
          </Tabs.Panel>
        ) : null}
        {result && typeof result === 'object' && !Array.isArray(result) ? (
          <Tabs.Panel value="fields" pt="xs">
            <KeyValueList cols={3} items={objectToItems(result as Record<string, unknown>)} />
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel value="json" pt="xs">
          <JsonViewer value={res.body} title="Response body" maxHeight={480} />
        </Tabs.Panel>
        <Tabs.Panel value="headers" pt="xs">
          <JsonViewer value={res.headers} title="Response headers" maxHeight={300} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function OperationPanel({ op, doc }: { op: IndexedOperation; doc: OpenApiDoc | null }) {
  const [query, setQuery] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      op.params.filter((p) => p.example !== undefined && p.required).map((p) => [p.name, String(p.example)]),
    ),
  );
  const exampleBody = useMemo(() => {
    if (!doc || !op.body) return '';
    const schema = requestBodySchema(doc, op.method, op.path);
    return JSON.stringify((schema ? exampleFromSchema(doc, schema) : {}) ?? {}, null, 2);
  }, [doc, op]);
  const [bodyOverride, setBody] = useState<string | null>(null);
  const body = bodyOverride ?? exampleBody;
  const [res, setRes] = useState<ExecResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const track = useJobs((s) => s.track);
  const openDrawer = useJobs((s) => s.setDrawerOpen);
  const queryClient = useQueryClient();

  const execute = async () => {
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const q: Record<string, string | number | boolean> = {};
      for (const p of op.params) {
        const v = query[p.name];
        if (v === undefined || v === '') continue;
        q[p.name] =
          p.type === 'boolean' ? v === 'true' : p.type === 'number' || p.type === 'integer' ? Number(v) : v;
      }
      // An operation that declares a body always gets one: IRIS answers 415 to a bodiless
      // request even when every field is optional (quirk optional-body-415).
      let parsedBody: unknown = undefined;
      if (op.body) parsedBody = body.trim() ? JSON.parse(body) : {};
      if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody))
        parsedBody = applyQuirks(op, parsedBody as Record<string, unknown>);
      // openapi-fetch has already parsed the body; use data/error rather than re-reading the stream.
      let fetched: { data?: unknown; error?: unknown; response: Response };
      try {
        fetched = (await api().request(
          op.method as 'get',
          op.path as never,
          {
            params: { query: q },
            ...(parsedBody !== undefined ? { body: parsedBody } : {}),
            headers: { 'x-aperture-job': `${op.method} ${op.path}` },
          } as never,
        )) as unknown as { data?: unknown; error?: unknown; response: Response };
      } catch (e) {
        throw new ApiError({
          status: 0,
          url: op.path,
          method: op.method,
          summary: e instanceof Error ? e.message : 'Network error',
        });
      }
      const { response } = fetched;
      const parsed: unknown = fetched.data ?? fetched.error ?? null;
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const jobId = response.status === 202 ? await jobIdFromResponse(response, fetched.data) : null;
      if (jobId) {
        track({ id: jobId, name: `${op.method} ${op.path}` });
        openDrawer(true);
      }
      setRes({
        status: response.status,
        ok: response.ok,
        headers,
        body: parsed,
        ms: Math.round(performance.now() - started),
        jobId,
      });
      // A write from the Explorer changes data the hand-crafted screens may be showing.
      if (op.method !== 'GET')
        void queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== 'async-result' && q.queryKey[0] !== 'session',
        });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const quirks = quirksFor(op);
  // Every non-GET call changes the instance and is confirmed; the path words only escalate the wording.
  const mutating = op.method !== 'GET';
  const dangerous =
    op.method === 'DELETE' ||
    /terminate|purge|truncate|dismount|revoke|delete|stop|kill|remove/i.test(op.path);
  const run = () =>
    mutating
      ? confirmDanger({
          title: `Execute ${op.method} ${op.path}`,
          message: dangerous
            ? 'This operation removes or stops something on the server. Continue?'
            : 'This operation changes something on the server. Continue?',
          confirmLabel: 'Execute',
          color: dangerous ? 'red' : 'orange',
          onConfirm: execute,
        })
      : execute();

  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <MethodBadge method={op.method} />
        <Stack gap={2} style={{ flex: 1 }}>
          <Text fw={600} className="mono" style={{ wordBreak: 'break-all' }}>
            {index.basePath}
            {op.path}
          </Text>
          <Text size="sm">{op.summary}</Text>
          <Group gap="xs">
            <PrivilegeBadge resources={op.privileges} size="xs" />
            {op.async ? (
              <Badge size="xs" color="indigo" variant="light">
                async (202)
              </Badge>
            ) : null}
            {op.result ? (
              <Badge size="xs" color="gray" variant="outline" style={{ textTransform: 'none' }}>
                result: {op.result}
              </Badge>
            ) : null}
          </Group>
        </Stack>
      </Group>
      {quirks.map((q) => (
        <Alert
          key={q.id}
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title="Spec vs. reality"
        >
          <Text size="sm">{q.note}</Text>
          <Text size="xs" c="dimmed">
            Source: {q.source}
          </Text>
        </Alert>
      ))}
      {op.params.length ? (
        <Paper p="sm" withBorder>
          <Text size="sm" fw={500} mb="xs">
            Query parameters
          </Text>
          <Grid gutter="xs">
            {op.params.map((p) => (
              <Grid.Col key={p.name} span={{ base: 12, sm: 6, lg: 4 }}>
                {p.enum ? (
                  <Select
                    label={`${p.name}${p.required ? ' *' : ''}`}
                    description={p.description}
                    data={p.enum}
                    value={query[p.name] ?? null}
                    onChange={(v) => setQuery((s) => ({ ...s, [p.name]: v ?? '' }))}
                    clearable
                  />
                ) : p.type === 'boolean' ? (
                  <Select
                    label={`${p.name}${p.required ? ' *' : ''}`}
                    description={p.description}
                    data={['true', 'false']}
                    value={query[p.name] ?? null}
                    onChange={(v) => setQuery((s) => ({ ...s, [p.name]: v ?? '' }))}
                    clearable
                  />
                ) : (
                  <TextInput
                    label={`${p.name}${p.required ? ' *' : ''}`}
                    description={p.description}
                    placeholder={p.example !== undefined ? String(p.example) : p.type}
                    value={query[p.name] ?? ''}
                    onChange={(e) => setQuery((s) => ({ ...s, [p.name]: e.currentTarget.value }))}
                  />
                )}
              </Grid.Col>
            ))}
          </Grid>
        </Paper>
      ) : null}
      {op.body ? (
        <Paper p="sm" withBorder>
          <BodyEditor doc={doc} op={op} value={body} onChange={setBody} />
        </Paper>
      ) : null}
      <Group>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          color={dangerous ? 'red' : mutating ? 'orange' : 'indigo'}
          onClick={run}
          loading={busy}
        >
          Execute
        </Button>
        {dangerous ? (
          <Group gap={4}>
            <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" />
            <Text size="xs" c="red">
              Destructive operation - asks for confirmation
            </Text>
          </Group>
        ) : mutating ? (
          <Text size="xs" c="dimmed">
            Changes the instance - asks for confirmation
          </Text>
        ) : null}
      </Group>
      {error ? <ErrorAlert error={error} /> : null}
      {res ? (
        <Paper p="sm" withBorder>
          <ResultView res={res} />
        </Paper>
      ) : null}
      <Accordion variant="contained">
        <Accordion.Item value="responses">
          <Accordion.Control>Documented responses</Accordion.Control>
          <Accordion.Panel>
            <Stack gap={4}>
              {Object.entries(op.responses).map(([code, d]) => (
                <Group key={code} gap="xs" align="flex-start">
                  <Badge
                    size="sm"
                    variant="light"
                    color={code.startsWith('2') ? 'teal' : code.startsWith('4') ? 'yellow' : 'red'}
                    w={48}
                  >
                    {code}
                  </Badge>
                  <Text size="sm">{d}</Text>
                </Group>
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

export default function ExplorerPage() {
  const { group } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const info = useSession((s) => s.info);
  const [doc, setDoc] = useState<OpenApiDoc | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    void loadSpec().then(setDoc);
  }, []);
  const groups = Object.keys(index.groups).sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)));
  const selectedGroup = group ? decodeURIComponent(group) : undefined;
  const opId = params.get('op');
  const op = opId ? index.operations.find((o) => o.id === opId) : undefined;
  const ops = useMemo(() => {
    const list = selectedGroup ? (operationsByGroup[selectedGroup] ?? []) : [];
    const f = filter.trim().toLowerCase();
    return f ? list.filter((o) => `${o.method} ${o.path} ${o.summary}`.toLowerCase().includes(f)) : list;
  }, [selectedGroup, filter]);
  const bySub = useMemo(() => {
    const m = new Map<string, IndexedOperation[]>();
    for (const o of ops) {
      const k = subGroup(o);
      (m.get(k) ?? m.set(k, []).get(k)!).push(o);
    }
    return [...m.entries()];
  }, [ops]);
  const schemaOf = (name?: string): JsonSchema | undefined =>
    doc && name ? doc.components.schemas[name] : undefined;

  return (
    <>
      <PageHeader
        title="API Explorer"
        description={`Every operation of the SysAdmin API v${index.version} (${index.operations.length} operations in ${groups.length} groups), rendered straight from the OpenAPI document. Privilege badges reflect your account.`}
      />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Paper p="xs">
            <ScrollArea.Autosize mah="calc(100vh - 220px)">
              {groups.map((g) => {
                const allowed = (operationsByGroup[g] ?? []).some((o) => canUse(info, o.privileges));
                return (
                  <NavLink
                    key={g}
                    label={groupLabel(g)}
                    description={
                      <Text size="xs" c="dimmed" className="mono">
                        {g === 'general' ? '/info, /login…' : g}
                      </Text>
                    }
                    rightSection={
                      <Badge size="xs" variant="light" color={allowed ? 'gray' : 'red'}>
                        {index.groups[g]}
                      </Badge>
                    }
                    active={g === selectedGroup}
                    onClick={() => navigate(`/explorer/${encodeURIComponent(g)}`)}
                    style={{ borderRadius: 8 }}
                  />
                );
              })}
            </ScrollArea.Autosize>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: op ? 3 : 9 }}>
          {selectedGroup ? (
            <Paper p="xs">
              <TextInput
                size="xs"
                placeholder="Filter operations…"
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                mb="xs"
              />
              <ScrollArea.Autosize mah="calc(100vh - 260px)">
                {bySub.map(([sub, list]) => (
                  <Box key={sub} mb="xs">
                    {sub ? (
                      <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="xs" py={4}>
                        {sub}
                      </Text>
                    ) : null}
                    {list.map((o) => (
                      <NavLink
                        key={o.id}
                        active={o.id === opId}
                        onClick={() => setParams({ op: o.id })}
                        style={{ borderRadius: 8 }}
                        label={
                          <Group gap={6} wrap="nowrap">
                            <MethodBadge method={o.method} />
                            <Text size="sm" className="mono" truncate>
                              {o.path.replace(`/v2/${selectedGroup.replace('/v2/', '')}`, '') || '/'}
                            </Text>
                          </Group>
                        }
                        description={
                          op ? undefined : (
                            <Text size="xs" c="dimmed" truncate>
                              {o.summary}
                            </Text>
                          )
                        }
                      />
                    ))}
                  </Box>
                ))}
              </ScrollArea.Autosize>
            </Paper>
          ) : (
            <Paper p="lg">
              <Title order={4} mb="xs">
                Pick a group
              </Title>
              <Text size="sm" c="dimmed">
                The Explorer is generated from <code>spec/mainspec_v2.json</code>: query parameters, request
                bodies (with a form for flat schemas and JSON for nested ones), required privileges and
                documented responses. Long-running operations (202) land in the Job Center automatically.
              </Text>
            </Paper>
          )}
        </Grid.Col>
        {op ? (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Paper p="md">
              <OperationPanel key={op.id} op={op} doc={doc} />
              {schemaOf(op.result) ? (
                <Accordion variant="contained" mt="md">
                  <Accordion.Item value="schema">
                    <Accordion.Control>Result schema: {op.result}</Accordion.Control>
                    <Accordion.Panel>
                      <JsonViewer value={schemaOf(op.result)} title="JSON schema" maxHeight={400} />
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              ) : null}
            </Paper>
          </Grid.Col>
        ) : null}
      </Grid>
    </>
  );
}
