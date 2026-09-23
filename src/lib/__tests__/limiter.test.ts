import { describe, expect, it } from 'vitest';
import { createLimiter } from '../limiter';

describe('createLimiter', () => {
  it('runs at most n at once, all of them eventually, in order', async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (i: number) =>
      limit(async () => {
        started.push(i);
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return i * 10;
      });
    const results = await Promise.all([0, 1, 2, 3, 4].map(task));
    expect(results).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps going after a failure', async () => {
    const limit = createLimiter(1);
    const failed = limit(() => Promise.reject(new Error('no')));
    const next = limit(async () => 'ok');
    await expect(failed).rejects.toThrow('no');
    await expect(next).resolves.toBe('ok');
  });
});
