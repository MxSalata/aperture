import { describe, expect, it } from 'vitest';
import fixture from '../../../ipm/python/tests/fixture.json';
import {
  cosine,
  fnv1a32,
  normaliseLogText,
  vectorLiteral,
  vectoriseLogText,
  VECTOR_DIMS,
} from '../logVectors';

/** The fixture is written by the Python twin (ipm/python/tests/make_fixture.py): both must agree. */
const byName = new Map(fixture.cases.map((c) => [c.name, c]));

describe('log wording vectors', () => {
  it('reproduces the templates and vectors of the Python vectoriser to the last decimal', () => {
    expect(VECTOR_DIMS).toBe(fixture.dims);
    for (const c of fixture.cases) {
      expect(normaliseLogText(c.text), c.name).toBe(c.template);
      expect(vectorLiteral(vectoriseLogText(c.text)), c.name).toBe(c.vector);
    }
  });

  it('is deterministic and unit length', () => {
    for (const c of fixture.cases) {
      const v = vectoriseLogText(c.text);
      expect(v).toHaveLength(VECTOR_DIMS);
      expect(v).toEqual(vectoriseLogText(c.text));
      const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
      if (c.template) expect(norm).toBeCloseTo(1, 9);
      else expect(norm).toBe(0);
    }
  });

  it('scores the same message with other numbers above 0.9 and unrelated messages below 0.3', () => {
    for (const p of fixture.pairs) {
      const score = cosine(vectoriseLogText(byName.get(p.a)!.text), vectoriseLogText(byName.get(p.b)!.text));
      if ('min' in p) expect(score, `${p.a} ~ ${p.b}`).toBeGreaterThanOrEqual(p.min!);
      else expect(score, `${p.a} ~ ${p.b}`).toBeLessThanOrEqual(p.max!);
    }
  });

  it('hashes like FNV-1a and formats without a negative zero', () => {
    // Known FNV-1a 32-bit values.
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
    expect(vectorLiteral([0, -0, 0.5, -1e-9])).toBe('0.000000,0.000000,0.500000,0.000000');
  });
});
