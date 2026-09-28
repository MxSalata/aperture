# Spec findings: 20 places where the specification and IRIS 2026.2 disagree

Also published, with the same evidence, as
[20 places where the SysAdmin API specification and IRIS disagree](https://community.intersystems.com/post/20-places-where-sysadmin-api-specification-and-iris-disagree)
on the Developer Community.

Things noticed while implementing the whole specification against real instances: IRIS for Health 2026.2
(Build 221U) and IRIS Community 2026.2 in CI. The specification is vendored at commit `f764aea427e5c0b1dd08a4c18a0457e0ff7b3b34` of
[intersystems-community/sysadmin-api-specification](https://github.com/intersystems-community/sysadmin-api-specification).

1. `LocalDatabaseList` is declared as an object, but `GET /v2/database-dirs` returns an array. Aperture accepts both.
2. The specification documents `GET /info` as returning the `Info` object without the standard `{status, console, result}` envelope; IRIS 2026.2 (Build 221U) wraps it like every other endpoint. Aperture accepts both.
3. `POST /v2/database-dir/integrity-check` takes its targets in the body (`Databases[]`) while its siblings (`compact`, `defragment`, …) use the `dir` query parameter.
4. `POST /v2/journal/switch-dir` documents no body, so the target directory can only be the configured alternate directory.
5. The `Location` header points at `/v1/async-result?id=…` (on 2026.2 as in the spec example) while the documented endpoint is `/v2/async-result`; the id works on both. Aperture only relies on the `id` query parameter, and falls back to the `GUID` in the body when the header is not exposed (2026.2 sends no GUID in the body).
6. Real instances have been observed to answer errors as `status.errors` (objects with a `code`) instead of the documented `status.Errors` strings, and IRIS 2026.2 accepts `ServerDefinition` where the spec names the OAuth client field `OAuth2ServerDefinition` (both reported in the IRIS Workbench verification record). The OAuth field reproduces on IRIS for Health 2026.2: `OAuth2ServerDefinition` is refused with a 400 (`ERROR #40307`), and the answers also carry `ClientId` and `JWTInterval`, which the schema does not list (OcuPilot, [issue #2](https://github.com/intersystems-community/sysadmin-api-specification/issues/2)). Aperture normalises the envelopes and adapts the field; see `src/lib/quirks.ts`.
7. Error text is localised by the server from the request's `Accept-Language`: with `Accept-Language: *`, which Node's built-in `fetch` sends when no language is set, the messages come in Arabic (`خطأ #420: Namespace … does not exist`, observed in CI and recorded in [i-error-envelope.json](verification/2026-09-23-irishealth-2026.2/i-error-envelope.json)). Browsers always send the header, and Aperture shows the numeric `code` and `id` next to the text, which are stable.
8. A resource cannot be without a public permission through the API: IRIS 2026.2 refuses `PublicPermission` `""` or `null` on creation and on edit with a 400 whose error list and summary are both empty, and a creation without the field with a 400 (`ERROR #40301`, required), although the spec's "a string consisting only of 'R', 'W', and 'U'" includes the empty string. Public access can only be taken away in the Management Portal, or by code running in `%SYS`: `Security.Resources.Create` and `Modify` accept an empty public permission (OcuPilot). Aperture keeps every change on the SysAdmin API, where IRIS checks the signed-in user's privileges, so its form says so instead of sending a request IRIS refuses without a reason. First reported for creation in the iris-fieldwork verification record, confirmed for both on IRIS for Health 2026.2 ([writes.json](verification/2026-09-27-irishealth-2026.2/writes.json)); quirk `resource-create-empty-public`.
9. `GET /v2/security/services` answers `Enabled` as a boolean and sends no `EnabledBoolean`; the spec declares `Enabled: string` plus `EnabledBoolean: boolean`. A client written to the spec shows every service as disabled (Aperture did, until checked against IRIS for Health 2026.2).
10. `GET /v2/processes` spells the executable field `EXEname`; the spec declares `EXEName`, so a column bound to the spec stays empty.
11. `SystemUsage.BusyProcesses` of `GET /v2/monitor/dashboard/main` always has ten rows `{ Process, Commands }`, padded with `{ Process: "", Commands: 0 }`; the spec declares `Process` as an integer and says nothing about the padding.
12. `POST /v2/journal/file/records` returns half the `maxRows` it is given (200 → 100 records, the default 1000 → 500; OcuPilot saw 10 → 5 and 40 → 20); the records are the first ones, contiguous.
13. `GET /v2/task/upcoming` stops at 100 runs when `maxRows` is not given; the spec documents 1000 as the default for every list.
14. `GET /v2/databases` and `GET /v2/database-dirs` answer 403, with an empty error list, to an account holding `%Operator`, although the spec allows `%Admin_Operate:U`; `GET /v2/database-dir` (one directory) is readable with it. As `%Operator`, `GET /v2/security/ldap/configurations` answers 500 (`<INVALID OREF>` in `%Api.Admin.Util.ClassQuery`) instead of 403.
15. Reading an async task again after it ended (`GET /v2/async-result` or the `/v1` path of the `Location` header) logs a severity-2 alert, `ERROR #7846: WQM attach passed invalid token`, from `TryToKillQueue^%Api.Admin.Util.AsyncTask`. The answer is unchanged, but each re-read lands in `messages.log` and `/api/monitor/alerts` and sets `iris_system_state` to 1 (Warning): a polling client that reads a finished task twice makes the instance look degraded to every monitor.
16. JWT sessions (undocumented behaviour, IRIS 2026.2 defaults): access tokens live 60 s and refresh tokens 900 s; `POST /refresh` rotates both, and the previous access token stops working at once; presenting a refresh token that was already used answers 401 and revokes the whole session; `POST /logout` needs the access token in `Authorization` (the refresh token in the body alone gets 401) and revokes both tokens with or without a body.
17. Error texts are HTML-escaped inside the JSON (`ERROR #5002: ObjectScript error: &lt;INVALID OREF&gt;…`); a client rendering them as text must unescape them.
18. `GET /v2/security/sql-privileges` names the object and the action `Object` and `Action`; the spec (`SQLPrivilegeList`) says `Name` and `Privilege`. A client written to the spec shows empty columns and revokes the wrong privilege.
19. `POST /v2/security/oauth2/revoke` does not exist: IRIS 2026.2 serves the operation at `POST /v2/security/oauth2/server/revoke` (the documented path answers 404 to every method, the other 405 with `Allow: POST` to a GET). The routes `%Api.Admin` declares, as `/api/mgmnt` lists them, also have `HEAD` on the three SQL privilege paths, which the spec does not document. The Explorer sends the revoke to its real path.
20. With JWT authentication switched off on `/api/admin`, `POST /login` does not answer 404: IRIS asks for a password before the request reaches the API, so it is a bodiless 401 with `WWW-Authenticate: Basic`, whatever the body carries. A wrong password with JWT on is the same bodiless 401 with `WWW-Authenticate: Bearer`. A client that falls back to Basic only on 404 reports a wrong password to every user of such an instance (Aperture did); the header is the only difference, and proxies that hide it to keep the browser's login dialog away must pass it on. Observed on IRIS Community 2026.2 Build 221U, on `/api/mgmnt`, whose JWT authentication is off by default, and on the `/api/admin` of IRIS for Health 2026.2 switched off for the test and on again ([jwt-off.json](verification/2026-09-27-irishealth-2026.2/jwt-off.json)): the portal signed in with Basic there, through the dev server and served by IRIS itself, with no browser login dialog.

## How the portal handles them

[`src/lib/quirks.ts`](../src/lib/quirks.ts) holds the adapters that belong to one operation: 19 entries.
Fifteen cover fourteen of the findings above (finding 6 has two), and four cover behaviours outside them:
a resource write IRIS answers 200 to without keeping it (read back and reported), an operation whose body
is optional answers 415 when the request has none, the task list reports every task as active (the Tasks
screen reads each task's state from `/v2/task/info`), and a resumed process reports HANG until it runs
again. The API Explorer shows each note next to its operation. The other six findings are handled where
they arise: 5 by the job registry, which reads only the task id, 7 and 17 by the error normaliser
(`src/lib/errors.ts`), 11 by the dashboard, 16 by the session store and 20 by the sign-in.

## Found with OcuPilot

Joshua Brandt, building OcuPilot on the same API, reported these in the
[comments of the article](https://community.intersystems.com/post/20-places-where-sysadmin-api-specification-and-iris-disagree)
and in [OcuPilot's own list](https://github.com/jbrandtmse/OcuPilot/blob/main/docs/api-gaps.md):

- **`GET /v2/tasks` reports every task as active.** `Suspended` is false for every task, suspended ones
  included, while `GET /v2/task/info` has the real state ([issue #1](https://github.com/intersystems-community/sysadmin-api-specification/issues/1)). Confirmed on IRIS for
  Health 2026.2 on 28 September: `/v2/task/info` reported two of 19 tasks suspended, the list none. Aperture
  had read it as a lag after a suspend; its Tasks screen and Health check now read each task's state from
  `/v2/task/info` (quirk `task-list-suspended-false`).
- **`GET /v2/web-app` has no `Type`**, although the list, `GET /v2/web-apps`, carries it as a display
  string such as `System,CSP`. Confirmed in Aperture's recorded answers: 46 fields, none of them `Type`.
- **`WSGIType` is a string** (`WSGI` or `ASGI`); the schema declares an integer. In
  [COVERAGE.md](COVERAGE.md) as well.
- **A resource edit can answer 200 without saving.** `PUT /v2/security/resource` with a 300-character
  description answers 200 and leaves the resource unchanged (`Security.Resources` holds 256 characters).
  Aperture's form takes 256 at most, and every resource write is read back: when IRIS did not keep a
  field, the portal says which (quirk `resource-put-not-kept`).

## Smaller differences

Checking every answer against the schema the specification declares turns up a few more type
differences (a lock's `Pid` is an integer, a role owner's `AdminOption` the string `"0"` or `"1"`, a
device's `Alias` and a task's `ExpiresDays` an empty string), and `discover=false` on
`POST /v2/security/oauth2/client/server-definition` answers 500 where `discover=0` works. They are listed,
with the run that found them, in [COVERAGE.md](COVERAGE.md).
