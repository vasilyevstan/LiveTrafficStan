# Airport Arrival and Departure Board Evaluation

**Decision date:** 2026-09-19

**Issue:** [#5](https://github.com/vasilyevstan/LiveTrafficStan/issues/5)

**Authorization blocker:** [#46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46)

## Decision

LiveTrafficStan does not currently implement airport arrival or departure
boards. No reviewed source is both configured and authorized for this public
project with a verified airport/time-window listing contract, source-age
semantics, display and combination rights, retention rules, budget, and secure
server-held credentials.

The independent local/static part of Issue #5 is complete:

- search current non-expired aircraft already held by the application;
- display a pinned public-domain OurAirports large/medium-airport layer;
- show static airport facts and provenance.

Those capabilities do not create an operational board and do not associate a
visible aircraft with an airport. The ADSB.lol plausible-route feature is a
callsign-based selected-aircraft hint, not an airport/time-window enumeration
source. A board source remains a separate provider decision.

## Required board contract

An acceptable source must enumerate flights for one airport and a bounded time
window. Before implementation, the project needs:

- a selected endpoint and provider-issued row/flight identity;
- an applicable account, plan, accepted terms or order, recurring budget, and
  quota;
- written public-display, combination, attribution, caching, fixture,
  screenshot, diagnostics, retention, and deletion rights;
- a server-held credential path with no client-side secret or general proxy;
- source-update time semantics distinct from retrieval time and flight event
  times;
- explicit operating, marketing, and codeshare semantics;
- UTC and airport-local-time boundary behavior;
- bounded pagination/window, concurrency, timeout, body-size, retry,
  `429`/`Retry-After`, and spend controls;
- permitted representative Tallinn (`EETN`) arrival, departure, empty,
  delayed, canceled/diverted, partial, and failure samples;
- independent stale/error behavior that cannot affect live traffic.

## Candidate review

### OpenSky arrivals and departures

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

### FlightAware AeroAPI

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
because LiveTrafficStan uses ADSB.lol. Published license and general-terms
documents also state different default retention periods; the accepted
agreement/order must establish which rule governs. The inspected board schema
does not establish a general source-update timestamp for every row.

**Outcome:** technically viable for later authorization, not currently
authorized.

### AeroDataBox

Official material:

- <https://doc.aerodatabox.com/docs/openapi-apimarket-v1.json>
- <https://aerodatabox.com/data-coverage>
- <https://aerodatabox.com/terms>
- <https://aerodatabox.com/pricing>

AeroDataBox publishes airport and local-time-window board operations. Rows can
include movement, departure, arrival, flight number, callsign, status,
codeshare status, aircraft, airline, and location.

The board-row contract inspected for this decision does not expose the
individual-flight contract's `lastUpdatedUtc`. Published coverage can range
from schedules to near-real-time or hours-delayed data, can differ between
origin and destination, and can include ADS-B-derived estimates. Those states
must not be relabeled as confirmed operational facts. The repository has no
selected account, key, paid plan, budget, or accepted project-specific terms;
display, caching, attribution, and retention depend on the applicable plan.

**Outcome:** technically plausible for later authorization, not currently
authorized.

### aviationstack

Official material:

- <https://aviationstack.com/documentation>
- <https://aviationstack.com/pricing>

An account and key are required. The repository has no approved plan, key,
budget, public-project contract, or verified source-age and occurrence
semantics. A free trial capability is not production authorization.

**Outcome:** not selected.

### Public airport, airline, and tracker pages

Human-facing pages and widgets are not machine-readable API authorization.
Scraping would weaken reliability, accessibility, privacy, provenance, and
licensing control.

**Outcome:** rejected.

## Prohibited substitutes

LiveTrafficStan will not:

- generate a board from currently visible aircraft;
- infer an airport relationship from movement, heading, proximity, callsign,
  registration, or a static airport point;
- present OpenSky historical estimates as a current board;
- scrape a public website or embed a widget as if it were an API contract;
- expose a provider key in browser code;
- add a placeholder board, synthetic production response, wildcard upstream,
  or general forwarding proxy.

## Re-evaluation gate

Issue #46 may be completed only when every item in the required board contract
is evidenced, including permitted Tallinn samples. Public deployment is
complete and does not grant board-data rights. Until the independent Issue #46
gate passes, board UI, domain fields, Worker routes, secrets, caches, and
production mocks stay absent.
