# Evidence: IRIS for Health 2026.2, 27 September 2026

The second pass against the instance of
[23 September](../2026-09-23-irishealth-2026.2/): the checks that change security settings, which
that set left out, the IPM install into the running container, and the log reader on IRIS for
Health. Run with Aperture 1.0.1 and the fixes after it, from a snapshot of the instance's durable
directory taken just before, and every change put back (checked by reading the touched objects
before and after).

| | |
| --- | --- |
| Image | `containers.intersystems.com/intersystems/irishealth-community:2026.2@sha256:7c06b6b3d950bc25f3e353b0a65db0c4045f251fb9103eade63514302b662cf3` |
| Build | `IRIS for UNIX (Ubuntu Server LTS for x86-64 Containers) 2026.2 (Build 221U) Fri Jun 26 2026 09:58:52 EDT` |
| Instance | Community Edition container, durable %SYS, time zone Europe/London, on a LAN |
| Accounts | `_SYSTEM` (`%All`) and an account holding `%Operator` only; the probe creates and deletes its own `ApertureProbe*` accounts |
| Redaction | the instance's address is `iris-host`; no password, token or other address is recorded |

## Files

| File | What it shows |
| --- | --- |
| `writes.json` | `e2e/live/writes.spec.ts` with `LIVE_MUTATE=1`, 7/7. **Partial PUT merges for every security type**: role, resource, user, web application, service and TLS configuration each took a body naming one field and changed only that field; a list in the body (a role's `Resources`) replaces the stored list whole; a user's `Roles` come back sorted. **No public permission is refused**: `PublicPermission` `""` and `null` answer 400 with an empty error list and summary, on creation and on edit, and a creation without the field answers 400 `ERROR #40301` (required). A service stores only the `AutheEnabled` bits it supports (1024 and 2^25 on `%Service_Weblink` were dropped, 64 kept); a web application keeps bits its form does not show (K5API, two-factor SMS and TOTP) through an edit in the UI. **Sign-in**: escalation at `POST /login` gives the role's privileges (`Secure` on), a role the account may not escalate to answers 401, a password beyond Latin-1 signs in with Basic sent as UTF-8 (Latin-1: 401), and the sign-in form escalates too. **An account without `%Admin_Operate`** queues a task (202) but gets 403 for its result; the Job Center polled once, stopped, and said why. A TLS configuration is created with `Type`, `Enabled` and `VerifyPeer`, as the spec says. |
| `verify-live.json` | `scripts/live-check.mjs`, 23/23, before the package was installed (the log reader answers 404). |
| `verify-live-portal.json` | the same with `PORTAL_URL` after the IPM install, 25/25: the log catalogue (`messages.log`, `SystemMonitor.log`), a window of 199 whole lines of `messages.log`, and the portal served at `/aperture/index.html`. |
| `ipm-load.txt` | `zpm "load"` into the running container: with the portal copied to `{$cspdir}` it stopped at Activate (`<13> Permission denied` on `/usr/irissys/csp/aperture/`, the image's own directory); copied to `{$mgrdir}` it installed, and the readiness report passed all nine checks. |
| `ui/walk-admin.json`, `ui/walk-operator.json` | every screen of 1.0.1 with the fixes, both accounts, as on 23 September: administrator, 32 screens with no console error or failed request (the only note is the dashboard's notice that the instance's clock differs from the browser's); operator, 403s only on the screens that need a privilege it lacks. |
| `ui/time-readings.json` | browser in America/New_York, instance UTC+1: every absolute time 0 minutes off, without a named zone and with Europe/London. |
| `ui/limits.json` | the audit query at its `maxRows` and the journal records at 200 show the "server limit reached" badge. |

What the run changed in Aperture (see `CHANGELOG.md`): the edit dialogs of the six security types
send only what changed; the Resources form says that "none" is refused instead of sending it; the
IPM package installs into `{$mgrdir}`; and a reload just after signing in no longer ends the
session, a bug the probe's own sign-ins ran into.
