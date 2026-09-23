# Evidence: IRIS for Health 2026.2, 23 September 2026

Raw answers of a real instance for the assumptions Aperture makes, recorded by the scripts in
`scripts/live/` and the opt-in Playwright project `playwright.live.config.ts`.

| | |
| --- | --- |
| Image | `containers.intersystems.com/intersystems/irishealth-community:2026.2@sha256:7c06b6b3d950bc25f3e353b0a65db0c4045f251fb9103eade63514302b662cf3` |
| Build | `IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2 (Build 221U) Fri Jun 26 2026 09:58:52 EDT`, `/info` `apiVersion: 2`, product `irisforhealth` |
| Instance | Community Edition container, durable %SYS, time zone Europe/London (UTC+1 on the day), started with `--check-caps false --ISCAgent false` |
| Accounts | an administrator (`%All`) and an account holding `%Operator` only |
| Redaction | secrets never reach disk (token values, passwords); the instance's address is `<iris-host>`, other private addresses `<lan-ip>`, the host part of the JWT issuer `<iris-hostname>` |

Reproduce against your own instance (credentials in an env file outside the repository):

```bash
IRIS_URL=http://iris.lan:52773 IRIS_IMAGE=<image@digest> \
  node --env-file=$HOME/.aperture/iris-live.env scripts/live/evidence.mjs --out docs/verification/<run>
APERTURE_LIVE_ENV=$HOME/.aperture/iris-live.env IRIS_URL=http://iris.lan:52773 npm run test:live
```

## Files

| File | Assumption | What the instance did |
| --- | --- | --- |
| `a-role-grants.json` | role `Resources` is `[{Name, Permissions}]` | confirmed, all 65 roles |
| `b-role-owners.json` | owners are `[{Name, Type, AdminOption}]` | confirmed; `Type` is `User`, `User (escalation)` or `Role`; `AdminOption` is the string `"0"`/`"1"` (spec: boolean) |
| `c-databases.json`, `c-journal.json` | volumes, journal `Databases`, `database-dirs` | confirmed; volumes also carry `VolumeDirectoryTotalSize`; `database-dirs` is an array (spec: object) |
| `d-authe-enabled.json` | `AutheEnabled` bit numbering | bits 4 OS, 5 Password, 6 Unauthenticated, 10 AutheSystem (no method name), 13 Delegated, matching `keys.ts`; the services list sends `Enabled` as a boolean and no `EnabledBoolean` |
| `e-monitor-counters.json`, `e-alerts-cursor.json` | `/api/monitor/alerts` is a destructive cursor; `/metrics` is not | confirmed: 2 alerts, then 0; `iris_system_alerts_log` unchanged; `_new` is a flag the alerts read clears; alert times are UTC `…Z` |
| `f-timestamps.json` | which times are zoned | none: every field is the instance's wall clock without a zone, except the audit log's `UTCTimeStamp` (UTC without a zone); `ui/time-readings.json` checks the screens |
| `g-async.json` | 202 + `Location`; 415 on a missing optional body | `Location` names `/v1/async-result` on a v2 call and works; no GUID in the body; `%Operator` reading another user's task gets 404; a journal integrity check without a body answers 415, with `{}` 202 |
| `h-lists-and-spec-sweep.json` | lists stop at `maxRows` (default 1000); every parameterless GET against the spec | no list reached 1000 here; `maxRows` honoured; spec mismatches in `database-dirs`, `locks` (`Pid` integer), dashboard `BusyProcesses` (padded with `""`), services (`Enabled` boolean) |
| `i-error-envelope.json` | error envelope | `status.errors` objects `{error, code, domain, id, params}`; the text follows `Accept-Language` (Arabic for `*`, German for `de`) |
| `j-sign-in.json` | JWT login, refresh, logout, Basic | `/info` enveloped, `/login` not; 401s carry `WWW-Authenticate: Bearer` (never Basic); a role the user may not escalate to answers 401 |
| `k-token-lifetime.json` | token handling | access 60 s, refresh 900 s; refresh rotates and kills the old access token; replaying a used refresh token revokes the session; logout needs the Bearer header |
| `l-operator-privileges.json` | `%Operator` gets what the spec allows `%Admin_Operate` | except `database-dirs` and `databases` (403) and the LDAP configuration list (500, `<INVALID OREF>`) |
| `m-list-limits.json` | default `maxRows` | `task/upcoming` stops at 100 without `maxRows`; journal records return half the `maxRows` asked for, contiguous |
| `n-async-reread-alert.json` | re-reading an ended task is harmless | it is not: every read after the first final one logs a severity-2 alert (`ERROR #7846`) |
| `verify-live.json`, `verify-live-mutate.json` | `npm run verify:live` (22/22) and with `--mutate` (25/25) | the task list lags the task object right after a suspend (`task-suspended-lag`) |
| `ui/walk-admin.json`, `ui/walk-operator.json` | every screen, both accounts | administrator: 32 screens, no console errors or failed requests; operator: 403s only on screens the navigation does not offer it |
| `ui/time-readings.json` | times read right from another zone | browser in America/New_York, instance UTC+1: 0 minutes off without and with a named zone (300 minutes off before the fix) |
| `ui/limits.json` | limit badges | audit query at its `maxRows` and journal records at 200 show the badge |
| `ui/outage.json` | OFFLINE on 502 | the header turned OFFLINE within 4 s of the container stopping (nginx 502), LIVE again after the start; the session survived the restart |
| `summary.json` | one line per section | |

Not in this set: the checks that change security settings (partial PUT per object type, the
`AutheEnabled` round trip through the UI, resource creation with no public permission,
escalation at sign-in, a password beyond Latin-1, an account without `%Admin_Operate`). They are
`e2e/live/writes.spec.ts`, which the instance's owner runs (`LIVE_MUTATE=1`) after a snapshot.
