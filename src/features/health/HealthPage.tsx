import {
  Accordion,
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  Menu,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCheck, IconDownload, IconExternalLink, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { KeyValueList } from '@/components/KeyValueList';
import { PageHeader } from '@/components/PageHeader';
import { ErrorAlert } from '@/components/ErrorAlert';
import { downloadText } from '@/lib/download';
import { formatDateTime } from '@/lib/format';
import { useInstanceLabel } from '@/features/shell/useInstanceLabel';
import { AREAS, SEVERITIES, SEVERITY_LABEL, type Finding, type Severity } from './checks';
import { reportToJson, reportToMarkdown } from './export';
import { useHealthCheck } from './useHealthCheck';

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'red',
  warning: 'yellow',
  advice: 'blue',
};

function SeverityBadge({ severity, size = 'sm' }: { severity: Severity; size?: string }) {
  return (
    <Badge size={size} variant="filled" color={SEVERITY_COLOR[severity]} tt="none">
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <Paper p="md" component="li" style={{ listStyle: 'none' }}>
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          <SeverityBadge severity={finding.severity} />
          <Badge size="sm" variant="light" color="gray" tt="none">
            {finding.area}
          </Badge>
          <Text fw={600} size="sm">
            {finding.title}
          </Text>
        </Group>
        <Text size="sm">{finding.meaning}</Text>
        <Text size="sm">
          <Text span fw={600}>
            What to do:
          </Text>{' '}
          {finding.action}
        </Text>
        <Group gap="xs" wrap="wrap">
          {finding.link ? (
            <Button
              component={Link}
              to={finding.link.to}
              size="compact-sm"
              variant="light"
              rightSection={<IconExternalLink size={14} />}
            >
              Open {finding.link.label}
            </Button>
          ) : null}
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} evidence for ${finding.title}`}
          >
            {open ? 'Hide evidence' : 'Evidence'}
          </Button>
        </Group>
        <Collapse in={open}>
          <Stack gap={4} pt="xs">
            <Text size="xs" c="dimmed">
              From {finding.evidence.source}, read {formatDateTime(finding.evidence.read)}
            </Text>
            <KeyValueList
              items={finding.evidence.fields.map((x) => ({
                label: x.label,
                value: x.value || '(empty)',
                mono: true,
              }))}
              cols={2}
            />
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}

/**
 * Deterministic, read-only checks of the instance, run with the signed-in account's own access:
 * findings highest severity first, each with what it means, what to do, the evidence and the
 * screen where the fix is made; what could not be examined is listed, never silently skipped.
 */
export default function HealthPage() {
  const report = useHealthCheck();
  const instance = useInstanceLabel();
  const [severities, setSeverities] = useState<string[]>([]);
  const [area, setArea] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const data = report.data;
  const shown = useMemo(() => {
    const wanted = new Set(severities);
    const q = search.trim().toLowerCase();
    return (data?.findings ?? []).filter(
      (x) =>
        (!wanted.size || wanted.has(x.severity)) &&
        (!area || x.area === area) &&
        (!q || `${x.title} ${x.meaning} ${x.action} ${x.area}`.toLowerCase().includes(q)),
    );
  }, [data, severities, area, search]);
  const notChecked = data?.results.filter((r) => r.status === 'not-checked' || r.status === 'failed') ?? [];

  const exportAs = (kind: 'md' | 'json') => {
    if (!data) return;
    const stamp = new Date(data.ranAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    if (kind === 'md')
      downloadText(
        `health-check-${stamp}.md`,
        reportToMarkdown(data, instance.name),
        'text/markdown;charset=utf-8',
      );
    else downloadText(`health-check-${stamp}.json`, reportToJson(data, instance.name), 'application/json');
  };

  return (
    <>
      <PageHeader
        title="Health check"
        description="Deterministic, read-only checks of this instance, run with your own access: databases and disks, journal, backups, security settings, certificates, tasks, alerts, licence and the newest severe log entries. Each finding names the screen where the fix is made; a check your account may not read is listed as not checked."
        actions={
          <>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={() => void report.refetch()}
              loading={report.isFetching}
            >
              Run again
            </Button>
            <Menu shadow="md" position="bottom-end" withinPortal>
              <Menu.Target>
                <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} disabled={!data}>
                  Export
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => exportAs('md')}>Markdown report</Menu.Item>
                <Menu.Item onClick={() => exportAs('json')}>JSON</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        }
      />
      <Stack gap="md">
        {report.isPending ? (
          <Group gap="sm" role="status" aria-live="polite">
            <Loader size="sm" />
            <Text size="sm">Running the checks with your access...</Text>
          </Group>
        ) : report.error ? (
          <ErrorAlert error={report.error} />
        ) : data ? (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
              {SEVERITIES.map((sev) => (
                <Paper p="md" key={sev}>
                  <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.4 }}>
                    {SEVERITY_LABEL[sev]}
                  </Text>
                  <Group gap="xs" align="baseline">
                    <Text fz={26} fw={650} lh={1.15} className="tabular">
                      {data.counts[sev]}
                    </Text>
                    {data.counts[sev] ? <SeverityBadge severity={sev} size="xs" /> : null}
                  </Group>
                </Paper>
              ))}
              <Paper p="md">
                <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: 0.4 }}>
                  Checks
                </Text>
                <Text fz={26} fw={650} lh={1.15} className="tabular">
                  {data.checked}
                  <Text span size="sm" c="dimmed" fw={500}>
                    {' '}
                    run
                  </Text>
                </Text>
                <Text size="xs" c="dimmed">
                  {data.notChecked ? `${data.notChecked} not checked` : 'every check ran'} ·{' '}
                  {formatDateTime(data.ranAt)} as {data.account}
                </Text>
              </Paper>
            </SimpleGrid>

            <Group gap="sm" align="flex-end" wrap="wrap">
              <MultiSelect
                label="Severity"
                placeholder="all"
                data={SEVERITIES.map((sev) => ({ value: sev, label: SEVERITY_LABEL[sev] }))}
                value={severities}
                onChange={setSeverities}
                w={240}
                clearable
              />
              <Select
                label="Area"
                placeholder="all"
                data={AREAS}
                value={area}
                onChange={setArea}
                w={200}
                clearable
              />
              <TextInput
                label="Search"
                placeholder="in titles, meanings and actions"
                leftSection={<IconSearch size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                w={280}
              />
              <Text size="sm" c="dimmed" pb={8} aria-live="polite">
                {shown.length === data.findings.length
                  ? `${data.findings.length} finding${data.findings.length === 1 ? '' : 's'}`
                  : `${shown.length} of ${data.findings.length} findings`}
              </Text>
            </Group>

            {data.findings.length === 0 ? (
              <Alert color="teal" variant="light" icon={<IconCheck size={18} />}>
                No findings: the {data.checked} checks that ran found nothing to report.
                {data.notChecked ? ' Some checks could not run; they are listed below.' : ''}
              </Alert>
            ) : shown.length === 0 ? (
              <Alert color="gray" variant="light">
                No finding matches the filter.
              </Alert>
            ) : (
              <Stack gap="sm" component="ul" style={{ margin: 0, padding: 0 }}>
                {shown.map((x) => (
                  <FindingCard key={x.id} finding={x} />
                ))}
              </Stack>
            )}

            {notChecked.length ? (
              <Paper p="md">
                <Text fw={600} size="sm" mb="xs">
                  Not checked
                </Text>
                <Stack gap={4} component="ul" style={{ margin: 0, paddingLeft: 18 }}>
                  {notChecked.map((r) => (
                    <li key={r.check}>
                      <Text size="sm">
                        {r.title}
                        {r.status === 'not-checked' ? (
                          <Text span c="dimmed">
                            {' '}
                            (needs {r.needs})
                          </Text>
                        ) : (
                          <Text span c="dimmed">
                            {' '}
                            (the read failed: {r.detail})
                          </Text>
                        )}
                      </Text>
                    </li>
                  ))}
                </Stack>
              </Paper>
            ) : null}

            <Accordion variant="contained">
              <Accordion.Item value="checks">
                <Accordion.Control>Every check, and what it reads</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={4} component="ul" style={{ margin: 0, paddingLeft: 18 }}>
                    {data.results.map((r) => (
                      <li key={r.check}>
                        <Text size="sm">
                          {r.title}
                          <Text span c="dimmed">
                            {' '}
                            ·{' '}
                            {r.status === 'ok'
                              ? 'passed'
                              : r.status === 'findings'
                                ? `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}`
                                : r.status === 'not-checked'
                                  ? `not checked (needs ${r.needs})`
                                  : `failed (${r.detail})`}
                          </Text>
                        </Text>
                      </li>
                    ))}
                  </Stack>
                  <Text size="xs" c="dimmed" mt="xs">
                    No score: the counts above are the findings, and this list says what was and was not
                    examined.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </>
        ) : null}
      </Stack>
    </>
  );
}
