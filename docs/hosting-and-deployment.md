# Hosting and Deployment

## Decision and current status

Decision date: **2026-09-19**

LiveTrafficStan selects **Cloudflare Workers with Static Assets** as its
production platform:

- Vite's `dist/` output is served as immutable static assets;
- one Worker handles the same-origin ADSB.lol point and AWC METAR paths;
- plausible route lookup calls ADSB.lol standing data directly from the
  browser after an explicit selected-aircraft action;
- OpenFreeMap, Photon, and Digitraffic REST/MQTT remain direct browser
  connections;
- no route secret, quota store, result database, queue, authentication
  service, or general backend is added.

The accepted recovery design keeps that public Cloudflare boundary and routes
only aircraft through a private Workers VPC Service and Tunnel to an isolated
OCI E2 Micro relay. The relay is running and provider/cadence behavior is
proven; the Tunnel, VPC binding, and public Worker integration are not active
until their compatible exact releases pass production acceptance. See
[OCI Aircraft Relay](oci-aircraft-relay.md).

`wrangler.jsonc` temporarily retains a declarative deleted-state tombstone for
the former `FlightRouteQuota` class so Cloudflare can retire the already
provisioned namespace and its obsolete attempt-counter data. It is not a
runtime export or binding and can be removed only after Cloudflare reports the
tombstone as stale.

Public production is live at
<https://livetrafficstan.syntal.workers.dev> on Cloudflare Workers Free with
Static Assets. The protected `production` environment contains the deployment
credentials, observability remains disabled, and no paid add-on, KV, or R2
service is used.

The accepted V1.6.0 application source is
`05bb39a0620f8ef2304c8bc96d1988ecded5325d`. Exact-main validation run
`36188141347` passed, and deployment run `36188232329` published Cloudflare
version `8fc9005c-b47a-4bcb-98bd-2c3b6e9cc9ad` with aircraft delivery through
`worker-proxy`, aircraft photos enabled, and plausible routes enabled. The
validated and deployed `index.html` SHA-256 is
`e82b17dbd95a2b5c30cc705f8197c73307ba857a2af63c08eec5dde4514ebac9`.

