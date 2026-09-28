// Guards the eager entry chunk: it must not carry the OpenAPI operation index
// (that belongs to lazy chunks) and must stay under the size budget.
// Usage: npm run build && node scripts/check-bundle.mjs [dist]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.argv[2] ?? 'dist', 'assets');
// The entry is the app shell: the layout, the session and its API client, the routes, the
// navigation, the Job Center's poller, and the small libraries they use (dayjs, openapi-fetch,
// zustand). React, Mantine, TanStack and the charts have chunks of their own, which stay cached
// from one release to the next. Until 1.0.4 React DOM's client (200 KB) sat in the entry as well,
// because react-dom/client is an entry point the vendor chunk did not list; the budget grew with
// it to 334 KB. Without it the shell is 121 KB: 135 KB leaves room for small features, and fails at
// once if React DOM or the 180 KB spec index comes back (the check above also names the index).
const BUDGET = 135_000;
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
