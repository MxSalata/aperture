import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEW_IN } from '@/features/shell/whatsNew';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
const moduleXml = readFileSync(join(process.cwd(), 'module.xml'), 'utf8');

const parts = (v: string) => v.split('.').map(Number);

describe('the release version', () => {
  it('is the same in package.json and module.xml', () => {
    expect(moduleXml.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(pkg.version);
  });

  it("is the About page's feature release, or a later patch of it (a dependency update)", () => {
    // A feature release writes its "New in" lines; a merged dependency update moves the patch only.
    const [major, minor, patch] = parts(pkg.version);
    const [newMajor, newMinor, newPatch] = parts(NEW_IN);
    expect(`${major}.${minor}`).toBe(`${newMajor}.${newMinor}`);
    expect(patch).toBeGreaterThanOrEqual(newPatch);
  });
});
