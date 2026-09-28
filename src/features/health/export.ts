import { formatDateTime } from '@/lib/format';
import { SEVERITY_LABEL } from './checks';
import type { HealthReport } from './runner';

/** The report as Markdown: what was found, what to do, the evidence, and what was not examined. */
export function reportToMarkdown(report: HealthReport, instance: string): string {
  const lines: string[] = [];
  lines.push(`# Health check: ${instance}`, '');
  lines.push(
    `Run ${formatDateTime(report.ranAt)} as ${report.account}. ${report.checked} checks run, ${report.notChecked} not checked.`,
    '',
  );
  lines.push(
    `Critical: ${report.counts.critical}, warnings: ${report.counts.warning}, advice: ${report.counts.advice}.`,
    '',
  );
  if (report.findings.length) {
    lines.push('## Findings', '');
    for (const x of report.findings) {
      lines.push(`### ${SEVERITY_LABEL[x.severity]}: ${x.title}`, '');
      lines.push(`Area: ${x.area}. ${x.meaning}`, '');
      lines.push(`What to do: ${x.action}`, '');
      lines.push(`Evidence (${x.evidence.source}, read ${formatDateTime(x.evidence.read)}):`, '');
      for (const field of x.evidence.fields) lines.push(`- ${field.label}: ${field.value || '(empty)'}`);
      lines.push('');
      if (x.link) lines.push(`Fix: ${x.link.label} (${x.link.to})`, '');
    }
  } else lines.push('## Findings', '', 'None.', '');
  lines.push('## Checks', '');
  for (const r of report.results) {
    const state =
      r.status === 'ok'
        ? 'passed'
        : r.status === 'findings'
          ? `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}`
          : r.status === 'not-checked'
            ? `not checked: needs ${r.needs}`
            : `failed: ${r.detail}`;
    lines.push(`- ${r.title}: ${state}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function reportToJson(report: HealthReport, instance: string): string {
  return JSON.stringify({ instance, ...report }, null, 2);
}
