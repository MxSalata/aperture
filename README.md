<p align="center">
  <img src="https://raw.githubusercontent.com/MxSalata/aperture/main/docs/logo.png" width="96" alt="Aperture's mark, an iris diaphragm" />
</p>
<h1 align="center">Aperture</h1>
<p align="center"><b>A management portal for InterSystems IRIS, with no separate application server.</b></p>
<p align="center">See who loses what before you save, follow every background job, read every log and find the entries worded like any of them with IRIS Vector Search.</p>
<p align="center">
  <a href="https://github.com/MxSalata/aperture/actions/workflows/ci.yml"><img src="https://github.com/MxSalata/aperture/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/MxSalata/aperture/tags"><img src="https://img.shields.io/github/v/tag/MxSalata/aperture?label=version&color=0e7299" alt="Version" /></a>
  <a href="https://mxsalata.github.io/aperture/"><img src="https://img.shields.io/badge/online%20demo-try%20it-45acd1" alt="Online demo" /></a>
  <a href="#docker"><img src="https://img.shields.io/badge/docker-ghcr.io%2Fmxsalata%2Faperture-2496ed?logo=docker&logoColor=white" alt="Docker image" /></a>
  <a href="#ipm"><img src="https://img.shields.io/badge/IPM-iris--aperture-095c7c" alt="IPM package" /></a>
  <a href="https://github.com/MxSalata/aperture/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT licence" /></a>
</p>
<p align="center">
  <a href="https://mxsalata.github.io/aperture/"><b>Online demo</b></a> ·
  <a href="#for-judges-two-minutes">For judges</a> ·
  <a href="#why-aperture">Why Aperture</a> ·
  <a href="#run-it-on-real-iris">Run it</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#contest-technology-bonuses">Bonuses</a> ·
  <a href="#verified-against-real-iris">Verification</a>
</p>

