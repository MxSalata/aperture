import { describe, expect, it } from 'vitest';
import { parseLogLine, parseLogLines, severityCounts } from '../messagesLog';

describe('messages.log lines', () => {
  it('parses a stamped line with its category (IRIS 2021.1+ form)', () => {
    const e = parseLogLine(
      '09/24/26-21:15:03:123 (1234) 0 [Utility.Event] Private webserver started on 52773',
    );
    expect(e).toMatchObject({
      time: '2026-09-24 21:15:03',
      millis: 123,
      pid: 1234,
      severity: 0,
      category: 'Utility.Event',
      message: 'Private webserver started on 52773',
    });
  });

  it('parses a line without a category and without milliseconds (older writers)', () => {
    const e = parseLogLine('01/02/25-03:04:05 (77) 2 Write daemon has been unable to write for 60 seconds');
    expect(e).toMatchObject({
      time: '2025-01-02 03:04:05',
      millis: null,
      pid: 77,
      severity: 2,
      category: '',
    });
    expect(e?.message).toMatch(/^Write daemon/);
  });

  it('attaches banner and continuation lines to the entry before them, and keeps a leading one', () => {
    const entries = parseLogLines([
      '*** Recovery started at Thu Sep 24 21:14:58 2026',
      '09/24/26-21:15:00:001 (1200) 0 [Generic.Event] Starting IRIS',
      '    with a continuation line',
      '',
      '09/24/26-21:15:01:002 (1200) 1 [Generic.Event] Warning',
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      time: '',
      severity: null,
      message: '*** Recovery started at Thu Sep 24 21:14:58 2026',
    });
    expect(entries[1].message).toBe('Starting IRIS\n    with a continuation line');
    expect(entries[1].raw.split('\n')).toHaveLength(2);
    expect(entries[2].severity).toBe(1);
    expect(severityCounts(entries)).toEqual({ 0: 1, 1: 1, 2: 0, 3: 0 });
  });
});
