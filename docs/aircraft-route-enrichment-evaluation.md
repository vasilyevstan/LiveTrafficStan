# Aircraft Plausible Route Enrichment

## Decision

Decision updated: **2026-09-25**

LiveTrafficStan uses ADSB.lol standing-route data for an optional
callsign-based **plausible route** on one selected live aircraft. This replaces
the dormant aviationstack evaluation and removes its account, secret, Worker
route, global quota, and Durable Object.

The feature:

- is enabled by default but starts no request on selection;
- makes one direct browser request only after **Find plausible route**;
- uses the same ADSB.lol ecosystem as live aircraft positions;
- requests one static route record from
  `https://vrs-standing-data.adsb.lol`;
- accepts only an exact normalized ICAO callsign;
- checks the selected aircraft's current position against the returned airport
  segments before displaying the result;
- labels the result as plausible rather than scheduled, filed, active, or
  authoritative;
- keeps successful results only in a bounded six-hour current-tab cache.

This is an engineering record, not legal advice. Provider terms, schemas,
hosting, and data can change and must be rechecked before a material contract
change.

## Source and licensing

Official evidence:

- ADSB.lol open-data API page:
  <https://www.adsb.lol/docs/open-data/api/>
- ADSB.lol API source:
  <https://github.com/adsblol/api>
- VRS Standing Data:
  <https://github.com/vradarserver/standing-data>
- VRS Standing Data license:
  [CC0 1.0](https://github.com/vradarserver/standing-data/blob/main/LICENSE)

ADSB.lol states that its public data is available under ODbL 1.0. The
underlying VRS Standing Data repository applies CC0 1.0. LiveTrafficStan shows
visible ADSB.lol and VRS Standing Data attribution and does not relicense either
source under the repository's Apache-2.0 code license.

ADSB.lol asks production users to make contact so application-breaking changes
are less likely. The project has already identified its public production use,
URL, request cadence, and attribution in the existing ADSB.lol provider
discussion.

## Data and transport contract

The direct request is:

```text
GET https://vrs-standing-data.adsb.lol/routes/{first-two-callsign-characters}/{normalized-callsign}.json
Accept: application/json
```

The browser:

- omits credentials;
- rejects redirects;
- bypasses browser cache for the request while still allowing provider/CDN
  cache policy to operate;
- enforces a ten-second deadline;
- rejects bodies larger than 32 KiB;
- accepts only JSON with the exact requested normalized callsign;
- validates every returned airport name, ICAO code, optional IATA code, and
  coordinate;
- treats `404` as no route and `429` as temporary provider throttling.

The source returned browser-readable wildcard CORS on bounded `200` and `404`
checks on 2026-09-25. The route request is a simple credential-free GET and
requires no preflight. The application CSP allows only the exact standing-data
origin.

## Identity and plausibility

The selected aircraft must provide:

- a canonical six-character ICAO24 address;
- a three-letter ICAO airline callsign followed by a valid route number;
- a finite current latitude and longitude.

Route-number normalization follows the published VRS standing-data convention:
leading zeroes are removed while retaining a valid zero when required, and
invalid mixed number/letter shapes fail closed. The request path is therefore
constructed only from a validated uppercase callsign.

The static route record can contain two or more airports. LiveTrafficStan uses
the first and last airports as displayed origin and destination and checks the
aircraft position against every consecutive route segment. A segment is
plausible only when the current position is within the larger of:

- 50 nautical miles; or
- 20 percent of that segment's great-circle distance.

The check includes both endpoints and the bounded great-circle segment. A
route outside that corridor is reported as unavailable rather than displayed.
This geometric check reduces obvious callsign-table mismatches; it does not
prove operational intent.

## Product semantics

The details panel says **Plausible route** and explicitly states that the result
is not:

- a filed flight plan;
- a schedule;
- a date-specific flight occurrence;
- confirmation of departure, arrival, diversion, cancellation, or status;
- an airport arrival/departure board.

No route data changes ADS-B marker position, freshness, polling, trails,
selection, metadata, aircraft history, or provider health.

## Request and cache behavior

Selection alone, aircraft refreshes, map movement, metadata updates, theme
changes, and history playback make no route request. Each user action starts at
most one cancellable request.

Successful exact-identity results may remain in a 32-entry least-recently-used
cache for six hours. The cache key contains normalized callsign, ICAO24, and
optional registration; current position is used for the initial plausibility
check but does not churn the cache as the aircraft moves. Explicit refresh
makes a new provider request.

Unavailable and failed results are not cached. No route response, URL, airport,
or attribution data enters Web Storage, IndexedDB, traffic history, the
service-worker cache, the Worker Cache API, KV, R2, or a Durable Object.

## Removed aviationstack path

The previous source tree contained a disabled aviationstack evaluation with a
server-held key, `/api/flight-route`, a 90-attempt rolling budget, and a
SQLite-backed Durable Object. It was never publicly enabled.

That machinery is removed because the accepted product requirement is now a
truthfully labeled plausible standing route, not a date-specific operational
flight association. The production environment may retain an unused legacy
secret until it is removed administratively, but no checked code or workflow
reads it.

Issue
[#44](https://github.com/vasilyevstan/LiveTrafficStan/issues/44)
must be reconciled with this decision: its date-specific provider-authorization
goal is intentionally superseded, not silently claimed as satisfied.

## Boundaries

- This feature does not solve ADSB.lol live-position `429` responses from
  Cloudflare shared egress.
- The standing route may be stale, absent, or wrong despite passing the
  geometric check.
- Private, registration-based, malformed, and unsupported callsigns remain
  unavailable.
- Airport arrival/departure boards remain a separate blocked capability under
  Issue #46.
- Public tracker pages, airline pages, widgets, and undocumented private APIs
  are not scraped.
