# Architecture

Aperture is a pure front-end: there is no server-side code of its own. Everything it shows or
changes goes through the InterSystems IRIS **SysAdmin REST API v2** (`/api/admin`). This document
explains how the pieces fit, in enough detail to extend the portal or reuse the patterns.

## 1. Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│ features/           screens (dashboard, databases, security, explorer…)  │
│ components/         DataTable, KeyValueList, PageHeader, ConfirmDanger…  │
├─────────────────────────────────────────────────────────────────────────┤
│ api/hooks.ts        useApiMutation, useAsyncResult, jobHeaders           │
│ api/client.ts       openapi-fetch client + middleware (auth, 401, 202)   │
│ api/schema.d.ts     generated from spec/mainspec_v2.json                 │
│ api/privileges.ts   %Admin_* ↔ GET /info                                 │
│ lib/openapi.ts      runtime access to the spec (Explorer, mock fallback) │
├─────────────────────────────────────────────────────────────────────────┤
│ stores/             zustand: session, connections, jobs, metrics, demo   │
├─────────────────────────────────────────────────────────────────────────┤
│ mocks/              MSW handlers = demo mode = test fixtures             │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. The API layer

### 2.1 Types from the specification

`npm run gen:api` runs two generators:

1. `openapi-typescript spec/mainspec_v2.json → src/api/schema.d.ts` produces the `paths` and
   `components` interfaces. Every call such as
   `api().GET('/v2/database-dir', { params: { query: { dir } } })` is checked at compile time:
   unknown paths, missing required query parameters, wrong body shapes and misspelled result
   properties are all errors.
2. `scripts/build-spec-index.mjs → src/api/spec-index.json` extracts a compact operation index:
   method, path, tag (group), the `(%Admin_X:U)` privilege prefix parsed out of the summary,
   query parameters (path-level and method-level merged, `$ref`s resolved), whether the operation
   answers `202`, and the documented responses. The index powers the navigation of the Explorer,
   the command palette and privilege badges without loading the 1 MB document. The full document is
   lazy-loaded (`lib/openapi.ts#loadSpec`) only when schemas are needed.

### 2.2 The envelope

Every v2 response is `{ status: { Errors: string[], summary: string }, console: string[], result: T }`.
`api/client.ts` offers three helpers:

| Helper | Returns | Use |
| --- | --- | --- |
| `call(promise)` | `{ data, response }` | when you need headers (e.g. `Location`) |
| `result(promise)` | `result` payload, typed | reads |
| `envelope(promise)` (aliased `run` in hooks) | `{ data, response, console, summary }` | writes - the summary becomes the success toast |

Non-2xx responses become `ApiError` with `status`, `summary`, `errors[]` and `console[]`.
`ErrorAlert` renders them with an expandable details section.

### 2.3 Authentication

```
login(auth = auto)
  ├─ POST /login {user, password, role?}   → 200 {result:{access_token, refresh_token, exp}}  → mode = jwt
  │                                        → 404/405/501 or non-JSON                          → fall back
  └─ GET /info with Authorization: Basic   → 200 Info                                          → mode = basic
```

- **JWT (IRIS ≥ 2026.2).** The access token goes into `Authorization: Bearer …`. The middleware
  refreshes proactively when `exp` is less than 20 s away, and reactively once on a `401`
  (the original body is stashed per request id so the retry can resend it). Concurrent refreshes are
  de-duplicated with a shared promise. If the refresh fails the session ends with a reason that the
  login page shows.
- **Basic.** Credentials are sent on every request. Because the browser would otherwise show its
  native login dialog on a `401` with `WWW-Authenticate: Basic`, nginx strips that header
  (`proxy_hide_header WWW-Authenticate`) and fetches are made with `credentials: 'omit'`.
- Tokens live in `sessionStorage` (per tab, gone when the tab closes). `RequireAuth` re-validates a
  restored session with `GET /info` before rendering anything.
- `role` is passed through to `/login` for **escalation roles**.

### 2.4 Asynchronous operations (202)

Some operations are queued by IRIS: database compaction, defragmentation, integrity checks,
database metrics, audit-log queries, journal record listings. They answer
`202 Accepted` with `Location: …/v2/async-result?id=<GUID>`.

- The middleware notices the `202`, extracts the id and calls `useJobs.track()`. Request headers
  `x-aperture-job` / `x-aperture-subject` give the job a readable name; `x-aperture-silent`
  keeps it out of the Job Center (used for metric lookups).
- `JobPoller` (mounted once in the layout) polls `GET /v2/async-result?id=` every 1.5 s for each
  non-terminal job with TanStack `useQueries`, updates the store, shows a toast on completion and
  invalidates cached queries so tables refresh. A `404`/`403` (task belongs to another user, instance
  restarted) marks the job **Missing** instead of polling forever.
- `useAsyncResult()` is the local variant for screens that want the result inline (database
  metrics, audit records, journal records).
- Progress: results derived from `AsyncTaskResultSysBGTask` carry `ProgressCurrent/ProgressTotal/ProgressUnits`;
  the Job Center renders them as a progress bar.

### 2.5 Activity log and reachability

The same middleware records every non-GET call (method, path, status, the server's summary,
duration, job id) in the `activity` store, shown on the Activity screen and exportable as JSON.
`call()` also feeds the `health` store: a network failure flips the header pill to OFFLINE with
the error, the next successful response flips it back to LIVE. The dashboard adds a PARTIAL DATA
badge when some of its polls fail, so a broken source is never hidden behind stale numbers.

### 2.6 Change review

