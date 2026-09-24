import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';
import { mgmntCredentials } from './mgmnt';

/**
 * Aperture's own log reader, `/api/aperture` (ipm/cls/Aperture/API.cls, created by the IPM
 * package): the one thing the SysAdmin API has no route for. Read-only, bounded windows of
 * messages.log, alerts.log, SystemMonitor.log and their rotations, read by Embedded Python on the
 * instance. Like /api/mgmnt its web application takes a password only, so a Basic session's
 * credentials are sent and a JWT session gives the password once (`stores/mgmntAuth.ts`).
 */
export const LOGS_PREFIX = '/api/aperture';

export interface LogSource {
  /** The file name; what `readLogWindow` takes. */
  id: string;
  kind: 'messages' | 'alerts' | 'monitor' | string;
  path: string;
  size: number;
  /** Instance wall-clock time, "YYYY-MM-DD HH:MM:SS". */
  modified: string;
  /** The live file, as opposed to a rotation. */
  current: boolean;
}

export interface LogWindow {
  size: number;
  /** Byte offset of the first whole line; pass it as `before` for the window preceding this one. */
  start: number;
  end: number;
  lines: string[];
  hasMore: boolean;
}

/** The web application answers 404 on an instance without the package: not an error of the file. */
export const LOG_READER_MISSING =
  'The log reader is not installed on this instance: /api/aperture is the web application the iris-aperture IPM package creates (zpm "install iris-aperture", or the Docker image). Everything else works without it.';

async function logsFetch<T>(path: string): Promise<T> {
  const url = `${useSession.getState().baseUrl.replace(/\/+$/, '')}${LOGS_PREFIX}${path}`;
  const credentials = mgmntCredentials();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (credentials) headers.Authorization = `Basic ${credentials}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, credentials: 'omit' });
  } catch (e) {
    throw new ApiError({ status: 0, url, summary: e instanceof Error ? e.message : 'Network error' });
  }
  if (res.ok) return (await res.json()) as T;
  let message = '';
  try {
    message = ((await res.json()) as { error?: string }).error ?? '';
  } catch {
    /* no JSON body: the web server's own 401, or an HTML error page */
  }
  // A refused password is forgotten at once: sending it again would count toward the account's
  // invalid-login limit.
  if (res.status === 401) useMgmntAuth.getState().clear();
  throw new ApiError({
    status: res.status,
    url,
    summary:
      res.status === 401
        ? credentials
          ? 'The instance refused the password for /api/aperture.'
          : 'The log reader needs your password: its web application accepts a password only.'
        : res.status === 403
          ? message || 'Reading the logs needs %Admin_Operate:USE, which this account does not hold.'
          : res.status === 404 && !message
            ? LOG_READER_MISSING
            : message || `HTTP ${res.status}`,
  });
}

export function fetchLogSources(): Promise<LogSource[]> {
  return logsFetch<LogSource[]>('/logs');
}

/**
 * A window of whole lines ending at `before` (0: the end of the file), `bytes` long at most
 * (64 KiB by default, 256 KiB at most; the server caps it).
 */
export function readLogWindow(file: string, before = 0, bytes = 65536): Promise<LogWindow> {
  const q = new URLSearchParams({ file, before: String(before), bytes: String(bytes) });
  return logsFetch<LogWindow>(`/logs/read?${q}`);
}

/** Whether the instance answered 404 for the reader itself (not installed), as opposed to a file. */
export function isReaderMissing(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.summary === LOG_READER_MISSING;
}
