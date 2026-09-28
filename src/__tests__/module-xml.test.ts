import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('module.xml', () => {
  it('is plain ASCII, which Open Exchange can read', () => {
    // Open Exchange's reader keeps the low byte of a character only: an en dash (U+2013) in the
    // description became 0x13, which XML does not allow, and publishing to the package manager
    // failed ("XSLT XML Transformer Error: invalid character 0x13").
    const text = readFileSync(join(process.cwd(), 'module.xml'), 'utf8');
    const found = text
      .split('\n')
      .flatMap((line, i) =>
        [...line]
          .filter((c) => !/[\t\r\x20-\x7e]/.test(c))
          .map((c) => `line ${i + 1}: U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`),
      );
    expect(found).toEqual([]);
  });
});
