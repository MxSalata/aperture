/**
 * Lines of messages.log, alerts.log and SystemMonitor.log, as IRIS writes them:
 *
 *   09/24/26-21:15:03:123 (1234) 0 [Utility.Event] Private webserver started on 52773
 *   ^ MM/DD/YY-HH:MM:SS:mmm ^pid  ^severity ^category (2021.1+)   ^message
 *
 * Severity is 0 (informational), 1 (warning), 2 (severe) or 3 (fatal). Older releases and some
 * writers omit the bracketed category; banner lines ("*** Recovery started at …") and
 * continuation lines have no stamp at all and belong to the entry before them.
 */
export type LogSeverity = 0 | 1 | 2 | 3;

export interface LogEntry {
  /** Instance wall-clock time in the form IRIS uses elsewhere, "YYYY-MM-DD HH:MM:SS", or '' for an unstamped line. */
  time: string;
  /** Milliseconds of the stamp when it carries them. */
  millis: number | null;
  pid: number | null;
  severity: LogSeverity | null;
  category: string;
  message: string;
  /** The line as it was read, and the ones that continued it. */
  raw: string;
  /** 0-based index of the line in the window it came from; entries are numbered, not lines. */
  index: number;
  /** Byte offset of the stamped line in the file (what names the entry to the reader), when known. */
  offset: number | null;
}

const STAMPED =
  /^(\d{2})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})(?::(\d{1,3}))?\s+\((\d+)\)\s+([0-3])\s+(?:\[([^\]]+)\]\s*)?(.*)$/;

export const SEVERITY_LABEL: Record<LogSeverity, string> = {
  0: 'info',
  1: 'warning',
  2: 'severe',
  3: 'fatal',
};

/** One stamped line, or null when the line carries no stamp (a banner or a continuation). */
export function parseLogLine(line: string, index = 0, offset: number | null = null): LogEntry | null {
  const m = STAMPED.exec(line);
  if (!m) return null;
  const [, mm, dd, yy, hh, mi, ss, ms, pid, sev, category, message] = m;
  return {
    time: `20${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    millis: ms === undefined ? null : Number(ms.padEnd(3, '0')),
    pid: Number(pid),
    severity: Number(sev) as LogSeverity,
    category: category ?? '',
    message: message.trimEnd(),
    raw: line,
    index,
    offset,
  };
}

/**
 * Lines → entries, oldest first. An unstamped line continues the entry before it (its text is
 * appended, with the raw line kept); an unstamped line with no entry before it becomes an entry
 * of its own so nothing read is dropped.
 */
export function parseLogLines(lines: string[], offsets?: number[]): LogEntry[] {
  const out: LogEntry[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const entry = parseLogLine(line, i, offsets?.[i] ?? null);
    if (entry) {
      out.push(entry);
      return;
    }
    const previous = out[out.length - 1];
    if (previous) {
      previous.message = `${previous.message}\n${line.trimEnd()}`;
      previous.raw = `${previous.raw}\n${line}`;
    } else {
      out.push({
        time: '',
        millis: null,
        pid: null,
        severity: null,
        category: '',
        message: line.trimEnd(),
        raw: line,
        index: i,
        offset: offsets?.[i] ?? null,
      });
    }
  });
  return out;
}

/** Counts per severity for a window, for the badges above the table. */
export function severityCounts(entries: LogEntry[]): Record<LogSeverity, number> {
  const counts: Record<LogSeverity, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const e of entries) if (e.severity !== null) counts[e.severity] += 1;
  return counts;
}
