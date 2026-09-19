# Aircraft Route Enrichment Evaluation

## Decision

Evaluation date: **2026-09-19**

LiveTrafficStan will not add aircraft origin or destination enrichment yet.

No reviewed source is both:

- authorized for this public application; and
- capable of associating origin and destination with the selected flight
  occurrence using a provider-issued flight/leg identity plus bounded date/time
  context.

The current keyless route-like sources are callsign-based standing tables or
track-derived airport estimates. They cannot establish current operational
intent. The credible operational APIs require an account, accepted terms, a
server-held credential, an approved budget, and provider-specific identity
rules that are not supplied or verified through the project.

[Issue #44](https://github.com/vasilyevstan/LiveTrafficStan/issues/44)
records the exact authorization evidence required before implementation.
Issue #3 remains open and receives no adapter, route field, Worker endpoint,
placeholder panel, or mock production response.

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

No provider account was created, no paid terms were accepted, no credential
was requested, no operator was contacted, and no credentialed route call was
made.

## Current project state

Verified against protected `dev` SHA
`dc6ef9208643116662c3e9138b84a0097e85548d`:

- ADSB.lol is the only live aircraft provider.
- A normalized aircraft may contain ICAO24, callsign, registration, type,
  observation time, and current position.
- No provider flight-occurrence identity or route field exists.
- The Cloudflare Worker constructs only the fixed ADSB.lol point URL.
- Repository Actions secrets and variables are empty.
- GitHub `production` environment secrets and variables are empty.
- `.env.example` states that every `VITE_*` value is browser-visible and must
  never contain a secret.
- Issue #39 separately tracks permanent Cloudflare deployment authorization.

This evidence does not claim that the repository owner has no unrelated
personal provider account. It establishes that no applicable route source,
agreement, plan, or credential is supplied or verified through the checked
project path.

## Required identity and truthfulness contract

A source is compatible only if it can support all of these rules:

- A provider-issued flight-occurrence or leg identity is the primary
  association.
- Bounded temporal context is part of the association.
- Callsign and registration may corroborate a result but cannot establish it
  alone.
- Operating and marketing flights, codeshares, repeated legs, UTC/local date
  boundaries, schedule changes, cancellations, and diversions have explicit
  semantics.
- Missing, reused, changed, or conflicting identifiers produce unavailable or
  ambiguous outcomes.
- Scheduled, estimated, revised, actual, canceled, diverted, approximate, and
  unknown values remain distinct.
- Source, source age, retrieval age, attribution, and identity confidence stay
  visible with every displayed route.

Movement, heading, current position, nearest airports, geographic plausibility,
static aircraft metadata, and callsign parsing are not route evidence.

## Candidate matrix

| Candidate | Identity and route semantics | Access, rights, and cost | Decision |
| --- | --- | --- | --- |
| ADSB.lol standing routes | Callsign-keyed standing airport pair; optional current-position plausibility; no date or flight-occurrence identity | Keyless current endpoint; standing-data rights do not turn the result into operational evidence | Reject |
| Airplanes.live | Published live aircraft and reference data; no dated operational route association in the inspected schema | Current aircraft access is contact-gated; route capability, rights, quota, and cost are not established | Reject |
| ADSBDB/VRS standing data | Callsign-keyed origin/destination; no date, status, or occurrence identity | ADSBDB surfaces a publication restriction while the VRS repository separately carries CC0; rights conflict is unresolved | Reject on identity semantics |
| OpenSky flights | ICAO24 plus time window, but previous-day-or-earlier batch output with estimated airports and times | OAuth for authenticated access; flight credits; live operational use requires a previous written agreement | Reject |
| FlightAware AeroAPI | Provider flight ID, schedule/estimate/actual times, codeshares, cancellation, and diversion fields | Account and API key; per-result-set pricing; Standard currently has a monthly minimum; written permission required for conjunction/backfill with another real-time provider | Credible only after authorization |
| AeroDataBox | Number, callsign, registration, or ICAO24 plus local date; schedule/status/quality fields; no opaque occurrence ID in the inspected contract | Account, key, and plan; paid retrieval required for commercial use unless separately agreed; bounded retention terms | Credible only after authorization and approved identity contract |
| aviationstack | Flight/status and route surfaces, but no verified project-specific occurrence contract | Account and key; Free has 100 requests/month and non-commercial use; paid plan required for this public product | Not selected |
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

Official sources:

- <https://aviationstack.com/documentation>
- <https://aviationstack.com/pricing>

The project has no account, access key, paid plan, accepted terms, verified
occurrence identity contract, cache grant, or authorized Tallinn sample.
aviationstack offers no established advantage over the stronger documented
FlightAware and AeroDataBox authorization paths.

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

## Blocker completion evidence

Issue #44 may close when all of these are proven:

- a named source, account owner, plan/Order, and approved recurring or usage
  budget;
- public end-user display rights;
- a documented legal relationship with ADSB.lol, including ODbL
  Produced-Work or Derivative-Database implications;
- no merged redistributed database of ODbL observations and proprietary route
  records;
- exact cache, negative-cache, logging, fixture, screenshot, retention,
  deletion, and attribution terms;
- a provider-issued occurrence/leg identity or provider-approved composite
  identity;
- explicit UTC/local-date, operating/marketing, repeated-leg, codeshare,
  midnight, schedule-change, cancellation, and diversion rules;
- an auditable table containing authorized dated Tallinn arrival and departure
  examples, selected observation time, lookup window, provider identity,
  corroborating identifiers, source/retrieval times, supported/unsupported
  states, and expected association or unavailable/ambiguous outcome;
- coverage for reused, missing, and changed identifiers, codeshares, and date
  boundaries;
- a provider-enforced hard allowance or separately approved aggregate
  fail-closed request/spend control;
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

## Separate production gate

Issue #39 remains the permanent Cloudflare account/deployment blocker.

Route-source authorization can be established in an approved non-public path
before #39 closes. Public route enrichment still requires the selected
secret-holding boundary to be deployed and validated. Closing either gate does
not complete the other.

## Later implementation invariants

These requirements do not authorize runtime code before Issue #44 closes:

- Start enrichment only after explicit aircraft selection.
- Never start or refresh it from ADSB position polling, camera movement, map
  updates, trails, metadata refresh, or provider retry.
- Deduplicate and cache by occurrence/leg identity plus temporal context, never
  callsign alone.
- Use provider-permitted bounded positive and negative lifetimes. Retention
  ceilings are not freshness TTLs.
- Reevaluate expiry while details remain open through an explicitly permitted
  refresh path.
- Abort on deselection, selection change, identity change, and unmount.
- Reject late callbacks by monotonic generation.
- Never alter ADSB position time, freshness, cadence/backoff, marker existence,
  trails, selection eligibility, static metadata, map health, or another
  provider.
- Preserve field-level provenance and source/retrieval time.
- Keep scheduled, estimated, revised, actual, canceled, diverted, approximate,
  ambiguous, and unknown states distinct.
- Reject FlightAware `position_only` records as operational route evidence;
  do not treat its `cancelled` flag as proof of airline cancellation; resolve
  diverted legs explicitly.
- Do not label AeroDataBox `revisedTime` or `Approximate` quality as confirmed
  actual data.
- Never use Mictronics metadata to infer the current operator, flight, origin,
  or destination.
- Always show visible provider attribution and source age.
- Keep future credentials server-side behind one same-origin fixed-upstream
  route with no wildcard CORS, cookies, browser authorization, arbitrary
  headers, client-selected upstream, or general-forwarder behavior.
- Do not routinely log selected identifiers, lookup URLs, or raw requests and
  responses. Any explicitly permitted diagnostics must be minimized, redacted,
  bounded, and expired.
- Do not add a persistent database, queue, cache service, or rate-control
  service without separate measured justification and approval.

Deterministic tests must cover occurrence identity, missing/reused/changed
identifiers, operating and marketing numbers, codeshares, UTC/local midnight,
repeated legs, schedule changes, cancellation, diversion, ambiguity,
positive/negative cache expiry, expiry while open, outage, throttle,
cancellation, stale callbacks, and complete live-marker/provider isolation.

## Issue boundaries

- Issue #3 remains open and blocked by #44.
- Issue #5 local current-aircraft search and a licensed static airport layer can
  proceed without a route source.
- Issue #5 operational boards need their own airport/time-window enumeration
  capability evaluation.
- Even if a board source is authorized, an aircraft-to-airport relationship
  remains gated by Issue #3's selected-flight occurrence match.
- Issue #39 remains a separate shipping prerequisite for a credentialed
  Cloudflare production path.

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
