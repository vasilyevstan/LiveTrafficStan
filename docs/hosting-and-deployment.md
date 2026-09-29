# Hosting and Deployment

## Decision and current status

Decision date: **2026-09-19**

LiveTrafficStan selects **Cloudflare Workers with Static Assets** as its
production platform:

- Vite's `dist/` output is served as immutable static assets;
- one Worker handles the same-origin ADSB.lol point and AWC METAR paths plus a
  protected storage-only orbital catalog route and scheduler;
- plausible route lookup calls ADSB.lol standing data directly from the
  browser once for a newly selected eligible live aircraft;
- exact-IMO vessel reference photos are versioned same-origin Static Assets
  and require no runtime Wikimedia, Wikidata, tracker, or image API;
- OpenFreeMap, Photon, and Digitraffic REST/MQTT remain direct browser
  connections;
- no plausible-route secret, quota store, result database, queue, or general
  backend is added. Private aircraft delivery uses one protected
  Worker-to-relay bearer secret and one fixed VPC Service binding. Orbital
  activation adds one dedicated bounded KV namespace, one SQLite-backed
  Durable Object coordinator, and one two-hour Cron.

The accepted recovery design keeps that public Cloudflare boundary and routes
only aircraft through a private Workers VPC Service and Tunnel to an isolated
OCI E2 Micro relay. The relay is running and provider/cadence behavior is
proven. The Tunnel, VPC Service, and QUIC connector are active; the checked
Worker binding is used only by a protected `oci-private-relay` deployment.
See [OCI Aircraft Relay](oci-aircraft-relay.md).

`wrangler.jsonc` temporarily retains a declarative deleted-state tombstone for
the former `FlightRouteQuota` class so Cloudflare can retire the already
provisioned namespace and its obsolete attempt-counter data. It is not a
runtime export or binding and can be removed only after Cloudflare reports the
tombstone as stale.

Public production is live at
<https://livetrafficstan.syntal.workers.dev> on Cloudflare Workers Free with
Static Assets. The protected `production` environment contains the deployment
credentials and the private-relay secret. Observability remains disabled and
no paid fallback is enabled. Orbital activation uses the included free KV and
SQLite Durable Object allocations; R2 is not used.

The current application source is
`94c1d35b3687cd26b4d0445005eaf38edfbf7964`. Visibility release deployment
run `36554328684` published Cloudflare version
`50b2a0a0-b09d-4e7d-8851-61c0817c07cc` with aircraft delivery through
`oci-private-relay`, aircraft photos, plausible routes, the five-file
exact-IMO vessel-photo manifest, and the orbital catalog enabled. It preserved
KV namespace `59178d55418247c4bab473b52a5dc07d`, one SQLite coordinator, and
Cron `17 */2 * * *`. The compatible relay remains at
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` and retains
`76540a21291878b44e7f92ceecb37d03a366c0c7` as the prior release. The
deployed client is `assets/index-BmhBmsdh.js`, and the deployed `index.html`
SHA-256 is
`8355a66f740f01d99fc1df83057df4b6f29d913ced9c84d8907f412058e24f62`.

The exact-release orbital endpoint and fresh-profile desktop/mobile browser
acceptance passed. The workflow's aggregate smoke ended red only because the
independent private aircraft relay returned `502 Aircraft upstream
unavailable`, tracked in #174. The deployment remained active because orbital,
marine, map, and static-context behavior was healthy and the architecture
requires truthful partial operation rather than rollback of an unrelated
release.

The activation catalog contains 156 schema-v1 records with digest
`2cbe00a3285c7bdfd80fe07661b6a14b48279d0629e44c026c6306bb20453d5b`
and bootstrap retrieval time `2026-09-28T18:45:06.958Z`. The stable browser
validator is the semantic weak ETag
`W/"2cbe00a3285c7bdfd80fe07661b6a14b48279d0629e44c026c6306bb20453d5b"`.

The final restoration installed its triggers at `2026-09-28T21:46:41Z`.
The first eligible `22:17Z` schedule was observed through the public catalog
route at `22:19:30Z` and every two minutes through `22:31:54Z`. Every response
remained the exact validated bootstrap. No compatible KV publication is
therefore claimed for that bounded window, and the observation alone cannot
distinguish delayed scheduled delivery from a failed refresh. The bootstrap
kept the feature available; #162 retains the first successful scheduled KV
publication as explicit outstanding evidence.

The public Wiki synchronization is commit
`bc45563e666d1a5622a9fd29f16771faf1fea2a2`. It updates focused
[Orbital Tracking](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Orbital-Tracking)
and
[Infrastructure and Hosting](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Infrastructure-and-Hosting)
pages plus the surrounding Home, map, release, troubleshooting, and
accessibility documentation with the visibility release evidence.

Current rendered route acceptance selected live `BTI877`, made exactly one
route request, rendered TLL to BCN, and made no second route request after an
aircraft polling refresh. Selecting live `FIN7DE` rendered HEL to TLL. The
compact caveat and ADSB.lol/VRS attributions remained visible with one
MapLibre canvas and zero horizontal overflow at desktop and 390x844.

Earlier rendered production acceptance used deterministic marine fixtures
against the real deployed application and asset bytes. All five reviewed IMO matches
loaded their correct 640-pixel images; valid-unmatched IMO `8917601` and
invalid IMO `8917602` showed no photo; A-to-B-to-A selection never paired a
title with the wrong hull; all assets returned the declared image MIME and
`public, max-age=31536000, immutable`; no Wikimedia, Wikidata, tracker, or
image-provider request occurred; one MapLibre canvas and reachable
Close/source/license/map attribution were preserved at 1280x900, 390x844, and
390x568. The subsequent stable-hover acceptance verified zero image request
before 500 ms, the exact Finlandia 640x472 JPEG and fixed rights context,
preserved keyboard focus, popup pointer/focus traversal, Escape dismissal,
stale-marker cleanup, unmatched omission, one MapLibre canvas, and no external
photo-provider request or browser diagnostic. The public Wiki was synchronized
at `dad38eed654ce6e8cdc121a92deca28547fc531a`.

Current-release aircraft acceptance observed a relay-local
`503 Retry-After: 19` followed by exact-release `200 application/json`,
rendered four real aircraft, retained one MapLibre canvas, and had no
horizontal overflow at 1280x900 or 390x844. Aircraft-photo acceptance made
zero selection and sub-dwell requests, exactly one stable-hover request, and
published the same matching image/source into the already-open details panel
without another request. A 70-second host canary measured 0.2374% combined
relay/cloudflared CPU, approximately 65 MB combined service memory, zero
restarts, zero swap, no OOM evidence, and approximately 460 MB available
memory.

Fresh-profile orbital acceptance observed zero startup catalog requests, one
same-origin request after enable, no CelesTrak browser request, one unchanged
MapLibre canvas, exact A-to-B-to-A selection, selection-preserving theme
rehydration, 156 modeled objects at whole-world view while aircraft and ships
paused, real touch camera movement at 390x844, and no runtime exception or
main-thread task over 50 ms.

The first deployment attempt, run `36265893317`, uploaded Cloudflare version
`a17be7e0-9340-49eb-8689-e8db4b63565c` but its immediate smoke reached an edge
still serving the predecessor Worker release header. The expected release
header appeared shortly afterward, and the exact-source rerun
`36266052761` passed without changing application bytes. #134 tracks the
bounded Worker-header propagation retry.

Protected rollback run `36188474191` restored accepted V1.5.3 source
`6d132907525f4f1479ae2b4f94485d76c151b86a` and Cloudflare version
`5b17eeb9-e6ad-4720-8a8e-c52725b18aba` with matching exact-byte smoke.
Restoration run `36188545228` returned production to the V1.6.0 version and
again passed smoke. Those historical operations predated private-relay
activation and preserved the expected explicit ADSB.lol `429` degradation from
Cloudflare egress instead of treating unavailable aircraft data as release
success. Current private production instead requires eventual real aircraft
JSON. Repository documentation commits may advance after an application
release; the public `X-LiveTrafficStan-Release` header identifies the running
application source.

This is an engineering record, not legal advice. Provider and platform terms,
limits, and behavior can change and must be rechecked before a material
deployment or caching change.

## Evidence method

The platform comparison uses:

- **Documented** facts from official Cloudflare, Netlify, GitHub, ADSB.lol,
  Photon, and Digitraffic material;
- **Observed** bounded local or provider checks;
- **Calculated** request volume from the checked-in 20-second aircraft cadence;
- **Unknown** for future provider capacity and long-term rate behavior of
  Cloudflare's shared outbound identity.

Unknown does not mean permitted or unavailable.

## Application requirements

The smallest complete deployment must preserve:

- one checked Vite build and its hashed MapLibre module worker;
- same-origin browser aircraft requests under `/api/aircraft`;
- same-origin browser weather requests under `/api/weather/metar`;
- one direct plausible-route request for a newly selected eligible aircraft;
- the exact ADSB.lol `/v2/point/{latitude}/{longitude}/{radiusNm}` mapping;
- the 100 km client eligibility decision before outward rounding to 54 NM;
- upstream status, body, `Content-Type`, and `Retry-After`;
- canonical 1-50-station AWC JSON requests with no browser credentials;
- no overlapping or accelerated aircraft request schedule;
- direct browser Digitraffic REST and secure MQTT WebSockets;
- direct browser Photon forward search only after explicit submit;
- visible OpenFreeMap/OpenStreetMap, Photon/OpenStreetMap, ADSB.lol/ODbL,
  AWC/NWS, and Digitraffic/CC BY attribution;
- independent aircraft, marine, and map failure;
- rounded, session-only location behavior without application URL logging.

The hosting platform does not need to proxy WebSockets. The browser continues
to connect directly to `wss://meri.digitraffic.fi:443/mqtt`.

