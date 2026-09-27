// Guards the eager entry chunk: it must not carry the OpenAPI operation index
// (that belongs to lazy chunks) and must stay under the size budget.
// Usage: npm run build && node scripts/check-bundle.mjs [dist]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.argv[2] ?? 'dist', 'assets');
// 300 KB would be the ideal. The entry is Mantine, React, the router, TanStack Query and the app
// shell; it was ~301 KB at 0.2.0 and reached 319.8 KB at 1.0.1 (the read-only middleware, the
// lock-out guard, the password gate), with 220 bytes left under the old 320 KB budget. 330 KB leaves
// room for small features and still fails at once if the 180 KB spec index comes back, which the
// check above also names.
const BUDGET = 330_000;
const entry = readdirSync(dir).find((n) => /^index-.*\.js$/.test(n));
if (!entry) {
  console.error(`check-bundle: no entry chunk in ${dir}`);
  process.exit(1);
}
const file = join(dir, entry);
const text = readFileSync(file, 'utf8');
const size = statSync(file).size;
const problems = [];
if (text.includes('/v2/security/audit/events'))
  problems.push('the OpenAPI operation index is bundled into the entry chunk');
if (size > BUDGET) problems.push(`entry chunk is ${size} bytes, budget is ${BUDGET}`);
console.log(`check-bundle: ${entry} ${size} bytes${problems.length ? '' : ' - ok'}`);
for (const p of problems) console.error(`check-bundle: ${p}`);
process.exit(problems.length ? 1 : 0);
