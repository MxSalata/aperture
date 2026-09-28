import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The README shows docker-compose.yml for people who set Aperture up without the repository. */
describe('README', () => {
  it('shows docker-compose.yml as it is', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const file = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
    const shown = readme.match(
      /<summary>What <code>docker-compose\.yml<\/code> contains<\/summary>\s*```yaml\n([\s\S]*?)```/,
    );
    expect(shown?.[1].trim()).toBe(file.slice(file.indexOf('services:')).trim());
  });
});
