# Evidence: IRIS Community 2026.2, local Docker stack, 23 September 2026

The repository's own `docker compose` stack, built on this machine and thrown away afterwards: IRIS
Community 2026.2 (Build 221U, the build of the IRIS for Health instance in
[`../2026-09-23-irishealth-2026.2`](../2026-09-23-irishealth-2026.2/)) with Aperture installed by
`zpm "load"`, and the nginx portal. Its only account password was generated for the run
(`npm run iris:password`).

| | |
| --- | --- |
| Image | `containers.intersystems.com/intersystems/iris-community:2026.2@sha256:87c8b9062530093d30384d66caa9933b8399bfbace7ddb7f1bdb983c0bfdb85b` (the ICR digest of the tag the compose file pins on Docker Hub) |
| Stack | `aperture-iris:local` (docker/iris/Dockerfile), `aperture-portal` (docker/Dockerfile, nginx 1.30) |

| File | Assumption | What the instance did |
| --- | --- | --- |
| `verify-live-mutate.json` | `scripts/live-check.mjs --mutate`, the CI job `verify-iris` | 25/25 over JWT |
| `partial-put.json` | a PUT naming some fields leaves the others (`scripts/live/partial-put.mjs`) | it does, for the local database, the database configuration, journal settings and a namespace: the named field changed, no other field did, and each value was put back |

Also checked by hand on the stack: the portal (`:8080`) and the IRIS-served app
(`:52773/aperture/index.html`) answer 200; `SYS` is refused and the generated password signs in
over Basic and JWT; `POST /login` on a web application with JWT switched off (`/api/mgmnt`) answers
a bodiless 401 with `WWW-Authenticate: Basic`, where a wrong password with JWT on names `Bearer`
(README spec finding 20); nginx passes that scheme on as `X-Aperture-WWW-Authenticate` and keeps its
security headers on `/api/admin`.
