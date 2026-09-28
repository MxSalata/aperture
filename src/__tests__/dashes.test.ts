import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No en or em dash in the repository's own text, since Open Exchange refused module.xml over one
 * (module-xml.test.ts): a hyphen, or other wording. Not the repository's own text: the build
 * (www/), the recorded output of past runs (docs/verification/), the upstream specification
 * (spec/) and what is generated from it.
 */
const DIRS = ['src', 'e2e', 'scripts', 'ipm', 'public', 'docs', 'docker', '.github'];
const FILES = [
  'README.md',
  'CHANGELOG.md',
  'module.xml',
  'index.html',
  'package.json',
  'vite.config.ts',
  'docker-compose.yml',
  'playwright.config.ts',
  'playwright.live.config.ts',
  'eslint.config.js',
];
const TEXT = /\.(tsx?|m?js|cjs|json|md|cls|xml|html|css|ya?ml|conf|template|sh|svg|txt|py)$/;
const NOT_OURS = /^(docs\/verification\/|src\/api\/(schema\.d\.ts|spec-index\.json)$)/;
const DASH = /[\u2013\u2014]/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (NOT_OURS.test(path)) continue;
    if (entry.isDirectory()) yield* walk(path);
    else if (TEXT.test(entry.name)) yield path;
  }
}

describe('the repository text', () => {
  it('has no en or em dash', () => {
    const found = [...DIRS.flatMap((d) => [...walk(d)]), ...FILES].flatMap((file) =>
      readFileSync(join(process.cwd(), file), 'utf8')
        .split('\n')
        .flatMap((line, i) => (DASH.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(found).toEqual([]);
  });
});
