# Airport Arrival and Departure Board Evaluation

**Latest access/implementation evidence:** 2026-10-08; original review: 2026-09-19

**Issue:** [#5](https://github.com/vasilyevstan/LiveTrafficStan/issues/5)

**Provider access and implementation:** [#46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46)

## Decision

The bounded, deployment-gated implementation uses **AeroDataBox Basic
through RapidAPI**, with 400 API units per month. Airport boards cost two units
per call, so the theoretical ceiling is **200 uncached board calls per month
shared across the entire app**, before other charged work. One call can include
arrivals and departures. This is not a per-user allowance.

The project credential and bounded Tallinn proof were established on
2026-10-08. The key is held only in the main-restricted production secret
`AERODATABOX_RAPIDAPI_KEY`, then installed atomically in the Worker. There is
no browser credential, paid plan, recurring refresh, or discretionary
provider-permission gate. The feature defaults off in source; activation
requires the matching checked browser/Worker deployment input.

The September review's blanket paid-plan and bespoke-permission assumptions
are superseded. Applicable published terms can authorize the intended use;
an individual agreement is necessary only when those terms require it.

The independent local/static part of Issue #5 is complete:

- search current non-expired aircraft already held by the application;
- display a pinned public-domain OurAirports large/medium-airport layer;
- show static airport facts and provenance.

Those capabilities do not create an operational board and do not associate a
visible aircraft with an airport. The ADSB.lol plausible-route feature is a
callsign-based selected-aircraft hint, not an airport/time-window enumeration
source. Board records stay separate from traffic and static airport facts.

## Implemented bounded contract

- The browser explicitly requests the literal same-origin
  `GET /api/airports/board?icao=EETN` shape. Only one canonical uppercase
  four-letter ICAO parameter is accepted; there is no endpoint, direction,
  window, credential, or location override.
- The Worker fixes the RapidAPI origin and relative-time airport endpoint:
  offset -60 minutes, duration 360 minutes, both directions, legs,
  cancellations/codeshares/cargo/private flights included, locations omitted.
  Rows have no general occurrence identifier or source-update timestamp.
- One demand-driven `AirportBoardCoordinator` in the existing Worker owns
  global admission. It persists only quota/reset/retry reservations, uses the
  provider's billing countdown rather than calendar-month resets, reserves
  before forwarding, and maintains an in-flight fence across recreation.
  There is no airport Cron, KV namespace, traffic-relay reuse or new host.
- A documented zero-unit health request bootstraps absent/expired quota only
  during an explicit load. Both actual API-unit and request allowances are
  honored. An unconfirmed free-plan/quota response prevents paid board work.
  Completed requests remain at least 1.1 seconds apart; `429`/`Retry-After`
  and exhaustion survive coordinator recreation. Failed or canceled paid
  reservations are not optimistically refunded.
- At most one upstream sequence and 16 matching consumers are active.
  Matching loads coalesce; other airports get explicit retry guidance rather
  than an unbounded queue. Canceling the last consumer aborts the producer,
  including the wait between free bootstrap and paid lookup.
- One total ten-second upstream deadline, 1 MiB raw body bound, 500 combined
  raw rows and 512 KiB normalized response bound apply. Only complete validated
  boards enter an eight-airport memory LRU: five minutes for populated boards,
  one minute for empty/unknown boards. Entries are checked/pruned before use;
  eviction/recreation discards the memory cache. Flight data never enters SQL.
- Application-owned models retain reported status, operating/codeshare/
  unknown semantics, selected-airport quality and consistent UTC/local clocks.
  Exact identical projected rows are deduplicated; conflicting or marketing
  rows remain separate. Callsigns, aircraft identity/positions and inferred
  flight-to-map associations are deliberately excluded.
- Missing/null directions and `204` remain unavailable coverage; valid empty
  arrays remain successful empty results. Missing optional clocks are not
  invented. Invalid supported fields fail the board instead of silently
  presenting a truncated or partially decoded result as complete.
- The browser makes no startup, select-only, theme, resize, direction-change
  or automatic retry request. Selection/close, hidden, offline and HISTORY
  cancel its generation and discard flight records. Active displayed data
  expires at 30 minutes. Shared retry state is not reset by selection changes.
  No board data enters preferences, private history or the service-worker cache.

## Timestamped access and rendered evidence

The 2026-10-08 free EETN health request at 17:19:09-17:19:11 UTC returned
schedules/live-update feeds `OK` and the separate ADS-B update feed `Down`.
That last status is not TrackStan's ADSB.lol aircraft health.

One combined board at 17:21:33-17:21:34 UTC returned **17 arrivals and eight
departures**, including a delayed arrival. All rows reported `IsOperator`;
there was no general row source-update field. The gateway reported a
400-unit allowance, 1,600-request allowance and free-plan hard-limit headers.
Health used zero units; the board used two, leaving 398. These are a bounded
project-access receipt, not ongoing coverage or a promise of specific flights.
Raw flights were discarded; only aggregate/schema evidence was retained.

Synthetic deterministic cases cover unavailable/empty, delayed, canceled,
uncertain-canceled, diverted, codeshare, approximate, missing-time, midnight,
DST, malformed, oversized, timeout, cancellation, quota and failure states.
No real provider records were committed as fixtures. Native browser acceptance
uses explicitly invented rows; see
[Development and Testing](development-and-testing.md#on-demand-airport-boards-46).
Actual activation and rollback receipts are recorded on
[#46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46); do not mistake
the local fixture acceptance for a production deployment.

## Required board contract

The following acceptance checklist motivated the selected contract and remains
the basis for any future provider change:

- a selected endpoint, explicit row/duplicate semantics, and an honest account
  of whether the source supplies a unique flight-occurrence identity;
- an applicable ongoing-free account/plan and published terms, confirmed quota,
  zero recurring spend, and no automatic paid overage;
- evidence in applicable terms for public-display, combination, attribution,
  caching, fixture, screenshot, diagnostics, retention, and deletion use;
- a server-held credential path with no client-side secret or general proxy;
- source-update semantics distinct from retrieval time and flight event times;
  absent source-update timestamps must remain explicitly unavailable;
- explicit operating, marketing, and codeshare semantics;
- UTC and airport-local-time boundary behavior;
- bounded pagination/window, concurrency, timeout, body-size, retry,
  `429`/`Retry-After`, and spend controls;
- permitted representative Tallinn (`EETN`) arrival, departure, empty,
  delayed, canceled/diverted, partial, and failure samples;
- independent stale/error behavior that cannot affect live traffic.

## Candidate review

### OpenSky arrivals and departures (September review)

Official documentation:

- <https://openskynetwork.github.io/opensky-api/rest.html>
- <https://opensky-network.org/about/terms-of-use>

OpenSky exposes airport arrival and departure endpoints, but its flight records
are reconstructed by an overnight batch. The documented data is available only
for the previous day or earlier, and airport/time values are estimates. Its
terms require a prior written agreement for operational REST API use in a live
product.

**Outcome:** unsuitable as a current operational board and not authorized for
this project.

### FlightAware AeroAPI (September review)

Official material:

- <https://static.flightaware.com/rsrc/aeroapi/aeroapi-openapi.yml>
- <https://www.flightaware.com/commercial/aeroapi/>
- <https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License.pdf>
- <https://www.flightaware.com/commercial/flightaware-terms-conditions-Sep2026.pdf>

AeroAPI is technically credible. Its published contract includes airport
flight, arrival, departure, cancellation, recent, scheduled, and pagination
operations, with provider flight identity and scheduled/estimated/actual event
times.

The repository has no applicable account, API key, accepted order, or approved
budget. The published Standard License requires written permission for some use
with another real-time or near-real-time flight provider, which is material
because TrackStan uses ADSB.lol. Published license and general-terms
documents also state different default retention periods; the accepted
agreement/order must establish which rule governs. The inspected board schema
does not establish a general source-update timestamp for every row.

**Outcome:** technically viable for later authorization, not currently
authorized.

### AeroDataBox: selected source, research rechecked on 2026-10-07

Official material:

- <https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json>
- <https://aerodatabox.com/data-coverage>
- <https://aerodatabox.com/terms>
- <https://aerodatabox.com/pricing>
- <https://aerodatabox.com/faq>
- <https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing>

AeroDataBox's pricing distinguishes RapidAPI Basic (**Free forever**, 400
units/month) from API.Market Basic (a **seven-day trial**). Direct free credits
depend on data contribution; no receiver or contribution project is in scope.

The RapidAPI gateway is `https://aerodatabox.p.rapidapi.com`, authenticated
server-side with `X-RapidAPI-Key` and
`X-RapidAPI-Host: aerodatabox.p.rapidapi.com`. The documented operations are:

```text
GET /flights/airports/{codeType}/{code}
GET /flights/airports/{codeType}/{code}/{fromLocal}/{toLocal}
GET /health/services/airports/{icao}/feeds
```

Both board operations are Tier 2, costing two units per request, with a
12-hour maximum Basic window. `direction=Both` permits one combined request.
Basic rate limits are one request per second and an additional 1,000 per hour.
The account allowance is shared by all viewers and charged endpoints; it must
not be treated as 400 board requests or multiplied by visitor count.

The Basic plan permits noncommercial use with visible linked AeroDataBox
attribution. Terms Articles 5.4 and 5.5 require an attribution link that does
not suppress referral data with `noreferrer`, minimized caching, deletion when
the operational purpose ends, and standard retention of at most seven days.
The FAQ explicitly distinguishes an integrated flight-number/time/status/gate
display from bulk redistribution or an API substitute. Credentials stay
confidential; multiple accounts must not be used to evade limits.

Terms Article 7.2 makes the actual subscribed marketplace plan authoritative
for quota and overage behavior. The pricing FAQ describes rejection on
exhaustion, but the project's actual zero-cost/no-overage subscription has not
been verified. There is no paid fallback.

The board-row contract inspected for this decision does not expose the
individual-flight contract's `lastUpdatedUtc` or a general unique occurrence
ID. Rows include flight number, status and codeshare status; optional movement
details carry UTC/local event times and data quality. Retrieval time is not
source-update time. Revised movement time may describe a gate or runway event,
and experimental individual-flight predictions are not a board guarantee.

Coverage can range from schedules to near-real-time or hours-delayed data,
can differ between departure and arrival, and can include ADS-B-derived
estimates. Those states must not become confirmed operational facts. Feed
health distinguishes schedules, live updates and ADS-B updates. Marketing or
country coverage is not proof of useful `EETN` responses.

The inspected RapidAPI specification is version `1.15.3.0`, SHA-256
`735620f2d2132c5bf51768f50caa767b7f0b25be8b128679641402666696890a`.
This identifies documentation, not a captured live response.

**Outcome:** leading candidate for the bounded free on-demand slice. A
name-only check found no configured project board credential. No signup,
subscription, purchase, provider contact or authenticated Tallinn request
occurred. The first useful proof is the `EETN` feed-status operation plus one
bounded combined board request under the actual free account.

### aviationstack

Official material:

- <https://aviationstack.com/documentation>
- <https://aviationstack.com/pricing>

The current pricing table advertises an ongoing $0 noncommercial plan with
100 requests per month, real-time flights and HTTPS. Dedicated Flight Schedules
is listed on paid plans. It is incorrect to describe every free offer as a
time-limited trial. An account/key is still required; useful free airport-filtered
coverage and its source-age, occurrence and public-use contract are unproved.

**Outcome:** not selected.

### AirLabs

Official material:

- <https://airlabs.co/docs/schedules>
- <https://airlabs.co/terms-of-service>

The schedules endpoint exists and supports airport queries, up to a ten-hour
forward horizon, and at most 50 results for Free keys. The documented Free
fields cover basic flight/airport identifiers and scheduled local times, not
status, estimated/actual times or UTC fields. No current monthly quota or
Tallinn coverage has been verified.

**Outcome:** not accepted as the requested operational board from the
documented free fields; do not misreport it as having no schedules endpoint.

### Public airport, airline, and tracker pages

Human-facing pages and widgets are not machine-readable API authorization.
Scraping would weaken reliability, accessibility, privacy, provenance, and
licensing control.

**Outcome:** rejected.

## Prohibited substitutes

TrackStan will not:

- generate a board from currently visible aircraft;
- infer an airport relationship from movement, heading, proximity, callsign,
  registration, or a static airport point;
- present OpenSky historical estimates as a current board;
- scrape a public website or embed a widget as if it were an API contract;
- expose a provider key in browser code;
- add a placeholder board, synthetic production response, wildcard upstream,
  or general forwarding proxy.

## Release and future provider-change gate

Issue #46 remains open until the contract and actual implementation criteria
are met, including permitted Tallinn samples and independent failure behavior.
Platform deployment alone does not supply provider access. The 2026-10-08
credential/account/source proof above resolves that prerequisite for the
selected free Basic path, not for an arbitrary alternate provider or plan.

Provision only the ongoing **RapidAPI Basic Free** plan, verify the actual
account's allowance and no-overage terms, and keep the key in the protected
GitHub `production` environment. Never paste it into Issue text, source, a
browser environment variable, a URL or a screenshot. Selecting this candidate
does not authorize a paid subscription or acceptance of unrelated account
terms.

The credential was used for a bounded proof before implementing this path.
Future provider changes need equivalent evidence; a key alone never justifies
a placeholder, synthetic production response or inferred board. Existing
aircraft, marine, orbital, route and static-airport behavior remains separate.
