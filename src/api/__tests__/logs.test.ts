import { beforeEach, describe, expect, it } from 'vitest';
import { fetchLogSources, isReaderMissing, readLogWindow } from '../logs';
import { basicCredentials } from '../base';
import { resetClients } from '../client';
import { resetDb } from '@/mocks/db';
import { windowOf } from '@/mocks/handlers/logs';
import { useSession } from '@/stores/session';
import { useMgmntAuth } from '@/stores/mgmntAuth';
import { ApiError } from '@/lib/errors';
import { parseLogLines } from '@/lib/messagesLog';

const signIn = (username: string, auth: 'jwt' | 'basic') =>
  useSession
    .getState()
    .login({ connectionId: 't', baseUrl: 'http://iris.test', username, password: 'SYS', auth });

describe('a window of a log file', () => {
  it('holds whole lines, and paging backwards by start is contiguous and complete', () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(i % 37)}`).join('\n') + '\n';
    const seen: string[] = [];
    let before = 0;
    for (let guard = 0; guard < 100; guard++) {
      const w = windowOf(text, before, 1024);
      expect(w.end).toBe(before || w.size);
      for (const l of w.lines) expect(l).toMatch(/^line \d+ x*$/);
      seen.unshift(...w.lines);
      if (!w.hasMore) break;
      expect(w.start).toBeLessThan(w.end);
      before = w.start;
    }
    expect(seen).toEqual(text.trimEnd().split('\n'));
  });

  it('answers the tail of a file that ends without a newline', () => {
    const w = windowOf('a\nb\npartial', 0, 4096);
    expect(w.lines).toEqual(['a', 'b', 'partial']);
    expect(w.hasMore).toBe(false);
  });
});

describe('/api/aperture (the log reader)', () => {
  beforeEach(() => {
    resetDb();
    resetClients();
    useMgmntAuth.getState().clear();
  });

  it('lists the log files and reads the newest window of messages.log for a Basic session', async () => {
    await signIn('_SYSTEM', 'basic');
    const sources = await fetchLogSources();
    expect(sources.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'messages.log',
        'alerts.log',
        'SystemMonitor.log',
        'messages.old_20260918_101502',
      ]),
    );
    const messages = sources.find((s) => s.kind === 'messages' && s.current)!;
    const w = await readLogWindow(messages.id, 0, 8192);
    expect(w.end).toBe(w.size);
    expect(w.lines.length).toBeGreaterThan(10);
    const entries = parseLogLines(w.lines);
    expect(entries.every((e) => e.time || e.message)).toBe(true);
    expect(entries.some((e) => e.category === 'Utility.Event' || e.category === 'Generic.Event')).toBe(true);
    const older = await readLogWindow(messages.id, w.start, 8192);
    expect(older.end).toBe(w.start);
    expect(older.lines.length).toBeGreaterThan(10);
  });

  it('asks a JWT session for the password, refuses an account without %Admin_Operate, and names a missing file', async () => {
    await signIn('_SYSTEM', 'jwt');
    await expect(fetchLogSources()).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 401 && /needs your password/.test(e.summary),
    );
    useMgmntAuth.getState().set(basicCredentials('_SYSTEM', 'SYS'));
    expect((await fetchLogSources()).length).toBeGreaterThan(0);
    await expect(readLogWindow('../../etc/passwd')).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 404 && !isReaderMissing(e),
    );
    await signIn('auditor', 'basic');
    await expect(fetchLogSources()).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.status === 403,
    );
  });
});
