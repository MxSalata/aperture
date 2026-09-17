# Verification against real IRIS

Aperture's build sandbox had no Docker daemon, so every claim about real instances is
verified by two mechanisms instead of by hand:

1. **CI job `verify-iris`** (`.github/workflows/ci.yml`) boots `intersystemsdc/iris-community:latest`
   with `docker compose`, runs `docker/iris/init.script` through the container's `-a` hook, waits
   for `GET /api/admin/info` to answer 200, then runs the conformance script below and checks that
   the portal is served at `/aperture/`. The JSON report is uploaded as the `iris-verification`
   artifact on every run.
2. **`npm run verify:live`** (`scripts/live-check.mjs`) runs the same checks against any instance
   you point it at and saves `docs/verification/latest.json` as evidence.

```bash
IRIS_URL=http://iris.lan:52773 IRIS_USER=_SYSTEM IRIS_PASSWORD=SYS \
PORTAL_URL=http://iris.lan:52773/aperture/ npm run verify:live
```

## What is checked

| Check | Why it matters |
| --- | --- |
| `GET /info` with Basic auth; envelope shape; privilege keys | first request every screen depends on; the spec returns `Info` unwrapped |
| `POST /login`, bearer token accepted, `POST /refresh` | JWT flow on IRIS 2026.2; falls back to Basic and records it on older versions |
| `GET` of databases, database-dirs, namespaces, processes, tasks, dashboard, async-results, users, web-apps, journal files, locks | result shapes; `403` is recorded as "privilege not held", not as failure |
| `LocalDatabaseList` shape | the spec says object, servers say array; Aperture accepts both |
| error envelope on a missing namespace | `status.Errors` (documented), `status.errors` objects (observed) or top-level `errors` |
| `POST /v2/database-dir/info` → `202`, `Location` header, GUID in body, polling to `Finished` | the Job Center's contract |
| portal HTML served (optional) | the IPM / init-script deployment path |

## Latest results

Paste the summary line printed by the script, the IRIS version and the date here after each run,
and commit the JSON report next to this file.

| Date | IRIS version | Auth | Result | Report |
| --- | --- | --- | --- | --- |
| _(pending)_ | | | | |

## Known differences between spec and instances

See `src/lib/quirks.ts`; each entry names its source. Items marked as coming from another
contest entry's verification record were not reproduced here yet; the conformance script records
the actual behaviour so the table above can confirm or refute them.