## Platform comparison

| Criterion | Cloudflare Workers + Static Assets | Netlify static site + Function |
| --- | --- | --- |
| Deployment unit | Worker code and static assets form one version and deployment | Site and Function deploy together |
| Same-origin proxy | Selective `/api` Worker boundary in the same unit | Validating Function required; a generic redirect proxy would be too permissive |
| Static asset cost | Documented free and unlimited Static Asset requests | Shared credit budget includes bandwidth and web requests |
| Free dynamic allowance | 100,000 Worker requests/day | 300 credits/month across production deploys, bandwidth, web requests, and compute |
| CPU and subrequests | 10 ms CPU and 50 subrequests/request on Workers Free; upstream wait is not CPU time | Function compute consumes the shared credit budget |
| HTTPS | Default `workers.dev` HTTPS; custom domain optional | Default `netlify.app` HTTPS; custom domain optional |
| Browser marine access | Direct provider HTTPS/WSS; no Worker relay | Direct provider HTTPS/WSS; no Function relay |
| Asset caching | Automatic edge caching plus `_headers` browser policy | CDN asset delivery and configurable headers |
| Rollback | Restore a recent Worker version containing code and assets | Republish a retained atomic deploy |
| GitHub deployment auth | Scoped Cloudflare API token and account ID | Netlify account/site authorization |
| Current operational surface | One platform and two fixed upstream request shapes | One platform, but a shared credit model with no compensating feature needed here |

Official pricing as reviewed:

- Workers Free: 100,000 dynamic requests/day, 10 ms CPU/request, 128 MB
  memory, and 50 subrequests/request.
- Static Asset requests are free and unlimited; the free plan allows 20,000
  files per Worker version and 25 MiB per asset.
- Workers Paid starts at USD 5/month and removes the daily request ceiling,
  with included request/CPU usage and no additional egress charge.
- Netlify Free supplies 300 monthly credits. Its official pricing assigns
  15 credits to a production deploy, 20 credits/GB bandwidth, 2 credits per
  10,000 web requests, and 10 credits/GB-hour compute.

Cloudflare is selected because it provides the required same-origin routes and
static client in one atomic unit while keeping static delivery outside Worker
invocation billing. Netlify remains technically viable but offers no required
advantage for these fixed routes.

