# Changelog

## 0.3.0 - what the other entries taught us

A scan of the other contest entries (IRIS Ops Studio, IRIS Fieldwork, Meridian, IRIS
Multi-Manager, OcuPilot, Ops Canvas) turned up six things worth having before the deadline.

- **Secrets are redacted at the render boundary.** Passwords, client secrets, tokens and private
  keys are replaced before raw JSON is rendered or copied, before detail pages list fields and
  before a CSV is written; a badge says how many values were hidden. Configuration keys that only
  mention a secret word are left alone. (`src/lib/redact.ts`, unit-tested.)
- **TLS & certificates.** The TLS page gained an X.509 credentials tab: subject and issuer, the
  certificate's validity read per credential, a countdown badge (expired, expiring within 30
  days, ok), private-key presence, owners and peer names, and a type-the-alias delete.
- **Task state is verified, not assumed.** After a suspend or resume the task object and the
  task list are both re-read and the page says which one has not caught up. CI reproduced the
  behaviour another entry reported on 2026.2: `/v2/task/info` reflects the suspend at once,
  `/v2/tasks` does not. `npm run verify:live -- --mutate` (used by CI) records what your
  instance does.
- **Audit evidence for security writes.** On the Activity screen a security change can be matched
  to the `%System/%Security/<Event>` audit record that proves it; the record is shown next to
  the HTTP result and the row keeps the audit index. The demo instance writes audit records for
  its own mutations so the flow works without an IRIS.
- **Logs hub.** One screen for the contest's sixth area: audit log, journal, `alerts.log`, task
  history and this tab's changes, each with counts and the latest entry, plus an honest list of
  the logs no API route reaches.
- **README maps the six contest areas** to screens and states each area's boundary.
- **Found by the new probe on IRIS 2026.2:** an operation that declares an optional request body
  answers 415 when none is sent. Task suspend, database mount and truncate, journal integrity
  check and the Explorer now send `{}` with `Content-Type: application/json`
  (`optional-body-415` in `src/lib/quirks.ts`).

## 0.2.0 - release candidate for the contest submission

Built from an external architecture review of 0.1.0 (F/G/U/A/M-series findings, 60 items).
Every finding was checked against the code; the disposition table at the end says what was done
with each one and why the rest were deferred.

### Correctness

- Leaving the demo now stops the mock worker and unregisters its service worker, so a real
  instance is never answered with fixtures once you sign in to one.
- The query cache, activity log, jobs, metric history and reachability are reset on logout
  and on a sign-in to a different instance.
- The retry after a JWT refresh runs the same bookkeeping as a first response: jobs from a
  `202` are registered, writes are recorded once; request bookkeeping is dropped on network
  errors; bodies are buffered only for JWT sessions.
- The portal's `x-aperture-*` metadata headers are stripped before dispatch: remote instances
  see no custom headers and no CORS preflight.
- Accounts without `%Admin_Operate` land on the first screen they can use instead of a
  Dashboard of 403s.
- A finished job no longer forces a `/info` round trip; the Explorer confirms every mutating
  call and refreshes the hand-crafted screens after a write; change review re-reads the object
  at apply time; task query keys no longer overlap.
- Activity export works in every browser; switching connections revokes the old refresh token;
  byte sizes use binary labels (KiB, MiB, GiB) and never print `undefined`.

### Operator conveniences

- Tables: filter, sort and page live in the URL when keyed (share a link, Back restores the
  view), column choices and page size are remembered, the filter is debounced, "no rows" and
  "nothing matches" are distinct, clickable rows are keyboard buttons with names, and every
  keyed table exports its filtered rows as CSV (RFC 4180, formula-injection safe).
- Browser-tab titles carry the page, the instance and its LIVE flag.
- Connection profiles carry a colour (bar under the header, swatch in the chip) and an
  optional IANA time zone; timestamps are shown verbatim and relative times are exact when the
  zone is named (`docs/ARCHITECTURE.md` §2.10).
- Modals no longer close on a stray click outside; dashboard history survives a reload.

### Appearance and accessibility

- Appearance menu: light / dark / system, plus an independent contrast axis (system / normal /
  high) applied before the first paint; high contrast switches badges and alerts to solid or
  outlined variants and raises borders and focus rings.
- Light-mode secondary text raised from 3.3:1 to 7:1; inline opacities replaced by tokens.
- Chart palettes are validated by a unit test against their surfaces; series carry dash
  patterns; animations respect `prefers-reduced-motion`; forced-colors handled.
- Live regions for loading and error states; tooltips reachable by keyboard.

### Build, deployment, CI

- The OpenAPI operation index left the entry chunk (loaded when idle or on first ⌘K); a
  bundle guard in CI keeps it out. The spec index is deterministic (SHA-256 provenance).
- CI runs `prettier --check`, verifies the committed `www/` build is current, uses least
  privilege and one queue per branch; only the Pages deployment keeps a serial queue.
- nginx sends `Content-Security-Policy`, `X-Content-Type-Options` and `Referrer-Policy`;
  `IRIS_ALLOWED_ORIGINS` allow-lists further instances for direct browser calls.
- Docker build context excludes docs, workflows and tests; the IRIS image says out loud that it
  un-expires every account (development image).
- Whole-repository Prettier format (one isolated commit; see `.git-blame-ignore-revs`).

### Repository

- Removed what the release does not need: the archived single-file prototype (`docs/prototype/`,
  still the `initial commit` in history; it targeted endpoints that are not in the v2
  specification and was never part of the build), the standalone Mermaid file (now embedded in
  `docs/ARCHITECTURE.md`), the demo-assets checklist (merged into `docs/VIDEO_SCRIPT.md`) and the
  unused `QueryBoundary` component.
