import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEW_IN } from '@/features/shell/whatsNew';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
const moduleXml = readFileSync(join(process.cwd(), 'module.xml'), 'utf8');

describe('the release version', () => {
  it('is the same in package.json, module.xml and the About page', () => {
    expect(moduleXml.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(pkg.version);
    // The About page lists what is new in this version: a release must write its lines.
    expect(NEW_IN).toBe(pkg.version);
  });
});
