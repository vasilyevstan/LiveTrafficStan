# Aircraft Route Enrichment Evaluation

## Decision

Evaluation updated: **2026-09-21**

The owner authorized a disabled-by-default aviationstack evaluation slice under
the Free plan's current 100-request monthly allowance. The repository may
contain the complete deterministic client, Worker, quota, and UI path without
claiming that public use is authorized or enabling it in a release.

The evaluation path:

- starts only from an explicit **Find route** action for a selected live
  aircraft;
- keeps the aviationstack key in the Cloudflare Worker;
- accepts only one exact active callsign/ICAO24 operating-flight match;
- reserves at most 90 attempts in any rolling 31-day window;
- makes one provider request per accepted action, with no retry or pagination;
- reuses successful exact-identity routes from a bounded six-hour tab cache;
- returns unavailable on no match, ambiguity, or incomplete pagination;
- remains disabled independently in both browser and Worker configuration.

[Issue #44](https://github.com/vasilyevstan/LiveTrafficStan/issues/44)
remains open for the exact accepted account terms, public-display,
attribution, cache/retention rights, and the remainder of the no-more-than-ten
call real evaluation. Issue #3 is closed after receiving the guarded
implementation, but public enablement and route claims remain blocked until
that evidence exists.

This is an engineering record, not legal advice. Provider terms, pricing,
schemas, and access can change and must be rechecked before a source decision.

## Evidence method

This evaluation uses:

- **Documented** for statements in official schemas, terms, pricing pages, or
  source repositories;
- **Observed** for current repository/account state and bounded endpoint checks;
- **Unknown** where the inspected official material or current project access
  does not establish a fact.

Unknown does not mean permitted.

A Free-plan account and dedicated key were supplied on 2026-09-21. The key is
stored only in ignored local Worker configuration and the protected GitHub
production environment; it is not committed or browser-visible. One
credentialed route call has been made through the local Worker runtime.

## Current project state

The cache branch is based on protected `dev` SHA
`2a2cdd73cbee618c25767cdfcb8da8d7c032d449`:

- ADSB.lol is the only live aircraft provider.
- A normalized aircraft may contain ICAO24, callsign, registration, type,
  observation time, and current position.
- aviationstack exposes no opaque provider flight-occurrence identity.
- The guarded client route state remains separate from live traffic entities.
- The Cloudflare Worker owns a fixed `/api/flight-route` boundary and a
  SQLite-backed global attempt quota.
- `VITE_FLIGHT_ROUTE_ENABLED` and `AVIATIONSTACK_ENABLED` default to `false`.
- One dedicated aviationstack key is configured outside Git.
- Successful validated exact-identity routes are eligible for reuse only
  through a bounded six-hour in-memory tab cache.
- `.env.example` states that every `VITE_*` value is browser-visible and must
  never contain a secret.
- The Cloudflare secret-holding boundary is deployed, but both route flags
  remain `false`.

The exact accepted Free-plan Order/terms, public display rights, attribution,
and cache/retention grant still have not been recorded. A configured
credential and successful private evaluation do not authorize public use.
The owner explicitly accepted retaining the existing dedicated key. It remains
only in protected secret paths and is not browser-visible; that no-rotation
decision does not authorize production route display.

## Initial identity and truthfulness contract

aviationstack's current flight response has no opaque occurrence identity, so
the evaluation deliberately avoids claiming a durable leg association. It can
display a current route only when all of these conditions hold in one complete
response page:

- the live aircraft has a canonical six-character ICAO24 address;
- the live callsign resembles an ICAO flight designator with three leading
  letters, one to five trailing alphanumeric characters, and at least one
  digit;
- the returned operating `flight.icao` equals that callsign;
- `flight_status` is `active`;
- `flight.codeshared` is null;
- returned `aircraft.icao24` exists and equals the selected ICAO24;
- when both registrations exist, trim/uppercase values match exactly;
- both departure and arrival have usable airport identity;
- exactly one row satisfies every condition.

There is no registration-only, callsign-only, fuzzy, codeshare-collapse,
date-guessing, or proximity fallback. Scheduled, landed, canceled, incident,
and diverted rows are not displayed in this first slice. Movement, heading,
current position, nearest airports, geographic plausibility, and static
aircraft metadata are not route evidence.

## Candidate matrix

| Candidate | Identity and route semantics | Access, rights, and cost | Decision |
| --- | --- | --- | --- |
| ADSB.lol standing routes | Callsign-keyed standing airport pair; optional current-position plausibility; no date or flight-occurrence identity | Keyless current endpoint; standing-data rights do not turn the result into operational evidence | Reject |
| Airplanes.live | Published live aircraft and reference data; no dated operational route association in the inspected schema | Current aircraft access is contact-gated; route capability, rights, quota, and cost are not established | Reject |
| ADSBDB/VRS standing data | Callsign-keyed origin/destination; no date, status, or occurrence identity | ADSBDB surfaces a publication restriction while the VRS repository separately carries CC0; rights conflict is unresolved | Reject on identity semantics |
| OpenSky flights | ICAO24 plus time window, but previous-day-or-earlier batch output with estimated airports and times | OAuth for authenticated access; flight credits; live operational use requires a previous written agreement | Reject |
| FlightAware AeroAPI | Provider flight ID, schedule/estimate/actual times, codeshares, cancellation, and diversion fields | Account and API key; per-result-set pricing; Standard currently has a monthly minimum; written permission required for conjunction/backfill with another real-time provider | Credible only after authorization |
| AeroDataBox | Number, callsign, registration, or ICAO24 plus local date; schedule/status/quality fields; no opaque occurrence ID in the inspected contract | Account, key, and plan; paid retrieval required for commercial use unless separately agreed; bounded retention terms | Credible only after authorization and approved identity contract |
| aviationstack | Active-flight filters plus route and aircraft identity fields; no opaque occurrence ID | Account and key; Free currently has 100 requests/month and non-commercial use; exact order terms remain unreviewed | Selected only for a disabled, fail-closed evaluation slice |
| EUROCONTROL NM B2B | Operational European flight data | Eligibility, agreements, certificates, and specific data rights not held by this project | Not accessible now |
| Public airport/airline/tracker pages | Human-readable schedules or status | A webpage is not an API/publication license and cannot prove the selected ADS-B occurrence | Reject scraping |

## Source conclusions

### ADSB.lol standing routes

The pinned implementation retrieves a standing route by callsign. For the
route-plus-position path it then calculates whether the current coordinates are
geographically plausible for the airport pair.

- Pinned API commit:
  `3c969c84f6f659e1c83715a73cb6c2b6eb1d1d89`
- Route implementation:
  <https://github.com/adsblol/api/blob/3c969c84f6f659e1c83715a73cb6c2b6eb1d1d89/src/adsb_api/utils/api_routes.py>
- Plausibility implementation:
  <https://github.com/adsblol/api/blob/3c969c84f6f659e1c83715a73cb6c2b6eb1d1d89/src/adsb_api/utils/plausible.py>

The endpoint has no date or provider flight-occurrence identity. It cannot
distinguish return legs, reused callsigns, charters, cancellations, diversions,
or schedule changes. Geographic plausibility is explicitly prohibited as route
proof.

Retain ADSB.lol only for the existing live position role.

### Airplanes.live

The inspected OpenAPI document publishes aircraft and reference-data endpoints,
not a dated selected-flight route endpoint:

- <https://airplanes.live/openapi.yaml>
- <https://airplanes.live/api-docs/>

The current aircraft endpoint is contact-gated, as recorded in the
[aircraft-provider evaluation](aircraft-provider-evaluation.md). API-specific
route capability, rights, caching, attribution, quota, and cost are unknown.

Do not add a route adapter or switch the live provider.

### ADSBDB and VRS standing data

ADSBDB `/callsign/{CALLSIGN}` returns one callsign, airline, origin, and
destination record without a date, time window, operational status, or flight
occurrence ID:

- Pinned ADSBDB commit:
  `21dbd0922283d9edae806696dc53f2ac47e275e5`
- README and response contract:
  <https://github.com/mrjackwills/adsbdb/blob/21dbd0922283d9edae806696dc53f2ac47e275e5/README.md>

The same README says its flight-route data may not be copied, published, or
incorporated into another database without explicit permission from the named
rights holder.

The VRS standing-data repository separately carries CC0:

- Pinned VRS commit:
  `4b4dcb3ec42de90fd9a3364ad2e9dd5819e46a39`
- License:
  <https://github.com/vradarserver/standing-data/blob/4b4dcb3ec42de90fd9a3364ad2e9dd5819e46a39/LICENSE>

That rights conflict is unresolved. Both forms are rejected independently
because a callsign-only standing route lacks the required occurrence and date
semantics. Adding a date only to a local cache key cannot add semantics the
source does not provide.

### OpenSky flight endpoints

OpenSky `/flights/aircraft` accepts ICAO24 plus a time interval, but the official
documentation says:

- flights are updated by an overnight batch and only the previous day or
  earlier is available;
- `firstSeen` and `lastSeen` are estimated departure and arrival times;
- `estDepartureAirport` and `estArrivalAirport` are estimated and may be null;
- candidate counts and airport distances remain part of the response.

Official sources:

- REST documentation:
  <https://openskynetwork.github.io/opensky-api/rest.html>
- Pinned response schema commit:
  `c4af9c9e5aba25fc6ee0852b54a91b8a7c02f76b`
- Flight response:
  <https://github.com/openskynetwork/opensky-api/blob/c4af9c9e5aba25fc6ee0852b54a91b8a7c02f76b/docs/free/flight-response.rst>
- Terms:
  <https://opensky-network.org/about/terms-of-use>

The terms require a previous written agreement for operational REST use in a
live product or automated system, regardless of non-profit status.
Authenticated access uses OAuth client credentials and the flight credit
bucket.

OpenSky can support historical track research. It is not current operational
route intent and must not be displayed as scheduled or confirmed route data.

### FlightAware AeroAPI

The official schema supplies a strong operational model:

- `fa_flight_id`;
- registration and ATC identifier context;
- operating identifiers and codeshares;
- scheduled, estimated, and actual event times;
- cancellation and diversion fields;
- a `position_only` distinction.

The schema also says diverted records can share a duplicate `fa_flight_id`.
The occurrence resolver therefore needs explicit leg disambiguation.

Official sources:

- Product and current pricing:
  <https://www.flightaware.com/commercial/aeroapi/>
- OpenAPI:
  <https://static.flightaware.com/rsrc/aeroapi/aeroapi-openapi.yml>
- Standard license:
  <https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf>
- Current general terms:
  <https://www.flightaware.com/commercial/flightaware-terms-conditions-Sep2026.pdf>

The current project has no FlightAware account, key, subscription, or approved
budget. The Standard license permits embedded consumer applications but its
`Licensee May Not` item 10 requires prior written permission to use AeroAPI data
in conjunction with or as backfill to another real-time or near-real-time
provider. LiveTrafficStan selects aircraft from ADSB.lol, so that permission is
required.

The current general terms default FlightAware-data retention to 24 hours unless
the applicable Order permits otherwise. The exact Order and license precedence
must be recorded before cache behavior is designed. A maximum retention period
is not a freshness TTL.

FlightAware is a technically credible future candidate only after its account,
budget, combination permission, Tallinn evidence, and leg identity contract
are approved.

### AeroDataBox

The current API supports flight status lookup by:

- flight number;
- registration;
- ATC callsign;
- ICAO24;
- explicit local date or date range.

Its flight contract exposes scheduled and revised airport times, statuses
including en-route, departed, arrived, canceled, and diverted, codeshare
status, aircraft identity fields, last update time, and quality markers.

Official sources:

- API overview: <https://aerodatabox.com/api>
- API channels and security schemes: <https://aerodatabox.com/api-spec>
- OpenAPI:
  <https://doc.aerodatabox.com/docs/openapi-apimarket-v1.json>
- Terms: <https://aerodatabox.com/terms>
- Pricing: <https://aerodatabox.com/pricing>

The inspected `FlightContract` does not expose an opaque durable
flight-occurrence ID. A future use therefore needs a provider-approved
composite identity covering number/callsign, aircraft identity, airport-local
date, repeated legs, codeshares, midnight, schedule changes, and diversions.

Every channel requires an account, API key, and plan. Current terms:

- require credentials to remain confidential;
- allow commercial use only for data retrieved through a paid channel unless a
  separate agreement says otherwise;
- permit purpose-bound caching normally for no more than seven days, response
  `max-age`, or a plan-specific allowance.

Seven days is a legal retention ceiling, not a freshness recommendation.
`revisedTime` may be actual or estimated, and an `Approximate` quality value
cannot be labeled confirmed.

AeroDataBox is a technically plausible future candidate only after plan,
budget, identity semantics, rights, and authorized Tallinn evidence are
approved.

### aviationstack

The official pricing page currently describes:

- Free: 100 requests/month, HTTPS, real-time flights, non-commercial use;
- paid tiers: commercial use and larger allowances.

The current official `/v1/flights` specification is available on all plans and
supports `flight_icao`, `flight_status`, and `limit`. Responses include route,
operating flight, codeshare, aircraft registration/ICAO24, pagination, and
optional live-update fields. Historical `flight_date` filtering is documented
for Basic and higher, so the Free evaluation does not use it.

Official sources:

- <https://aviationstack.com/documentation>
- <https://aviationstack.com/pricing>

The project still has no account, access key, paid plan, accepted order terms,
cache grant, or authorized Tallinn sample. Generic public material does not
settle whether the exact intended display, attribution, fixtures, screenshots,
or combination with ADSB.lol is permitted.

The owner nevertheless selected aviationstack as the first bounded evaluation
because the Free plan can support a manually triggered proof without user
charges. The application reserves no more than 90 attempts in a rolling
31-day window and the first live evaluation may use no more than ten calls.
That implementation budget is stricter than the advertised allowance and does
not replace provider-side account monitoring.

### EUROCONTROL and public flight boards

EUROCONTROL Network Manager B2B access requires eligibility, agreements,
certificates, and applicable data rights:

- <https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services>
- <https://www.eurocontrol.int/info/agreements-rules-and-policies>

No such access or public-display authorization is held by this project.

The Tallinn Airport flight page is a human-facing operational board:
<https://airport.ee/en/flights/>. Public viewing does not establish a
machine-readable integration or republication license, and it does not bind a
row to the selected ADS-B occurrence. Do not scrape it or another airline,
airport, tracker, or widget.

## Public-enablement evidence

Issue #44 may close and the feature may be enabled publicly only when all of
these are proven:

- a named source, account owner, plan/Order, and approved recurring or usage
  budget;
- public end-user display rights;
- a documented legal relationship with ADSB.lol, including ODbL
  Produced-Work or Derivative-Database implications;
- no merged redistributed database of ODbL observations and proprietary route
  records;
- exact cache, negative-cache, logging, fixture, screenshot, retention,
  deletion, and attribution terms;
- provider acceptance of the exact callsign-plus-ICAO24 matching contract and
  its limits, or a stronger supported occurrence identity;
- explicit UTC/local-date, operating/marketing, repeated-leg, codeshare,
  midnight, schedule-change, cancellation, and diversion rules;
- an auditable table containing authorized dated Tallinn arrival and departure
  examples, selected observation time, lookup window, provider identity,
  corroborating identifiers, source/retrieval times, supported/unsupported
  states, and expected association or unavailable/ambiguous outcome;
- coverage for reused, missing, and changed identifiers, codeshares, and date
  boundaries;
- the checked global 90-attempt rolling quota using one dedicated key;
- a dedicated key held only in protected secret paths and excluded from
  browser-visible configuration;
- authorized server-side credential verification;
- one successful selected-flight lookup and one valid unavailable or ambiguous
  result retained under provider terms;
- a narrow endpoint contract with fixed upstream, bounded input/window,
  concurrency, pagination, retries, timeout, body size, redirect rejection,
  response validation, bounded rendering, `429`/`Retry-After`, and
  no-general-forwarder behavior.

A naturally occurring real diversion is not required during source evaluation.
An official documented example or permitted fixture can prove a rare
diversion/ambiguity path. Authentication failure and provider outage do not
count as a valid unavailable-flight result.

## Bounded live evaluation evidence

Two of the ten authorized evaluation calls have been used:

| Retrieved | Selected ADS-B identity | Result | Notes |
| --- | --- | --- | --- |
| 2026-09-21 | `SAS1748`, ICAO24 `4AB566`, registration `SE-MKF` | Arlanda (`ARN`) to Ulemiste (`TLL`), active | Local Worker returned one sanitized exact-match route with `200`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff` |
| 2026-09-22 | `SAS1748`, ICAO24 `4AB56F`, registration `SE-MKO` | Arlanda (`ARN`) to Ulemiste (`TLL`), active | One additional authorized local-Worker request returned the strict exact match with the same sanitized response contract |

No raw provider body, key, quota state, or user data was retained. The
remaining evaluation allowance is eight calls.

## Production boundary

The selected Cloudflare secret-holding boundary is deployed and validated.
Public route enrichment remains disabled because deployment does not satisfy
the separate Issue #44 Vendor Terms/public-display authorization gate.

## Implemented evaluation invariants

- Selection alone never starts a request; each attempt requires **Find route**.
- ADSB position polling, camera movement, map updates, trails, metadata
  refreshes, and provider retries never start or refresh route lookup.
- Deselect, identity change, history mode, feature disable, and unmount abort
  and clear obsolete work; monotonic revisions reject late callbacks.
- The client sends only canonical callsign, ICAO24, and optional registration
  to one root-relative route.
- The Worker accepts only a bounded JSON `POST`, constructs one fixed
  aviationstack URL, adds the key server-side, rejects redirects, and performs
  no retry or pagination request.
- One globally named SQLite-backed Durable Object atomically reserves accepted
  attempts before the provider call. It stores only timestamps, never selected
  identifiers, routes, provider bodies, or user data.
- Reservations are never refunded after timeout, redirect, malformed response,
  provider error, or client cancellation.
- Every response is `no-store` and sanitized; raw provider bodies, pagination,
  URLs, status text, secrets, and exception details never reach the browser.
- Up to 32 successful validated exact-identity routes are eligible for reuse
  from tab memory for six hours with least-recently-used eviction. Failures are
  not cached, and no route is persisted in Web Storage, IndexedDB, history, the
  service worker, Worker Cache API, or Durable Object storage.
- Route failure never alters ADSB position time, freshness, cadence/backoff,
  marker existence, trails, static metadata, selection, map health, or another
  provider.
- Visible attribution identifies aviationstack and makes clear that map
  positions continue to come from ADSB.lol.

## Issue boundaries

- Issue #3 is closed after delivering the guarded default-off implementation;
  public authorization remains in #44.
- Issue #5 is closed after delivering local current-aircraft search and a
  licensed static airport layer.
- Operational boards remain isolated in #46 and need their own
  airport/time-window enumeration capability evaluation.
- Even if a board source is authorized, an aircraft-to-airport relationship
  remains gated by Issue #3's selected-flight occurrence match.
- The deployed Cloudflare boundary does not grant route-provider rights.

## Re-evaluation conditions

Re-evaluate only when:

- a specific provider account and plan are available;
- the applicable terms or written permissions can be reviewed;
- a secure server-side credential path can be demonstrated;
- provider-issued identity semantics can be tested;
- permitted Tallinn samples can be retained;
- quota and cost have an approved fail-closed bound.

A successful anonymous request, a new callsign table, a matching city pair, or
a provider marketing claim is not completion evidence.
