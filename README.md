<p align="center">
  <img src="public/favicon.svg" width="72" alt="Aperture logo" />
</p>
<h1 align="center">Aperture</h1>
<p align="center"><b>A modern management portal for InterSystems IRIS, built entirely on the SysAdmin REST API.</b></p>
<p align="center">
  <a href="#online-demo">Online demo</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-you-get">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="docs/ARTICLE.md">Article</a>
</p>

Aperture is an entry for the **InterSystems Programming Contest: Build Your Own Management Portal**.
It is a single-page application (React 19 + TypeScript) that talks only to the
[SysAdmin API v2](https://github.com/intersystems-community/sysadmin-api-specification) (`/api/admin`),
covers **all 273 operations** of the specification, and adds the things the classic portal never had:
a live dashboard, a Job Center for asynchronous operations, a command palette, privilege-aware
navigation, dark mode, and an in-browser demo that needs no IRIS at all.

![Dashboard](docs/screenshots/02-dashboard.png)

## Online demo

**No IRIS required.** The demo build serves the entire SysAdmin API from a mock inside your browser
(Mock Service Worker), seeded to look like a busy IRIS 2026.2 instance with interoperability,
HL7/DICOM workloads, tasks, journals, users and audit history. Every write is real against the
in-memory instance: create a namespace, compact a database, terminate a process, purge audit records.

- GitHub Pages: https://mxsalata.github.io/intersystems-frontend-contest/ (published by the CI workflow once GitHub Pages is set to "GitHub Actions" in the repository settings)
- Or locally: `npm run build:demo && npm run preview:demo` → http://localhost:4174

| Demo account | Password | Privileges                                        | What it shows                                              |
| ------------ | -------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `_SYSTEM`    | `SYS`    | everything                                        | full portal                                                |
| `operator`   | `SYS`    | `%Admin_Operate`, `%Admin_Task`, `%Admin_Journal` | security screens disappear, actions explain what they need |
| `auditor`    | `SYS`    | `%Admin_Secure` only                              | only the security area is usable                           |

Every real deployment also has a **Try the demo** button on the login page.

## Quick start

### 1. Docker Compose (IRIS + portal, one command)

```bash
git clone https://github.com/MxSalata/intersystems-frontend-contest.git
cd intersystems-frontend-contest
docker compose up --build
```

- http://localhost:8080 - Aperture behind nginx (proxies `/api/admin` to IRIS, no CORS, no Basic-auth pop-ups; sends a Content-Security-Policy, set `IRIS_ALLOWED_ORIGINS="https://other.iris:52773"` on the `portal` service to let the browser call further instances directly)
- http://localhost:52773/aperture/index.html - Aperture served by IRIS itself (the committed `www/` build, refreshed with `npm run build:www`; the built-in web server needs the file name, a bare `/aperture/` answers 404)
- Sign in with `_SYSTEM` / `SYS`

The `iris` service is built from [`docker/iris/Dockerfile`](docker/iris/Dockerfile) on top of
`intersystems/iris-community:2026.2` (put `IRIS_IMAGE=intersystems/irishealth-community:2026.2`
in a `.env` file next to the compose file for IRIS for Health Community). At build time
[`docker/iris/init.script`](docker/iris/init.script) fetches the InterSystems Package Manager from the
community registry and installs Aperture through its own IPM package (`zpm "load"` of [`module.xml`](module.xml)): the built portal is copied under the instance's `csp/`
directory, the `/aperture` web application is created, and [`Aperture.Installer`](ipm/cls/Aperture/Installer.cls),
written in Embedded Python, enables `/api/admin` with password + JWT authentication. The build log
ends with the installer's readiness report; you can print it again at any time:

```bash
docker exec aperture-iris iris session IRIS -U USER "##class(Aperture.Installer).Doctor()"
```

### 2. IPM (ZPM) package

```objectscript
zpm "install iris-aperture"
```

copies the pre-built portal (`www/`) under the instance's `csp/` directory, creates the `/aperture`
web application and runs [`Aperture.Installer`](ipm/cls/Aperture/Installer.cls), an Embedded Python
class that enables `/api/admin` with password and JWT authentication and prints a readiness report
(IRIS version, JWT availability, the API's authentication settings, the portal's files). Then open
`http://<host>:52773/aperture/index.html`. From a checkout, `zpm "load /path/to/intersystems-frontend-contest"`
installs the same package; `##class(Aperture.Installer).Doctor()` prints the report again.

### 3. Development

```bash
npm install
cp .env.example .env           # VITE_IRIS_URL=http://localhost:52773
npm run dev                    # http://localhost:5173, /api/admin proxied to IRIS
```

Other scripts:

| Script                | What it does                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run build`       | type-check + production build (`dist/`, browser routing, for nginx)                                  |
| `npm run build:www`   | build for IRIS-hosted deployment (`www/`, relative URLs + hash routing)                              |
| `npm run build:demo`  | build the online demo (`dist-demo/`, in-browser mock)                                                |
| `npm test`            | Vitest unit tests (client, auth, privileges, async jobs, spec index)                                 |
| `npm run test:e2e`    | Playwright end-to-end tests against the demo build                                                   |
| `npm run smoke`       | walks the main screens in headless Chromium and refreshes `docs/screenshots/`                        |
| `npm run verify:live` | conformance check of a real instance (`IRIS_URL`, `IRIS_USER`, `IRIS_PASSWORD`), saves JSON evidence |
| `npm run gen:api`     | regenerate `src/api/schema.d.ts` and the operation index from `spec/mainspec_v2.json`                |

### Requirements on the IRIS side

- IRIS or IRIS for Health **2025.1+** with the `/api/admin` web application (**2026.2+** for JWT login; older versions use HTTP Basic automatically).
- The account needs at least one `%Admin_*` privilege (`GET /info` refuses everyone else).
- If the portal is served from a different origin than IRIS, add that origin to the CORS allow-list of `/api/admin` (Aperture can do that itself under _Security → Web applications → /api/admin_).

## What you get

| Area                                              | Screens                                                                                                                                                                                                                                                                     | Notable                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Dashboard**                                     | live stats, sparklines, global refs/s and disk I/O charts, health, alerts, upcoming tasks, busy processes, resource seizes                                                                                                                                                  | polls `/v2/monitor/*` every 3 s, keeps history while you navigate                        |
| **Job Center**                                    | every `202 Accepted` response, with console output, progress, pause / resume / cancel                                                                                                                                                                                       | fed automatically by the API client (Location header or body GUID); toasts on completion |
| **Activity**                                      | every change this tab sent and what the server answered, exportable as JSON                                                                                                                                                                                                 | recorded by the client middleware                                                        |
| **Host monitor**                                  | CPU, memory, disk, licence and alerts.log from the native `/api/monitor` service                                                                                                                                                                                            | OpenMetrics parsed in the browser; degrades to "unavailable" honestly                    |
| **Databases**                                     | configuration + local file view, metrics (async), mount/dismount, compact, defragment, integrity check, truncate, expand, volumes, create, delete                                                                                                                           | dangerous actions require typing the name                                                |
| **Namespaces**                                    | create, delete, enable interoperability, copy mappings, global/package/routine mappings                                                                                                                                                                                     |                                                                                          |
| **Processes**                                     | live list, detail with variables and roles, suspend/resume/terminate, broadcast                                                                                                                                                                                             |                                                                                          |
| **Locks, Journals, Tasks, Web sessions, License** | lock removal with transaction check, journal files/records/settings/switching, task schedules + history + task manager, session ending, license key/usage/servers                                                                                                           |                                                                                          |
| **Security**                                      | users, roles, resources, services, web applications (JWT, CORS), audit events + log + purge, TLS/SSL configs + test, SQL privileges                                                                                                                                         |                                                                                          |
| **API Explorer**                                  | every one of the 273 operations rendered from the OpenAPI document: parameters, request body form or JSON, privileges, documented responses, response as table / fields / JSON                                                                                              | reachable from the command palette                                                       |
| **Everywhere**                                    | ⌘K command palette, privilege badges, raw JSON of every response, responsive layout, multiple saved connections, escalation-role login, LIVE / OFFLINE / DEMO indicator                                                                                                     |                                                                                          |
| **Tables**                                        | filter, sort and page live in the URL (share a link to exactly what you see; Back restores it), column choices and page size are remembered per table, every table exports its filtered rows as CSV, "no rows" and "nothing matches your filter" are different messages     | `stateKey` / `exportName` on `DataTable`                                                 |
| **Instances**                                     | each saved connection has a colour (a bar under the header, so production never looks like staging) and an optional time zone, browser-tab titles carry the instance name and its LIVE flag, and an account without `%Admin_Operate` lands on a screen it can use           | `docs/ARCHITECTURE.md` §2.10 for the time policy                                         |
| **Appearance**                                    | light / dark / system theme plus an independent contrast axis (system / normal / high), applied before the first paint; live regions, keyboard-reachable tooltips, reduced-motion and forced-colors support; chart palettes validated against their surfaces by a unit test | Appearance menu in the header                                                            |
| **Change review**                                 | every edit form shows old → new per field, re-reads the object to detect concurrent edits, and only then applies                                                                                                                                                            | `reviewChanges()` in `src/components/ReviewChanges.tsx`                                  |

<details>
<summary>More screenshots</summary>

|                                                   |                                                             |
| ------------------------------------------------- | ----------------------------------------------------------- |
| ![Databases](docs/screenshots/03-databases.png)   | ![Database detail](docs/screenshots/04-database-detail.png) |
| ![Job Center](docs/screenshots/05-job-center.png) | ![Processes](docs/screenshots/06-processes.png)             |
| ![Audit](docs/screenshots/09-audit.png)           | ![Explorer](docs/screenshots/11-explorer.png)               |
| ![Dark mode](docs/screenshots/13-dark.png)        | ![High contrast](docs/screenshots/19-high-contrast.png)     |
| ![Mobile](docs/screenshots/15-mobile.png)         | ![Host monitor](docs/screenshots/16-monitor.png)            |

</details>

## Architecture

```
browser ──HTTPS──▶ nginx (dist/) ──/api/admin──▶ IRIS private web server / web gateway
        or  ──▶ IRIS /aperture (www/, static CSP app, same origin)
        or  ──▶ Vite dev server (proxy)             or  ──▶ MSW mock (demo)
```

- **Typed client.** `openapi-typescript` turns `spec/mainspec_v2.json` into `src/api/schema.d.ts`;
  `openapi-fetch` gives compile-time checked paths, query parameters, bodies and responses for every operation.
- **Envelope handling.** `call()` / `result()` unwrap `{ status: { Errors, summary }, console, result }`
  and turn any non-2xx into an `ApiError` carrying the server's summary and console lines.
- **Authentication.** `POST /login` → JWT access + refresh tokens (IRIS 2026.2+). A fetch middleware adds
  the bearer header, refreshes proactively before expiry and once more on a 401, then retries the
  request with its original body. If `/login` does not exist, the client falls back to HTTP Basic.
  Escalation roles are supported via the `role` field of `/login`.
- **Asynchronous operations.** The same middleware watches for `202 Accepted`, parses the `Location`
  header (`/v2/async-result?id=…`) and registers a job. The Job Center polls until
  `Finished | Failed | Canceled`, shows `Console`, `Result` and `ProgressCurrent/ProgressTotal`, and
  invalidates cached queries when a job completes.
- **Privileges.** `GET /info` reports the user's `%Admin_*` permissions. Navigation, the command
  palette and every page header use them; unknown resources (older servers) stay optimistic.
- **Spec-driven Explorer.** A build step (`scripts/build-spec-index.mjs`) extracts a compact index
  (method, path, group, privileges, parameters, async flag); the full document is lazy-loaded only
  when the Explorer needs schemas to build forms and examples.
- **Demo / tests.** The MSW handlers in `src/mocks` implement the API against an in-memory instance,
  including JWT issuance, privilege enforcement, 202 tasks with progress, and a spec-driven fallback
  for every operation without a hand-written handler. The same handlers run in the browser (demo)
  and in Node (Vitest, Playwright).

## Documentation

| File                                                               | Purpose                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                       | how the layers fit: typed client, auth, async jobs, privileges, mock, deployment |
| [docs/ARCHITECTURE_OVERVIEW.mmd](docs/ARCHITECTURE_OVERVIEW.mmd)   | the same as a Mermaid diagram                                                    |
| [docs/CONTEST_PLAN.md](docs/CONTEST_PLAN.md)                       | contest requirements, judging, bonuses, plan                                     |
| [docs/BONUSES.md](docs/BONUSES.md)                                 | technology bonuses: criteria, evidence, what remains                             |
| [docs/OPENEXCHANGE_SUBMISSION.md](docs/OPENEXCHANGE_SUBMISSION.md) | paste-ready Open Exchange listing                                                |
| [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)       | everything to tick before the deadline                                           |
| [docs/DEMO_ASSETS_CHECKLIST.md](docs/DEMO_ASSETS_CHECKLIST.md)     | screenshots (generated) and video assets                                         |
| [docs/ARTICLE.md](docs/ARTICLE.md)                                 | Developer Community article draft                                                |
| [docs/ARTICLE_2.md](docs/ARTICLE_2.md)                             | second article draft: what the specification does not tell you                   |
| [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md)                       | three demo video storyboards                                                     |
| [docs/prototype/](docs/prototype/)                                 | the original single-file prototype this repository started from (archived)       |

## Verified against real IRIS

The CI job `verify-iris` builds the IRIS image (IRIS Community 2026.2, Aperture installed through
`zpm "load"` of its `module.xml`, Embedded Python installer), starts it and runs `scripts/live-check.mjs`: JWT login and refresh, `/info`, list shapes, the error envelope and a full `202` round trip,
plus a check that the portal is served at `/aperture/index.html` (22/22 on IRIS 2026.2, Build 221U). Run the same against your own instance with
`npm run verify:live`; results are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Spec findings

Things noticed while implementing the whole specification (reported for the API team). The specification is
vendored at commit `f764aea427e5c0b1dd08a4c18a0457e0ff7b3b34` of
[intersystems-community/sysadmin-api-specification](https://github.com/intersystems-community/sysadmin-api-specification).

1. `LocalDatabaseList` is declared as an object, but `GET /v2/database-dirs` returns an array. Aperture accepts both.
2. The specification documents `GET /info` as returning the `Info` object without the standard `{status, console, result}` envelope; IRIS 2026.2 (Build 221U) wraps it like every other endpoint. Aperture accepts both.
3. `POST /v2/database-dir/integrity-check` takes its targets in the body (`Databases[]`) while its siblings (`compact`, `defragment`, …) use the `dir` query parameter.
4. `POST /v2/journal/switch-dir` documents no body, so the target directory can only be the configured alternate directory.
5. The `Location` header points at `/v1/async-result?id=…` (on 2026.2 as in the spec example) while the documented endpoint is `/v2/async-result`; the id works on both. Aperture only relies on the `id` query parameter, and falls back to the `GUID` in the body when the header is not exposed (2026.2 sends no GUID in the body).
6. Real instances have been observed to answer errors as `status.errors` (objects with a `code`) instead of the documented `status.Errors` strings, and IRIS 2026.2 accepts `ServerDefinition` where the spec names the OAuth client field `OAuth2ServerDefinition` (both reported in the IRIS Workbench verification record). Aperture normalizes the envelopes and adapts the field; see `src/lib/quirks.ts`.
7. Error text is localized by the server from the request's `Accept-Language`; a client that sends none gets the messages in Arabic (`خطأ #420: Namespace … does not exist`, observed in CI). Browsers always send the header, and Aperture shows the numeric `code` and `id` next to the text, which are stable.

## Tech stack

React 19 · TypeScript 5.9 · Vite 7 · Mantine 8 (+ charts, spotlight, notifications, modals) · TanStack Query 5 · TanStack Table 8 · React Router 7 · zustand · openapi-typescript / openapi-fetch · Mock Service Worker 2 · Vitest 3 · Playwright · nginx · IPM · Embedded Python (installer)

## License

MIT - see [LICENSE](LICENSE).