`reviewChanges()` (`components/ReviewChanges.tsx`) wraps every edit form: it diffs the loaded
object against the form values, lists old → new per field, re-reads the object from the server to
detect concurrent edits (an "Apply anyway" checkbox overrides), and only then runs the mutation.
No dialog is shown when nothing changed.

### 2.7 Native monitor API

`api/monitor.ts` reads `/api/monitor/metrics` (OpenMetrics text, parsed by `parsePrometheus`) and
`/api/monitor/alerts` for host-level signals the SysAdmin API lacks. JWT tokens are scoped to
`/api/admin`, so only Basic credentials are forwarded; an unauthenticated or missing monitor app
is reported as unavailable rather than failing the screen.

### 2.8 Spec quirks

`lib/quirks.ts` lists known differences between the specification and running instances with their
source; the Explorer shows them beside the affected operation and applies body adapters before sending.

### 2.9 Privileges

`GET /info` returns `privileges: { Operate: {use}, Manage: {use}, Secure: {use}, … }`.
`api/privileges.ts#checkPrivileges(info, ['%Admin_Manage:U', '%Admin_Operate:U'])` returns
`granted | denied | unknown` (unknown = the server did not report that key, e.g. an older version;
the UI stays optimistic). Navigation sections, the command palette, page headers (`PrivilegeBadge`)
and the Explorer all use it.

## 3. State

| Store | Persisted in | Holds |
| --- | --- | --- |
| `session` | sessionStorage | connection, mode, tokens, `/info` |
| `connections` | localStorage | saved IRIS instances |
| `jobs` | sessionStorage | followed async tasks |
| `metrics` | memory | ring buffer of dashboard samples (120 × 3 s) |
| `demo` | sessionStorage | whether the in-browser mock is active |
| `activity` | sessionStorage | changes sent from this tab |
| `health` | memory | reachability of the instance |

Server state is entirely TanStack Query: `staleTime` 10 s, one retry after a `401`, no retry on other
4xx. Mutations go through `useApiMutation`, which toasts the envelope summary, toasts `ApiError`s
and invalidates the query keys you list.

## 4. Screens

Hand-written screens follow one shape: `PageHeader` (title, description, privilege badge, actions),
a `DataTable` (TanStack Table: sorting, quick filter, column chooser, pagination, sticky header) or a
`KeyValueList` for details, Mantine modals with `@mantine/form` for create/edit, and `confirmDanger`
for destructive actions (type-the-name confirmation for irreversible ones). Every detail page also
shows the raw JSON of the responses it used.

The **Explorer** (`features/explorer`) is generic: it lists groups from the index, renders query
parameters as inputs (enums as selects, booleans as selects), builds a request-body form from the
resolved JSON schema (flat fields) with a JSON tab for nested ones, pre-fills examples from the spec,
executes through the same client (so 202s land in the Job Center) and shows the result as a table,
fields or JSON.

## 5. Deployment topologies

| Mode | Build | Router | Origin of `/api/admin` |
| --- | --- | --- | --- |
| `npm run dev` | - | browser | Vite proxy → `VITE_IRIS_URL` |
| nginx container | `npm run build` → `dist/` | browser | nginx `proxy_pass` → IRIS |
| IRIS-hosted (`/aperture`) | `npm run build:www` → `www/` | hash, relative assets | same origin |
| GitHub Pages demo | `npm run build:demo` → `dist-demo/` | hash, relative assets | in-browser mock |

Hash routing is used wherever there is no server to rewrite deep links to `index.html`.

There is one installation path. `module.xml` copies `www/` to `{$cspdir}aperture/`, creates the
`/aperture` web application and invokes `Aperture.Installer` (`ipm/cls/Aperture/Installer.cls`),
whose Embedded Python `Configure` sets `Enabled=1`, adds password authentication to `AutheEnabled`
(bit 32) and sets `JWTAuthEnabled=1` on `/api/admin` through `Security.Applications`; its `Doctor`
prints a readiness report. The Docker image (`docker/iris/Dockerfile`, official Community image plus the package manager) runs that same package with
`zpm "load"` at build time (`docker/iris/init.script`), so a `docker compose build` is also an
install test of the IPM package.

## 6. Mock instance (demo + tests)

`src/mocks` implements the API with Mock Service Worker:

- `auth.ts` issues structurally valid JWTs (fake signature) with 15-minute access and 24-hour
  refresh tokens; four accounts have different `%Admin_*` sets.
- `secure.ts#route()` wraps every handler with authentication and privilege enforcement, so a
  `403` in the demo means exactly what it would mean on IRIS.
- `db.ts` seeds namespaces, databases, processes, locks, journals, tasks, users, roles, resources,
  services, web applications, audit events, sessions and TLS configs; `async.ts` simulates queued
  tasks with console output, progress, pause/resume/cancel.
- `handlers/generic.ts` answers **every other** operation from the spec: it checks privileges from
  the index and generates an example from the response schema, so the demo really covers all 273
  operations.
- `monitor.ts` produces drifting metrics so the dashboard charts move.

The same handlers run under Node for Vitest (`src/test/setup.ts`) and in Chromium for Playwright.

## 7. Extending

- **New screen for an existing group:** copy a feature folder, use `result(api().GET(...))` with the
  typed path, add the route in `routes.tsx` and a nav item in `features/shell/nav.ts` with its
  privileges.
- **New API version:** replace `spec/mainspec_v2.json`, run `npm run gen:api`, fix type errors.
- **Charts:** colors come from `lib/chartColors.ts` (validated categorical palettes for light and dark).
