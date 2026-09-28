import { api, result } from '@/api/client';
import { fetchLogSources, readLogWindow, isReaderMissing } from '@/api/logs';
import { checkPrivileges, PRIVILEGE_LABELS, privilegeKey } from '@/api/privileges';
import type { Info } from '@/api/types';
import { fetchVolumes, joinDatabases, normalizeLocal } from '@/features/databases/useDatabases';
import { storageLocations } from '@/features/databases/storage';
import { ApiError } from '@/lib/errors';
import { mapLimit } from '@/lib/limiter';
import { parseLogLines } from '@/lib/messagesLog';
import {
  CHECKS,
  checkAlerts,
  checkAllHolders,
  checkAuditing,
  checkBackup,
  checkCertificates,
  checkDatabases,
  checkDiskSpace,
  checkJournalFreeze,
  checkJournalSpace,
  checkLicence,
  checkMessagesLog,
  checkServices,
  checkSystemMonitor,
  checkTasks,
  checkUnknownUser,
  checkWebApps,
  sortFindings,
  type CheckId,
  type CheckInfo,
  type DashboardFacts,
  type Finding,
  type Severity,
  type TaskRunFacts,
} from './checks';

export interface CheckResult {
  check: CheckId;
  title: string;
  area: CheckInfo['area'];
  status: 'ok' | 'findings' | 'not-checked' | 'failed';
  /** For "not checked": what the account lacks, or what else stands in the way. */
  needs?: string;
  /** For "failed": what the server answered. */
  detail?: string;
  findings: Finding[];
}

export interface HealthReport {
  /** Milliseconds since the epoch. */
  ranAt: number;
  account: string;
  results: CheckResult[];
  /** Every finding, highest severity first. */
  findings: Finding[];
  counts: Record<Severity, number>;
  checked: number;
  notChecked: number;
}

export interface RunContext {
  info: Info | null | undefined;
  account: string;
  /** Whether the log reader can be called (a password is at hand). */
  logsReady: boolean;
  now?: number;
}

/** "%Admin_Secure" or "%Admin_Secure or %Admin_Manage": the resources, named the way the badges do. */
export function needsLabel(resources: string[]): string {
  return resources
    .map((r) => {
      const key = privilegeKey(r);
      return key ? (PRIVILEGE_LABELS[key] ?? r) : r.replace(/:U$/, '');
    })
    .join(' or ');
}

/** One fetch per source per run, shared by the checks that read it. */
function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= fn());
}

/**
 * Runs every check with the signed-in account's own access: a check whose data the account may
 * not read is reported as not checked and says what it needs; one whose read fails says what the
 * server answered. Nothing here writes.
 */
