import { logsRequest } from './logs';
import type { LogSeverity } from '@/lib/messagesLog';

/**
 * "Similar entries" of the log reader (Aperture.LogIndex on the instance): the wording index of
 * messages.log and its rotations, and a query by cosine similarity over it. Matching is by
 * wording (hashed words under an HNSW index), not by meaning.
 */
export interface LogIndexFile {
  id: string;
  current: boolean;
  size: number;
  indexedTo: number;
  lines: number;
  indexedAt: string;
  pending: number;
}

export interface LogIndexStatus {
  files: LogIndexFile[];
  lines: number;
  /** Whether a refresh has lines to index. */
  stale: boolean;
  pendingBytes: number;
  maxBytesPerCall: number;
  maxLinesPerCall: number;
  firstTail: number;
  dims: number;
  index: string;
  distance: string;
}

export interface LogIndexRefresh {
  files: { id: string; added: number; indexedTo: number; size: number; pending: number }[];
  lines: number;
  indexedAt: string;
  stale: boolean;
}

export interface SimilarMatch {
  file: string;
  offset: number;
  time: string;
  severity: LogSeverity | null;
  category: string;
  text: string;
  /** Cosine similarity, 0 to 1. */
  score: number;
}

export interface SimilarEntries {
  entry: {
    file: string;
    offset: number;
    time: string;
    severity: LogSeverity | null;
    category: string;
    text: string;
    template: string;
  };
  matches: SimilarMatch[];
  summary: {
    /** Entries scoring `threshold` or more among the `of` nearest, the entry itself included. */
    similar: number;
    of: number;
    first: string;
    last: string;
    threshold: number;
    capped?: boolean;
  };
  method: string;
}

export function fetchLogIndex(): Promise<LogIndexStatus> {
  return logsRequest<LogIndexStatus>('/logs/index');
}

/** One bounded refresh; call again while the answer says `stale`. */
export function refreshLogIndex(): Promise<LogIndexRefresh> {
  return logsRequest<LogIndexRefresh>('/logs/index', 'POST');
}

export function fetchSimilarEntries(file: string, offset: number, limit = 20): Promise<SimilarEntries> {
  const q = new URLSearchParams({ file, offset: String(offset), limit: String(limit) });
  return logsRequest<SimilarEntries>(`/logs/similar?${q}`);
}

/** The most refreshes one search waits for before it asks with what is indexed so far. */
export const MAX_REFRESHES = 12;

/**
 * Brings the index up to date, one bounded refresh at a time, then searches; `onProgress` is
 * told what is happening so a screen can say "indexing" rather than "loading".
 */
export async function similarEntries(
  file: string,
  offset: number,
  limit: number,
  onProgress: (state: { phase: 'checking' | 'indexing' | 'searching'; pendingBytes?: number }) => void,
): Promise<SimilarEntries> {
  onProgress({ phase: 'checking' });
  let status = await fetchLogIndex();
  for (let i = 0; i < MAX_REFRESHES && status.stale; i++) {
    onProgress({ phase: 'indexing', pendingBytes: status.pendingBytes });
    const done = await refreshLogIndex();
    if (!done.stale) break;
    status = await fetchLogIndex();
  }
  onProgress({ phase: 'searching' });
  return fetchSimilarEntries(file, offset, limit);
}
