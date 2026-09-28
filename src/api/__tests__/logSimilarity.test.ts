import { beforeEach, describe, expect, it } from 'vitest';
import { fetchLogIndex, fetchSimilarEntries, refreshLogIndex, similarEntries } from '../logSimilarity';
import { fetchLogSources, lineOffsets, readLogWindow } from '../logs';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';
import { parseLogLines } from '@/lib/messagesLog';

const signIn = () =>
  useSession.getState().login({
    connectionId: 't',
    baseUrl: 'http://iris.test',
    username: '_SYSTEM',
    password: 'SYS',
    auth: 'basic',
  });

describe('/api/aperture/logs/similar (the wording index)', () => {
  beforeEach(async () => {
    resetDb();
    resetClients();
    useMgmntAuth.getState().clear();
    await signIn();
  });

  it('reports the index, builds it on a refresh, and names entries by the offsets of a window', async () => {
    const before = await fetchLogIndex();
    expect(before.stale).toBe(true);
    expect(before.files.map((f) => f.id)).toEqual(
      expect.arrayContaining(['messages.log', 'messages.old_20260918_101502']),
    );
    expect(before.index).toBe('HNSW');
    const done = await refreshLogIndex();
    expect(done.lines).toBeGreaterThan(1000);
    expect(done.stale).toBe(false);
    const after = await fetchLogIndex();
    expect(after.stale).toBe(false);
    expect(after.lines).toBe(done.lines);
    expect(after.files.every((f) => f.indexedTo === f.size && f.pending === 0)).toBe(true);

    const messages = (await fetchLogSources()).find((s) => s.kind === 'messages' && s.current)!;
    const w = await readLogWindow(messages.id, 0, 8192);
    expect(w.offsets).toHaveLength(w.lines.length);
    expect(lineOffsets(w)).toEqual(w.offsets);
    const older = await readLogWindow(messages.id, w.start, 8192);
    // Offsets are contiguous across windows: the last line of the older window ends where the newer starts.
    const lastOlder = older.offsets![older.offsets!.length - 1];
    expect(lastOlder + new TextEncoder().encode(older.lines[older.lines.length - 1]).length + 1).toBe(
      w.start,
    );
  });

  it('answers the entry, its nearest by score, and how often the same message was seen', async () => {
    const messages = (await fetchLogSources()).find((s) => s.kind === 'messages' && s.current)!;
    const w = await readLogWindow(messages.id, 0, 16384);
    const entries = parseLogLines(w.lines, w.offsets);
    const expanded = entries.find((e) => /expanded by/.test(e.message))!;
    const phases: string[] = [];
    const answer = await similarEntries(messages.id, expanded.offset!, 5, (p) => phases.push(p.phase));
    expect(phases[0]).toBe('checking');
    expect(phases).toContain('searching');
    expect(answer.entry).toMatchObject({ file: messages.id, offset: expanded.offset, time: expanded.time });
    expect(answer.matches.length).toBeLessThanOrEqual(5);
    expect(answer.matches.length).toBeGreaterThan(0);
    const scores = answer.matches.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // The same message with other numbers scores 1.0; it is never the entry itself.
    expect(scores[0]).toBeGreaterThanOrEqual(0.9);
    expect(answer.matches.some((m) => m.file === messages.id && m.offset === expanded.offset)).toBe(false);
    expect(answer.matches.every((m) => /expanded by/.test(m.text) || m.score < 0.9)).toBe(true);
    expect(answer.summary.similar).toBeGreaterThan(1);
    expect(answer.summary.first <= answer.summary.last).toBe(true);
    expect(answer.summary.threshold).toBe(0.9);
    expect(answer.method).toMatch(/hashed words/);

    // A rotation's entries count too: the summary reaches across files.
    expect(
      answer.matches.some((m) => m.file !== messages.id) || answer.summary.of >= answer.matches.length,
    ).toBe(true);
  });

  it('refuses a missing file or offset, and names an offset where no stamped line starts', async () => {
    await expect(fetchSimilarEntries('', 0)).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 400,
    );
    await expect(fetchSimilarEntries('nowhere.log', 0)).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 404 && /Not a catalogued/.test(e.summary),
    );
    // Offset 0 of the generated messages.log is the empty line before the recovery banner.
    await expect(fetchSimilarEntries('messages.log', 0)).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 404 && /No stamped entry/.test(e.summary),
    );
  });

  it('reads only on a GET: the index grows through POST /logs/index, never through a query', async () => {
    const messages = (await fetchLogSources()).find((s) => s.kind === 'messages' && s.current)!;
    const w = await readLogWindow(messages.id, 0, 16384);
    const entry = parseLogLines(w.lines, w.offsets).find((e) => /expanded by/.test(e.message))!;
    const unindexed = await fetchSimilarEntries(messages.id, entry.offset!, 5);
    expect(unindexed.entry.offset).toBe(entry.offset);
    expect(unindexed.matches).toEqual([]);
    expect((await fetchLogIndex()).stale).toBe(true);
  });
});