GitHub Pages plus a separate Worker was rejected because it creates two
deployment units and either a split origin with CORS or extra domain/routing
configuration. Cloudflare Pages was not selected because Workers Static Assets
already provide the required current platform boundary directly.

## Capacity calculation

One continuously visible, eligible browser has a nominal upper envelope of:

```text
60 seconds / 20 seconds = 3 aircraft requests/minute
3 * 60 * 24 = 4,320 aircraft requests/day
```

At that envelope, the Workers Free allowance corresponds to about 23
continuously active browser sessions:

```text
100,000 / 4,320 = 23.15
```

Page hiding, ineligible views, request duration, cancellation, and provider
backoff reduce actual starts. Invalid public requests, production checks, and
other Workers on the account consume allowance too.

This calculation is a budget estimate, not a concurrency promise, ADSB.lol
capacity grant, service-level agreement, or reason to weaken provider pacing.
METAR has no periodic poller, so its optional enable/station-change/refresh
volume cannot be converted into the same continuous-session envelope without
real usage. Monitor combined route usage before considering the paid plan,
cache, or any rate-control change.

## Production boundary

```text
browser
  |
  +-- /, /assets/*, /aircraft-metadata/*,
  |   /vessel-photos/*, /orbital-data/* ---> Cloudflare Static Assets
  |
  +-- /api/aircraft/v2/point/... --+
  |                                |
  +-- /api/weather/metar?ids=... --+--> Cloudflare Worker
  |                                |
  +-- /api/orbits/catalog ---------+       +--> Workers KV or
                                           |    exact-release bootstrap
                                           |             |
                                           |             +--> aviationweather.gov
                                           |
                                           +--> `worker-proxy`: api.adsb.lol
                                           |
                                           +--> `oci-private-relay`
                                                -> Workers VPC Service
                                                -> Cloudflare Tunnel
                                                -> OCI loopback relay
                                                -> api.adsb.lol

Cloudflare Cron, at most once per two hours
  -> one named SQLite Durable Object
  -> atomic cadence admission and fail-closed outcome state
  -> fixed CelesTrak visual GP JSON
  -> fixed CelesTrak visual SATCAT JSON
  -> validated single-write Workers KV snapshot

browser --------------------------------> OpenFreeMap HTTPS
browser --------------------------------> Photon HTTPS on explicit search
browser --------------------------------> Digitraffic HTTPS + WSS
browser --------------------------------> vrs-standing-data.adsb.lol
                                          on committed live-aircraft selection
browser --------------------------------> api.adsb.lol only in the protected,
                                          provider-approved direct mode
```

`wrangler.jsonc`:

- points Static Assets at `dist/`;
- invokes Worker code first only for `/api` and `/api/*`;
- enables the first hobby deployment on `workers.dev`;
- disables public version preview URLs;
- enables incoming `Request.signal` cancellation so deselection and identity
  changes can abort obsolete upstream work;
- explicitly disables Worker observability so invocation URLs containing
  rounded camera coordinates and weather station IDs are not retained in
  application logs.

There is no SPA fallback because the current application has no client-side
routes. Missing hashed JavaScript, CSS, MQTT, or MapLibre worker assets return
real 404 responses rather than `index.html`.

`public/_headers` applies to Static Asset responses:

- `/assets/*` uses one-year immutable browser caching because Vite fingerprints
  those filenames;
- `/aircraft-metadata/*` uses one-year immutable browser caching because every
  source, schema, generator, or byte change receives a new versioned path;
- `/vessel-photos/*` uses one-year immutable browser caching because every
  identity, source, rights, transformation, or byte change receives a new
  manifest/version path;
- `/orbital-data/*` uses one-year immutable browser caching because the
  normalized bootstrap path is schema/versioned and its digest is checked;
- `/` and `/index.html` revalidate;
- all asset paths use `nosniff`, clickjacking protection, and a conservative
  referrer policy.

Those rules do not apply to Worker responses. The aircraft proxy sets its own
`no-store` and `nosniff` headers; successful METAR responses use
`public, max-age=60`, JSON content type, and `nosniff`. A successful orbital
snapshot response uses `public, max-age=300, must-revalidate`, a stable weak
snapshot-digest ETag, JSON content type, and `nosniff`. The weak validator is
intentional because Cloudflare may change content encoding at the edge; the
digest header and canonical decoded payload still require exact agreement.

## Aircraft proxy contract

The only allowed aircraft route is:

```text
GET /api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}
```

| Input or behavior | Result |
| --- | --- |
| Wrong path or segment count | `404 Not Found` |
| Method other than GET | `405 Method Not Allowed`, `Allow: GET` |
| Query string | `400 Bad Request` |
| Noncanonical, malformed, non-finite, or out-of-range coordinate | `400 Bad Request` |
| Radius outside integer 1-54 NM | `400 Bad Request` |
| Valid request | Fixed `https://api.adsb.lol/v2/point/...` upstream |
| Upstream redirect | `502 Bad Gateway`; never followed or forwarded |
| Upstream network/read failure | `502 Bad Gateway` |
| Total upstream deadline exceeded | `504 Gateway Timeout` |
| Response over 4 MiB counted bytes | `502 Bad Gateway`; never truncated success |
| Browser cancellation | Upstream abort |
| Upstream 2xx/4xx/5xx | Original status and body |
| Upstream throttle | Original `Retry-After`, including HTTP-date or seconds |

The parser splits the encoded path before decoding only the three value
segments. It rejects malformed escapes, encoded separators, encoded dot
segments, signs, exponent or hexadecimal syntax, leading-zero variants, and
other noncanonical forms.

The proxy:

- constructs the destination from a hard-coded ADSB.lol origin;
- forwards no browser cookie, authorization, forwarding, range, or arbitrary
  header;
- sends only `Accept: application/json` and the stable public project
  `User-Agent`;
- sets upstream and downstream cache behavior to `no-store`;
- uses `redirect: manual`;
- keeps a ten-second deadline active while reading the body;
- buffers at most 4 MiB so a timeout or size error is reported before a partial
  response is committed;
