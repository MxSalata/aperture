# Changelog

## Unreleased

- **A reload just after signing in no longer signs you out.** Sign-in stores the session for the
  tab, then reads `/info`. A reload or a typed address in that moment aborted the read; sign-in took
  the failure for a refused account and revoked the new tokens, and the page that loaded next
  restored them revoked: "Your session expired". A new session now ends only when the server refuses
  the account (401 or 403), as a restored one already did; a read that got no answer is left to the
  next page's own check. Found by the first live run of the security write probe on IRIS for
  Health 2026.2, where the `%Operator` account hit it on every immediate navigation.
- **The IPM package installs into a running container.** It copied the portal to
  `{$cspdir}aperture/`, the csp directory of the IRIS installation, which belongs to the image: on
  IRIS for Health 2026.2 with durable %SYS, `zpm "load"` into the running container stopped at
  Activate with `<13> Permission denied` and rolled back, and where such a copy succeeds it is lost
  whenever the container is recreated while the `/aperture` web application points at it. The
  portal now goes to `{$mgrdir}aperture/`, the instance's own manager directory, which durable %SYS
  keeps. Verified on that instance: the load completed, the readiness report passed all nine checks,
  and `npm run verify:live` with the portal URL passed 25/25, reading the log catalogue and a window
  of `messages.log` over HTTP. The CI image, which installs at build time, was not affected.
- **A click beside the command palette closes it.** The theme keeps every modal open on a click
  outside, so a half-filled form survives a stray click; the palette is a Mantine modal too and
  inherited the rule, so only Escape or a pick closed it. It now closes on its backdrop, while edit
  dialogs keep the rule (an end-to-end test checks both).
- **Disk space on the Databases screen.** A card above the table shows each disk that holds
  database files: its path, the free space IRIS reports, and the databases on it with their size;
  the table has a "Disk free" column. A disk is marked low under 10 GiB or under a tenth of the data
  on it, and critical under 2 GiB, in words as well as colour. The figures are the `DiskFree` of GET
  `/v2/database-dir/volumes`, read for every database four at a time; directories reporting the
  same free space are one disk. It works in a container too: on IRIS for Health 2026.2 with durable
  %SYS the screen shows the host disk behind `/durable/iris/mgr/` (2.6 TiB free, 12 databases) apart
  from the image's own file system under `/usr/irissys/mgr/` (77 GiB free, the three read-only
  libraries). The demo puts its application databases on a second disk that is running low.
- **The security write probe, complete on IRIS for Health 2026.2 (7/7).** `e2e/live/writes.spec.ts`
  now writes its results as it goes (one `writes.json` per run, kept when a test times out),
  registers the undo of every change to an existing object before making it and runs whatever a
  timed-out test left in `afterAll` (a timed-out run had left `%Service_Weblink` with a client
  address, put back by hand), records what the server stored next to what was sent, waits for the
  navigation before judging an escalated sign-in, creates its TLS configuration with the fields the
  spec requires, and confirms in the Explorer only when it asks. Its results, the live checks before
  and after the IPM install and the install transcript are in
  `docs/verification/2026-09-27-irishealth-2026.2/`.
- **Security edits send only what changed.** The edit dialogs of roles, resources, users, web
  applications, services and TLS configurations send the fields the review lists, as those of
  databases, journal settings and namespaces already did: IRIS merged a body naming one field for
  each of the six types. A field changed on the server since the dialog opened is kept unless it
  was changed here too, and disabling a user sends `Enabled` alone.
- **A resource without a public permission is not sent.** IRIS 2026.2 refuses one, on creation and
  on edit, with a 400 that carries no message (spec finding 8, now confirmed for both). The
  Resources form shows "none" without offering it, and a creation without a permission says why
  before sending anything; editing a resource whose public access was taken away in the Management
  Portal now sends only what changed, which IRIS accepts. The mock refuses it the same way, and
  keeps a TLS server's type when a PUT leaves it out.

## 1.0.1 - after a review of the online demo (27 September 2026)

- **The demo comes first.** On the online demo the sign-in page opens with the demo and says what it
  is; signing in to an IRIS instance follows. Where a screen needs a password in a JWT session
  (REST services, the Messages log), the demo says its password is `SYS` and offers it with one
  click. The README's evaluation path takes the integrity check through Databases → USER → Actions,
  not the Explorer's JSON body.
