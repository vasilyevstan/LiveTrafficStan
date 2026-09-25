# Aircraft Provider Evaluation

## Decision

Evaluation date: **2026-09-19**

Cloud-delivery re-evaluation: **2026-09-24**

LiveTrafficStan will retain **ADSB.lol as its only active aircraft provider**.
It remains the smallest compatible option for the current no-credential,
bounded point-query architecture:

- the public point/radius API matches the existing provider contract;
- the current response supplies the normalized fields used by the application;
- public ADSB.lol data is offered under ODbL 1.0;
- no current API credential is required;
- the existing same-origin proxy isolates the lack of browser CORS.

Current production remains on that checked Worker proxy. Source also contains
a protected `adsb-lol-direct` build mode so the browser can use the same
provider and adapter after ADSB.lol explicitly approves and deploys CORS.
Source readiness is not provider authorization, and there is no runtime
fallback between the two delivery paths.

Airplanes.live documents a closely compatible point/radius response, but a
single current Tallinn request returned `403` with instructions to contact the
operator. The applicable API access, rate, data-use, caching, attribution, and
public-display terms are not established by the published OpenAPI document or
homepage language.

OpenSky is not a compatible default. Its current terms require a written
license for operational REST API use in a live product even for a non-profit
entity. It also uses a different bounding-box/state-vector contract, requires
server-side OAuth credentials for authenticated access, and its standard daily
credit budget cannot sustain one uninterrupted 20-second session.

No automatic failover, aggregation, cross-provider deduplication, alternative
adapter, credential flow, or additional backend is justified by this
evaluation.

This is an engineering record, not legal advice. Provider terms and behavior
can change and must be rechecked before a deployment or provider change.

## Evidence method

The matrix uses these labels:

- **Documented**: stated by an official provider specification, repository, or
  terms page.
- **Observed**: one bounded verification request during this evaluation; it is
  not a service guarantee or load test.
- **Calculated**: derived from the application's checked-in 20-second cadence
  and viewport limits.
- **Unknown**: not established by the reviewed official material. Unknown does
  not mean permitted.

No operator was contacted, no access or capacity was approved, and no provider
was load-tested.

## Application requirements

The current aircraft integration requires:

- a geographic query for a rounded center and conservative radius no greater
  than 100 km;
- an outward-rounded integer transport radius, where exactly 100 km becomes
  54 NM or 100.008 km;
- non-overlapping requests no more often than every 20 seconds;
- stable ICAO24 identity, coordinates, and observation age;
- optional heading/course, speed, altitude, vertical rate, callsign,
  registration, type, emitter category, and squawk;
- explicit errors, `429`, and retry guidance;
- exact client-side filtering to the visible viewport polygon;
- no route, operator, or category inference from movement.

## Technical and operational matrix

