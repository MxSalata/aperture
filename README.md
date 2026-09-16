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

| Demo account | Password | Privileges | What it shows |
| --- | --- | --- | --- |
| `_SYSTEM` | `SYS` | everything | full portal |
| `operator` | `SYS` | `%Admin_Operate`, `%Admin_Task`, `%Admin_Journal` | security screens disappear, actions explain what they need |
| `auditor` | `SYS` | `%Admin_Secure` only | only the security area is usable |

Every real deployment also has a **Try the demo** button on the login page.

## Quick start

### 1. Docker Compose (IRIS + portal, one command)

```bash
git clone https://github.com/MxSalata/intersystems-frontend-contest.git
cd intersystems-frontend-contest
docker compose up --build
```

- http://localhost:8080 - Aperture behind nginx (proxies `/api/admin` to IRIS, no CORS, no Basic-auth pop-ups)
- http://localhost:52773/aperture/ - Aperture served by IRIS itself (after `npm run build:www`, see below)
- Sign in with `_SYSTEM` / `SYS`

The `iris` service runs `intersystemsdc/iris-community:latest` (override with `IRIS_IMAGE=...`).
On first start [`docker/iris/init.script`](docker/iris/init.script) enables the `/api/admin` web
application with password + JWT authentication and, if `www/` exists, registers the portal as the
`/aperture` web application.

### 2. IPM (ZPM) package

```objectscript
zpm "install iris-aperture"
```

installs the pre-built portal as the `/aperture` web application on the instance and runs
[`Aperture.Installer`](ipm/cls/Aperture/Installer.cls), which enables `/api/admin` with password and
JWT authentication. Then open `http://<host>:52773/aperture/`.

### 3. Development

```bash
npm install
cp .env.example .env           # VITE_IRIS_URL=http://localhost:52773
npm run dev                    # http://localhost:5173, /api/admin proxied to IRIS
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | type-check + production build (`dist/`, browser routing, for nginx) |
| `npm run build:www` | build for IRIS-hosted deployment (`www/`, relative URLs + hash routing) |
| `npm run build:demo` | build the online demo (`dist-demo/`, in-browser mock) |
| `npm test` | Vitest unit tests (client, auth, privileges, async jobs, spec index) |
| `npm run test:e2e` | Playwright end-to-end tests against the demo build |
| `npm run smoke` | walks the main screens in headless Chromium and refreshes `docs/screenshots/` |
| `npm run gen:api` | regenerate `src/api/schema.d.ts` and the operation index from `spec/mainspec_v2.json` |

### Requirements on the IRIS side

- IRIS or IRIS for Health **2025.1+** with the `/api/admin` web application (**2026.2+** for JWT login; older versions use HTTP Basic automatically).
- The account needs at least one `%Admin_*` privilege (`GET /info` refuses everyone else).
- If the portal is served from a different origin than IRIS, add that origin to the CORS allow-list of `/api/admin` (Aperture can do that itself under *Security → Web applications → /api/admin*).

## What you get

| Area | Screens | Notable |
| --- | --- | --- |
| **Dashboard** | live stats, sparklines, global refs/s and disk I/O charts, health, alerts, upcoming tasks, busy processes, resource seizes | polls `/v2/monitor/*` every 3 s, keeps history while you navigate |
| **Job Center** | every `202 Accepted` response, with console output, progress, pause / resume / cancel | fed automatically by the API client; toasts on completion |
| **Databases** | configuration + local file view, metrics (async), mount/dismount, compact, defragment, integrity check, truncate, expand, volumes, create, delete | dangerous actions require typing the name |
| **Namespaces** | create, delete, enable interoperability, copy mappings, global/package/routine mappings | |
| **Processes** | live list, detail with variables and roles, suspend/resume/terminate, broadcast | |
| **Locks, Journals, Tasks, Web sessions, License** | lock removal with transaction check, journal files/records/settings/switching, task schedules + history + task manager, session ending, license key/usage/servers | |
| **Security** | users, roles, resources, services, web applications (JWT, CORS), audit events + log + purge, TLS/SSL configs + test, SQL privileges | |
| **API Explorer** | every one of the 273 operations rendered from the OpenAPI document: parameters, request body form or JSON, privileges, documented responses, response as table / fields / JSON | reachable from the command palette |
| **Everywhere** | ⌘K command palette, privilege badges, raw JSON of every response, dark mode, responsive layout, multiple saved connections, escalation-role login | |

<details>
<summary>More screenshots</summary>

| | |
| --- | --- |
| ![Databases](docs/screenshots/03-databases.png) | ![Database detail](docs/screenshots/04-database-detail.png) |
| ![Job Center](docs/screenshots/05-job-center.png) | ![Processes](docs/screenshots/06-processes.png) |
| ![Audit](docs/screenshots/09-audit.png) | ![Explorer](docs/screenshots/11-explorer.png) |
| ![Dark mode](docs/screenshots/13-dark.png) | ![Mobile](docs/screenshots/15-mobile.png) |

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

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the details, and
[docs/CONTEST_PLAN.md](docs/CONTEST_PLAN.md) for the contest evaluation.

## Spec findings

Things noticed while implementing the whole specification (reported for the API team):

1. `LocalDatabaseList` is declared as an object, but `GET /v2/database-dirs` returns an array. Aperture accepts both.
2. `GET /info` returns the `Info` object without the standard `{status, console, result}` envelope; every other endpoint uses the envelope.
3. `POST /v2/database-dir/integrity-check` takes its targets in the body (`Databases[]`) while its siblings (`compact`, `defragment`, …) use the `dir` query parameter.
4. `POST /v2/journal/switch-dir` documents no body, so the target directory can only be the configured alternate directory.
5. The `Location` header example uses `/v1/async-result`; the v2 endpoint is `/v2/async-result`. Aperture only relies on the `id` query parameter.

## Tech stack

React 19 · TypeScript 5.9 · Vite 7 · Mantine 8 (+ charts, spotlight, notifications, modals) · TanStack Query 5 · TanStack Table 8 · React Router 7 · zustand · openapi-typescript / openapi-fetch · Mock Service Worker 2 · Vitest 3 · Playwright · nginx · IPM

## License

MIT - see [LICENSE](LICENSE).