- **Colours of its own.** An ocean blue-teal primary replaces Mantine's stock indigo, dark mode moves
  from neutral grey to slate, light mode sets the cards on a cool page tone, and the header and sign-in
  page share one brand mark. Every colour role keeps WCAG AA contrast (computed first, then checked by
  axe in all four appearance modes).
- **A loading splash.** The page shows the brand mark and "Loading Aperture…" from the first paint,
  instead of staying blank while the demo starts its API mock.
- **Badges keep their whole label** in table columns ("RUNW", "SYSTEM", "Scheduled", no longer
  "RU…").
- **Accessibility.** The raw JSON panels and the Explorer's lists scroll by keyboard (axe reported
  scrollable-region-focusable on four screens); the audit now covers those screens too.
- **Smaller fixes.** The Explorer shows `/v2/database-dirs` as itself, not "s". Connections names
  the profile's default user and who is signed in. Database settings show megabytes and "Unlimited",
  "System default" or "Off" like the space card. The demo starts with two finished tasks in the Job
  Center and mappings in USER, reports the IRIS build Aperture was verified on (2026.2 Build 221U),
  and sends a global mapping's collation as IRIS does (an integer; a documented divergence from the
  spec).
- **Housekeeping.** GitHub Actions on their Node 24 releases, pinned by SHA; one concurrency helper
  (`mapLimit` in `lib/limiter.ts`); the entry chunk budget raised to 330 KB, with the reason.

## 1.0.0 - the submission (25 September 2026)

- **The log files, through a reader of Aperture's own.** The SysAdmin API has no route for
  `messages.log`, `alerts.log` or `SystemMonitor.log`. The IPM package now creates `/api/aperture`,
  a read-only `%CSP.REST` class (`ipm/cls/Aperture/API.cls`) over an Embedded Python file reader
  (`Logs.cls`): a catalogue of the log files and their rotations (wherever `ConsoleFile` puts
  messages.log), and windows of whole lines of at most 256 KiB ending at a byte offset, so a
  100 MB log pages at the same cost as a small one and nothing is read whole. A file is named by its
  catalogue id, never by a path; every route needs `%Admin_Operate:USE`. Logs → Messages log shows
  the newest window first, older ones on request, with a severity filter, the raw line of every
  entry and unstamped lines folded into the entry before them; the Logs hub has a card for it and
  says where each log comes from. nginx and the dev server proxy the path; the mock generates the
  same files with the same algorithm; `npm run verify:live` reads the catalogue and a window; the
  readiness report checks the web application and lists the files it can read. On an instance
  without the package the screen says so and nothing else depends on it. Verified on IRIS
  Community 2026.2 (CI run 36070924998): the catalogue and a 201-line window of `messages.log`
  read over HTTP, 28/28 checks. The first run had found the web application answering 404 because
  it was declared with `CSPZENEnabled="0"` (copied from the static `/aperture` application); a
  dispatch class only runs with CSP/ZEN enabled, and the readiness report now says when it is off.
- **Wallet & OAuth 2.0 (Security).** A Wallet tab: collections with their use and edit resources
  and the names and types of their secrets; create and edit a collection; add or replace a secret
  as a write-only value (`Collection.Secret`, the `%Wallet.Secret` name form) with its usage,
  allowed hosts and TLS requirement; delete either with the name typed. An OAuth 2.0 tab in the
  API's three roles: this instance as an authorization server with its registered clients, the
  servers it is a client of with each one's client configurations, and its resource servers;
  details in drawers with secrets redacted, deletes by typed name, every other write one link away
  in the Explorer. The demo seeds all of it.
- **Devices (Operations).** The devices with the instance's telnet and default-device settings,
  each one's detail, and links into the Explorer to create, edit or delete.
- **`/api/admin/v2` sends no CORS headers, by design** (InterSystems, contest announcement thread,
  22 September). The README, the Connections screen, the connections store and the nginx template
  stop advising an allow-list for a cross-origin instance and document the same-origin pattern: a
  second instance behind the same nginx under a path prefix, which a connection profile can now
  name as its base URL (`/iris-b`).