- emits no request, coordinate, header, body, or exception log;
- adds `X-LiveTrafficStan-Release` only when deployment supplied a valid
  40-character source SHA.

The 54 NM maximum is intentionally tied to the current 100 km application
contract. A regression test compares the Worker maximum with
`aircraftQueryRadiusNauticalMiles(APP_CONFIG.map.maximumViewportRadiusKm)` so a
future viewport-limit change cannot silently work in Vite while production
rejects it.

## METAR proxy contract

The only weather route is:

```text
GET /api/weather/metar?ids=EETN%2CEFHK
```

| Input or behavior | Result |
| --- | --- |
| Wrong path | `404 Not Found` |
| Method other than GET | `405 Method Not Allowed`, `Allow: GET` |
| Missing, repeated, extra, raw-comma, unsorted, duplicate, lowercase, malformed, or over-50 `ids` | `400 Bad Request` |
| Valid request | Fixed `https://aviationweather.gov/api/data/metar?ids=...&format=json` upstream |
| Upstream redirect | `502 Bad Gateway`; never followed or forwarded |
| HTTP 200 with non-JSON content type | `502 Bad Gateway` |
| Upstream network/read failure | `502 Bad Gateway` |
| Eight-second upstream deadline exceeded | `504 Gateway Timeout` |
| Response over 256 KiB counted bytes | `502 Bad Gateway`; never truncated success |
| Browser cancellation | Upstream abort and `499` when a response is still possible |
| Upstream 200/204 or error | Original status, bounded body policy, and `Retry-After` |

The proxy accepts exactly one canonical `ids` query containing 1-50 sorted
unique uppercase four-letter values. It constructs the hard-coded AWC URL,
forces JSON, uses `redirect: manual`, sends only JSON accept and the public
project User-Agent, and forwards no cookie, authorization, origin, referrer,
forwarding, or arbitrary caller header. It does not log station IDs, raw
observations, URLs, headers, bodies, or exceptions.

Successful responses receive a 60-second public cache header aligned with the
observed AWC guidance. This is browser/edge response guidance, not an
application-owned shared stale-data system or proof of aggregate provider
capacity. Non-success responses are `no-store`; exposed error bodies are
bounded plain text with `nosniff`.

The browser provider adds its own eight-second deadline and 256 KiB cap,
accepts only requested METAR/SPECI stations, and observes one session request
start at least 60 seconds after the previous start. That local pacing cannot
prove public aggregate request/egress safety. Production exact-SHA smoke proves
the deployed boundary, while provider capacity remains an external operational
dependency rather than an application guarantee.

## Scheduled orbital catalog contract

The orbital infrastructure is disabled unless the protected deployment sets:

```text
ORBITAL_CATALOG_ENABLED=true
```

When enabled, the workflow:

1. finds exactly one Workers KV namespace titled
   `livetrafficstan-orbital-catalog`, or creates it once;
2. generates an exact temporary Wrangler configuration with only the
   `ORBITAL_CATALOG` KV binding, one
   `ORBITAL_CATALOG_COORDINATOR` SQLite Durable Object binding, and the offset
   `17 */2 * * *` UTC Cron;
3. dry-runs that exact configuration before deployment;
4. deploys the Worker, allowing Cloudflare to provision the named SQLite
   Durable Object class, and records the KV namespace ID;
5. smokes the catalog route and immutable bootstrap.

The namespace ID is a resource identifier, not a credential. Account ID and API
token remain protected environment secrets. The token must have only the
Worker/KV permissions required by this deployment. A permission failure stops
activation rather than falling back to a browser fetch or another store.

The Cron handler calls `controller.noRetry()` and invokes one named Durable
Object. A synchronous SQLite transaction admits at most one refresh, stores a
fail-closed in-progress gate before any provider request, and rejects duplicate
or early events. Workers KV is intentionally not used as a lock because it has
no compare-and-set contract and is eventually consistent. The coordinator
never accepts browser input. One admitted event may request:

```text
https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json
https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json
```

Both responses must satisfy:

- exact HTTP `200`; other successful 2xx statuses, including `206`, are
  rejected;
- exact `application/json` media type with at most an optional UTF-8 charset;
- ten-second deadline per response;
- at most 256 KiB and 256 records per response;
- valid UTF-8 and strict required fields;
- unique canonical NORAD IDs;
- complete GP-to-SATCAT metadata join;
- normalized output at most 256 KiB.

After both responses validate and normalize, the Durable Object durably
records the next allowed start before one final KV write replaces
`orbital:catalog:v1`. That KV write is the sole publication commit. If
publication fails, the prior snapshot remains and the next ordinary event may
try again. The coordinator stores only schema/source-contract versions,
attempt sequence, cadence, and blocked status. It contains no coordinates,
user data, raw payload, digest, or provider body.

`429` and readable `Retry-After` guidance on `5xx` extend the next-allowed
time. Guidance is bounded to seven days; a longer value enters an
operator-reviewed blocked state rather than creating an unsafe or
non-representable deadline. Redirects, `403`, and `404` also block subsequent
scheduled acquisition until explicit review. Timeout, `5xx` without readable
guidance, malformed data, oversize, invalid fields, or incomplete joins
preserve the prior snapshot and wait for the next normal event. If the
coordinator cannot persist any provider outcome, the initial fail-closed gate
remains at `Number.MAX_SAFE_INTEGER`; the event reports unavailable and no
later Cron can contact CelesTrak until a reviewed coordinator reset. There is
no immediate retry, alternate group, provider fallback, or on-demand browser
fetch.

The public route is exactly:

```text
GET /api/orbits/catalog
```

It rejects queries and other methods. It validates a schema-v1 KV value before
serving; if KV is absent or incompatible it validates and serves the
exact-release `/orbital-data/v1/visual-catalog.json` bootstrap. If neither is
valid it returns `503` with bounded retry guidance. Every response identifies
the release SHA, schema, digest, retrieval time, serve time, and whether KV or
bootstrap supplied the bytes.

