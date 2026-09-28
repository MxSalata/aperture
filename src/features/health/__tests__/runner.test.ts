import { beforeEach, describe, expect, it } from 'vitest';
import { needsLabel, runHealthCheck } from '../runner';
import { reportToJson, reportToMarkdown } from '../export';
import { resetClients } from '@/api/client';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';

const signIn = (username: string) =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth: 'basic' });

describe('the health check runner', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    useMgmntAuth.getState().clear();
  });

  it('runs every check for an administrator, finds what the demo seeds, and reads the log', async () => {
    await signIn('_SYSTEM');
    const report = await runHealthCheck({
      info: useSession.getState().info,
      account: '_SYSTEM',
      logsReady: true,
    });
    expect(report.notChecked).toBe(0);
    expect(report.results.every((r) => r.status === 'ok' || r.status === 'findings')).toBe(true);
    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'unknown-user:enabled',
        'auditing:Login',
        'services:%Service_Terminal',
        'web-apps:/csp/legacy:namespace',
        'journal-freeze:off',
        'certificates:MirrorMemberCert',
        'alerts:serious',
      ]),
    );
    expect(ids.some((id) => id.startsWith('tasks:') && id.endsWith(':error'))).toBe(true);
    expect(ids.some((id) => id.startsWith('disk-space:'))).toBe(true);
    expect(ids.some((id) => id.startsWith('messages-log:'))).toBe(true);
    // Highest severity first; the counts add up.
    const order = { critical: 0, warning: 1, advice: 2 };
    for (let i = 1; i < report.findings.length; i++)
      expect(order[report.findings[i - 1].severity]).toBeLessThanOrEqual(order[report.findings[i].severity]);
    expect(report.counts.critical + report.counts.warning + report.counts.advice).toBe(
      report.findings.length,
    );
    for (const f of report.findings) {
      expect(f.evidence.source).toMatch(/^GET /);
      expect(f.evidence.fields.length).toBeGreaterThan(0);
      expect(f.meaning.length).toBeGreaterThan(20);
      expect(f.action.length).toBeGreaterThan(20);
    }
    const md = reportToMarkdown(report, 'Demo instance');
    expect(md).toMatch(/^# Health check: Demo instance/);
    expect(md).toContain('## Findings');
    expect(md).toContain('UnknownUser is enabled');
    expect(md).toContain('## Checks');
    expect(JSON.parse(reportToJson(report, 'Demo instance')).findings.length).toBe(report.findings.length);
  });

  it('says what an operator may not read instead of skipping it, and what the log check waits for', async () => {
    await signIn('operator');
    const report = await runHealthCheck({
      info: useSession.getState().info,
      account: 'operator',
      logsReady: false,
    });
    const notChecked = report.results.filter((r) => r.status === 'not-checked');
    expect(notChecked.map((r) => r.check)).toEqual(
      expect.arrayContaining([
        'unknown-user',
        'auditing',
        'services',
        'web-apps',
        'certificates',
        'disk-space',
        'databases',
        'messages-log',
      ]),
    );
    expect(notChecked.find((r) => r.check === 'certificates')?.needs).toBe('%Admin_Secure');
    expect(notChecked.find((r) => r.check === 'disk-space')?.needs).toBe('%Admin_Manage');
    expect(notChecked.find((r) => r.check === 'messages-log')?.needs).toMatch(/password/);
    // What the operator may read still runs.
    expect(report.results.find((r) => r.check === 'alerts')?.status).toMatch(/ok|findings/);
    expect(report.notChecked).toBe(notChecked.length);
    expect(reportToMarkdown(report, 'x')).toContain('not checked: needs %Admin_Secure');
  });

  it('names the resources the way the badges do', () => {
    expect(needsLabel(['%Admin_Secure:U'])).toBe('%Admin_Secure');
    expect(needsLabel(['%Admin_Task:U', '%Admin_Operate:U'])).toBe('%Admin_Task or %Admin_Operate');
  });
});
