# Hosting and Deployment

## Decision and current status

Decision date: **2026-09-19**

LiveTrafficStan selects **Cloudflare Workers with Static Assets** as its
production platform:

- Vite's `dist/` output is served as immutable static assets;
- one stateless Worker handles only the same-origin ADSB.lol point route;
- OpenFreeMap, Photon, and Digitraffic REST/MQTT remain direct browser
  connections;
- no database, queue, persistent server state, authentication service, or
  general backend is added.

The repository is deploy-ready but does not yet claim a public production
deployment. Permanent Cloudflare account selection and credentials are tracked
by [Issue #39](https://github.com/vasilyevstan/LiveTrafficStan/issues/39).
Everything that does not require those credentials is implemented and
testable locally.

This is an engineering record, not legal advice. Provider and platform terms,
limits, and behavior can change and must be rechecked before a material
deployment or caching change.

## Evidence method

The platform comparison uses:

- **Documented** facts from official Cloudflare, Netlify, GitHub, ADSB.lol,
  Photon, and Digitraffic material;
- **Observed** bounded local or provider checks;
- **Calculated** request volume from the checked-in 20-second aircraft cadence;
- **Unknown** for account-specific entitlement, production egress behavior, and
  unverified provider capacity.

Unknown does not mean permitted or unavailable.

## Application requirements

The smallest complete deployment must preserve:

- one checked Vite build and its hashed MapLibre module worker;
- same-origin browser aircraft requests under `/api/aircraft`;
- the exact ADSB.lol `/v2/point/{latitude}/{longitude}/{radiusNm}` mapping;
- the 100 km client eligibility decision before outward rounding to 54 NM;
- upstream status, body, `Content-Type`, and `Retry-After`;
- no overlapping or accelerated aircraft request schedule;
- direct browser Digitraffic REST and secure MQTT WebSockets;
- direct browser Photon forward search only after explicit submit;
- visible OpenFreeMap/OpenStreetMap, Photon/OpenStreetMap, ADSB.lol/ODbL, and
  Digitraffic/CC BY attribution;
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
| Current operational surface | One platform and one fixed upstream subrequest | One platform, but a shared credit model with no compensating feature needed here |

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

Cloudflare is selected because it provides the required same-origin route and
static client in one atomic unit while keeping static delivery outside Worker
invocation billing. Netlify remains technically viable but offers no required
advantage for this one fixed route.

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
Monitor real usage before considering the paid plan or any rate-control change.

## Production boundary

```text
browser
  |
  +-- /, /assets/*, /aircraft-metadata/* -> Cloudflare Static Assets
  |
  +-- /api/aircraft/v2/point/... ------> Cloudflare Worker
                                               |
                                               +--> https://api.adsb.lol

browser --------------------------------> OpenFreeMap HTTPS
browser --------------------------------> Photon HTTPS on explicit search
browser --------------------------------> Digitraffic HTTPS + WSS
```

`wrangler.jsonc`:

- points Static Assets at `dist/`;
- invokes Worker code first only for `/api` and `/api/*`;
- enables the first hobby deployment on `workers.dev`;
- disables public version preview URLs;
- explicitly disables Worker observability so invocation URLs containing
  rounded camera coordinates are not retained in application logs.

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
`no-store` and `nosniff` headers.

## Aircraft proxy contract

The only allowed dynamic route is:

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

The strict route, 54 NM ceiling, ten-second deadline, 4 MiB body bound, no
proxy retry, existing client schedule, and Cloudflare daily allowance reduce
accidental load. They are not a global abuse-control system. Do not add an
isolate-local counter, database, Durable Object, or arbitrary IP threshold
without measured abuse and provider guidance.

## Local commands

Normal Vite development remains:

```bash
npm run dev
npm run preview
```

Vite's convenience proxy preserves the valid route mapping but is broader than
the production allowlist. Validate the production boundary with:

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
- `preview:worker` builds the client and runs the actual local `workerd`
  runtime.

The normal `validate` check runs lint, strict TypeScript, deterministic tests,
the Vite production build, and the Wrangler dry run. It makes no live provider
request and receives no deployment secret.

## Production environment and credentials

The GitHub `production` environment is restricted to the `main` branch and has
no personal approval gate for CLI-owned deployments. Exact technical checks
remain mandatory.

Issue #39 must supply these environment secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the permanent Cloudflare account |
| `CLOUDFLARE_API_TOKEN` | Least-privilege token allowed to deploy this Worker |

The token should be scoped to the selected account and the Worker-edit
permission required by Wrangler. Neither value belongs in Git, issue text,
`VITE_*`, client JavaScript, or pull-request workflows.

There is deliberately no local production-deploy package script. Permanent
deployments must use the serialized checked workflow so exact-SHA, current-main,
environment, smoke, and rollback evidence stay attached to one operation.

Cloudflare documents an unauthenticated temporary-account path for agents, but
it requires user acceptance of Cloudflare's Terms of Service and Privacy
Policy, must be claimed, and is not the permanent production/CI account model.
LiveTrafficStan does not use that workaround.

## Exact-SHA deployment

`.github/workflows/deploy-production.yml` is manually dispatched only after the
source is present on the default `main` branch:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha>
```

The workflow:

1. requires its workflow ref to be `main`;
2. validates the SHA format without evaluating it as shell code;
3. checks out exactly that SHA;
4. fetches `origin/main` and requires exact equality;
5. fails closed if either Cloudflare environment secret is absent;
6. reruns install, lint, type-check, all tests, build, and Wrangler dry run;
7. re-fetches and rechecks current `main` immediately before deployment;
8. serializes production operations without canceling an in-progress deploy;
9. deploys Worker code and Static Assets atomically;
10. passes the source SHA as `RELEASE_SHA`;
11. runs the bounded production smoke;
12. records the URL, SHA, and result in the workflow summary and GitHub
    deployment.

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
- one successful same-origin ADSB point request;
- the exact `X-LiveTrafficStan-Release` value;
- `no-store` aircraft behavior;
- malformed-coordinate and unsupported-path rejection;
- Digitraffic REST preflight and a bounded REST response;
- one Digitraffic MQTT connection, subscription, JSON message, and explicit
  disconnect.

The MQTT check has a 15-second outer deadline, disables reconnect, and force
closes the client. The script never prints provider payloads, MMSIs, browser
coordinates beyond the documented fixed Tallinn fixture, or a secret.

An HTTP/Node smoke is not browser acceptance. Before Issue #11 closes, record a
real browser check of:

- rendered vector tiles and actual MapLibre worker execution;
- one MapLibre instance through Light/Dark changes;
- same-origin aircraft data;
- one explicit Photon search with current browser CORS, bounded results,
  privacy disclosure, and visible Photon/OpenStreetMap attribution;
- direct Digitraffic REST preflight and secure WebSocket
  CONNACK/SUBACK/messages;
- aircraft/marine failure isolation;
- visible attribution;
- desktop and narrow mobile layouts.

No browser-automation framework is added solely for this Issue.

## Monitoring

Use Cloudflare's aggregate Worker analytics and the application UI to monitor:

- dynamic request count and free-allowance headroom;
- response status, especially provider 403/429/5xx versus local 502/504;
- CPU/resource failures;
- missing static assets;
- last successful deployment SHA and version.

Do not equate a successful Worker invocation with HTTP success. A Worker can
correctly execute while returning an upstream 429 or local 504.

Persistent invocation URL logs, Logpush, tracing, and custom request logs remain
disabled because URLs contain rounded camera coordinates. Cloudflare still
processes ordinary request/network metadata as the hosting provider; this
configuration minimizes application-retained location data rather than
claiming the platform observes none.

No additional analytics service, log-export pipeline, synthetic provider poll,
or continuous health service is added.

## Rollback

Cloudflare versions contain Worker code, configuration, and Static Assets.

For the first deployment:

- record the exact source SHA and first known-good version ID;
- record the previous version as `none - bootstrap`;
- a same-platform prior-version rollback cannot yet be demonstrated.

After a subsequent version exists:

1. record the prior known-good version before promotion;
2. if smoke or browser acceptance fails, use `wrangler rollback <version-id>` or
   the Cloudflare deployment dashboard;
3. rerun the same automated smoke and browser checks;
4. keep production operations serialized;
5. record the restored version and evidence.

Cloudflare supports rollback among the 100 most recent versions. Older recovery
uses the exact repository SHA and locked dependency/build inputs. This design
has no database or storage migration to reverse.

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
- [Photon public endpoint terms](https://photon.komoot.io/)
- [Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [Digitraffic marine traffic](https://www.digitraffic.fi/en/marine-traffic/)
- [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/)