| Criterion | ADSB.lol | Airplanes.live | OpenSky |
| --- | --- | --- | --- |
| Current access | **Documented:** the API is available to everyone and currently free. **Observed:** current bounded access succeeds without a key. | **Documented:** a v2 point endpoint is published. **Observed:** a bounded Tallinn request returned `403` asking the project to contact `contact@airplanes.live`. | **Documented:** anonymous access is available with reduced limits; account clients use OAuth2. Operational REST use still requires a separate written license. |
| Browser CORS | **Observed:** successful responses did not provide a general browser `Access-Control-Allow-Origin`; retain a same-origin proxy. | **Observed:** the `403` response did not provide usable browser CORS. CORS for an authorized successful response is **unknown**. | No general third-party browser-CORS guarantee was found. Authenticated use requires a server-held client secret regardless. |
| Authentication | **Documented:** none today. The deployed API description separately asks production users to make contact so integrations are not broken accidentally. The source repository announces future feeder-linked API keys. Neither statement is an SLA or present capacity approval. | The OpenAPI document declares no security scheme, but that conflicts with the observed contact gate. Key, IP allowlist, header, rotation, and deployment-egress requirements are **unknown**. | **Documented:** anonymous requests have reduced limits. Authenticated access uses OAuth2 client credentials; basic username/password authentication ended on 2026-03-18. Tokens last about 30 minutes. |
| Geographic query | **Documented:** `/v2/point/{lat}/{lon}/{radius}`, radius in NM, maximum 250 NM. Directly compatible. | **Documented:** the same point/radius shape, radius in NM, maximum 250 NM. Transport-compatible if access is approved. | **Documented:** `/states/all` accepts a WGS84 bounding box, not a point/radius query. A new adapter would need a conservative box, antimeridian handling, and exact client filtering. |
| Timestamps and fields | The current adapter consumes readsb-style `now`, `seen_pos`/`seen`, `hex`, position, headings/track, knots, feet, ft/min, callsign, registration, type, category, and squawk. | The published v2 schema documents a closely matching readsb-style envelope and fields. Runtime compatibility cannot be claimed without authorized sample data. | State vectors are positional arrays. Timestamps are seconds; altitude is metres; velocity and vertical rate are m/s; category is numeric with `extended=1`; registration and aircraft type are not in the core response. |
| Coverage | **Documented:** community-fed global data. No Tallinn completeness or SLA is promised. | **Documented:** community ADS-B/MLAT aggregation. No measured Tallinn advantage or completeness guarantee is published. | **Documented:** a ground-receiver network with geographic coverage variation. No measured Tallinn advantage or completeness guarantee is established here. |
| Rate limits | **Documented:** dynamic with environment load; no fixed project quota is promised. | A current numeric API quota is **unknown**. Historical or archived rate statements are not treated as a current grant. | **Documented:** `/states/all` uses credits. Anonymous users receive 400/day, standard users 4,000/day, active feeders 8,000/day, and licensed users 14,400/hour. A bounding box up to 25 square degrees costs one credit. |
| Cost | **Documented:** currently free. Proxy hosting and egress remain project costs. | API price and approved free allowance are **unknown**. A free public map is not evidence of a free production API grant. | Public prices for the required operational license are **unknown**. Free technical tiers do not authorize operational product use. |
| Outage and throttle behavior | Data is provided as-is. Keep provider failures distinct from empty traffic and preserve standard HTTP status and `Retry-After` guidance. | The OpenAPI document describes `502` when its upstream cannot be reached; the current access gate is a distinct `403`. Other recovery terms are **unknown**. | Credit exhaustion returns `429` plus `X-Rate-Limit-Retry-After-Seconds`; expired OAuth tokens return `401`. Supporting this would require provider-specific error handling. |
| Production implication | Issue #11 must provide a fixed-upstream, allowlisted same-origin route with validated inputs and a bounded upstream timeout. No client secret is currently needed. | Activation first requires written access and terms. A proxy cannot turn denied access into authorized use. | Activation requires a written operational license, server-side OAuth credentials/token refresh, quota accounting, and validation in the approved hosting environment. |
| Operator-change risk | Current production-contact guidance is informal. Future API keys are explicitly tied to feeding ADSB.lol, with no announced enforcement date. | Access is discretionary today and the published terms can change. Approved rate, cost, caching, attribution, and egress rules are unknown. | Terms, access, and quotas are centrally controlled. Official client documentation also warns that hyperscaler IP ranges may be blocked because of abuse. |

Official technical sources:

