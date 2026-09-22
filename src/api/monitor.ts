import { useSession } from '@/stores/session';
import { ApiError } from '@/lib/errors';

/**
 * The native monitor REST API (`/api/monitor`) is outside the SysAdmin spec but
 * ships with every IRIS: OpenMetrics text at /metrics and alerts.log at /alerts.
 * It covers what the SysAdmin API lacks: host CPU, memory and disk.
 *
 * Its web application normally allows unauthenticated access; when it requires
 * a password, Basic credentials are forwarded. JWT tokens are scoped to
 * /api/admin and are therefore not sent here.
 */
export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
  help?: string;
  type?: string;
}

const LINE =
  /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|NaN|[-+]?Inf)\s*(?:\d+)?$/;

export function parseLabels(raw: string | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!raw) return labels;
  const inner = raw.slice(1, -1);
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)))
    labels[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  return labels;
}

/** Parse Prometheus/OpenMetrics exposition text. Comments carry HELP/TYPE metadata. */
export function parsePrometheus(text: string): MetricSample[] {
  const help: Record<string, string> = {};
  const type: Record<string, string> = {};
  const out: MetricSample[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = line.match(/^#\s+(HELP|TYPE)\s+(\S+)\s+(.*)$/);
      if (m) (m[1] === 'HELP' ? help : type)[m[2]] = m[3];
      continue;
    }
    const m = line.match(LINE);
    if (!m) continue;
    const value =
      m[3] === 'NaN'
        ? NaN
        : m[3].endsWith('Inf')
          ? m[3].startsWith('-')
            ? -Infinity
            : Infinity
          : Number(m[3]);
    const name = m[1];
    const base = name.replace(/_(total|sum|count|bucket)$/, '');
    out.push({
      name,
      labels: parseLabels(m[2]),
      value,
      help: help[name] ?? help[base],
      type: type[name] ?? type[base],
    });
  }
  return out;
}

function monitorBase(): string {
  return `${useSession.getState().baseUrl.replace(/\/+$/, '')}/api/monitor`;
}

function monitorHeaders(accept: string): HeadersInit {
  const s = useSession.getState();
  const h: Record<string, string> = { Accept: accept };
  if (s.mode === 'basic' && s.basicCredentials) h.Authorization = `Basic ${s.basicCredentials}`;
  return h;
}

async function monitorFetch(path: string, accept: string): Promise<Response> {
  const url = `${monitorBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: monitorHeaders(accept), credentials: 'omit' });
  } catch (e) {
    throw new ApiError({ status: 0, url, summary: e instanceof Error ? e.message : 'Network error' });
  }
  if (!res.ok) {
    throw new ApiError({
      status: res.status,
      url,
      summary:
        res.status === 401 || res.status === 403
          ? 'The /api/monitor web application requires authentication your session cannot provide.'
          : res.status === 404
            ? 'The /api/monitor web application is not enabled on this instance.'
            : `HTTP ${res.status}`,
    });
  }
  return res;
}

export async function fetchMetrics(): Promise<MetricSample[]> {
  const res = await monitorFetch('/metrics', 'text/plain');
  return parsePrometheus(await res.text());
}

export interface AlertRow {
  time: string;
  severity: string;
  process: string;
  message: string;
  raw: unknown;
}

/**
 * alerts.log as JSON: the alerts posted since the previous call to the endpoint, by any client
 * (a read consumes them; see features/monitor/useAlertLog). The shape is not formally
 * documented; accept an array or an object wrapping one.
 */
export async function fetchAlerts(): Promise<AlertRow[]> {
  const res = await monitorFetch('/alerts', 'application/json');
  const text = await res.text();
  let body: unknown = [];
  try {
    body = text ? JSON.parse(text) : [];
  } catch {
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => ({ time: '', severity: '', process: '', message: line, raw: line }));
  }
  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? ((Object.values(body as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined) ?? [])
      : [];
  return list.map((a) => {
    const o = (a && typeof a === 'object' ? a : { message: String(a) }) as Record<string, unknown>;
    const pick = (...keys: string[]) =>
      String(keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== '') ?? '');
    return {
      time: pick('time', 'Time', 'timestamp', 'date'),
      severity: pick('severity', 'Severity', 'level'),
      process: pick('process', 'pid', 'Process', 'source'),
      message: pick('message', 'Message', 'text', 'alert'),
      raw: a,
    };
  });
}

/** Pick the first sample with a given name (optionally matching labels). */
export function metric(
  samples: MetricSample[],
  name: string,
  labels?: Record<string, string>,
): MetricSample | undefined {
  return samples.find(
    (s) => s.name === name && (!labels || Object.entries(labels).every(([k, v]) => s.labels[k] === v)),
  );
}
