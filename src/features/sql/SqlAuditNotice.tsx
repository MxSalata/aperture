import { Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconShieldCheck, IconShieldOff, IconShieldQuestion } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, result, useApiMutation } from '@/api/hooks';
import { checkPrivileges } from '@/api/privileges';
import { confirmDanger } from '@/components/ConfirmDanger';
import { isApiError } from '@/lib/errors';
import { sqlAuditState, type AuditEventRow } from '@/lib/sqlAudit';
import { enableAuditing, enableSqlAuditEvents } from '@/features/security/audit';
import { secKeys } from '@/features/security/keys';
import { useReadOnly } from '@/stores/readOnly';
import { useSession } from '@/stores/session';

const SECURE = ['%Admin_Secure:U'];

/** `%System/%SQL/DynamicStatementDML` → `DynamicStatementDML`. */
const short = (id: string) => id.split('/').pop() ?? id;
const names = (ids: string[]) => ids.map(short).join(' and ');

const auditLink = (
  <Anchor component={Link} to="/security/audit" size="sm">
    Security &gt; Audit
  </Anchor>
);

/**
 * Whether IRIS writes the statements run on the SQL screen to its audit log. The screen runs them
 * as the signed-in account through Dynamic SQL, which IRIS audits only when system-wide auditing
 * and the DynamicStatement events are on; as IRIS ships, they are off, and nothing records who
 * changed what through SQL. Reading the settings needs %Admin_Secure:U; an account without it is
 * told the state is unknown, and one with it may switch the events on (instance-wide, confirmed,
 * read back, and recorded in Activity like every other write).
 */
