import { describe, expect, it } from 'vitest';
import { diffObjects } from '../ReviewChanges';

describe('diffObjects', () => {
  it('lists changed keys with before/after values', () => {
    const d = diffObjects({ a: 1, b: 'x', c: [1, 2], d: true }, { a: 1, b: 'y', c: [1, 2, 3], d: true });
    expect(d).toEqual([
      { key: 'b', before: 'x', after: 'y' },
      { key: 'c', before: [1, 2], after: [1, 2, 3] },
    ]);
  });
  it('treats null and undefined as equal and honours omit', () => {
    expect(diffObjects({ a: null }, { a: undefined, b: 2 }, ['b'])).toEqual([]);
    expect(diffObjects(undefined, { a: 1 })).toEqual([{ key: 'a', before: undefined, after: 1 }]);
  });
});
