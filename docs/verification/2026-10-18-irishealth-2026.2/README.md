# Evidence: interoperability productions on IRIS for Health 2026.2, 18 October 2026

The same instance as in September (IRIS for Health Community 2026.2, Build 221U, durable %SYS), with the test
production of [`scripts/live/lab.mjs`](../../../scripts/live/lab.mjs) running in the `APERTURELAB` namespace:
`Aperture.Lab.Production`, whose `Lab.Flaky` refuses every other message, `Lab.Slow` takes three seconds a message so
bursts queue, and `Lab.Spare` is disabled.

| File | What it shows |
| --- | --- |
| `p-interop.json` | [`scripts/live/interop.mjs`](../../../scripts/live/interop.mjs), read-only: `/api/interop-editors` (`%Api.InteropEditors`, `apiVersion` 7) answers 200 to the token of `/api/admin/login` (its `app` claim is `/api/admin/`; both applications have JWT on and the by-ID group `%ISCMgtPortal`) and to Basic; the privileges it reports; the productions and status of every namespace; the test production's definition, connections, categories, each host's event log, messages, queue and jobs, a host by name (404) and by item id (200), its settings, and a message search |

What the screens rely on, as recorded here and while building them:

- **The routes are IRIS's own UI's.** The API is not documented (its dispatch classes are marked internal, and
  `/api/mgmnt` answers 404 for its descriptions, v1 to v7); IRIS's Interoperability UI (`/ui/interop/`) calls
  `/api/interop-editors/v7/`, and the routes the screens use are among the ones it calls.
- **A host's `status` is the outcome of its last message**: `Lab.Flaky` read `ok`, then `error` three times eight
  seconds apart. A host that fails now and then shows in its event log, which keeps every failure.
- **Clocks**: event log times and a queue's `TimeCreated` are the instance's wall clock; message `Date`s are UTC,
  without a designator.
- **Language**: names and messages follow the request's `Accept-Language`; with none, or `*`, IRIS picks the first
  language it has (Arabic). A browser always sends one.
- **Starting and stopping** (`POST {ns}/productions/production/state/{production}?state=start|stop`, with
  `&hostID=` the item id for one host): both work, and a stopped host reads `stopped` while staying enabled. The
  route answers `{"Success":1}` to any other value too (`restart`, `recover`, `bogus`), and `restart` stopped a
  host: Aperture sends `start` or `stop`, and `recover` for a troubled production, and reads the state back afterwards. What `recover` does was taken from the `%Api.InteropEditors` source (`RecoverProduction`), not recorded here.
- **SQL through Atelier** (`/api/atelier`, API 8, password only, `%Development`): `?positional=1` answers
  `[{ columns: [{ name, type }], content: [[...]] }]`; `EXPLAIN` one `Plan` column in the 2026 plain-text form; an
  error is HTTP 200 with `status.errors[0]` `{ code: 5540, id: "SQLCode", params: ["-30", "Table ... not found"] }`;
  `CREATE TABLE`, `INSERT`, `UPDATE` and `DROP TABLE` answer `result: []` with no row count;
  `INFORMATION_SCHEMA.CURRENT_STATEMENTS` has no statement text, `STATEMENTS` has the statistics.
  `e2e/live/sql.spec.ts` checks the screen, and its @mutate test creates, fills, reads and drops a table in APERTURELAB.
- **FHIR servers**: the test server "Aperture lab R4" (`/csp/healthshare/aperturelab/fhir/r4`) was made with
  `POST /csp/fhir-management/api/endpoints?namespace=APERTURELAB` (303 to its job, complete in 38 s; enabling
  interoperability in a namespace of IRIS for Health makes it a Foundation namespace, FHIR-enabled). A `PUT` with
  `{ serviceId, enabled }` alone disables or enables it; disabled, its `/metadata` answers 503; enabled, it answers
  without credentials and refuses the portal's token (401). `e2e/live/fhir.spec.ts` reads the screens, and its
  @mutate test disables and enables the server.
- **Jobs**: `{}` throughout, even while a host was working; the screens do not show them.

## The runs that change the instance, 19 October 2026

With the test production running and `LIVE_MUTATE=1`, `e2e/live/productions.spec.ts`, `sql.spec.ts` and
`fhir.spec.ts` passed, their @mutate tests included (6 tests): a host stopped and started again, read back from IRIS;
a table created, written, read back and dropped in APERTURELAB; "Aperture lab R4" disabled and enabled again. The
test production was stopped again afterwards.

For that run the `%System/%SQL/DynamicStatementDML` and `DynamicStatementDDL` audit events were switched on (and off
again after it). The audit log then held three records under the signed-in account, `_SYSTEM`: the `CREATE TABLE`,
the `INSERT` and the `DROP TABLE` of `ApertureProbe.Note`. The `SELECT` was not recorded, as
`DynamicStatementQuery` stayed off. The records reached `%SYS.Audit` a few seconds after the statements.
