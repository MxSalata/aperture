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
  host: Aperture sends `start` or `stop` only and reads the state back afterwards.
- **Jobs**: `{}` throughout, even while a host was working; the screens do not show them.