The browser route and scheduled updater remain independent. Explicit ORBITS
enable makes one strict same-origin read, then local SGP4 propagation runs in a
dedicated worker. Camera, selection, theme, style, and ordinary hide/show
changes cannot invoke CelesTrak or reset the two-hour schedule. The browser
revalidates with ETag no more often than every two hours and stops using a
snapshot after its 24-hour hard age.

For local rendered acceptance without production credentials:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

This serves the exact-release bootstrap through the real Worker route. It does
not create the production KV namespace, Durable Object, or Cron and must not be
used as a provider probe.

The current source and provider assessment is
[Orbital Data Source Evaluation](orbital-data-source-evaluation.md). Browser
modeling and acceptance are documented in
[Orbital Tracking](orbital-tracking.md).

At twelve scheduled events per day, the coordinator uses approximately twelve
Durable Object requests and a few row reads/writes per day, while successful
refreshes add about twelve KV writes per day. Cloudflare currently includes
SQLite-backed Durable Objects on Workers Free with 100,000 requests, five
million rows read, and 100,000 rows written per day; Workers KV includes
100,000 key reads and 1,000 key writes per day. These are current limits, not a
permanent entitlement. Activation must confirm the account remains on the
free plan and that failed over-limit operations do not trigger paid fallback.

## Bounded implementation observations

On 2026-09-19:

- one direct maximum-radius Tallinn ADSB.lol request returned HTTP 200 and
  4,494 application bytes;
- the first local `workerd` request with its generic default User-Agent returned
  HTTP 403 with an instruction to include valid contact information;
- after the Worker sent
  `LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)`, the same
  local fixed-route path returned HTTP 200;
- a separate local 11 NM response was 978 application bytes;
- local Static Assets served the emitted MapLibre worker with immutable caching
  and `nosniff`;
- a missing hashed asset returned 404;
- malformed proxy coordinates returned 400.

These are bounded compatibility observations, not a body-size maximum,
availability promise, provider quota, coverage measurement, or load test. The
4 MiB limit is a defensive application ceiling.

## Cache and rate-protection decision

Cache fingerprinted application assets and immutable versioned metadata/port
assets, not live aircraft responses.

No Worker Cache API, shared response cache, `stale-while-revalidate`, or
`stale-if-error` is enabled because:

- aircraft data is refreshed on a 20-second live cadence;
- rounded centers still produce many distinct request keys;
- no measured shared hit rate establishes value;
- serving a stale shared success could misrepresent live traffic;
- repeated extraction, retention, and shared caching need a separate ODbL and
  provider-policy decision.

  METAR differs only in preserving the source's observed 60-second cache
  guidance. The application has no periodic weather poller, persistent weather
  cache, stale-if-error success, or cross-user request coordinator. Public
  aggregate station-query volume and cache behavior must be measured after
  authorized deployment rather than inferred from one browser's session gate.

  ## Plausible route contract

  The browser constructs exactly one validated static-data request:

  ```text
  GET https://vrs-standing-data.adsb.lol/routes/{prefix}/{callsign}.json
  Accept: application/json
  ```

  The callsign is normalized before URL construction, and only validated
  uppercase route characters can enter the path. The request omits
  credentials, rejects redirects, bypasses browser cache, has a ten-second
  deadline, and rejects responses above 32 KiB.

  | Input or behavior | Result |
  | --- | --- |
  | Missing or invalid ICAO callsign, ICAO24, or current position | Lookup unavailable in the UI |
  | Static route `404` | No standing route available |
  | Provider `429` | Typed temporary throttling error |
  | Redirect, non-JSON, malformed schema, mismatched callsign, invalid airport, or oversized body | Typed provider error |
  | Fewer than two airports | Incomplete route |
  | Current position outside every accepted segment corridor | Implausible route |
  | Valid exact route and plausible position | Origin and destination displayed as plausible |

  The route may contain multiple airports. The first and last are displayed,
  while every consecutive pair participates in the geographic check. A
  segment accepts the current position only within the larger of 50 NM or
  20 percent of that segment's great-circle distance.

  The client may reuse up to 32 successful validated exact-identity routes
  from memory for six hours. This cache disappears with the tab, never
  contains failures, and is not a Worker Cache API, Durable Object,
  service-worker, Web Storage, IndexedDB, or cross-user cache. Reselecting a
  cached flight makes no provider request; manual **Refresh** deliberately
  does.

The strict ADS-B route, 54 NM ceiling, ten-second deadline, 4 MiB body bound,
no proxy retry, existing client schedule, and Cloudflare daily allowance
reduce accidental load. They are not a global ADS-B abuse-control system.

Plausible routes add no Worker invocation, server-side secret, persistent
quota, shared cache, or cross-user state.

## Local commands

Normal Vite development remains:

```bash
npm run dev
npm run preview
```

Vite's aircraft convenience proxy is broader than the production allowlist.
Its METAR rewrite is fixed to the AWC JSON path, discards unsupported query
parameters, strips browser credentials/forwarding headers, and is still not a
substitute for Worker canonical-input validation. Validate the production
boundary with:

```bash
npm run build
npm run check:deploy
npm run preview:worker
```

- `check:deploy` performs a credential-free Wrangler bundle and Static Assets
  dry run.
- `check:aircraft-metadata` validates the committed version, license, inventory,
  hashes, grammar, counts, and publication-age policy without upstream network
  access before the build is eligible to deploy.
- `check:country-allocations` validates the bundled MID and ICAO24 projection,
  hashes, exclusions, ranges, counts, and representative fixtures without
  upstream network access.
- `check:vessel-photos` validates exact IMO identities, pinned source
  revisions, file-specific rights, the co-located license record, image
  dimensions, byte budgets, hashes, and directory inventory without upstream
  network access.
- `preview:worker` builds the client and runs the actual local `workerd`
  runtime.

Plausible route lookup is enabled by default and uses the same direct static
data path in development and production. To exercise the disabled state:

```bash
VITE_FLIGHT_ROUTE_ENABLED=false npm run dev
```

The normal `validate` check runs lint, strict TypeScript, deterministic tests,
the Vite production build, and the Wrangler dry run. It makes no live provider
request and receives no deployment secret.

## Production environment and credentials