export function SqlAuditNotice() {
  const secure = useSession((s) => checkPrivileges(s.info, SECURE));
  const readOnly = useReadOnly((s) => s.readOnly);
  const readable = secure !== 'denied';
  const enabled = useQuery({
    queryKey: secKeys.auditEnabled,
    queryFn: () => result(api().GET('/v2/security/audit/enabled')),
    enabled: readable,
  });
  const events = useQuery({
    queryKey: secKeys.auditEvents,
    queryFn: () => result(api().GET('/v2/security/audit/events')),
    enabled: readable,
  });
  const invalidate = [secKeys.auditEnabled, secKeys.auditEvents];
  const enableEvents = useApiMutation((ids: string[]) => enableSqlAuditEvents(ids), {
    invalidate,
    success: (_d, ids) => `${names(ids)} switched on`,
  });
  const enableAll = useApiMutation(() => enableAuditing(), { invalidate, success: 'Auditing switched on' });

  const failed = enabled.error ?? events.error;
  if (!readable || failed)
    return (
      <Group gap={6} mb="sm" wrap="nowrap" align="flex-start">
        <IconShieldQuestion size={16} style={{ flex: 'none', marginTop: 2 }} />
        <Text size="sm" c="dimmed">
          IRIS SQL audit state unknown:{' '}
          {!readable || (isApiError(failed) && failed.isForbidden)
            ? 'reading the audit settings needs %Admin_Secure:U, which this account does not hold.'
            : 'the audit settings could not be read.'}{' '}
          Whether the statements run here are written to the IRIS audit log is not known to this screen.
        </Text>
      </Group>
    );
  if (enabled.isPending || events.isPending) return null;

  const state = sqlAuditState(
    (enabled.data as { Enabled?: boolean } | undefined)?.Enabled,
    events.data as AuditEventRow[] | undefined,
  );
  const busy = enableEvents.isPending || enableAll.isPending;

  const auditChanges = () =>
    confirmDanger({
      title: 'Audit SQL changes on the whole instance',
      message: `This switches on ${names(state.changeEvents)}. IRIS then writes every INSERT, UPDATE, DELETE and DDL statement run through Dynamic SQL to its audit log, under the account that runs it, from every SQL client and not only Aperture. Each one adds a record to the audit database, which keeps it until it is purged.`,
      confirmLabel: 'Audit SQL changes',
      color: 'orange',
      onConfirm: () => enableEvents.mutateAsync(state.changeEvents),
    });
  const auditQueries = (id: string) =>
    confirmDanger({
      title: 'Audit every SQL query',
      message: `This switches on ${short(id)}. IRIS then writes every query run through Dynamic SQL to its audit log, from every SQL client, the reads this screen makes for the catalogue and the statement index included. On a busy instance that is many records a minute, and the audit database grows quickly.`,
      confirmLabel: 'Audit every query',
      color: 'red',
      onConfirm: () => enableEvents.mutateAsync([id]),
    });
  const switchOn = () =>
    confirmDanger({
      title: 'Switch auditing on',
      message:
        'IRIS starts writing a record for every audit event that is on, across the instance and not only for SQL, until auditing is switched off again.',
      confirmLabel: 'Switch on',
      color: 'orange',
      onConfirm: () => enableAll.mutateAsync(),
    });
  const mayChange = !readOnly;

  if (state.level === 'unknown')
    return (
      <Group gap={6} mb="sm" wrap="nowrap" align="flex-start">
        <IconShieldQuestion size={16} style={{ flex: 'none', marginTop: 2 }} />
        <Text size="sm" c="dimmed">
          IRIS SQL audit state unknown:{' '}
          {state.missing.length
            ? `this instance lists Dynamic SQL audit events but not ${names(state.missing)}, so whether the changes run here are audited cannot be told.`
            : 'this instance lists no Dynamic SQL audit events.'}{' '}
          See {auditLink}.
        </Text>
      </Group>
    );

  if (state.level === 'all')
    return (
      <Group gap={6} mb="sm" wrap="nowrap" align="flex-start">
        <IconShieldCheck
          size={16}
          color="var(--mantine-color-teal-6)"
          style={{ flex: 'none', marginTop: 2 }}
        />
        <Text size="sm" c="dimmed">
          IRIS audits the statements run here, changes and queries, under the account that runs them. See{' '}
          {auditLink}.
        </Text>
      </Group>
    );

  if (state.level === 'changes')
    return (
      <Alert color="blue" variant="light" icon={<IconShieldCheck size={16} />} mb="sm">
        <Stack gap={6}>
          <Text size="sm">
            IRIS audits the changes run here (INSERT, UPDATE, DELETE and DDL) under the account that runs
            them; queries are not written to the audit log. See {auditLink}.
          </Text>
          {state.queryEvent ? (
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                disabled={!mayChange || busy}
                onClick={() => auditQueries(state.queryEvent!)}
              >
                Audit every query too…
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Alert>
    );

  return (
    <Alert color="orange" icon={<IconShieldOff size={16} />} title="IRIS SQL audit is disabled" mb="sm">
      <Stack gap={6}>
        <Text size="sm">
          Statements run here are not written to the IRIS audit log, under any user: nothing records who
          changed what through SQL.{' '}
          {state.auditing === false
            ? 'Auditing is off for the whole instance, so no event is written until it is switched on.'
            : state.changeEvents.length
              ? `${names(state.changeEvents)} ${state.changeEvents.length > 1 ? 'are' : 'is'} off.`
              : ''}
          {state.auditing !== false && state.queries ? ' Queries are audited.' : ''} See {auditLink}.
        </Text>
        {state.auditing === false && state.changeEvents.length ? (
          <Text size="sm">
            {names(state.changeEvents)} {state.changeEvents.length > 1 ? 'are' : 'is'} off as well: both are
            needed.
          </Text>
        ) : null}
        <Group gap="xs">
          {state.auditing === false ? (
            <Button
              size="compact-sm"
              variant="light"
              color="orange"
              disabled={!mayChange || busy}
              onClick={switchOn}
            >
              Switch auditing on…
            </Button>
          ) : null}
          {state.changeEvents.length ? (
            <Button
              size="compact-sm"
              variant="light"
              color="orange"
              disabled={!mayChange || busy}
              onClick={auditChanges}
            >
              Audit SQL changes…
            </Button>
          ) : null}
        </Group>
        {readOnly ? (
          <Text size="xs" c="dimmed">
            This tab is read-only, so it changes no audit setting.
          </Text>
        ) : null}
      </Stack>
    </Alert>
  );
}