![Aperture's dashboard](docs/screenshots/02-dashboard.png)

Aperture is an entry for the [InterSystems Programming Contest: Build Your Own Management Portal](https://openexchange.intersystems.com/contest/48).
It is a set of static files that IRIS serves itself. Your browser calls IRIS's own
[SysAdmin REST API](https://github.com/intersystems-community/sysadmin-api-specification) (`/api/admin`,
273 operations) directly, signed in as you, so IRIS checks your privileges on every call and audits
you by name. The one thing that API cannot give you, the instance's log files, comes through a small
read-only reader the IPM package adds, written in Embedded Python, with a wording index on IRIS Vector
Search beside it.

## For judges: two minutes

1. **In your browser, nothing to install.** Open the [online demo](https://mxsalata.github.io/aperture/)
   and press **Try the demo**: a simulated IRIS 2026.2 runs inside the page, so change whatever you like.
   - Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd><kbd>K</kbd>), type `databases`, open `USER` and choose
     _Actions → Integrity check_: the `202 Accepted` lands in the **Job Center** with console output and progress.
   - Open _Security → Users → jdoe_, remove a role and press Save: the review lists old → new and
     **who loses which privilege**.
   - Open _Logs → Messages log_ (the reader asks for the password, `SYS`), open an entry and choose
     **Similar entries**: IRIS Vector Search lists the entries worded like it, with how often and when.
   - Open _REST services_ and export an application's routes as a Postman collection or a `.http` file.
   - Sign out and sign in as `operator` / `SYS`: the security area disappears, and every disabled
     action names the resource it needs.
2. **On real IRIS, one command.** `docker run -d --name aperture -p 127.0.0.1:52773:52773 ghcr.io/mxsalata/aperture`,
   then http://localhost:52773/aperture/index.html as `_SYSTEM` / `SYS` ([more](#docker)).
3. **On your own IRIS 2026.2.** `zpm "install iris-aperture"`, then `/aperture/index.html` on the
   instance's web server ([more](#ipm)).

| Demo account | Password | Privileges                                        | What it shows                                              |
| ------------ | -------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `_SYSTEM`    | `SYS`    | everything                                        | the whole portal                                           |
| `operator`   | `SYS`    | `%Admin_Operate`, `%Admin_Task`, `%Admin_Journal` | security screens disappear, actions explain what they need |
| `auditor`    | `SYS`    | `%Admin_Secure` only                              | only the security area is usable                           |

The demo is Aperture itself, built with a mock of the whole API that runs in the browser (Mock
Service Worker), seeded to look like a busy instance with interoperability productions, tasks,
journals, users and audit history. Writes change that in-memory instance; the same mock drives the
unit and browser tests. Every real deployment also has a **Try the demo** button on its sign-in page.

## Why Aperture

- **You sign in as yourself.** No service account in the middle: `POST /login` gives you your own
  short-lived JWT, IRIS enforces your privileges on every call and writes your name into its audit
  log. The portal reads what you may do (`GET /info`) and shows exactly that.
- **All 273 operations.** Hand-made screens for the daily work, and the API Explorer renders every
  operation from the OpenAPI document, so nothing in the API is out of reach.
- **Who loses what, before you save.** Every edit is reviewed old → new against a fresh read of the
  object. A user or role change lists every account it reaches with the privileges gained and lost,
  and a change that would leave nobody able to administer security is refused.
- **Every background job in one place.** `202 Accepted` answers become jobs by themselves; the Job
  Center follows them with console output, progress, pause, resume and cancel.
- **Every log, and the entries worded like it.** `messages.log`, `alerts.log`, `SystemMonitor.log` and
  every rotation (Ideas Portal DPI-I-966), read in bounded windows. **Similar entries** finds the
  entries worded like any of them with IRIS Vector Search: an HNSW index over hashed words, built in
  Embedded Python inside IRIS, with nothing sent anywhere else.
- **Requests you do not have to type.** Any REST application's routes, and any SysAdmin operation,
  export as a Postman collection, a `.http` file or curl (Ideas Portal DPI-I-813).
- **Disk space you can act on.** The databases screen shows how much of each disk behind the database
  files is free, as a share and as a size, and says when one is running low.
- **Tested on real IRIS.** 139 operations verified on IRIS for Health 2026.2; CI builds IRIS Community
  2026.2 with the package on every push and checks the API contract against it; 274 unit tests and 135
  browser tests, among them an accessibility audit of every screen in five appearance modes.
- **Made for long sessions.** Light, Dark and Pastel themes and high contrast, a command palette, a
  navigation menu you arrange yourself, charts you choose, a colour per connection so production
  never looks like staging, and browser tabs you can make read-only.

|                                                           |                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| ![Who loses what](docs/screenshots/24-who-loses-what.png) | ![Similar entries](docs/screenshots/31-similar-entries.png)    |
| ![Job Center](docs/screenshots/05-job-center.png)         | ![Databases and disk space](docs/screenshots/03-databases.png) |
| ![Request export](docs/screenshots/30-request-export.png) | ![API Explorer](docs/screenshots/11-explorer.png)              |
| ![Pastel theme](docs/screenshots/32-pastel.png)           | ![Dark theme](docs/screenshots/13-dark.png)                    |

<details>
<summary>More screenshots</summary>

|                                                             |                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| ![Database detail](docs/screenshots/04-database-detail.png) | ![Processes](docs/screenshots/06-processes.png)         |
| ![Audit](docs/screenshots/09-audit.png)                     | ![High contrast](docs/screenshots/19-high-contrast.png) |
| ![Mobile](docs/screenshots/15-mobile.png)                   | ![Host monitor](docs/screenshots/16-monitor.png)        |
| ![Certificates](docs/screenshots/20-certificates.png)       | ![Logs](docs/screenshots/21-logs.png)                   |
| ![Audit evidence](docs/screenshots/22-audit-evidence.png)   | ![Change review](docs/screenshots/17-review.png)        |
| ![REST services](docs/screenshots/23-rest-services.png)     | ![Read-only tab](docs/screenshots/25-read-only.png)     |
| ![Operator](docs/screenshots/14-operator.png)               | ![Wallet](docs/screenshots/26-wallet.png)               |
| ![OAuth 2.0](docs/screenshots/27-oauth.png)                 | ![Devices](docs/screenshots/28-devices.png)             |
| ![Messages log](docs/screenshots/29-messages-log.png)       | ![Command palette](docs/screenshots/12-palette.png)     |

</details>

## The six contest areas

| Contest area                   | Where in Aperture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Boundary                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web applications and REST APIs | Security → Web applications (list, detail, JWT and CORS settings, create, edit, delete); every `/v2/web-app*` operation in the API Explorer; REST services (every REST application and its routes, from `/api/mgmnt`; the routes export as a Postman collection or a `.http` file, any route copies as curl: Ideas Portal DPI-I-813)                                                                                                                                                                | `/api/mgmnt` takes a password only, so a JWT session asks for it once (kept in the tab's memory); routes are what the dispatch class declares                                                                                     |
| Permission management          | Users, Roles, Resources, Services, SQL privileges; escalation-role login; every edit reviewed field by field against a fresh read; a change that would leave nobody able to administer security is refused, and one to a role says who loses what                                                                                                                                                                                                                                                   | the portal adds no privilege of its own: what the account cannot do stays visible and disabled, with the resource it needs                                                                                                        |
| Security and secrets           | TLS & certificates (configurations with a connection test, X.509 credentials with certificate expiry); Wallet & OAuth 2.0 (collections with their use and edit resources, write-only secrets with usage, allowed hosts and TLS; the authorization server and its clients, the servers this instance is a client of with their client configurations, resource servers); audit settings; LDAP, MFT, encryption and the remaining OAuth writes in the Explorer                                        | passwords, secrets, tokens and private keys are redacted before they are rendered, copied or exported; wallet secret values are never fetched                                                                                     |
| Task management                | Tasks (schedules, run now or at a time, suspend and resume, history), the task manager daemon, upcoming runs                                                                                                                                                                                                                                                                                                                                                                                        | the task is re-read after every change and the page says when IRIS reports something else                                                                                                                                         |
| OS management                  | Dashboard, Host monitor (CPU, memory, disk from `/api/monitor`), Processes, Devices (with the telnet and default-device settings), Locks, Databases, Namespaces, Journals, License, Web sessions; ECP, external language servers and file-system access through the Explorer                                                                                                                                                                                                                        | host measurements come from the native monitor service, not from the SysAdmin API                                                                                                                                                 |
| The logs                       | Logs hub → `messages.log`, `alerts.log` and `SystemMonitor.log` with their rotations (any `messages.old_*` file selectable, Ideas Portal DPI-I-966; newest first, older windows on request, severity filter), **Similar entries** on any entry (IRIS Vector Search: the entries worded like it, with how often and when), the audit log (asynchronous query, events, purge), journal records, task history, this tab's changes; a security change can be matched to the audit record that proves it | the log files have no route in the SysAdmin API: they are read by the package's own read-only reader (`/api/aperture`, Embedded Python) in bounded windows, never whole; `^ERRORS` and SQL diagnostics stay in the classic portal |

## Run it on real IRIS

### Docker

The published image, IRIS Community 2026.2 with Aperture installed through its IPM package:

```bash
docker run -d --name aperture -p 127.0.0.1:52773:52773 ghcr.io/mxsalata/aperture
```

Then open http://localhost:52773/aperture/index.html (the built-in web server needs the file name, a
bare `/aperture/` answers 404) and sign in as `_SYSTEM` (or `SuperUser`) with `SYS`. That is the
image's demonstration password; `-e IRIS_PASSWORD=...` makes another one the password of every
enabled account (but `CSPSystem`, the image's own Web Gateway account) at every start. With Docker
Compose, [`docker-compose.yml`](docker-compose.yml) runs the same image and takes `IRIS_PASSWORD`
from a `.env` next to it ([`.env.example`](.env.example)): `docker compose up -d`. CI publishes the
image only after checking it against the SysAdmin API, both with a password set at start and with
the demonstration one: `latest` and the version from `main`, `edge` from the development branch.

From the sources, with nginx serving the portal in front of IRIS:

```bash
git clone https://github.com/MxSalata/aperture.git
cd aperture
docker compose -f docker-compose.build.yml up --build
```

- http://localhost:8080 - Aperture behind nginx (proxies `/api/admin`, `/api/monitor`, `/api/mgmnt` and `/api/aperture` to IRIS: same origin, so no CORS and no Basic-auth pop-ups; sends a Content-Security-Policy). A second instance goes behind the same nginx under a path prefix (`/iris-b`, the pattern is documented in [`docker/nginx/default.conf.template`](docker/nginx/default.conf.template)) and gets a connection profile with that prefix as its base URL
- http://localhost:52773/aperture/index.html - Aperture served by IRIS itself (the committed `www/` build, refreshed with `npm run build:www`)
- Sign in as `_SYSTEM` with `IRIS_PASSWORD` from `.env`, or with `SYS` when none is set.
- On a host with more than 20 CPU cores, IRIS Community stops at start-up with _Invalid Community Edition license, may have exceeded core limit_ (reported by the IRIS Atrium entry). Restrict the container's CPUs with a `docker-compose.override.yml` next to the compose file: `services: { iris: { cpuset: "0-19" } }`.
- The ports are published on `127.0.0.1` only by default. To use it from other machines, set `IRIS_PASSWORD`, put TLS in front (nginx and IRIS's web server speak plain HTTP), then start with `APERTURE_BIND=0.0.0.0`.

The `iris` service is built from [`docker/iris/Dockerfile`](docker/iris/Dockerfile) on top of
`intersystems/iris-community:2026.2`, pinned by digest (`sha256:cd2ebcab…50bdaa`, Build 221U).
IRIS for Health Community 2026.2 is tested too, against a real instance
([evidence](docs/verification/2026-09-23-irishealth-2026.2/)): put
`IRIS_IMAGE=containers.intersystems.com/intersystems/irishealth-community:2026.2@sha256:7c06b6b3d950bc25f3e353b0a65db0c4045f251fb9103eade63514302b662cf3`
in a `.env` file next to the compose file. The portal image pins `node:22-alpine` and
`nginx:1.30-alpine` by digest, and CI pins every GitHub Action to a commit. At build time
[`docker/iris/init.script`](docker/iris/init.script) fetches the InterSystems Package Manager from the
community registry (installer 0.10.9, checked against its SHA-256) and installs Aperture through its own IPM package (`zpm "load"` of [`module.xml`](module.xml)): the built portal is copied into the instance's manager
directory (`mgr/aperture/`), the `/aperture` web application is created, the `/api/aperture` log reader
([`Aperture.API`](ipm/cls/Aperture/API.cls) over [`Aperture.Logs`](ipm/cls/Aperture/Logs.cls), Embedded Python)
is created, and [`Aperture.Installer`](ipm/cls/Aperture/Installer.cls), also Embedded Python, enables
`/api/admin` with password + JWT authentication. The build log ends with the installer's readiness
report; you can print it again at any time:

```bash
docker exec aperture iris session IRIS -U USER "##class(Aperture.Installer).Doctor()"   # aperture-iris when built from the sources
```

### IPM

```objectscript
zpm "install iris-aperture"
```

copies the pre-built portal (`www/`) into the instance's manager directory (`mgr/aperture/`, which
durable %SYS keeps across container updates), creates the `/aperture`
web application and the `/api/aperture` log reader (a read-only `%CSP.REST` class over an Embedded
Python file reader, needs `%Admin_Operate:USE`) with its wording index (`Aperture.LogLine`, a
`%Library.Vector` column under an HNSW index, the package's only tables), and runs [`Aperture.Installer`](ipm/cls/Aperture/Installer.cls),
an Embedded Python class that enables `/api/admin` with password and JWT authentication and prints a
readiness report (IRIS version, JWT availability, the API's authentication settings, the portal's
files, the log reader and the log files it can read). Then open
`http://<host>:52773/aperture/index.html`. From a checkout, `zpm "load /path/to/aperture"`
installs the same package; `##class(Aperture.Installer).Doctor()` prints the report again.

### Requirements on the IRIS side

- IRIS or IRIS for Health **2026.2+** with the `/api/admin` web application. Aperture speaks SysAdmin API v2, which ships with 2026.2; IRIS 2026.1 serves only v1 (every `/v2` path answers 404) and older releases have no SysAdmin API, so sign-in there stops with an explanation. Sign-in uses JWT and falls back to HTTP Basic when `/login` is unavailable (for example with JWT authentication switched off on `/api/admin`).
- The account needs at least one `%Admin_*` privilege (`GET /info` refuses everyone else).
- _Logs → Messages log_ reads the log files through the package's own `/api/aperture` web application (created by `zpm "install"`, `zpm "load"` and the Docker image; password authentication, `%Admin_Operate:USE`). On an instance without the package that screen says so and everything else works.
- The portal must be served from the same origin as the API it talks to: `/api/admin/v2` sends no CORS headers, by design (InterSystems, in the contest announcement thread, 22 September 2026), so a browser cannot call it across origins whatever the web application's allow-list says. The three supported topologies are all same-origin: nginx in front of IRIS (compose), the `/aperture` web application served by IRIS itself (IPM), and the Vite dev server's proxy. Further instances go behind the same nginx under a path prefix.

### Development

```bash
npm install
cp .env.example .env           # VITE_IRIS_URL=http://localhost:52773
npm run dev                    # http://localhost:5173, /api/admin proxied to IRIS
```

Other scripts:

| Script                | What it does                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`       | type-check + production build (`dist/`, browser routing, for nginx)                                                           |
| `npm run build:www`   | build for IRIS-hosted deployment (`www/`, relative URLs + hash routing)                                                       |
| `npm run build:demo`  | build the online demo (`dist-demo/`, in-browser mock)                                                                         |
| `npm test`            | Vitest unit tests (client, auth, privileges, async jobs, spec index)                                                          |
| `npm run test:e2e`    | Playwright end-to-end tests against the demo build, with axe-core WCAG 2.1 AA audits                                          |
| `npm run smoke`       | walks the main screens in headless Chromium and refreshes `docs/screenshots/`                                                 |
| `npm run verify:live` | conformance check of a real instance (`IRIS_URL`, `IRIS_USER`, `IRIS_PASSWORD`), the log reader included, saves JSON evidence |
| `npm run gen:api`     | regenerate `src/api/schema.d.ts` and the operation index from `spec/mainspec_v2.json`                                         |

## Architecture

![Aperture's architecture: the browser loads the portal from IRIS and calls its APIs as the signed-in user](docs/architecture.png)

| Endpoint        | What Aperture uses it for                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `/aperture`     | the portal's static files, served by IRIS (or by nginx, or by GitHub Pages for the demo)                    |
| `/api/admin`    | SysAdmin API v2: administration, sign-in (JWT, or HTTP Basic where JWT is off) and the account's privileges |
| `/api/monitor`  | host CPU, memory and disk, licence use and the interoperability metrics                                     |
| `/api/mgmnt`    | the instance's REST applications and the routes their dispatch classes declare                              |
| `/api/aperture` | the package's own read-only log reader and wording index (Embedded Python, IRIS Vector Search)              |

The portal and the APIs share an origin (the SysAdmin API sends no CORS headers, by design), so the
same build is served by IRIS itself, behind nginx, or by the Vite dev server's proxy; the demo swaps
the network for the in-browser mock. More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

<details>
<summary>How the client works</summary>

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
  when the Explorer needs schemas to build forms and examples. The same index and schemas produce
  the requests other tools take: `src/lib/requestExport.ts` writes a Postman collection (format
  v2.1), a `.http` file or a curl command from any list of generated requests, whether they come
  from the SysAdmin document (`features/explorer/requests.ts`) or from a REST application's
  Swagger 2.0 (`api/mgmnt.ts`); the password stays in the browser and body secrets are redacted.
- **Log reader.** The SysAdmin API has no route for the instance's log files, so the IPM package adds
  one of its own: `/api/aperture`, a read-only `%CSP.REST` class (`ipm/cls/Aperture/API.cls`) over an
  Embedded Python file reader (`Logs.cls`). It catalogues `messages.log` (wherever `ConsoleFile` puts
  it), `alerts.log`, `SystemMonitor.log` and their rotations, and answers windows of whole lines of
  at most 256 KiB ending at a byte offset, so a client pages backwards at constant cost whatever the
  file's size; a file is named by its catalogue id, never by a path, and every route needs
  `%Admin_Operate:USE`. The browser parses the lines (`src/lib/messagesLog.ts`); the mock serves
  generated files so the demo has them too.
- **Demo / tests.** The MSW handlers in `src/mocks` implement the API against an in-memory instance,
  including JWT issuance, privilege enforcement, 202 tasks with progress, and a spec-driven fallback
  for every operation without a hand-written handler. The same handlers run in the browser (demo)
  and in Node (Vitest, Playwright).

</details>

## Contest technology bonuses

| Bonus                       | Where to see it                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Community Opportunity ideas | [DPI-I-966](https://ideas.intersystems.com/ideas/DPI-I-966): every rotated `messages.log` readable in the portal (Logs → Messages log). [DPI-I-813](https://ideas.intersystems.com/ideas/DPI-I-813): requests generated from OpenAPI for Postman, VS Code and curl (REST services → Export; API Explorer)              |
| Embedded Python             | [`Aperture.Installer`](ipm/cls/Aperture/Installer.cls) (configures `/api/admin`, prints the readiness report), [`Aperture.Logs`](ipm/cls/Aperture/Logs.cls) (the log reader), [`Aperture.LogIndex`](ipm/cls/Aperture/LogIndex.cls) and [`aperture_vectors.py`](ipm/python/lib/aperture_vectors.py) (the wording index) |
| Vector Search               | [`Aperture.LogLine`](ipm/cls/Aperture/LogLine.cls): a `%Library.Vector` of 256 doubles under a `%SQL.Index.HNSW` index; `/api/aperture/logs/similar` ranks with `VECTOR_COSINE` (Logs → Messages log → Similar entries)                                                                                                |
| Docker                      | `ghcr.io/mxsalata/aperture`, [`docker-compose.yml`](docker-compose.yml), [`docker-compose.build.yml`](docker-compose.build.yml)                                                                                                                                                                                        |
| IPM                         | `zpm "install iris-aperture"` ([`module.xml`](module.xml))                                                                                                                                                                                                                                                             |
| Online demo                 | https://mxsalata.github.io/aperture/                                                                                                                                                                                                                                                                                   |

## Ideas Portal ideas Aperture implements

Two ideas with the "Community Opportunity" status on the [InterSystems Ideas Portal](https://ideas.intersystems.com) are implemented here; each is one screen away in the demo.

| Idea                                                                                                                  | What it asks                                                                                                                                                                                        | Where Aperture does it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DPI-I-966 Option to show older message.log in IRIS SMP](https://ideas.intersystems.com/ideas/DPI-I-966)              | "It would be nice that we could choose in SMP portal to display any `messages.old_*` file": today it takes a remote desktop session to the server                                                   | Logs → Messages log. The package's log reader (`/api/aperture`, Embedded Python) catalogues `messages.log`, `alerts.log`, `SystemMonitor.log` and every rotation IRIS or an administrator leaves beside them (`messages.old_20260412_1`, `messages.log.1`, `messages_20260412.log`), newest first. The File selector lists them under their kind, and a rotation reads exactly like the current file: windows of whole lines, newest first, older on request, the same severity filter. Verified on IRIS Community 2026.2 in CI (`verify-iris`).                                                                                                                                                                      |
| [DPI-I-813 Make REST API Debugger for VSCode Recognise Open API Spec](https://ideas.intersystems.com/ideas/DPI-I-813) | Requests should come from the OpenAPI description instead of being typed field by field, and be importable into Postman. The idea is written for the VS Code ObjectScript extension's REST debugger | Done in the portal, and handed to VS Code and Postman as files. Every REST application's routes (REST services → Export) and every SysAdmin API operation (API Explorer → Export, and "Request for curl, VS Code and Postman" under each operation) are generated as ready requests: method, path, path and query parameters with their types, examples and required flags, an example body from the schema, the privileges needed. Saved as a Postman collection (format v2.1, one folder per group, Basic auth from variables), as a `.http` file the VS Code REST Client extension and JetBrains IDEs run, or copied as curl. The password is never written into a file, and secret values in a body are redacted. |

## Verified against real IRIS

- **On IRIS for Health 2026.2** (Build 221U), [docs/COVERAGE.md](docs/COVERAGE.md) accounts for every
  one of the 273 operations: 139 verified on that instance (every read that had an object to read,
  and each write with its evidence, undone after its check), 139 called by a hand-made screen, 173
  answered by the online demo. Every screen was walked as an administrator and as an operator, from
  a browser in another time zone ([evidence](docs/verification/)).
- **On IRIS Community 2026.2, in CI, on every push:** the `verify-iris` job builds the image
  (Aperture installed by `zpm "load"` of its `module.xml`, the Embedded Python installer), starts it
  and runs [`scripts/live-check.mjs`](scripts/live-check.mjs): JWT sign-in and refresh, `/info`, list
  shapes, the error envelope, a full `202` round trip, the portal served at `/aperture/index.html`, the
  log reader and a similar-entries query on the wording index. It checks the image with a password
  set at start and with the demonstration one before publishing it.
- **Everywhere else:** `npm run verify:live` runs the same check against your instance
  ([docs/VERIFICATION.md](docs/VERIFICATION.md)); the answers of real instances are also the second
  oracle of the mock's contract test.

## What it does not do yet

- Mirroring, ECP, LDAP, MFT, encryption, external language servers and file-system access are
  reachable through the API Explorer rather than hand-made screens.
- SQL, globals and classes are outside the SysAdmin API, and outside Aperture; `^ERRORS` and SQL
  diagnostics stay in the classic Management Portal.
- Interoperability productions show as charts of messages and queues, not as a production editor.
- Similar entries match wording, not meaning: two messages that describe one fault in different
  words are not paired.
- The log reader and the wording index need the IPM package (or the Docker image); without them the
  Messages log says so and everything else works.

<details>
<summary>Everything in it, screen by screen</summary>

| Area                                                       | Screens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Notable                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                                              | live stats, sparklines, your choice of charts (global refs/s, disk I/O, message throughput and queued messages per namespace from the interoperability metrics, cache efficiency, logical requests, routine refs, processes and sessions, license use), host gauges, health, alerts, upcoming tasks, busy processes, resource seizes                                                                                                                                                                                  | polls `/v2/monitor/*` every 3 s, keeps history while you navigate                                                   |
| **Job Center**                                             | every `202 Accepted` response, with console output, progress, pause / resume / cancel                                                                                                                                                                                                                                                                                                                                                                                                                                 | fed automatically by the API client (Location header or body GUID); toasts on completion                            |
| **Health check**                                           | sixteen read-only checks run with your own access (disks, databases, journal, backup, UnknownUser, auditing, open services and applications, %All holders, certificates, tasks, monitor, alerts, licence, severe log entries), findings by severity with what they mean, what to do, the evidence and a link to the screen that fixes it; what the account may not read is listed as not checked; Markdown and JSON export; a dashboard card                                                                          | `src/features/health/checks.ts` (pure checks, one test each), `runner.ts`                                           |
| **Activity**                                               | every change this tab sent and what the server answered, exportable as JSON; a security write can be matched to the `%System/%Security/*` audit record that proves it                                                                                                                                                                                                                                                                                                                                                 | recorded by the client middleware; audit lookup runs as an async task around the request time                       |
| **Host monitor**                                           | CPU, memory, disk, licence and alerts.log from the native `/api/monitor` service                                                                                                                                                                                                                                                                                                                                                                                                                                      | OpenMetrics parsed in the browser; degrades to "unavailable" honestly                                               |
| **Databases**                                              | configuration + local file view, free disk space per disk and per database, metrics (async), mount/dismount, compact, defragment, integrity check, truncate, expand, volumes, create, delete                                                                                                                                                                                                                                                                                                                          | dangerous actions require typing the name                                                                           |
| **Namespaces**                                             | create, delete, enable interoperability, copy mappings, global/package/routine mappings                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                     |
| **Processes**                                              | live list, detail with variables and roles, suspend/resume/terminate, broadcast                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                                                                     |
| **Locks, Devices, Journals, Tasks, Web sessions, License** | lock removal with transaction check, devices with the telnet and default-device settings, journal files/records/settings/switching, task schedules + history + task manager (state re-read after every change), session ending, license key/usage/servers                                                                                                                                                                                                                                                             |                                                                                                                     |
| **Logs**                                                   | a hub over every log of the instance, and a Messages log screen: `messages.log`, `alerts.log`, `SystemMonitor.log` and their rotations read in bounded windows through the package's `/api/aperture` reader, newest first, older on request, severity filter, the raw line of every entry; "Similar" on any entry lists the entries worded like it across `messages.log` and its rotations, with how often and when, through IRIS Vector Search (an HNSW index over hashed words, matched by wording, not by meaning) | `ipm/cls/Aperture/API.cls`, `Logs.cls`, `LogIndex.cls` (Embedded Python), `src/lib/messagesLog.ts`, `logVectors.ts` |
| **Security**                                               | users, roles, resources, services, web applications (JWT, CORS), audit events + log + purge, TLS/SSL configs + test, X.509 credentials with certificate expiry, wallet collections and write-only secrets, OAuth 2.0 in its three roles, SQL privileges                                                                                                                                                                                                                                                               | secrets are redacted at the render boundary                                                                         |
| **Permission safety**                                      | a change to a user or a role that would leave no enabled account holding %All or %Admin_Secure:U is refused; every such change lists, per account it reaches, the privileges lost and gained, counting granted roles and public permissions                                                                                                                                                                                                                                                                           | `features/security/adminGuard.ts`, `impact.ts`                                                                      |
| **REST services**                                          | every REST web application of the instance, the spec-first classes no application serves, and the routes each one declares with what each takes, from `/api/mgmnt` (outside the SysAdmin API); the routes export as a Postman collection or a `.http` file, any route copies as curl                                                                                                                                                                                                                                  | a JWT session gives the password once, kept in the tab's memory only                                                |
| **API Explorer**                                           | every one of the 273 operations rendered from the OpenAPI document: parameters, request body form or JSON, privileges, documented responses, response as table / fields / JSON; each operation also as curl, a `.http` block or a Postman item with the values typed, and the whole API or a group as a file                                                                                                                                                                                                          | reachable from the command palette                                                                                  |
| **Everywhere**                                             | ⌘K command palette, a navigation menu you can rearrange (hold an entry and drag it, or Alt+arrows), auto-refresh beside every Refresh button (off, 5, 15, 30 or 60 s, remembered per screen), privilege badges, raw JSON of every response with passwords, secrets, tokens and private keys redacted (and a count of what was hidden), responsive layout, multiple saved connections, escalation-role login, LIVE / OFFLINE / DEMO indicator, read-only tabs that send nothing that changes the instance              | `src/lib/redact.ts`                                                                                                 |
| **Tables**                                                 | filter, sort and page live in the URL (share a link to exactly what you see; Back restores it), column choices and page size are remembered per table, every table exports its filtered rows as CSV, "no rows" and "nothing matches your filter" are different messages                                                                                                                                                                                                                                               | `stateKey` / `exportName` on `DataTable`                                                                            |
| **Instances**                                              | each saved connection has a colour (a bar under the header, so production never looks like staging) and an optional time zone, browser-tab titles carry the instance name and its LIVE flag, and an account without `%Admin_Operate` lands on a screen it can use                                                                                                                                                                                                                                                     | `docs/ARCHITECTURE.md` §2.10 for the time policy                                                                    |
| **Appearance**                                             | light, pastel (soft lavender, mint, peach, butter, sky and rose, with a periwinkle accent), dark or system theme plus an independent contrast axis (system / normal / high), applied before the first paint; live regions, keyboard-reachable tooltips, reduced-motion and forced-colors support; colour tokens and chart palettes tested for WCAG 2 AA contrast                                                                                                                                                      | Appearance menu; axe-core audits all five modes in CI                                                               |
| **Change review**                                          | every edit form shows old → new per field, re-reads the object to detect concurrent edits, and only then applies; where IRIS merges a PUT, only the changed fields are sent                                                                                                                                                                                                                                                                                                                                           | `reviewChanges()` in `src/components/ReviewChanges.tsx`                                                             |

</details>

<details>
<summary>Spec findings: 20 places where the specification and IRIS 2026.2 disagree</summary>

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
8. A resource cannot be without a public permission through the API: IRIS 2026.2 refuses `PublicPermission` `""` or `null` on creation and on edit with a 400 whose error list and summary are both empty, and a creation without the field with a 400 (`ERROR #40301`, required), although the spec's "a string consisting only of 'R', 'W', and 'U'" includes the empty string. Public access can only be taken away in the Management Portal; Aperture's form says so instead of sending a request IRIS refuses without a reason. First reported for creation in the iris-fieldwork verification record, confirmed for both on IRIS for Health 2026.2 ([writes.json](docs/verification/2026-09-27-irishealth-2026.2/writes.json)); quirk `resource-create-empty-public`.
9. `GET /v2/security/services` answers `Enabled` as a boolean and sends no `EnabledBoolean`; the spec declares `Enabled: string` plus `EnabledBoolean: boolean`. A client written to the spec shows every service as disabled (Aperture did, until checked against IRIS for Health 2026.2).
10. `GET /v2/processes` spells the executable field `EXEname`; the spec declares `EXEName`, so a column bound to the spec stays empty.
11. `SystemUsage.BusyProcesses` of `GET /v2/monitor/dashboard/main` always has ten rows `{ Process, Commands }`, padded with `{ Process: "", Commands: 0 }`; the spec declares `Process` as an integer and says nothing about the padding.
12. `POST /v2/journal/file/records` returns half the `maxRows` it is given (200 → 100 records, the default 1000 → 500); the records are the first ones, contiguous.
13. `GET /v2/task/upcoming` stops at 100 runs when `maxRows` is not given; the spec documents 1000 as the default for every list.
14. `GET /v2/databases` and `GET /v2/database-dirs` answer 403, with an empty error list, to an account holding `%Operator`, although the spec allows `%Admin_Operate:U`; `GET /v2/database-dir` (one directory) is readable with it. As `%Operator`, `GET /v2/security/ldap/configurations` answers 500 (`<INVALID OREF>` in `%Api.Admin.Util.ClassQuery`) instead of 403.
15. Reading an async task again after it ended (`GET /v2/async-result` or the `/v1` path of the `Location` header) logs a severity-2 alert, `ERROR #7846: WQM attach passed invalid token`, from `TryToKillQueue^%Api.Admin.Util.AsyncTask`. The answer is unchanged, but each re-read lands in `messages.log` and `/api/monitor/alerts` and sets `iris_system_state` to 1 (Warning): a polling client that reads a finished task twice makes the instance look degraded to every monitor.
16. JWT sessions (undocumented behaviour, IRIS 2026.2 defaults): access tokens live 60 s and refresh tokens 900 s; `POST /refresh` rotates both, and the previous access token stops working at once; presenting a refresh token that was already used answers 401 and revokes the whole session; `POST /logout` needs the access token in `Authorization` (the refresh token in the body alone gets 401) and revokes both tokens with or without a body.
17. Error texts are HTML-escaped inside the JSON (`ERROR #5002: ObjectScript error: &lt;INVALID OREF&gt;…`); a client rendering them as text must unescape them.
18. `GET /v2/security/sql-privileges` names the object and the action `Object` and `Action`; the spec (`SQLPrivilegeList`) says `Name` and `Privilege`. A client written to the spec shows empty columns and revokes the wrong privilege.
19. `POST /v2/security/oauth2/revoke` does not exist: IRIS 2026.2 serves the operation at `POST /v2/security/oauth2/server/revoke` (the documented path answers 404 to every method, the other 405 with `Allow: POST` to a GET). The routes `%Api.Admin` declares, as `/api/mgmnt` lists them, also have `HEAD` on the three SQL privilege paths, which the spec does not document. The Explorer sends the revoke to its real path.
20. With JWT authentication switched off on `/api/admin`, `POST /login` does not answer 404: IRIS asks for a password before the request reaches the API, so it is a bodiless 401 with `WWW-Authenticate: Basic`, whatever the body carries. A wrong password with JWT on is the same bodiless 401 with `WWW-Authenticate: Bearer`. A client that falls back to Basic only on 404 reports a wrong password to every user of such an instance (Aperture did); the header is the only difference, and proxies that hide it to keep the browser's login dialog away must pass it on. Observed on IRIS Community 2026.2 Build 221U, on `/api/mgmnt`, whose JWT authentication is off by default, and on the `/api/admin` of IRIS for Health 2026.2 switched off for the test and on again ([jwt-off.json](docs/verification/2026-09-27-irishealth-2026.2/jwt-off.json)): the portal signed in with Basic there, through the dev server and served by IRIS itself, with no browser login dialog.

</details>

## Documentation

| File                                         | Purpose                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the layers fit: typed client, auth, async jobs, privileges, mock, deployment                                                        |
| [docs/COVERAGE.md](docs/COVERAGE.md)         | all 273 operations: the screen that calls each, what a real IRIS for Health instance answered (139 verified), and what the demo answers |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | the conformance check against a real instance, and how to run it against yours                                                          |
| [docs/verification/](docs/verification/)     | recorded answers of real IRIS 2026.2 instances, one folder per run, the evidence for the spec findings below                            |
| [CHANGELOG.md](CHANGELOG.md)                 | what changed, and why                                                                                                                   |

## Tech stack

React 19 · TypeScript 5.9 · Vite 7 · Mantine 8 (+ charts, spotlight, notifications, modals) · TanStack Query 5 · TanStack Table 8 · React Router 7 · zustand · openapi-typescript / openapi-fetch · Mock Service Worker 2 · Vitest 4 · Playwright · nginx · IPM · ObjectScript (`%CSP.REST`, `%Persistent`) · Embedded Python (installer, log reader, wording index) · IRIS Vector Search (`%Library.Vector`, `%SQL.Index.HNSW`, `VECTOR_COSINE`)

## License

MIT, see [LICENSE](LICENSE).