The GitHub `production` environment is restricted to the `main` branch and has
no personal approval gate for CLI-owned deployments. Exact technical checks
remain mandatory.

The protected environment supplies these secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the permanent Cloudflare account |
| `CLOUDFLARE_API_TOKEN` | Least-privilege token allowed to deploy this Worker, provision its SQLite Durable Object binding, and resolve/create its one dedicated orbital KV namespace when that feature is enabled |

Private relay bootstrap additionally requires Cloudflare Tunnel Write,
Connectivity Directory Admin, and Connectivity Directory Bind. The existing
token's effective permissions are verified by the protected bootstrap
workflow; a permission failure is reported rather than worked around.

The token is scoped to the selected account and Worker deployment. The
repository-level duplicate token was removed; deployment credentials remain
only in the protected environment. No value belongs in Git, issue text,
`VITE_*`, client JavaScript, or pull-request workflows.

The orbital namespace resolver uses the exact reserved title and fails if more
than one namespace matches. It never deletes or renames a namespace, lists or
mutates KV values, or adopts another titled resource. If the current token
lacks Workers KV Storage permission, activation stops and reports the
technical blocker.

There is deliberately no local production-deploy package script. Permanent
deployments must use the serialized checked workflow so exact-SHA, current-main,
environment, smoke, and rollback evidence stay attached to one operation.

Cloudflare documents an unauthenticated temporary-account path for agents, but
it requires user acceptance of Cloudflare's Terms of Service and Privacy
Policy, must be claimed, and is not the permanent production/CI account model.
LiveTrafficStan does not use that workaround.

## Private aircraft transport bootstrap

`.github/workflows/bootstrap-aircraft-relay.yml` creates or verifies exactly
one remote-managed Tunnel and one HTTP VPC Service fixed to
`127.0.0.1:8788`. It is serialized, runs only from exact current `main`, uses
the protected `production` environment, and fails if a same-named resource has
different configuration.

The workflow never publishes the Tunnel token. A caller supplies an ephemeral
RSA public key; the workflow encrypts the token with RSA-OAEP/SHA-256 and
uploads only ciphertext in a one-day artifact. The private key and decrypted
token remain outside GitHub. The repository-owned cloudflared installer reads
the token from standard input and stores it in a root-created `0400` file owned
by the dedicated tunnel user. Full key preparation, installation, canary,
failure interpretation, and cleanup are documented in
[OCI Aircraft Relay](oci-aircraft-relay.md).

## Exact-SHA deployment

`.github/workflows/deploy-production.yml` is manually dispatched only after the
source is present on the default `main` branch:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=oci-private-relay \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true \
  -f orbital_catalog_enabled=true
```

The workflow:

1. requires its workflow ref to be `main`;
2. validates the SHA format without evaluating it as shell code;
3. checks out exactly that SHA;
4. fetches `origin/main` and requires exact equality;
5. fails closed if either Cloudflare credential is absent and, for private
   relay mode, if the protected relay authentication secret is absent or too
   short;
6. validates the committed orbital bootstrap without network access;
7. builds the browser with the fixed aircraft-delivery choice plus the
   requested aircraft-photo and plausible-route flags;
8. reruns install, lint, type-check, all tests, build, and the normal
   credential-free Wrangler dry run;
9. when orbital acquisition is enabled, resolves or creates exactly one
   reserved KV namespace;
10. generates and dry-runs the exact Wrangler configuration with either one KV
    binding, one SQLite Durable Object coordinator, and one Cron, or none of
    those orbital resources;
11. re-fetches and rechecks current `main` immediately before deployment;
12. serializes production operations without canceling an in-progress deploy;
13. updates the private Worker secret only when
    `aircraft_delivery=oci-private-relay`;
14. deploys Worker code, exact VPC/KV/Durable Object bindings, trigger state,
    delivery mode, and Static Assets;
15. passes the source SHA as `RELEASE_SHA`;
16. runs the bounded production smoke;
17. records the URL, SHA, aircraft-delivery mode, orbital state/KV namespace,
    route-enabled state, and result in the workflow summary and GitHub
    deployment.

Aircraft delivery is an explicit per-deployment choice:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=worker-proxy \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true
```

`worker-proxy` is the rollback/diagnostic mode that uses shared Cloudflare
egress. `oci-private-relay` keeps the same browser URL and uses the exact
checked VPC Service ID in `wrangler.jsonc`. It requires
`AIRCRAFT_RELAY_AUTH_TOKEN` only in the protected `production` environment;
the workflow installs it as a Worker secret and never exposes it through a
`VITE_*` value, repository variable, command argument, or log. The Worker adds
that bearer credential only to its newly constructed relay request. Browser
cookies, authorization, forwarding headers, and client IP are not copied.
Missing private configuration returns local `503 Retry-After` and cannot fall
back to shared egress.

`adsb-lol-direct` sets the fixed browser endpoint to
`https://api.adsb.lol`; it does not accept a caller-supplied URL. Do not
dispatch direct mode until the provider has approved it and a bounded check
proves that successful and throttled responses permit the production origin.
If the direct CORS smoke fails after deployment, restore the recorded prior
Cloudflare version or redeploy the accepted SHA with `worker-proxy`; do not add
a public relay.