export async function runHealthCheck(ctx: RunContext): Promise<HealthReport> {
  const now = ctx.now ?? Date.now();
  const read = () => Date.now();
  const load = {
    dashboard: memo(async () => (await result(api().GET('/v2/monitor/dashboard/main'))) as DashboardFacts),
    databases: memo(async () => {
      const [config, local] = await Promise.all([
        result(api().GET('/v2/databases')),
        result(api().GET('/v2/database-dirs')),
      ]);
      return joinDatabases(config, normalizeLocal(local));
    }),
    users: memo(() => result(api().GET('/v2/security/users'))),
    services: memo(() => result(api().GET('/v2/security/services'))),
    webApps: memo(() => result(api().GET('/v2/web-apps'))),
    namespaces: memo(() => result(api().GET('/v2/namespaces'))),
    auditEnabled: memo(() => result(api().GET('/v2/security/audit/enabled'))),
    auditEvents: memo(() => result(api().GET('/v2/security/audit/events'))),
    tasks: memo(() => result(api().GET('/v2/tasks'))),
    taskHistory: memo(() => result(api().GET('/v2/task/history'))),
    allOwners: memo(() =>
      result(api().GET('/v2/security/role/owners', { params: { query: { name: '%All' } } })),
    ),
    journal: memo(() => result(api().GET('/v2/journal/settings'))),
    certificates: memo(async () => {
      const list = (await result(api().GET('/v2/security/x509-credentials'))) as { Alias: string }[];
      return mapLimit(list, 4, async (c) => {
        const cert = (await result(
          api().GET('/v2/security/x509-credential/certificate', { params: { query: { alias: c.Alias } } }),
        )) as {
          ValidityNotAfter?: string;
          SubjectDN?: string;
        };
        return { Alias: c.Alias, ...cert };
      });
    }),
  };

  const runners: Record<CheckId, () => Promise<Finding[]>> = {
    'disk-space': async () => {
      const rows = await load.databases();
      const dirs = rows.map((r) => r.Directory).filter((d): d is string => !!d);
      const volumes = await fetchVolumes(dirs);
      const at = read();
      return checkDiskSpace(
        storageLocations(
          rows.map((r) => ({
            name: r.Name || r.Directory || '',
            volumes: volumes.get(dirKey(r.Directory ?? '')) ?? [],
          })),
        ),
        at,
      );
    },
    databases: async () => {
      const rows = await load.databases();
      return checkDatabases(
        rows.map((r) => ({
          name: r.Name || r.Directory || '',
          directory: r.Directory ?? '',
          mounted: (r.local as { Mounted?: boolean } | undefined)?.Mounted,
          readOnly: (r.local as { ReadOnly?: boolean } | undefined)?.ReadOnly,
          mountAtStartup: r.MountAtStartup,
          sizeMB: r.SizeMB,
          maxSize: r.MaxSize,
        })),
        read(),
      );
    },
    'journal-freeze': async () =>
      checkJournalFreeze((await load.journal()) as { FreezeOnError?: boolean }, read()),
    'journal-space': async () => checkJournalSpace(await load.dashboard(), read()),
    backup: async () => checkBackup(await load.dashboard(), read(), now),
    'unknown-user': async () =>
      checkUnknownUser(
        (await load.users()) as { Name: string; Enabled?: boolean; Roles?: string[] }[],
        read(),
      ),
    auditing: async () => {
      const [enabled, events] = await Promise.all([load.auditEnabled(), load.auditEvents()]);
      return checkAuditing(
        { enabled: (enabled as { Enabled?: boolean }).Enabled, events: events as AuditEvent[] },
        read(),
      );
    },
    services: async () =>
      checkServices(
        (await load.services()) as { Name: string; Enabled?: unknown; AuthenticationMethods?: string[] }[],
        read(),
      ),
    'web-apps': async () => {
      const apps = (await load.webApps()) as {
        Name: string;
        Namespace?: string;
        Enabled?: boolean;
        AutheEnabled?: number;
        DispatchClass?: string;
        IsSystemApp?: boolean;
      }[];
      // The namespace list needs %Admin_Manage; without it the open-access part still runs.
      let namespaces: string[] | undefined;
      if (checkPrivileges(ctx.info, ['%Admin_Manage:U']) !== 'denied')
        try {
          namespaces = ((await load.namespaces()) as { Name?: string }[])
            .map((n) => n.Name ?? '')
            .filter(Boolean);
        } catch {
          namespaces = undefined;
        }
      return checkWebApps(apps, namespaces, read());
    },
    'all-holders': async () => {
      const [owners, users] = await Promise.all([load.allOwners(), load.users()]);
      return checkAllHolders(
        owners as { Name: string; Type?: string }[],
        users as { Name: string; Enabled?: boolean }[],
        read(),
      );
    },
    certificates: async () => checkCertificates(await load.certificates(), read(), now),
    tasks: async () => {
      const [tasks, history] = await Promise.all([load.tasks(), load.taskHistory()]);
      return checkTasks(
        tasks as { Id?: number; Name: string; Suspended?: boolean; LastFinished?: string }[],
        history as TaskRunFacts[],
        read(),
      );
    },
    'system-monitor': async () => checkSystemMonitor(await load.dashboard(), read()),
    alerts: async () => checkAlerts(await load.dashboard(), read()),
    licence: async () => checkLicence(await load.dashboard(), read()),
    'messages-log': async () => {
      const sources = await fetchLogSources();
      const file = sources.find((x) => x.kind === 'messages' && x.current) ?? sources[0];
      if (!file) return [];
      const w = await readLogWindow(file.id, 0, 65_536);
      return checkMessagesLog(parseLogLines(w.lines).reverse(), file.id, read(), now);
    },
  };

  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    const base = { check: check.id, title: check.title, area: check.area };
    if (check.id === 'messages-log' && !ctx.logsReady) {
      results.push({
        ...base,
        status: 'not-checked',
        needs: 'the password for /api/aperture (Logs, Messages log asks for it once)',
        findings: [],
      });
      continue;
    }
    if (check.needs.length && checkPrivileges(ctx.info, check.needs) === 'denied') {
      results.push({ ...base, status: 'not-checked', needs: needsLabel(check.needs), findings: [] });
      continue;
    }
    try {
      const findings = await runners[check.id]();
      results.push({ ...base, status: findings.length ? 'findings' : 'ok', findings });
    } catch (e) {
      if (check.id === 'messages-log' && isReaderMissing(e)) {
        results.push({
          ...base,
          status: 'not-checked',
          needs: 'the log reader (the iris-aperture package creates /api/aperture)',
          findings: [],
        });
        continue;
      }
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        results.push({
          ...base,
          status: 'not-checked',
          needs: check.needs.length ? needsLabel(check.needs) : e.summary,
          findings: [],
        });
        continue;
      }
      results.push({
        ...base,
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e),
        findings: [],
      });
    }
  }
  const findings = sortFindings(results.flatMap((r) => r.findings));
  const counts: Record<Severity, number> = { critical: 0, warning: 0, advice: 0 };
  for (const x of findings) counts[x.severity] += 1;
  return {
    ranAt: now,
    account: ctx.account,
    results,
    findings,
    counts,
    checked: results.filter((r) => r.status === 'ok' || r.status === 'findings').length,
    notChecked: results.filter((r) => r.status === 'not-checked' || r.status === 'failed').length,
  };
}

type AuditEvent = { EventSource?: string; EventType?: string; EventName?: string; Enabled?: boolean };

/** The join key of a database directory, as useDatabases uses it. */
function dirKey(dir: string): string {
  const trimmed = dir.replace(/[\\/]+$/, '');
  return /^[a-z]:[\\/]|\\/i.test(trimmed) ? trimmed.toLowerCase().replace(/\//g, '\\') : trimmed;
}
