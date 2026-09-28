import { describe, expect, it } from 'vitest';
import { applyOrder, movedBefore } from '../order';

describe('hand-arranged orders', () => {
  it('gives an entry the stored order does not know its default position, and drops one that no longer exists', () => {
    // An entry the code adds later shows up where the code puts it; a removed one leaves no hole.
    expect(applyOrder(['a', 'b', 'c', 'd'], ['d', 'gone', 'b'], (x) => x)).toEqual(['a', 'd', 'c', 'b']);
    expect(applyOrder(['a', 'b'], ['b', 'b', 'a'], (x) => x)).toEqual(['b', 'a']);
    expect(applyOrder(['a', 'b'], [], (x) => x)).toEqual(['a', 'b']);
  });

  it('moves an entry in front of another or to the end, and refuses what is no move', () => {
    expect(movedBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(movedBefore(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
    expect(movedBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
    expect(movedBefore(['a', 'b', 'c'], 'b', 'b')).toBeNull();
    expect(movedBefore(['a', 'b', 'c'], 'x', 'a')).toBeNull();
    expect(movedBefore(['a', 'b', 'c'], 'a', 'x')).toBeNull();
  });
});