Aircraft-photo activation is an explicit per-deployment choice:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=worker-proxy \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true
```

This flag contains no credential and changes only the browser bundle. Use
`true` only after reviewing the current Planespotters terms and with a bounded
exact-origin browser check ready for the deployed URL. The published
low-volume browser path requires no API key, email, membership account, or
prior provider contact. The photo surface must remain public and free. If the
check cannot read the API response or render the direct
thumbnail/link/credit contract, immediately redeploy the same accepted SHA
with `aircraft_photo_enabled=false`; do not add a proxy or rewrite provider
URLs.

If a newer pull request reaches `main` while an older manual deployment is
validating, the second equality check fails rather than silently promoting the
older SHA.

## Automated production smoke

`scripts/smoke-production.mjs` verifies:

- HTTPS;
- deployed `index.html` bytes equal the validated local build;
- the dynamically discovered `maplibre-gl-worker-*.js` bytes equal the
  validated local build;
- Static Asset security headers;
- the immutable Natural Earth port asset path and caching policy;
- every reviewed immutable vessel-photo byte set, media type, and caching
  policy;
- when enabled, the immutable normalized orbital bootstrap bytes and caching
  policy;
- in `worker-proxy` mode, one same-origin ADSB point request that either
  returns valid aircraft JSON or truthfully preserves an upstream `429` with
  the exact release and `no-store` headers;
- in `oci-private-relay` mode, one successful same-origin aircraft payload
  through the bound private path; a numeric local `503 Retry-After` may delay
  the check at most three times, while `429`, authentication failure, VPC
  failure, malformed data, or any other status fails activation;
- in `adsb-lol-direct` mode, one browser-origin ADSB point request that returns
  valid aircraft JSON or an explicit `429` and permits the deployed origin
  through CORS;
- one bounded canonical same-origin AWC METAR request or valid 204;
- disabled orbital deployments return `404` from the fixed route; enabled
  deployments return one bounded validated schema-v1 catalog from KV or the
  exact-release bootstrap, with matching digest/ETag/source/retrieval headers,
  reject queries and non-GET methods, and make no upstream provider request;
- the exact `X-LiveTrafficStan-Release` value;
- `no-store` aircraft behavior;
- malformed-coordinate and unsupported-path rejection;
- malformed METAR query and unsupported-method rejection;
- Digitraffic REST preflight and a bounded REST response;
- one Digitraffic MQTT connection, subscription, JSON message, and explicit
  disconnect.

The production smoke does not make a plausible-route or CelesTrak request on
every deploy. The orbital route is storage/bootstrap-only; the first live
CelesTrak refresh is a separately observed Cron event. The exact bundle and
CSP are checked deterministically; browser acceptance selects one known live
callsign when route behavior itself changes. This avoids turning deployment
smoke into recurring third-party traffic.

Static Asset checks use a bounded 60-second retry schedule because a newly
published Cloudflare version can report deployment success before every edge
serves every immutable asset. This bound covers the more-than-15-second Static
Asset switch observed during the V1.5.3 rollback proof without weakening
exact-byte validation. The locally rejected Worker release-header probe cannot
reach an upstream provider, but it is currently single-attempt; #134 tracks
giving only an otherwise accepted known-predecessor header the same bounded
propagation policy. After its release header matches, the smoke makes exactly one live
aircraft-provider request through the selected delivery path. In
`worker-proxy`, an ADSB.lol `429` is recorded as provider throttling rather
than a release regression. Direct mode additionally requires that response to
be browser-readable. In `oci-private-relay`, bounded local `503` guidance may
delay the probe, but provider `429` and any failure to reach an eventual valid
`200` fail activation.

The MQTT check has a 15-second outer deadline, disables reconnect, and force
closes the client. The script never prints provider payloads, METAR reports,
MMSIs, browser coordinates beyond the documented fixed Tallinn fixture,
station IDs beyond the documented EETN fixture, or a secret.

An HTTP/Node smoke is not browser acceptance. V1.5.3 recorded a real browser
check of:

- rendered vector tiles and actual MapLibre worker execution;
- one MapLibre instance through Auto/Light/Dark changes;
- same-origin aircraft data;
- optional same-origin METAR data, source age, attribution, and failure
  isolation;
- one explicit Photon search with current browser CORS, bounded results,
  privacy disclosure, and visible Photon/OpenStreetMap attribution;
- direct Digitraffic REST preflight and secure WebSocket
  CONNACK/SUBACK/messages;
- aircraft/marine failure isolation;
- visible attribution;
- desktop and narrow mobile layouts.

V1.6.0 additionally recorded a rendered browser check of the changed
plausible-route behavior before release: selecting `FIN949` made no route
request, **Find plausible route** made exactly one fixed-origin standing-data
request, the UI rendered HEL to TRD as **Plausible** with the non-authoritative
disclaimer and both attributions, and explicit refresh made one additional
request. The vessel-photo release then added the exact production acceptance
recorded above. Final exact-byte deployment smoke proved the accepted
application artifact and release identity. Private-relay source
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` completed #11 with exact-byte
deployment smoke, eventual real aircraft JSON, rendered desktop/mobile
acceptance, and the measured E2 Micro canary. A truthful shared-egress `429`
remains accepted only in `worker-proxy` rollback/diagnostic mode and is not
proof of reliable aircraft delivery. No browser-automation framework is added
solely for this Issue.

Automatic-route source `3370dfe3f1cc2614feff894643ed865978ec7edc`
then passed exact-main validation `36299844911` and deployment/smoke
`36299895010`, publishing Cloudflare version
`0cbc0b5d-2e7b-49f0-b649-a2d22ac3a83c`. Production selection of live
`BTI877` made exactly one standing-route request and rendered TLL to BCN; a
later aircraft polling refresh made no second route request. Live `FIN7DE`
rendered HEL to TLL. Desktop and 390x844 retained one MapLibre canvas, zero
horizontal overflow, the compact caveat, and both route attributions.

## Monitoring

Use Cloudflare's aggregate Worker analytics and the application UI to monitor:

- dynamic request count and free-allowance headroom;
- response status, especially provider 403/429/5xx versus local 502/504;
- direct plausible-route availability and provider throttling shown in the UI;
- CPU/resource failures;
- missing static assets;
- last successful deployment SHA and version.

Do not equate a successful Worker invocation with HTTP success. A Worker can
correctly execute while returning an upstream 429 or local 504.

Persistent invocation URL logs, Logpush, tracing, and custom request logs remain
disabled because URLs contain rounded camera coordinates or visible weather
station IDs. Cloudflare still processes ordinary request/network metadata as the hosting provider; this
configuration minimizes application-retained location data rather than
claiming the platform observes none.

No additional analytics service, log-export pipeline, synthetic provider poll,
or continuous health service is added.

## Rollback