Protected rollback run `36188474191` restored accepted V1.5.3 source
`6d132907525f4f1479ae2b4f94485d76c151b86a` and Cloudflare version
`5b17eeb9-e6ad-4720-8a8e-c52725b18aba` with matching exact-byte smoke.
Restoration run `36188545228` returned production to the V1.6.0 version and
again passed smoke. Both operations preserved the expected explicit ADSB.lol
`429` degradation from Cloudflare egress instead of treating unavailable
aircraft data as release success. Repository documentation commits may advance
after that application release; the public `X-LiveTrafficStan-Release` header
identifies the running application source.

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
- one explicit direct plausible-route request for a selected aircraft;
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
  +-- /, /assets/*, /aircraft-metadata/* -> Cloudflare Static Assets
  |
  +-- /api/aircraft/v2/point/... --+  current `worker-proxy` mode
  |                                |
  +-- /api/weather/metar?ids=... --+--> Cloudflare Worker
                                           |             |
                                           +------------> aviationweather.gov
                                           +------------> api.adsb.lol

browser --------------------------------> OpenFreeMap HTTPS
browser --------------------------------> Photon HTTPS on explicit search
browser --------------------------------> Digitraffic HTTPS + WSS
browser --------------------------------> vrs-standing-data.adsb.lol
                                          on explicit plausible-route lookup
browser --------------------------------> api.adsb.lol only in the protected,
                                          provider-approved direct mode

planned private aircraft transport:

Cloudflare Worker -> Workers VPC Service -> Cloudflare Tunnel
                  -> OCI loopback relay -> api.adsb.lol
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
- `/` and `/index.html` revalidate;
- all asset paths use `nosniff`, clickjacking protection, and a conservative
  referrer policy.

Those rules do not apply to Worker responses. The aircraft proxy sets its own
`no-store` and `nosniff` headers; successful METAR responses use
`public, max-age=60`, JSON content type, and `nosniff`.

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
  cached flight makes no provider request; **Refresh plausible route**
  deliberately does.

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
| `CLOUDFLARE_API_TOKEN` | Least-privilege token allowed to deploy this Worker |

Private relay bootstrap additionally requires Cloudflare Tunnel Write,
Connectivity Directory Admin, and Connectivity Directory Bind. The existing
token's effective permissions are verified by the protected bootstrap
workflow; a permission failure is reported rather than worked around.

The token is scoped to the selected account and Worker deployment. The
repository-level duplicate token was removed; deployment credentials remain
only in the protected environment. No value belongs in Git, issue text,
`VITE_*`, client JavaScript, or pull-request workflows.

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
  -f aircraft_delivery=worker-proxy \
  -f aircraft_photo_enabled=false \
  -f flight_route_enabled=true
```

The workflow:

1. requires its workflow ref to be `main`;
2. validates the SHA format without evaluating it as shell code;
3. checks out exactly that SHA;
4. fetches `origin/main` and requires exact equality;
5. fails closed if either Cloudflare environment secret is absent;
6. builds the browser with the fixed aircraft-delivery choice plus the
   requested aircraft-photo and plausible-route flags;
7. reruns install, lint, type-check, all tests, build, and Wrangler dry run;
8. re-fetches and rechecks current `main` immediately before deployment;
9. serializes production operations without canceling an in-progress deploy;
10. deploys Worker code and Static Assets atomically;
11. passes the source SHA as `RELEASE_SHA`;
12. runs the bounded production smoke;
13. records the URL, SHA, aircraft-delivery mode, route-enabled state, and
    result in the workflow summary and GitHub
    deployment.

Aircraft delivery is an explicit per-deployment choice:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=adsb-lol-direct \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true
```

`worker-proxy` is the default and current production mode.
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
- in `worker-proxy` mode, one same-origin ADSB point request that either
  returns valid aircraft JSON or truthfully preserves an upstream `429` with
  the exact release and `no-store` headers;
- in `adsb-lol-direct` mode, one browser-origin ADSB point request that returns
  valid aircraft JSON or an explicit `429` and permits the deployed origin
  through CORS;
- one bounded canonical same-origin AWC METAR request or valid 204;
- the exact `X-LiveTrafficStan-Release` value;
- `no-store` aircraft behavior;
- malformed-coordinate and unsupported-path rejection;
- malformed METAR query and unsupported-method rejection;
- Digitraffic REST preflight and a bounded REST response;
- one Digitraffic MQTT connection, subscription, JSON message, and explicit
  disconnect.

The production smoke does not make a plausible-route request on every deploy.
The exact bundle and CSP are checked deterministically; browser acceptance uses
one explicit known live callsign when route behavior itself changes. This
avoids turning deployment smoke into recurring third-party route traffic.

Static Asset checks and a locally rejected Worker request use a bounded
60-second retry schedule because a newly published Cloudflare version can
report deployment success before every edge serves every immutable asset or
the new Worker release. This bound covers the more-than-15-second Static Asset
switch observed during the V1.5.3 rollback proof without weakening exact-byte
validation. The local Worker probe cannot reach an upstream provider. After
its release header matches, the smoke makes exactly one live aircraft-provider
request through the selected delivery path. An ADSB.lol `429` is recorded as
provider throttling rather than a release regression; direct mode additionally
requires that throttling response to be browser-readable. Other non-`200`
statuses still fail the deployment check.

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
request. Final exact-byte deployment, rollback, and restoration smoke then
proved the accepted production artifact and release identity. Issue #11
remains open only for reliable ADSB.lol access from Cloudflare's shared
outbound identity; a truthful `429`/partial state is accepted degradation, not
proof of reliability. No browser-automation framework is added solely for
this Issue.

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
Plausible routes add no separately persisted server resource.

For the first deployment:

- record the exact source SHA and first known-good version ID;
- record the previous version as `none - bootstrap`;
- a same-platform prior-version rollback cannot yet be demonstrated.

After a subsequent version exists:

1. record the prior known-good version before promotion;
2. dispatch `.github/workflows/rollback-production.yml` from `main` with the
   exact current `main` SHA, target source SHA, recorded Cloudflare version ID,
   public origin, artifact kind, aircraft-delivery mode, whether that target
   build explicitly set `VITE_AIRCRAFT_ENDPOINT`, and the target version's two
   feature flags;
3. rerun the same automated smoke and browser checks;
4. keep production operations serialized;
5. record the restored version and evidence.

The rollback workflow shares the `production-deployment` concurrency group and
protected `production` environment with the deployment workflow. It rejects a
stale current-main SHA, a target source commit that is not an ancestor of the
current `main`, malformed version IDs or URLs, and missing Cloudflare
credentials. It checks out and builds the exact target source, restores the
current smoke policy so current provider-throttling semantics are applied
consistently, calls `wrangler rollback <version-id>`, and requires the same
production smoke to pass with the target release SHA. Restoring the latest
known-good version uses the same workflow as a second serialized operation;
production must never be left on the older version merely to preserve rollback
evidence.

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

Versioned aircraft-metadata and port files already retained in browser or edge
immutable caches do not need destructive invalidation. A forward update or
rollback points application code at the corresponding immutable version path;
unreferenced old files are inert.

## Re-evaluation conditions

Revisit the platform or proxy design only when evidence shows:

- sustained traffic exceeds the selected Cloudflare budget;
- Cloudflare egress cannot reliably reach ADSB.lol;
- ADSB.lol changes CORS, authentication, licensing, fields, or access terms;
- measured abuse requires a supported edge rate-control policy;
- a custom domain becomes a concrete product requirement;
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
- [Photon public endpoint terms](https://photon.komoot.io/)
- [Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [Digitraffic marine traffic](https://www.digitraffic.fi/en/marine-traffic/)
- [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/)
