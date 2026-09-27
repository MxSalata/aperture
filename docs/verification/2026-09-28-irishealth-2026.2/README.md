# Evidence: API coverage on IRIS for Health 2026.2, 28 September 2026

The same instance as on [23](../2026-09-23-irishealth-2026.2/) and
[27 September](../2026-09-27-irishealth-2026.2/) (IRIS for Health Community 2026.2, Build 221U,
durable %SYS), read to produce [`docs/COVERAGE.md`](../../COVERAGE.md).

| File | What it shows |
| --- | --- |
| `coverage-live.json` | `scripts/live/coverage.mjs`: every GET of the SysAdmin API v2 called as an administrator, with parameters taken from the instance's own lists, and each answer checked against the schema the spec declares. 100 of 115 answered 200, none was refused and none failed; one answered 404 (no OAuth 2.0 server is configured on this instance), and 14 were not called, each with its reason (no ECP server, encryption key file, managed file transfer connection or X.509 credential exists, or the read needs an object IRIS refused to create). `GET /v2/async-result` is never called here: reading an ended task again logs an alert, so the live check's single read covers it. |
| `sample-data.json` | `scripts/live/sample-data.mjs`: the sample objects that let the reads above find something (a wallet collection with a secret, an OAuth 2.0 server definition and resource server, a file system access purpose, a privileged routine application and a DocDB application, all disabled or pointing at example.com), each type first taken through a create, read, delete and read round trip on a throw-away `ApertureProbe` object. IRIS refused two documented bodies: a client configuration's `RedirectionEndpoint` object (400, "needs to be a literal type") and a resource server mapping's `Service` (500). |

The sample objects stay on the instance for demonstrations; `scripts/live/sample-data.mjs --remove`
deletes them.
