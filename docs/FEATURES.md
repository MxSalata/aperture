# Everything in Aperture, screen by screen

What each area of the portal does, with what is notable about it and where to look in the code. The [README](../README.md) has the
short version; [COVERAGE.md](COVERAGE.md) lists the API operations each screen calls.

## Dashboard

Live stats, sparklines, your choice of charts (global refs/s, disk I/O, message throughput and queued messages per namespace from the interoperability metrics, cache efficiency, logical requests, routine refs, processes and sessions, licence use), host gauges, health, alerts, upcoming tasks, busy processes, resource seizes.

_Notable:_ polls `/v2/monitor/*` every 3 s, keeps history while you navigate.

## Job Center

Every `202 Accepted` response, with console output, progress, pause / resume / cancel.

_Notable:_ fed automatically by the API client (Location header or body GUID); toasts on completion.

## Health check

Sixteen read-only checks run with your own access (disks, databases, journal, backup, UnknownUser, auditing, open services and applications, %All holders, certificates, tasks, monitor, alerts, licence, severe log entries), findings by severity with what they mean, what to do, the evidence and a link to the screen that fixes it; what the account may not read is listed as not checked; Markdown and JSON export; a dashboard card.

_Notable:_ `src/features/health/checks.ts` (pure checks, one test each), `runner.ts`.

## Activity

Every change this tab sent and what the server answered, exportable as JSON; a security write can be matched to the `%System/%Security/*` audit record that proves it.

_Notable:_ recorded by the client middleware; audit lookup runs as an async task around the request time.

## Host monitor

CPU, memory, disk, licence and alerts.log from the native `/api/monitor` service.

_Notable:_ OpenMetrics parsed in the browser; degrades to "unavailable" honestly.

## Databases

Configuration + local file view, free disk space per disk and per database, metrics (async), mount/dismount, compact, defragment, integrity check, truncate, expand, volumes, create, delete.

_Notable:_ dangerous actions require typing the name.

## Namespaces

Create, delete, enable interoperability, copy mappings, global/package/routine mappings.

## Processes

Live list, detail with variables and roles, suspend/resume/terminate, broadcast.

## Locks, Devices, Journals, Tasks, Web sessions, License

Lock removal with transaction check, devices with the telnet and default-device settings, journal files/records/settings/switching, task schedules + history + task manager (state re-read after every change), session ending, license key/usage/servers.

## Logs

A hub over every log of the instance, and a Messages log screen: `messages.log`, `alerts.log`, `SystemMonitor.log` and their rotations read in bounded windows through the package's `/api/aperture` reader, newest first, older on request, severity filter, the raw line of every entry; "Similar" on any entry lists the entries worded like it across `messages.log` and its rotations, with how often and when, through IRIS Vector Search (an HNSW index over hashed words, matched by wording, not by meaning).

_Notable:_ `ipm/cls/Aperture/API.cls`, `Logs.cls`, `LogIndex.cls` (Embedded Python), `src/lib/messagesLog.ts`, `logVectors.ts`.

## Security

Users, roles, resources, services, web applications (JWT, CORS), audit events + log + purge, SQL privileges; _TLS & certificates_ (TLS/SSL configurations with a connection test, X.509 credentials with certificate expiry); _Wallet & OAuth_ (wallet collections and write-only secrets, OAuth 2.0 in its three roles).

_Notable:_ secrets are redacted at the render boundary.

## Permission safety

A change to a user or a role that would leave no enabled account holding %All or %Admin_Secure:U is refused; every such change lists, per account it reaches, the privileges lost and gained, counting granted roles and public permissions.

_Notable:_ `features/security/adminGuard.ts`, `impact.ts`.

## REST services

Every REST web application of the instance, the spec-first classes no application serves, and the routes each one declares with what each takes, from `/api/mgmnt` (outside the SysAdmin API); the routes export as a Postman collection or a `.http` file, any route copies as curl.

_Notable:_ a JWT session gives the password once, kept in the tab's memory only.

## API Explorer

Every one of the 273 operations rendered from the OpenAPI document: parameters, request body form or JSON, privileges, documented responses, response as table / fields / JSON; each operation also as curl, a `.http` block or a Postman item with the values typed, and the whole API or a group as a file.

_Notable:_ reachable from the command palette.

## Everywhere

⌘K command palette, a navigation menu you can rearrange (hold an entry and drag it, or Alt+arrows), auto-refresh beside every Refresh button (off, 5, 15, 30 or 60 s, remembered per screen), privilege badges, raw JSON of every response with passwords, secrets, tokens and private keys redacted (and a count of what was hidden), responsive layout, multiple saved connections, escalation-role login, LIVE / OFFLINE / DEMO indicator, read-only tabs that send nothing that changes the instance.

_Notable:_ `src/lib/redact.ts`.

## Tables

Filter, sort and page live in the URL (share a link to exactly what you see; Back restores it), column choices and page size are remembered per table, every table exports its filtered rows as CSV, "no rows" and "nothing matches your filter" are different messages.

_Notable:_ `stateKey` / `exportName` on `DataTable`.

## Instances

Each saved connection has a colour (a bar under the header, so production never looks like staging) and an optional time zone, browser-tab titles carry the instance name and its LIVE flag, and an account without `%Admin_Operate` lands on a screen it can use.

_Notable:_ `docs/ARCHITECTURE.md` §2.10 for the time policy.

## Appearance

Light, pastel (soft lavender, mint, peach, butter, sky and rose, with a periwinkle accent), dark or system theme plus an independent contrast axis (system / normal / high), applied before the first paint; live regions, keyboard-reachable tooltips, reduced-motion and forced-colors support; colour tokens and chart palettes tested for WCAG 2 AA contrast.

_Notable:_ Appearance menu; axe-core audits all five modes in CI.

## Change review

Every edit form shows old → new per field, re-reads the object to detect concurrent edits, and only then applies; where IRIS merges a PUT, only the changed fields are sent.

_Notable:_ `reviewChanges()` in `src/components/ReviewChanges.tsx`.