- **A two-minute evaluation path for the jury** at the top of the README; version 1.0.0 in
  `package.json` and `module.xml`.
- **Requests for curl, VS Code and Postman (Ideas Portal DPI-I-813).** The REST services drawer
  now shows what each route takes (path and query parameters, a body for a write), copies any
  route as curl and exports an application's routes as a Postman collection (format v2.1) or a
  `.http` file for the VS Code REST Client extension and JetBrains IDEs, generated from the
  `/api/mgmnt` description with parameters, types, examples and an example body from the schema
  (`routesOf` keeps the declared parameters and the path's `{name}` segments; `routeRequests`
  builds the requests). The Explorer does the same for the 273 SysAdmin operations with the values
  typed into the panel ("Request for curl, VS Code and Postman" under each operation, in three
  tabs with copy and save), and exports the whole API or a group from its header. The password is
  never written into a file: the files carry `{{username}}` and an empty `{{password}}`, curl asks
  for it; a secret typed into a body is redacted. `src/lib/requestExport.ts` holds the three
  writers, with unit tests; the demo's `/api/mgmnt` descriptions now declare parameters and bodies;
  the smoke run adds `30-request-export.png`.
- **Ideas Portal.** The README names the two "Community Opportunity" ideas Aperture implements,
  with what each asks and where it is done: DPI-I-966 (any rotated `messages.old_*` file readable
  in the portal, which the log reader and Logs → Messages log do) and DPI-I-813 (above).

### Before 1.0.0 - permission safety, REST services, read-only tabs

- **Edits send only what changed, where IRIS merges a PUT.** The review dialog now hands the write
  the changed fields. For the local database, the database configuration and the journal settings
  only those are sent: a field changed on the server since the dialog opened that you did not touch
  is kept instead of overwritten, and only a field changed on both sides stops the write. Recorded
  first on IRIS 2026.2 (`scripts/live/partial-put.mjs`): a PUT naming one field changed that field
  and no other, for each of these types and for namespaces. Users, roles, resources, services, web
  applications and TLS send the whole form until `e2e/live/writes.spec.ts` confirms their PUT
  merges too.

- **Sign-in falls back to Basic when JWT is switched off on /api/admin, as the README promised.** It
  did not: with JWT off, IRIS answers `POST /login` with a bodiless 401 naming `Basic` (it asks for a
  password before the API is reached), and Aperture fell back only on 404, so it reported a wrong
  password. A wrong password with JWT on is the same 401 naming `Bearer`: the scheme now decides,
  and a wrong password is still never tried twice. nginx and the dev server pass the scheme on as
  `X-Aperture-WWW-Authenticate` (they hide `WWW-Authenticate` to keep the browser's login dialog
  away); where it cannot be read, the error says to choose Basic. The mock can switch JWT off.
  Found on a local IRIS Community 2026.2 container; README spec finding 20.
- **An escalation role is refused when sign-in ends in Basic.** Escalation exists only at
  `POST /login`; the Basic session ran with the account's own roles while the account menu said
  "escalated to …".

- **The Explorer sends the OAuth token revocation where IRIS serves it.** The spec documents
  `POST /v2/security/oauth2/revoke`; IRIS 2026.2 has no such route (404 to every method) and serves
  the operation at `/v2/security/oauth2/server/revoke`. Found by comparing the routes `%Api.Admin`
  declares (from `/api/mgmnt`) with the spec, and checked with a GET on each path (404 against 405
  `Allow: POST`). A quirk now carries the served path; the Explorer uses it and the mock answers
  like IRIS. README spec finding 19.

- **Vitest 4.** The unit tests move from Vitest 3.2 to 4.1 (the next major, maintained since October
  2025); the configuration needed no change and all tests pass as before. Vitest 5 (September 2026)
  needs Node 22.12 or later and is the next step once it has settled.

