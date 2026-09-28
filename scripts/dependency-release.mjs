#!/usr/bin/env node
// A dependency update merged into main is a patch release of its own (ci.yml, the
// www-after-dependabot-merge job): this writes the release's CHANGELOG section from the merged
// commits, whose Dependabot messages name each package and its versions, and prints the same
// lines for the GitHub release. The section goes after "## Unreleased", which keeps what the next
// feature release will say.
//
// Usage: node scripts/dependency-release.mjs <version> < commits.json
// commits.json: the push event's commits (message, added, modified ...), as GitHub sends them.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: dependency-release.mjs <major.minor.patch> < commits.json');
  process.exit(1);
}
const commits = JSON.parse(readFileSync(0, 'utf8'));

const bullets = [];
for (const commit of Array.isArray(commits) ? commits : []) {
  const [title, ...body] = String(commit.message ?? '').split('\n');
  if (!/^Bump\b/.test(title)) continue;
  // "Updates `@tabler/icons-react` from 3.46.0 to 3.48.0" lines of a grouped update, or the title
  // of a single one ("Bump globals from 16.5.0 to 17.12.0"), which already names the versions.
  const updates = body
    .map((line) => line.trim())
    .map((line) => /^Updates? `([^`]+)` from (\S+) to (\S+)/.exec(line))
    .filter(Boolean)
    .map((m) => `${m[1]} ${m[2]} to ${m[3]}`);
  const clean = title.replace(/\s+\(#\d+\)$/, '');
  bullets.push(updates.length ? `- ${clean}: ${updates.join(', ')}.` : `- ${clean}.`);
}
if (!bullets.length) bullets.push('- Dependency updates merged from Dependabot.');

const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const section = `## ${version} - Dependency updates (${date})\n\n${bullets.join('\n')}\n\n`;
const path = 'CHANGELOG.md';
const text = readFileSync(path, 'utf8');
const at = text.search(/^## \d/m);
writeFileSync(
  path,
  at < 0 ? `${text.trimEnd()}\n\n${section}` : text.slice(0, at) + section + text.slice(at),
);
process.stdout.write(`${bullets.join('\n')}\n`);
