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

## Similar entries (IRIS Vector Search), 03:48 to 03:55

The package reloaded from the working copy (`zpm "load /aperture -v"`, in `%SYS` on this run, so
`/api/aperture` now runs there): the six classes compiled, including `Aperture.LogLine`'s
`%Library.Vector(DATATYPE = "DOUBLE", LEN = 256)` property under its `%SQL.Index.HNSW(Distance =
"Cosine")` index; the vectoriser was copied as a directory to `mgr/aperture-python/`; the readiness
report passed its nine checks.

| File | What it shows |
| --- | --- |
| `verify-live-vector.json` | `scripts/live-check.mjs`: 26/26 with JWT, among them the log reader (3 files, a window of 176 whole lines), the wording index (2,690 entries, 1 file, not stale, 256 dimensions, HNSW, cosine) and a similar query for the newest entry of `messages.log` (5 matches, best 1, 41 of the 250 nearest scoring 0.9 or more, 264 ms). |
| `similar-entries-live.png`, `similar-entries-live.json` | `e2e/live/similar.spec.ts` through the portal: Logs, Messages log, a `CPUusage Alert` entry, Similar entries. The same alert with other figures scores 100 %, the `CPUusage Warning` entries 64 %, and the drawer says "Seen 2 times since 2026-09-28 02:07:58 (last 2026-09-28 03:12:54)". |

Before the check, by hand through the reader: `GET /api/aperture/` answers version 1.1.0 with the
three index routes; every window carries one byte offset per line, increasing from the window's
start; the index started empty and stale, and one `POST /api/aperture/logs/index` indexed the whole
`messages.log` (345 KB, 2,688 entries, each an HNSW insert) in 5.2 s, well under the 20 s at which
the batch would need lowering; `TO_VECTOR(?, DOUBLE, 256)` with a parameter works. Uninstalling was
not tried.

