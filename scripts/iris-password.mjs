#!/usr/bin/env node
// The password of the Docker image's administrator accounts (_SYSTEM, SuperUser and every other
// enabled account except CSPSystem, which the image's own Web Gateway signs in with). Generated
// once into .secrets/iris-password (git- and docker-ignored) and handed to the image build as a
// BuildKit secret, so it never lands in an image layer, the build context or the build log.
//
//   npm run iris:password            creates the file if it does not exist, and says where it is
//   npm run iris:password -- --new   replaces it (rebuild the image afterwards)
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('.secrets', 'iris-password');
if (existsSync(file) && !process.argv.includes('--new')) {
  console.log(`${file} exists; the image build uses it. Replace it with: npm run iris:password -- --new`);
  process.exit(0);
}
mkdirSync(resolve('.secrets'), { recursive: true });
// 24 characters of base64url: letters, digits, "-" and "_", which IRIS's default password pattern accepts.
writeFileSync(file, `${randomBytes(18).toString('base64url')}\n`, { mode: 0o600 });
try {
  chmodSync(file, 0o600);
} catch {
  /* not supported on this file system */
}
console.log(`Wrote a new password to ${file}.`);
console.log(
  'Build the image with it (docker compose build iris), then sign in as _SYSTEM with that password.',
);