- **The Disk I/O chart draws again.** It showed its axes and nothing else. `@mantine/charts` 8 wraps
  each area in a Fragment, and recharts 2 finds its children with its own `react-is` 18, which does
  not recognise React 19 elements, so the areas were never seen. Every `react-is` is now 19 through
  a global npm override (recharts' documented fix for React 19; an override scoped to recharts also
  reached the `prop-types` it shares with Mantine, which npm 10 rejects in `npm ci`), and an e2e test checks that
  both dashboard charts draw their series. Recharts stays on 2 (deprecated): recharts 3 under
  `@mantine/charts` 8 draws no areas either; it comes with `@mantine/charts` 9.

- **REST services: every REST application and its routes.** A new screen reads `/api/mgmnt`
  (outside the SysAdmin API): the REST web applications of the instance with their dispatch class,
  the spec-first classes no web application serves, and, for each, the routes its dispatch class
  declares (method, path, summary; searchable and exportable). Checked on the real instance:
  `/api/mgmnt` takes a password only, and the `/api/admin` token gets a 401 there, so a JWT session
  asks for the password once and keeps it in the tab's memory until sign-out; a refused password is
  forgotten at once and never retried. The Docker nginx and the dev server proxy `/api/mgmnt/`.

- **Editing a role or a user's roles shows who loses what.** The review lists, per enabled account
  the change reaches (holders of the role and of every role granting it), the privileges lost and
  gained, as `%DB_USER:W`. A privilege is only listed as lost when no other role, granted role or
  public permission still gives it, so removing %Admin_Task from %Operator does not list an account
  that also holds %Manager. It reads the accounts' roles (at most 50, eight at a time) when the
  dialog opens, from the same role model as the lock-out check.

- **A tab can be read-only.** Turn it on in the account menu or at sign-in; a READ-ONLY badge shows
  in the header, and the setting survives a reload of that tab only. The tab then sends nothing that
  changes the instance: the request middleware refuses every write before it leaves the browser
  (reads the API takes as POST, such as audit records and database info, still go through), and
  the review and confirm dialogs disable their action and explain why. The Explorer no longer asks
  for confirmation before those POST reads.

- **X.509 certificates are read at a steady pace.** The API has no batch read, so the tab reads one
  certificate per credential; it fired all of them at once. At most four are in flight now, each
  kept ten minutes, and only while the tab is shown.

- **A finished task refetches what it changed, not every screen.** Any task ending (a metrics
  lookup, an integrity check) invalidated every query. A job now records the operation that queued
  it; reads refetch nothing, database maintenance refetches databases and the dashboard, namespace
  and audit operations their screens, and an unknown operation (the Explorer can queue any) still
  refetches everything. Tasks followed from the server list are recognised by their name.

- **No change can lock everyone out of security.** Removing roles from a user, disabling or
  deleting a user, deleting a role or editing its resources or granted roles is judged first: if no
  enabled account would still hold `%All` or `%Admin_Secure:U` (directly or through granted roles,
  at any depth; escalation roles do not count), the dialog refuses and names today's
  administrators; when roles and owners cannot be read it asks for the name to be typed. "Disable
  account" used to act at once with no dialog at all; it asks now.