- The GitHub Pages deployment is opt-in: `deploy-demo` runs only when the repository variable
  `DEPLOY_DEMO` is `true`, so a private repository gets a skipped job instead of a failed run.
  Every run still attaches the demo build as the `demo-site` artifact.

### Review disposition

| Finding                                 | Status      | Note                                                                                                                                                                                                                                    |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 demo mock intercepts a real instance | done        | `disable()` stops and unregisters the worker; the demo build itself is exempt (the mock is its only backend). The optional "no mock chunk in IRIS builds" decision was not taken: the README promises a demo button on every deployment |
| F2 cache survives logout / switch       | done        | `resetInstanceState()`; tests                                                                                                                                                                                                           |
| F3 transport dependency inversion       | deferred    | largest refactor of the set, no user-visible effect; the dynamic import in `loadInfo` is the documented seam                                                                                                                            |
| F4 401-retry bookkeeping                | done        | `finalize()` runs for both responses; tests                                                                                                                                                                                             |
| F5 inflight leak                        | done        | `onError`, JWT-only buffering; test                                                                                                                                                                                                     |
| F6 spec index in the entry chunk        | done        | `lib/specIndex.ts`, idle load, CI guard                                                                                                                                                                                                 |
| F7 dashboard imports the monitor page   | done        | `useHostMetrics.ts`                                                                                                                                                                                                                     |
| F8 client-side-only tables              | partial     | filter debounced; server-side `filter`/`maxRows` deferred (semantics per endpoint unverified on real instances)                                                                                                                         |
| F9 dashboard component size             | deferred    | memoising the panels is safe work for after the contest; chart animations were fixed under G11                                                                                                                                          |
| F10 job poller                          | done        | scoped invalidation, signature-keyed effect, `useQueryClient`                                                                                                                                                                           |
| F11 Basic credentials in sessionStorage | partial     | the opt-in checkbox is explicit and its copy says what is stored; the default stays on because the demo and most sessions are JWT                                                                                                       |
| F12 security headers                    | done        | nginx CSP and friends                                                                                                                                                                                                                   |
| F13 metadata headers on the wire        | done        | stripped in `onRequest`; test                                                                                                                                                                                                           |
| F14 route-level privileges              | deferred    | U1 fixes the landing page; the nav/PageHeader duplication is documented, not harmful                                                                                                                                                    |
| F15 component tests                     | partial     | DataTable, palette, CSV, session-reset and retry tests added; shell-level RTL tests deferred                                                                                                                                            |
| F16 `www/` freshness                    | done        | CI step                                                                                                                                                                                                                                 |
| F17a-f                                  | done        | keys, apply-time re-read, method-based confirmation, invalidation, `useLiveQuery`; F17e documented in §4                                                                                                                                |
| G1 Prettier                             | done        | ignore list, `format:check`, one reformat commit                                                                                                                                                                                        |
| G2 spec index timestamp                 | done        | SHA-256                                                                                                                                                                                                                                 |
| G3 Docker context                       | done        |                                                                                                                                                                                                                                         |
| G4 CI permissions / concurrency         | done        |                                                                                                                                                                                                                                         |
| G5 time zone                            | done        | policy: verbatim wall clock, zone per profile, §2.10                                                                                                                                                                                    |
| G6 `formatBytes`                        | done        | binary labels, clamped; tests                                                                                                                                                                                                           |
| G7 export download                      | done        | `lib/download.ts`                                                                                                                                                                                                                       |
| G8 revoke on switch                     | done        |                                                                                                                                                                                                                                         |
| G9-G13 accessibility                    | done        | roles, focusable tooltips, reduced motion, honest fonts, row buttons                                                                                                                                                                    |
| G14 un-expire passwords                 | done (kept) | announced in the build log and in the script; dev image only                                                                                                                                                                            |
| G15 duplicated `/api/admin` config      | superseded  | one installer (Embedded Python) used by IPM and the Docker build                                                                                                                                                                        |
| G16 metric row keys                     | done        |                                                                                                                                                                                                                                         |
| U1-U6                                   | done        | landing, titles, URL state, modal guard, instance colour, empty states                                                                                                                                                                  |
| U7 bulk actions                         | deferred    | needs per-screen design of partial-failure reporting                                                                                                                                                                                    |
| U8 empty charts on load                 | done        | history persisted per tab                                                                                                                                                                                                               |
| U9 more shortcuts                       | deferred    | `/` and ⌘K exist; single-key bindings need an input-focus policy first                                                                                                                                                                  |
| U10 breadcrumbs, U11 phone tables       | deferred    | U10 waits on F14; U11 is a layout project                                                                                                                                                                                               |
| U12 CSV export                          | done        |                                                                                                                                                                                                                                         |
| U13 timestamp control                   | done        | `Timestamp` component; global preference deferred                                                                                                                                                                                       |
| A1 dark-mode defects                    | done        | pre-paint script, three-state theme, palette measured                                                                                                                                                                                   |
| A2-A5, A8 contrast                      | done        | tokens, contrast axis, reactive theme, localStorage                                                                                                                                                                                     |
| A6 charts                               | partial     | HC palettes and dash patterns; patterned fills deferred                                                                                                                                                                                 |
| A7 forced colors                        | partial     | badges and swatches keep colour, focus ring; not audited component by component                                                                                                                                                         |
| A9 tests                                | partial     | palette contrast test; e2e contrast pass deferred                                                                                                                                                                                       |
| M1-M4 splits                            | deferred    | pure movement; not worth churn days before submission (M3 `db.ts` is demo-only)                                                                                                                                                         |
| M5 `ApiError` accessors                 | done        | adopted                                                                                                                                                                                                                                 |
