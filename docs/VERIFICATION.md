# Verification against real IRIS

Aperture's build sandbox had no Docker daemon, so every claim about real instances is
verified by two mechanisms instead of by hand:

1. **CI job `verify-iris`** (`.github/workflows/ci.yml`) builds the `iris` image from
   `docker/iris/Dockerfile` (official IRIS Community 2026.2 image): at build time `docker/iris/init.script`
   fetches the package manager and installs Aperture through `zpm "load"` of `module.xml`, which runs the Embedded Python installer,
   and prints its readiness report. The job then starts the container, waits for `GET /api/admin/info`
   to answer 200, runs the conformance script below, checks that the portal is served at `/aperture/`
   and prints the readiness report again from inside the running container. The JSON report is
   uploaded as the `iris-verification` artifact on every run.
2. **`npm run verify:live`** (`scripts/live-check.mjs`) runs the same checks against any instance
   you point it at and saves `docs/verification/latest.json` as evidence.

```bash
IRIS_URL=http://iris.lan:52773 IRIS_USER=_SYSTEM IRIS_PASSWORD=SYS \
PORTAL_URL=http://iris.lan:52773/aperture/index.html npm run verify:live
```

## What is checked

| Check | Why it matters |
| --- | --- |
| `GET /info` with Basic auth; envelope shape; privilege keys | first request every screen depends on; the spec returns `Info` unwrapped |
| `POST /login`, bearer token accepted, `POST /refresh` | JWT flow on IRIS 2026.2; falls back to Basic and records it on older versions |
| `GET` of databases, database-dirs, namespaces, processes, tasks, dashboard, async-results, users, web-apps, journal files, locks | result shapes; `403` is recorded as "privilege not held", not as failure |
| `LocalDatabaseList` shape | the spec says object, servers say array; Aperture accepts both |
| error envelope on a missing namespace | `status.Errors` (documented), `status.errors` objects (observed) or top-level `errors` |
| `POST /v2/database-dir/info` → `202`, task id from the `Location` header (2026.2 sends no body), polling to `Finished` | the Job Center's contract |
| `POST /v2/task/suspend` + `resume` (opt-in `--mutate`) | the read-back after a change; whether the task list reflects the suspend at once; a bodiless suspend answers 415 |
| portal HTML served (optional) | the IPM / init-script deployment path |

## Latest results

Paste the summary line printed by the script, the IRIS version and the date here after each run,
and commit the JSON report next to this file.

| Date | IRIS version | Auth | Result | Report |
| --- | --- | --- | --- | --- |
| 2026-09-19 | IRIS for UNIX 2026.2 (Build 221U), `intersystems/iris-community:2026.2`, CI run 35468133739 (`verify-iris` green) | JWT (login + refresh) | 22/22: `/info`, privileges, JWT login and refresh, all list shapes, error envelope, the full `202` round trip to `Finished`, portal served at `/aperture/index.html` | `iris-verification` artifact of the run |
| 2026-09-19 | same image, run 35467740679 | JWT | 21/22: identical, except the bare `/aperture/` directory URL answered 404; the built-in web server needs `/aperture/index.html`, which the check and the docs now use | job log |
| 2026-09-22 | same image, run 35719716417 (`--mutate`) | JWT | 25/25: the previous 22 plus a suspend/resume round trip; the read-back showed `/v2/task/info` correct and `/v2/tasks` lagging (recorded, not a failure) | `iris-verification` artifact of the run |
| 2026-09-19 | same image, both runs, inside the container | - | `Aperture.Installer.Doctor()` (Embedded Python): 7/7 ok (version, JWT available, `/api/admin` enabled + password + JWT, `/aperture` web app, files on disk) | job log, step "Readiness report" |

## Findings from the `--mutate` probe (22 September 2026, run 35718557061)

- **The task list lags behind the task object.** Right after `POST /v2/task/suspend` succeeded,
  `GET /v2/task/info` reported `Suspended=true` while the row in `GET /v2/tasks` still reported
  `false` (run 35719716417). This reproduces the IRIS Fieldwork finding. The task detail page
  re-reads both and says which one has not caught up; recorded as `task-suspended-lag`.
- `POST /v2/task/suspend?id=…` **without a body answers HTTP 415**, although the specification
  marks the body (`LeaveInQueue`) as optional. The portal and the probe now send `{}` with
  `Content-Type: application/json`; the same applies to `database-dir/mount`, `database-dir/truncate`
  and `journal/file/integrity-check`, and the Explorer always sends `{}` for an operation that
  declares a body. Recorded as `optional-body-415` in `src/lib/quirks.ts`.

## Known differences between spec and instances

See `src/lib/quirks.ts`; each entry names its source. Items marked as coming from another
contest entry's verification record were not reproduced here yet; the conformance script records
the actual behaviour so the table above can confirm or refute them.