Cloudflare versions contain Worker code, configuration, and Static Assets.
Plausible routes add no separately persisted server resource. Vessel reference
photos are part of the same exact Static Asset version and add no provider,
database, Worker route, or deployment credential. The orbital KV namespace is
retained across versions, as is the dormant Durable Object namespace; each
Worker accepts only its supported schema and can fall back to its exact-release
bootstrap.

For an initial deployment:

- record the exact source SHA and first known-good version ID;
- record the previous version as `none - bootstrap`;
- a same-platform prior-version rollback cannot yet be demonstrated.

After a subsequent version exists:

1. record the prior known-good version before promotion;
2. dispatch `.github/workflows/rollback-production.yml` from `main` with the
   exact current `main` SHA, target source SHA, recorded Cloudflare version ID,
   public origin, artifact kind, aircraft-delivery mode, whether that target
   build explicitly set `VITE_AIRCRAFT_ENDPOINT`, and the target version's two
   existing browser feature flags;
3. rerun the same automated smoke and browser checks;
4. keep production operations serialized;
5. record the restored version and evidence.

The rollback workflow shares the `production-deployment` concurrency group and
protected `production` environment with the deployment workflow. It rejects a
stale current-main SHA, a target source commit that is not an ancestor of the
current `main`, malformed version IDs or URLs, and missing Cloudflare
credentials. It checks out and builds the exact target source, restores the
current smoke policy so current provider-throttling semantics are applied
consistently, reads the target Cloudflare version metadata, and derives its
orbital flag from the version's exact plain-text binding. An enabled target
must also contain exactly one orbital KV and one Durable Object binding. For an orbital-enabled target, the workflow then calls
`wrangler rollback <version-id>`. For a disabled or pre-orbital target after
the coordinator namespace has been provisioned, Cloudflare cannot activate the
old version directly because that would orphan the SQLite Durable Object
class. The workflow instead rebuilds the exact target source and assets behind
an unreachable compatibility export: the coordinator class remains declared
without a binding or Cron, preserving its namespace while target runtime
behavior stays disabled. Both paths require the same production smoke with the
target release SHA. The workflow never trusts a separately remembered orbital
checkbox. Restoring the latest known-good version uses the same workflow as a
second serialized operation; production must never be left on the older
version merely to preserve rollback evidence.

Cron triggers are deployment-level state rather than safely assumed to follow
a version rollback. After `wrangler rollback`, the workflow explicitly applies
one of two checked trigger configs:

- orbital target enabled: restore `17 */2 * * *`;
- orbital target disabled or pre-orbital: remove all Cron triggers.

This prevents a pre-orbital Worker from retaining a scheduled invocation that
it cannot handle and prevents an enabled target from being restored with its
scheduler accidentally disabled. The KV and Durable Object namespaces are
never deleted during rollback.

The orbital activation completed this proof in production:

- run `36488117751` rebuilt pre-orbital source
  `3370dfe3f1cc2614feff894643ed865978ec7edc` behind an unreachable live
  coordinator export, published compatibility version
  `1cb4a5e2-2f62-4d48-8b6f-9089dbb03e3c`, removed all Cron triggers,
  returned `404` from `/api/orbits/catalog`, and passed target smoke;
- run `36488245592` restored exact current source
  `46cb2007bc0cc27d1905fab32db6149a91d17576`, version
  `0138d581-2162-491a-bcb5-619a97cf31fb`, the retained KV/coordinator
  namespaces, Cron `17 */2 * * *`, catalog route, and full production smoke.

Build-time environment presence is part of the recorded artifact identity.
Versions deployed before the selectable aircraft-delivery mode did not set
`VITE_AIRCRAFT_ENDPOINT`; their rollback input must therefore set
`aircraft_endpoint_explicit=false` while retaining
`aircraft_delivery=worker-proxy` for live smoke. Later versions set the
endpoint explicitly and use `aircraft_endpoint_explicit=true`. The workflow
rejects an implicit direct-provider target.

Cloudflare supports rollback among the 100 most recent versions. Older recovery
uses the exact repository SHA and locked dependency/build inputs. The target
version's recorded plausible-route flag is rebuilt explicitly, but no route
database, secret, or quota namespace needs restoration.

Versioned aircraft-metadata, vessel-photo, and port files already retained in
browser or edge immutable caches do not need destructive invalidation. A
forward update or rollback points application code at the corresponding
immutable version path; unreferenced old files are inert.

## Re-evaluation conditions

Revisit the platform or proxy design only when evidence shows:

- sustained traffic exceeds the selected Cloudflare budget;
- Cloudflare egress cannot reliably reach ADSB.lol;
- ADSB.lol changes CORS, authentication, licensing, fields, or access terms;
- measured abuse requires a supported edge rate-control policy;
- a custom domain becomes a concrete product requirement;
- Workers KV, SQLite Durable Object, or Cron pricing, limits, consistency, or
  trigger behavior no longer fits the bounded orbital snapshot contract;
- CelesTrak blocks Cloudflare egress or changes the selected endpoint, cadence,
  schema, or caching/public-display basis;
- a different provider removes the proxy while remaining legally and
  operationally compatible;
- a new client route genuinely needs SPA fallback.

Do not add a general backend, shared live cache, alternate provider, proxy
selector, database, or marine relay in anticipation of those conditions.

## Official sources

Cloudflare:

- [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Static Asset configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Static Asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static Asset billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [`workers.dev`](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Temporary account claims](https://developers.cloudflare.com/workers/platform/claim-deployments/)

Alternative and repository workflow:

- [Netlify pricing](https://www.netlify.com/pricing/)
- [Netlify Vite support](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Provider context:

- [ADSB.lol API](https://www.adsb.lol/docs/open-data/api/)
- [ADSB.lol API source](https://github.com/adsblol/api)
- [VRS Standing Data](https://github.com/vradarserver/standing-data)
- [CelesTrak GP data formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [CelesTrak usage policy](https://celestrak.org/usage-policy.php)
- [CelesTrak SATCAT format](https://celestrak.org/satcat/satcat-format.php)
- [Photon public endpoint terms](https://photon.komoot.io/)
- [Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [Digitraffic marine traffic](https://www.digitraffic.fi/en/marine-traffic/)
- [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/)