- ADSB.lol:
  [deployed OpenAPI](https://api.adsb.lol/api/openapi.json),
  [open-data API page](https://www.adsb.lol/docs/open-data/api/),
  [API source and rate notes](https://github.com/adsblol/api), and
  [privacy/license/contact](https://www.adsb.lol/privacy-license/).
- Airplanes.live:
  [OpenAPI](https://airplanes.live/openapi.yaml),
  [API documentation](https://airplanes.live/api-docs/),
  [homepage](https://airplanes.live/), and
  [general terms](https://airplanes.live/terms-of-use/).
- OpenSky:
  [live API introduction](https://openskynetwork.github.io/opensky-api/),
  [REST documentation](https://openskynetwork.github.io/opensky-api/rest.html),
  [official client repository](https://github.com/openskynetwork/opensky-api),
  and [terms of use](https://opensky-network.org/about/terms-of-use).

## Data rights, retention, and public display

| Criterion | ADSB.lol | Airplanes.live | OpenSky |
| --- | --- | --- | --- |
| Data license | **Documented:** public API data is ODbL 1.0. The separate CC0 feeder statement covers data contributed to feeder endpoints and must not be substituted for the public database license. | The OpenAPI metadata says Apache-2.0, but that does not establish the license for returned live aircraft data. API data rights remain **unknown**. | **Documented:** the default license is limited to approved non-profit research and education. Operational REST use requires a written license regardless of non-profit status. |
| Caching and retention | ODbL permits use subject to its conditions. Current LiveTrafficStan state is bounded in memory; it does not create a redistributed aircraft database. Repeated extraction, future persistence, or shared caching still needs a separate ODbL and provider-policy review. | General terms restrict systematic retrieval and database compilation without written permission. How those terms apply to an approved API integration, including cache TTL and retention, is **unknown**. | Current terms restrict use to the approved purpose, prohibit unauthorized disclosure, and require data copies to be expunged after the approved research/access ends, subject to a reasonable reproducibility period. |
| Public map and screenshots | An interactive map or screenshot is an ODbL Produced Work. Public use needs an associated notice identifying ADSB.lol and ODbL 1.0. | Homepage language is informal marketing, while the general terms restrict public reuse. Public display, screenshots, and attribution requirements need written operator confirmation. | A live public product requires a written operational license. The default terms also require the OpenSky paper citation for publications and restrict disclosure of aircraft identifiers without an applicable authorization. |
| Combined databases | An unmodified ODbL database can be part of a Collective Database while retaining its own license. A publicly used Derivative Database triggers ODbL share-alike and machine-readable access obligations. LiveTrafficStan does not create either today. | Combining, retaining, or redistributing returned data is **unknown** and must be resolved in an access agreement. | Default terms prohibit distributing or making data available beyond approved collaborators; aggregation for a public product needs a written license. |
| Required attribution | Current UI should identify ADSB.lol and link ODbL 1.0. | Exact credit wording is **unknown** until authorized. | The default research terms require citation of the 2014 OpenSky paper; an operational agreement may add or replace requirements. |

Official license sources:

- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Airplanes.live general terms](https://airplanes.live/terms-of-use/)
- [OpenSky terms of use](https://opensky-network.org/about/terms-of-use)

## Request-volume calculation

One continuously active eligible session has a nominal upper-envelope cadence
of:

```text
60 seconds / 20 seconds = 3 requests per minute
3 * 60 = 180 requests per hour
180 * 24 = 4,320 requests per day
```

| Active duration | Nominal requests |
| --- | ---: |
| 10 minutes | 30 |
| 30 minutes | 90 |
| 1 hour | 180 |
| 8 hours | 1,440 |
| 24 hours | 4,320 |

Pauses, ineligible viewports, slow responses, and backoff reduce actual starts.
Rapid camera changes do not add another request stream.

For OpenSky near Tallinn, conservative boxes around representative circular
queries remain below 25 square degrees:

| Radius | Approximate box area near 59.4 degrees north | Credits/request | Credits/24 h |
| --- | ---: | ---: | ---: |
| 20 km | 0.25 square degrees | 1 | 4,320 |
| 50 km | 1.59 square degrees | 1 | 4,320 |
| 100 km | 6.36 square degrees | 1 | 4,320 |

At one credit/request:

- 400 anonymous credits cover about 2 hours 13 minutes;
- 4,000 standard credits cover about 22 hours 13 minutes;
- 8,000 active-feeder credits cover one continuous session, but not two.

This Tallinn calculation is not globally constant. At high latitudes a 100 km
enclosing box can exceed 25 square degrees, and antimeridian handling could
require more than one request. OpenSky is already excluded by its operational
license requirement, so the calculation is capacity evidence rather than an
implementation design.

## Compatibility and risk conclusions

### ADSB.lol

- Retain the existing provider and normalizer.
- Treat dynamic limits and the announced feeder-linked key requirement as
  upstream risks, not as approved production capacity.
- Keep the current one-provider provenance and ODbL attribution.
- Hand the fixed-route proxy, input validation, upstream timeout, status/header
  preservation, and safe logging requirements to Issue #11.

### Airplanes.live

- The documented transport and v2 schema are promising but not authorized.
- The OpenAPI Apache-2.0 declaration must not be represented as an aircraft-data
  license.
- The homepage's permissive language conflicts with a contact-gated endpoint
  and restrictive general terms; API-specific rights remain unknown.
- A later activation requires written access, terms, quota, cost, public-display
  rights, caching/retention rules, attribution, and an authorized sample before
  code is added.

### OpenSky

- Do not treat anonymous technical access as product authorization.
- A future reconsideration starts with a written operational license, approved
  hosting, adequate aggregate quota, and credential handling.
- A real implementation would need a distinct bounding-box/state-vector
  adapter and honest omission of unavailable registration/type fields.

## Failover decision

Automatic failover and aggregation are rejected for the current product:

- Airplanes.live is not authorized and OpenSky is not licensed for this
  operational use.
- Providers have different schemas, timestamps, fields, quotas, and rights.
- Switching sources can change provenance and attribution while an entity is
  selected.
- Aggregation needs duplicate resolution and conflict policy that the current
  product does not otherwise require.
- A second provider would add credentials, proxy behavior, and failure modes
  without demonstrated user value.

The application-owned `AircraftDataProvider` boundary is sufficient for a
future deliberate replacement. No additional abstraction is needed now.

## Acceptance evidence

- This dated matrix records official sources, observations, calculations, and
  unknowns separately.
- The current access/contact status of Airplanes.live is recorded without
  claiming an operator response.
- The chosen ADSB.lol adapter has deterministic fixtures for normalization,
  units, timestamps, geographic filtering, category mapping, transport radius,
  exact request construction, abort-signal forwarding, invalid JSON, and HTTP
  error/retry guidance.
- The existing controller fixtures cover non-overlap, 20-second request-start
  spacing, query revision, cancellation, pause/resume, rate-limit backoff, and
  stale-result rejection.
- Production proxy implications remain explicitly assigned to Issue #11.
- No alternative-provider placeholder, secret, failover, or live CI request is
  introduced.

## Re-evaluation conditions

Reopen the provider decision only with concrete new evidence:

- ADSB.lol changes access, licensing, fields, reliability, or feeder/key terms;
- Airplanes.live grants written access with publishable terms and an authorized
  sample;
- OpenSky grants an operational license and sufficient aggregate quota for the
  intended hosting model;
- measured coverage or availability demonstrates a user-facing requirement
  that the current provider cannot meet.

The current Airplanes.live restriction is a completed evaluation conclusion,
not a blocker to retaining ADSB.lol. Create a blocker Issue only if a later
approved feature specifically requires activating that provider.

## Cloudflare production observation

On 2026-09-23 the first real Workers Free deployment proved that ADSB.lol
returns `429` to Cloudflare Workers shared egress while the same bounded
request returns `200` from a normal residential connection. A bounded
cross-provider check found no immediately activatable replacement:

- ADSB.fi returned `403` from Workers egress and has a custom
  personal/non-commercial policy rather than the current ODbL contract;
- Airplanes.live remained contact-gated;
- OpenSky still requires operational licensing and insufficient anonymous
  quota remains;
- AvioADSB was reachable but had no Tallinn coverage and only 100 anonymous
  requests per day.

The official ADSB.lol API description asks production users to contact the
operator so integrations are not broken accidentally. The minimum external
action is therefore a production-access request for the existing bounded
ODbL integration. That request is tracked in
[adsblol/website#272](https://github.com/adsblol/website/issues/272).
[adsblol/api#63](https://github.com/adsblol/api/pull/63) proposes scoped CORS
for public `/v2` application responses; the provider edge must separately make
any nginx-generated `429` browser-readable for direct mode to preserve
explicit backoff. Until access is resolved, the application must expose
provider throttling honestly; it must not add a public proxy, spoof client
addresses, rotate identities, cache live positions, or silently substitute a
provider with unresolved rights.
