# Evidence: the SQL and FHIR screens on IRIS for Health 2026.2, 19 October 2026

The same instance as on [18 October](../2026-10-18-irishealth-2026.2/) (IRIS for Health Community 2026.2, Build 221U,
durable %SYS), with the `APERTURELAB` namespace of [`scripts/live/lab.mjs`](../../../scripts/live/lab.mjs) and its FHIR
server "Aperture lab R4" (`/csp/healthshare/aperturelab/fhir/r4`). The screens of 1.4.0 to 1.7.0 against it, from
Aperture 1.7.0 (`0057c91`, "Release 1.7.0"; the commits after it change only the live tests and this folder) served by
the Vite dev server of `playwright.live.config.ts`, signed in as the administrator account (`_SYSTEM`). The browser ran
in America/New_York and the instance at UTC+01:00, so each screen showed the notice that the two clocks differ; the
tests close it before each screenshot, as it covers the header and the signed-in account.

## Read-only run, 14:12 (House time)

```
IRIS_URL=… APERTURE_LIVE_ENV=… CI=true LIVE_EVIDENCE=docs/verification/2026-10-19-irishealth-2026.2/ui \
  npx playwright test -c playwright.live.config.ts e2e/live/sql.spec.ts e2e/live/fhir.spec.ts
```

Without `LIVE_MUTATE`, so the two @mutate tests were skipped. 2 passed: `fhir.spec.ts` "the FHIR servers and one of
them" (4.2 s) and `sql.spec.ts` "a query with its column types, a plan, and the catalogue" (4.3 s). Each screenshot is
the whole page, with the window made as tall as the page for it. Nothing was written
to the instance: the SQL test runs a `SELECT`, an `EXPLAIN` and a `SELECT` of a table that does not exist, and reads the
statement index; the FHIR test reads. The audit notice was only displayed, and none of its buttons was clicked.

| File | What it shows |
| --- | --- |
| `ui/sql-audit-notice.png` | the SQL screen on `USER` as it opens: the orange notice "IRIS SQL audit is disabled", saying that statements run there are not written to the IRIS audit log under any user, that DynamicStatementDML and DynamicStatementDDL are off, a link to Security > Audit, and its "Audit SQL changes…" button (not clicked) |
| `ui/sql-query.png` | `SELECT TOP 5 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES`: "5 rows in 35 ms", each column header with its SQL type (`VARCHAR(128)`) |
| `ui/sql-plan.png` | Explain on the same statement: IRIS's plan in its 2026 text form (the warning that the table is not tuned, the cost, the modules and the map it reads) |
| `ui/sql-error.png` | `SELECT nothing FROM Nowhere.AtAll`: "The statement failed", `SQLCODE -30: Table 'NOWHERE.ATALL' not found` |
| `ui/sql-statement-index.png` | the Statement index tab: 81 statements of `USER` with their `StatCount`, `StatTotal`, `StatAverage` and `StatRowCount` |
| `ui/fhir-servers.png` | FHIR servers: one row, `APERTURELAB`, "Aperture lab R4", its URL, FHIR 4.0.1, JsonAdvSQL storage, Enabled, 0 resources |
| `ui/fhir-server.png` | the server's page: state, FHIR version, package `hl7.fhir.r4.core@4.0.1`, storage strategy, search page sizes, prefer handling, validation, debug mode, OAuth client and databases, and the Stored tab ("It stores nothing yet.") |
| `ui/fhir-server-serves.png` | the Serves tab: "FHIR 4.0.1, 145 resource types", each with its interactions and the number of search parameters |
| `ui/fhir-server-jobs.png` | the Jobs tab: "No job for this server." (IRIS keeps a server's jobs only for a while) |

The production screens are not in this set: their spec needs the test production running, and it was stopped. Their
screenshots of 18 October are in [`../2026-10-18-irishealth-2026.2/ui/`](../2026-10-18-irishealth-2026.2/ui/), and
they predate the fixes of 19 October.

## Changes, run separately on 19 October

Earlier that day (before 11:21), the @mutate tests of `productions.spec.ts`, `sql.spec.ts` and `fhir.spec.ts`, with
`LIVE_MUTATE=1` and the test production running, on the same instance but from `0a41b77`, before 1.7.0 was built: 6
passed. A host of the test production was stopped and started again, read back from IRIS; a table was created,
written, read back and dropped in `APERTURELAB` (`ApertureProbe.Note`); and the lab FHIR server was disabled and
enabled again. The test production was stopped again afterwards.

The audit check: with DynamicStatementDML and DynamicStatementDDL switched on for that run, and off again afterwards,
IRIS wrote 3 records under `_SYSTEM` for the SQL test: `CREATE TABLE`, `INSERT` and `DROP TABLE` of
`ApertureProbe.Note`. The `SELECT` was not recorded, as DynamicStatementQuery stayed off. The records reached
`%SYS.Audit` a few seconds after the statements. The notice above shows the settings as they were left.