- **Docker: no well-known password, pinned supply chain.** The IRIS image used to un-expire every
  account and keep `_SYSTEM`/`SYS`. `npm run iris:password` now writes a generated password to
  `.secrets/iris-password` (git- and docker-ignored), compose passes it to the build as a BuildKit
  secret, and `init.script` sets it on every enabled account except `CSPSystem` (the account the
  image's own Web Gateway signs in with; it holds no role). `SYS` is refused; the password is in
  no layer, context or log. Base images are pinned by digest (`iris-community:2026.2`,
  `node:22-alpine`, nginx moved from 1.27 to `1.30-alpine`), every GitHub Action by commit, and
  the IPM installer by version (0.10.9) and SHA-256. CI generates a masked password per run. IRIS
  for Health 2026.2 is documented as a tested base with its digest. Verified locally: build log
  without the password, `SYS` refused, the portal served through the Web Gateway, 26/26 checks.

- **Basic credentials are never stored.** With "keep me signed in", a Basic session wrote
  `user:password` in Base64 to sessionStorage (finding F11 of 0.2.0, left partial). Only JWT
  sessions are persisted now, whose tokens expire and can be revoked; a reload of a Basic session
  signs it out and the sign-in page says why; credentials stored by an earlier version are dropped.

## Unreleased - checked against a real IRIS for Health 2026.2

The review below was done against the specification and the mock. This pass ran the portal
against IRIS for Health Community 2026.2 (Build 221U) and fixed what the real instance answered
differently; the evidence is in `docs/verification/`.

- **Services showed every service as disabled.** The list answers `Enabled` as a boolean and has
  no `EnabledBoolean` (the spec declares `Enabled: string` plus `EnabledBoolean`); the screen
  read only `EnabledBoolean`. The mock now serves the services of a 2026.2 container with their
  real `AutheEnabled` values and names authentication methods as IRIS does
  ("Operating System", no invented "JWT"); the contract test lists divergences per field.
- **Dashboard numbers.** Disk reads/writes and logical requests are totals since startup (the spec
  says so; the mock sent rates): the tiles and the "Disk I/O per second" chart now show rates
  derived from consecutive samples, with no rate across a restart. Cache efficiency is a ratio
  (global references per physical I/O, 680 on the test instance), not a percentage. Busy
  processes are the `{ Process, Commands }` rows IRIS sends, without its ten-row padding: the list
  showed blank rows and "10 busy" for one. The globals-and-routines panel says its values are
  totals.
- **Times from an instance in another zone were hours off.** With no zone named on the connection,
  instance times were read in the browser's zone: from New York, a London instance's tasks
  "finished in 5 hours", and the Activity screen queried the audit log five hours away from the
  change it looked for. The instance's offset is now measured from its clock and used when no
  zone is named (a named zone still wins, and knows about daylight saving; a one-time notice
  suggests naming it); the portal's own times are shown on the same clock. Checked live from
  America/New_York: 0 minutes off, with and without a named zone.
- **JWT sessions against real token rotation.** IRIS issues 60-second access tokens, revokes the
  previous access token on every refresh and revokes the whole session when a used refresh token
  comes back. A duplicated tab (which copies sessionStorage) therefore signed both tabs out within
  a minute: the copy now gives up its tokens locally (a Web Lock names the owning tab). A `401`
  for a request sent before a refresh finished is retried with the new token instead of
  refreshing again, which cascaded; token expiry is counted on the browser's clock from the
  token's lifetime. The mock rotates tokens with IRIS's lifetimes and rules.
- **The mock is held to a real instance, not only to the spec.** `iris-shapes.json` records the
  shapes (paths and types, no values) IRIS for Health 2026.2 answered with; the contract test fails
  on any field the mock invents or type it changes. Aligning the mock surfaced the licence servers'
  `KeyDirectory` (the screen showed an invented Description column), owners' `AdminOption` as
  `"0"`/`"1"`, lock `Pid` as an integer, task `Expires*` as strings and `TimePeriodEvery` as an
  integer; divergences from the spec are listed per field with their evidence.
- **SQL privileges: empty columns, and Revoke sent the wrong privilege.** IRIS answers `Object` and
  `Action` where the spec says `Name` and `Privilege`; the screen read the spec's names, showed
  empty columns and revoked `SELECT` on an empty object name. It reads either now.
- **Screens the walk against IRIS flagged**: the Logs hub read the audit log and task history for
  accounts that may not (403s in the console; its cards now query only what they may show); the
  journal settings form rendered empty and editable before the settings arrived, and its inputs
  switched from uncontrolled to controlled; a table's empty message and a Logs statistic nested
  block elements in `<p>`.
- Error texts arrive HTML-escaped inside the JSON (`&lt;INVALID OREF&gt;`); they are shown unescaped.
- **The mock answers as IRIS does**: `/info` enveloped, `/login` and `/refresh` not; errors in
  `status.errors` as `{ error, code, domain, id, params }`; a 403 with no text; a 401 with no body
  and a Bearer challenge; a 202 with the task id only in a `Location` that names `/v1`; logout
  with an empty body. The Explorer's error block read only the documented `status.Errors` and
  stayed empty against IRIS; codes already in the text are no longer repeated; a 403 on a task
  read says it needs `%Admin_Operate`.
- **Re-reading a finished task raised alerts on the instance.** IRIS logs a severity-2 alert for
  every read of an ended async task after the first, which turns the instance's system state to
  Warning. Aperture re-read them whenever a finished lookup was refetched (a remount, or any job
  finishing, which invalidated every query). Every read now goes through `readAsyncResult()`,
  which keeps the first final answer; the mock posts the same alert on a re-read, and tests assert
  the portal causes none.
- **Journal records: "first 200" showed 100.** IRIS returns half the `maxRows` it is given; the
  drawer asks for twice its page, shows one page and says when the file holds more.
- **Operators were offered Databases and met a 403.** The spec allows `%Admin_Operate` for the
  database lists; IRIS refuses them to `%Operator`. The navigation, the page badge and the mock
  follow the server.
- **Processes: the Executable column was always empty.** IRIS spells the field `EXEname` (the spec
  says `EXEName`). Elapsed time sorts by duration (`hh:mm:ss`, as IRIS writes it) instead of as text.

## Unreleased - code review

A full review of the codebase (every screen, store and the mock, with probes that reproduced
each suspected bug before it was fixed). Highlights:

- **Authentication flags were mis-numbered and dropped on save.** 2048 (LDAP) was labelled
  "Login token", 256 "LDAP", 1024 "Delegated"; the web-application and service editors rebuilt
  `AutheEnabled` from the checkboxes, silently clearing delegated, login-token, two-factor,
  Kerberos and mutual-TLS bits on any save. Fixed, and bits the form does not show are kept.
- **`/api/monitor/alerts` is a cursor** (it returns what was posted since the previous call, by
  anyone). The Host monitor polled it every 30 s and the Logs hub read it on open, emptying the
  portal's own list and taking alerts away from Prometheus/SAM. Alerts are now read on request and
  kept for the session; counts come from `iris_system_alerts_log` / `_new` in `/metrics`.
- **Redaction gaps closed:** `access_token` / `refresh_token` (a POST /login in the Explorer showed
  live tokens), strings inside secret objects, process variables named like secrets, and the
  change-review dialog.
- **Role grants use the API's shape** (`[{ Name, Permissions }]`); the mock had taught the editor
  strings. A new contract test keeps the mock honest against the specification.
- **Auditor accounts:** reading an async task needs `%Admin_Operate`; the 403 is now final (it
  was re-polled every second) and explained.
- **Reachability:** a 502/503/504 from the proxy counts as the instance being down; HTML error
  pages become one line. A network blip on reload no longer signs you out.
- **Sign-in:** passwords beyond Latin-1 no longer crash Basic authentication; JWT subjects decode
  as UTF-8; a late token refresh cannot revive a signed-out session.
- Smaller fixes: finished server tasks can be followed, database dialogs open with current
  values, Windows database paths join, two-step create/delete say what exists after a partial
  failure, TLS `VerifyPeer` 3 (mutual TLS) is editable, `ServeFiles` offers the spec's values,
  whole-name audit matching, forms no longer overwritten by background refetches, and more
  (see the commit messages).
- **Accessibility is tested, not assumed.** `e2e/a11y.spec.ts` runs axe-core (WCAG 2.1 A/AA)
  over the sign-in page and nine screens in light, dark and both high-contrast modes; serious or
  critical findings fail CI. Its first run found Mantine's default colours below 4.5:1 almost
  everywhere (white on filled red 3.3:1, light yellow badges 1.75:1, dark-scheme dimmed text
  4.0:1), icon-only pagination buttons without names, unnamed progress bars and table viewports
  keyboard users could not scroll. All fixed: `src/styles.css` now sets every filled, text,
  outline and light-colour token to the nearest shade that passes on the surfaces it sits on.
- **Deployment:** Docker Compose publishes its ports on `127.0.0.1` by default (well-known
  credentials); `APERTURE_BIND` opts out. The installer's readiness report no longer fails an
  install where Embedded Python is unavailable.

## 0.3.0

Six additions.

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

- Removed the standalone Mermaid file (the diagram lives in `docs/ARCHITECTURE.md`) and the
  unused `QueryBoundary` component.
- The GitHub Pages deployment is opt-in: `deploy-demo` runs only when the repository variable
  `DEPLOY_DEMO` is `true`, so a private repository gets a skipped job instead of a failed run.
  Every run still attaches the demo build as the `demo-site` artifact.
