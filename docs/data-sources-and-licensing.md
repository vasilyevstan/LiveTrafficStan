# Data Sources and Licensing

This document records the data-provider checks made for LiveTrafficStan V1. Provider behavior and terms can change, so the linked official documentation must be rechecked before any public deployment.

## Map: OpenFreeMap

- Style service: <https://tiles.openfreemap.org/styles/positron>
- Documentation: <https://openfreemap.org/quick_start/>
- Terms: <https://openfreemap.org/tos/>
- Authentication: none
- Browser access: supported; the style endpoint returned `Access-Control-Allow-Origin: *` during V1 verification.
- Data: OpenStreetMap-derived vector tiles using the OpenMapTiles schema.
- Attribution: preserve the attribution supplied through the OpenFreeMap tile metadata, including OpenMapTiles and OpenStreetMap contributors.

OpenFreeMap is free and open, requires no application key, and is directly compatible with MapLibre GL JS. Its public service is provided as-is without an uptime guarantee. The style URL is therefore configuration rather than an application-wide assumption.

## Place search: Photon

- Public endpoint and service terms: <https://photon.komoot.io/>
- Project source: <https://github.com/komoot/photon>
- API documentation: <https://github.com/komoot/photon/blob/master/docs/api-v1.md>
- Default endpoint: `https://photon.komoot.io/api`
- Authentication: none for the current public endpoint
- Search mode: explicit forward search only; no autocomplete or reverse
  geocoding
- Result data: OpenStreetMap-derived
- OpenStreetMap copyright and ODbL attribution:
  <https://www.openstreetmap.org/copyright>

This decision was verified on 2026-09-19. Photon's public-service notice
expressly permits use for a project, asks clients to behave fairly, warns that
extensive use can be throttled, provides no availability guarantee, and
reserves the right to change the service. It does not publish a numerical
per-application quota or an SLA.

A bounded planning probe using `limit=3` returned HTTP 200, JSON, wildcard CORS,
three Tallinn results, and 1,139 response bytes. That synthetic-Origin probe was
header evidence only. The final real-Chrome acceptance check made one
`Tallinn Airport` request, received five bounded results, and proved current
browser CORS compatibility for the application's actual request shape. These
observations are not a permanent CORS or capacity guarantee.

LiveTrafficStan sends named text only after the user explicitly submits the
Location form. It sends `q`, `limit=5`, and `Accept: application/json`, omits
credentials, and adds no custom browser `User-Agent`, location bias, or
automatic retry. Valid decimal coordinates are parsed locally and never sent
to Photon. Browser-derived Home coordinates are never sent to Photon.

Submitted place text appears in the request URL, and the service receives
ordinary client network metadata such as the IP address. The interface states
this before use and makes no claim about provider retention. Successful and
empty results may remain only in a bounded 15-minute in-memory session cache;
they are not persisted, placed in application URLs, or used to build a
redistributed geocoding database.

The Location control visibly credits Photon and OpenStreetMap contributors.
Provider outage, timeout, invalid response, CORS failure, or throttling affects
only named search. Coordinate navigation, Home/Center, and the traffic map
remain available.

### Why public Nominatim was not selected

The official public-instance policy is:
<https://operations.osmfoundation.org/policies/nominatim/>.
It permits moderate user-triggered search, but its maximum one request per
second applies to the sum of all users of a website or application and it
prohibits client-side autocomplete. A browser-local limiter cannot enforce an
aggregate application-wide ceiling across independent users. Using public
Nominatim directly would therefore require an operational control this
static-first client does not have. Photon was the smaller compliant current
choice; no geocoder proxy or credential was added.

## Aircraft: ADSB.lol

- API: <https://api.adsb.lol>
- Documentation: <https://api.adsb.lol/docs>
- Open-data documentation: <https://www.adsb.lol/docs/open-data/api/>
- Source and rate-limit notes: <https://github.com/adsblol/api>
- License: Open Data Commons Open Database License 1.0 (ODbL 1.0)
- Authentication: none for the current public API
- Geographic query: `/v2/point/{latitude}/{longitude}/{radius}`
- Radius unit: nautical miles, maximum 250
- Rate limits: dynamic according to service load
- Browser access: the live endpoint did not return CORS headers during V1 verification

The deployed API documentation says the API is currently free to use, asks
production users to make contact so integrations are not broken accidentally,
and licenses public ADSB.lol data under ODbL 1.0. The API source repository
separately announces future feeder-linked API keys. Neither statement is a
capacity guarantee or current SLA.

LiveTrafficStan polls one small geographic query approximately every 20
seconds while the page and viewport are eligible. Because direct browser
requests are blocked by CORS, Vite proxies local development and preview while
the selected production Cloudflare Worker provides the strict same-origin
route.

The production proxy identifies the public project to ADSB.lol, forwards no
browser credentials or arbitrary headers, follows no redirect, and applies no
shared live-response cache. Fingerprinted application assets are cached
separately. Production is active; intermittent ADSB.lol throttling of
Cloudflare's shared outbound identity remains tracked in Issue #11.

Visible attribution must identify ADSB.lol and link ODbL 1.0. An interactive
map or screenshot is an ODbL Produced Work; a publicly used derivative
database has additional share-alike and machine-readable access obligations.
The application's Apache License 2.0 covers source code only; it does not
relicense provider data.

### Device-local history decision

The decision was rechecked on 2026-09-19 against the official
[ADSB.lol API page](https://www.adsb.lol/docs/open-data/api/) and
[ODbL 1.0 legal text](https://opendatacommons.org/licenses/odbl/1-0/).
ODbL section 3.1 grants extraction, creation of derivative databases, and
temporary or permanent reproduction. Its public-use conditions remain
distinct from a user's personal origin-local database.

Issue #9 persists an allowlisted normalized aircraft observation record only
when the user explicitly opts in and only for personal playback in that
browser origin. The application operator receives no copy. No export,
sharing, cross-device synchronization, backend history, service-worker live
response cache, or public retained-history publication is permitted by this
decision. Any such future use requires a new ODbL/provider-policy review.
ADSB.lol/ODbL attribution must remain visible during playback.

The implementation identifies this decision as
`adsb-lol-odbl-local-playback-2026-09-19` in every stored ADSB.lol row. Visible
ADSB.lol/ODbL attribution remains on the map during live and historical
display.

The normalized `category` field is treated as a reported ADS-B emitter
category. The bounded icon mapping follows the published
[DO-260B emitter category definitions](https://support.adsbexchange.com/hc/en-us/articles/44705224053517-Emitter-Category-ADS-B-DO-260B-2-2-3-2-5-2):
A1/A2 light or small fixed-wing, A5 heavy fixed-wing, and A7 rotorcraft.
A3/A4/A6 keep generic fixed-wing artwork and their existing truthful labels.
Missing and unsupported values remain generic. No aircraft purpose or exact
model is inferred.

### Why Airplanes.live was not selected

- Official API description: <https://airplanes.live/api-docs/>
- OpenAPI document: <https://airplanes.live/openapi.yaml>
- Candidate endpoint: `/v2/point/{latitude}/{longitude}/{radius}`

Airplanes.live was reevaluated on 2026-09-19. It publishes a compatible v2
point/radius contract, but a current bounded request returned `403` with an
instruction to contact the provider and did not establish browser CORS for an
authorized response. The OpenAPI Apache-2.0 metadata does not establish the
license for returned aircraft data. Its homepage language, general terms, and
contact-gated endpoint do not establish API-specific rate, caching,
redistribution, attribution, or public-display rights. ADSB.lol remains the
smallest verified option.

### Why OpenSky was not selected

OpenSky's default license is limited to approved non-profit research and
education, and a written license is required for operational REST API use in a
live product regardless of non-profit status. The terms also restrict
redistribution and retention outside the approved purpose. Technically, the
anonymous 400-credit daily allowance lasts about 2 hours 13 minutes at a
20-second cadence, authenticated access introduces protected OAuth credentials,
and the bounding-box state-vector response requires a different adapter.
ADSB.lol is both legally and technically the smaller current choice.

The complete dated comparison, request-volume calculation, rights analysis,
proxy handoff, and re-evaluation conditions are in
[Aircraft Provider Evaluation](aircraft-provider-evaluation.md).

## Aircraft photos: production Planespotters integration

- Photo API documentation and API-specific terms:
  <https://www.planespotters.net/photo/api>
- General terms:
  <https://www.planespotters.net/legal/termsofuse>
- Public endpoint:
  `https://api.planespotters.net/pub/photos/hex/{ICAO24}`
- Authentication: none
- Production enablement: explicit protected-build flag, currently enabled

The API-specific terms permit public/free display when the browser requests
JSON with a valid `Origin` or `Referer`, image bytes load directly from the
returned unchanged thumbnail URL, visible photographer credit appears beside
the image, and the thumbnail is an obvious plain link to the unchanged
Planespotters photo page without `nofollow`. API JSON may be cached for up to
24 hours; image bytes may not be stored, rehosted, proxied, or passed to another
client. Returned data may not be re-exposed through another API, feed, export,
or dataset.

LiveTrafficStan tightens the JSON cache to one hour and 32 current-tab entries,
shared only between its hover and selected-details controllers. It uses only
an exact six-character ICAO24 after **Load aircraft
photo** or a stable 500 ms fine-pointer hover, accepts only the documented
API/CDN/photo-page origins, shows the photographer credit and source link, and
writes no response, URL, credit, or image byte to application-managed storage.
Selection alone, HISTORY, and vessels never use the path.

The API-specific terms page has no visible dated revision. The separate general
terms state "As of: December 22nd, 2012", but that date does not prove when the
current API-specific obligations took effect. Exact-production-origin
acceptance on 2026-09-23 returned readable HTTP 200 JSON for `4CADF9`, loaded
the unchanged `https://t.plnspttrs.net` thumbnail directly, and preserved
visible photographer/source metadata and the exact photo-page URL.

The feature is enabled in production. A Worker proxy is not an authorized
workaround because it would conflict with the direct-loading and no-proxy/
no-re-exposure terms. See
[Aircraft Photo Evaluation](aircraft-photo-evaluation.md) for the exact
boundary, deterministic evidence, live result, vessel-image blocker, and
enablement requirements.

## Selected-flight routes: disabled aviationstack evaluation

LiveTrafficStan contains a disabled-by-default aviationstack evaluation path
for origin and destination on one selected live aircraft. It is not enabled in
the checked default build and does not claim schedule, delay, cancellation, or
diversion support.

The dated
[Aircraft Route Enrichment Evaluation](aircraft-route-enrichment-evaluation.md)
records the owner's decision to test aviationstack within the Free plan's
current 100-request monthly allowance while keeping public use blocked on
exact account terms and real samples.

- ADSB.lol and ADSBDB/VRS-style route lookups are callsign-based standing
  tables. ADSB.lol can additionally test geographic plausibility. Neither
  supplies date-specific operational intent.
- Airplanes.live publishes no dated operational route-association endpoint in
  the inspected schema.
- OpenSky flight endpoints provide previous-day-or-earlier track-derived
  estimated airports and require a written agreement for operational REST use
  in a live product.
- FlightAware AeroAPI and AeroDataBox are technically credible future
  candidates, but LiveTrafficStan has no applicable account, credential,
  accepted plan, approved budget, provider-specific identity contract, or
  authorized Tallinn sample.
- aviationstack exposes active flight, route, and aircraft identity fields but
  no opaque occurrence ID. The evaluation accepts only one active
  non-codeshare row with exact operating callsign and ICAO24, and fails closed
  for conflicting registration, ambiguity, or incomplete pagination.
- Public airport boards, airline sites, trackers, and widgets are not
  integration or republication licenses and will not be scraped.

[Issue #44](https://github.com/vasilyevstan/LiveTrafficStan/issues/44)
records the exact rights, identity, sample, cost, retention, attribution, and
credential evidence required before public enablement. The Cloudflare
secret-holding boundary is deployed; both route flags remain `false`.

Selection alone does not call aviationstack. Each accepted **Find route**
action reserves one of 90 global rolling-31-day attempts before one fixed
provider call; no retry, pagination request, shared response cache, or refund
exists. The key remains server-side, and only validated route fields reach the
browser. The current tab may reuse up to 32 successful exact-identity results
for up to six hours; failures are not cached and no route is persisted or
shared.

Heading, track, current position, geographic plausibility, nearby airports, and
Mictronics static metadata remain prohibited route inferences. No
aviationstack key or provider-derived fixture is committed while the source
gate is open.

## Airport arrival/departure boards: no active source

LiveTrafficStan does not currently display airport arrivals or departures.
Airport/time-window enumeration is a separate capability from selected-flight
origin/destination association.

The dated
[Airport Arrival and Departure Board Evaluation](airport-board-evaluation.md)
found technically credible commercial candidates, but no source currently has
the project account, accepted terms/order, approved budget, display and
combination rights, retention rule, secure credential, source-age contract,
and permitted Tallinn samples required for implementation.

- OpenSky's airport endpoints expose previous-day-or-earlier overnight
  reconstructed flights with estimated airports/times; they are not a current
  operational board, and operational REST use requires a written agreement.
- FlightAware AeroAPI exposes strong airport-flight operations and provider
  identity, but the project has no account/key/order/budget. Written
  combination permission may be required for use with ADSB.lol, and published
  documents state conflicting default retention periods that an accepted
  agreement must resolve.
- AeroDataBox exposes airport/time-window operations, but the project has no
  selected plan or key, and the inspected board rows do not carry the
  individual-flight `lastUpdatedUtc` contract. Coverage may be scheduled,
  delayed, asymmetric, or ADS-B-derived.
- aviationstack requires an account/key and no approved project plan,
  contract, budget, or source-age semantics exist.
- Public airport, airline, and tracker pages will not be scraped.

[Issue #46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46)
records the exact authorization and sample evidence required. No board is
constructed from visible aircraft, heading, proximity, callsign, static airport
points, or cached selected-flight lookups.

## Aircraft metadata: Mictronics aircraft-database

- Source repository:
  <https://github.com/Mictronics/aircraft-database>
- Pinned commit:
  `1724959f854f540c95f11872bcd377ecfeb698a2`
- Source publication instant: `2026-09-13T07:35:29Z`
- Internal database version: 522
- License:
  [Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/)
- Pinned archive SHA-256:
  `3f274f21154833d47cae45b5e847c3d47463a212c631384bc79493872beb44dc`
- Pinned license SHA-256:
  `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b`
- Immutable projected path: `/aircraft-metadata/2026-09-13-v1`

This decision was verified on 2026-09-19. The source README explicitly makes
its exports available under ODC-By and describes a weekly update process.
ODC-By permits use, extraction, modification, creation and conveyance of a
derivative database subject to its attribution and notice requirements.

ODC-By governs database rights. Its own preamble warns that it does not license
every independent right in individual contents and provides no warranty.
LiveTrafficStan therefore keeps only technical factual fields: ICAO24,
registration, type designator, model description, configuration, wake
category, and an ambiguity marker. It excludes owner, operator, photos, notes,
and similar personal or independently protected content. The source operator
directory is not linked to individual aircraft and cannot prove the current
operating airline.

The application conveys a derivative database under ODC-By 1.0. The full
license is stored beside the generated version, while `NOTICE` records the
attribution and explicitly separates this data license from Apache-2.0 source
code. When metadata appears in the selected-aircraft panel, visible attribution
links the Mictronics source and ODC-By and shows the snapshot publication date.

The exact normalized ICAO24 address is primary. Present live registration and
type must agree with the record; globally duplicated registrations are marked
ambiguous and unavailable. If live registration is absent, an exact ICAO24
record is labeled ICAO24-only and the database registration remains distinct.
No registration fallback, punctuation stripping, fuzzy match, callsign,
owner/operator, or airline inference is permitted.

No metadata request occurs at startup. Selecting an aircraft lazily loads one
same-origin index/type asset and at most one prefix shard. Complete validation,
stream byte caps, checksums, one total deadline, fulfilled-only caches, and
selection revisions keep failure local to the detail panel. Static metadata
never changes the live provider or its marker category.

The source publication date is dataset-wide age rather than per-aircraft
verification. This snapshot remains valid through the exact 45-day boundary
and becomes unavailable after `2026-10-28T07:35:29Z`. A date more than 24 hours
ahead of the client clock is invalid. Any source, schema, generator, or
generated-byte update uses a new immutable output path.

The full source comparison, measured projection, rejected alternatives,
matching rules, and re-evaluation conditions are in
[Aircraft Metadata Evaluation](aircraft-metadata-evaluation.md).

## Offline aircraft and vessel country allocations

Country rows in selected details are bundled identifier-derived context. They
make no runtime request and do not change traffic providers, normalization,
history records, persistence, map state, or selection.

### Vessel MID projection

- Source repository:
  <https://github.com/michaeljfazio/MIDs>
- Pinned commit:
  `ebcc3c8fbb7ada9df11f857e78db2400f1e08155`
- Source file: `mids.json`
- Source SHA-256:
  `94d4be029c1174af41b56426f9310155cf52d2ff331dd98ab0d19dd0c65ff58c`
- License: Apache License 2.0
- Cross-check: Wikidata properties P2979 and P297, structured data under
  CC0 1.0 Universal
- Canonical cross-check SHA-256:
  `ba83216afa73d6b6d0daec91b553a63968455a57b560c5902b7c5487f47fc53b`
- Retrieval review: `2026-09-19`

The Apache source has 292 MID mappings. The pinned CC0 cross-check has the same
292 unique MID values across 297 rows. Projection groups every row for a MID
before accepting it and retains only exact one-ISO agreement. Ten ambiguous or
ISO-less territory allocations are excluded: 204, 255, 303, 306, 501, 607,
608, 618, 635, and 665. The committed result contains 282 MIDs.

ITU's current allocation table and ITU-R M.585 / USCG guidance define the MID
and special MMSI semantics, but LiveTrafficStan does not redistribute their
publication layout or text. Only a safe integer with exactly nine digits, first
digit 2 through 7, and an included assigned MID can produce **Flag state**.
Group, coast, SAR-aircraft, handheld, craft-associated, AtoN, SART/MOB/EPIRB,
unassigned, conflicting, and malformed identifiers remain unknown.

### Aircraft ICAO24 projection

- Source repository:
  <https://github.com/ibosoftnet/icao-aircraft-addresses>
- Pinned commit:
  `2ac0f294274beddb57212eb7531ff87dfd869de5`
- Source file: `Hexadecimal Addresses (Amendment 92).csv`
- Source revision stated by the source:
  ICAO Annex 10 Volume III, Table 9-1, Amendment 92,
  effective `2024-07-22`
- Source SHA-256:
  `2a7bf997fee6ba7edaa83687a2179b903632a817f45172b4a6f531b872474166`
- License applied by the source repository: CC0 1.0 Universal
- ISO crosswalk: Wikidata P297 English-label result under CC0 1.0 Universal
- Canonical crosswalk SHA-256:
  `dca67d4d0f8ad71e1d068f146f50c51f2ebbd68e5e7c01cb2d205e2e0b18e264`
- Retrieval review: `2026-09-19`

The source has 196 non-overlapping rows. LiveTrafficStan excludes the Comoros
row because its declared zero count conflicts with range `035000-0357FF`,
rather than silently repairing it. The three `ICAO(1)`/`ICAO(2)` temporary or
special-use rows are also excluded. The committed projection contains 192
validated inclusive ranges.

The source is a third-party open-licensed factual transcription, not an ICAO
permission grant or live registry. LiveTrafficStan copies no ICAO publication
layout or explanatory text. Exact six-character hexadecimal addresses can
produce **Registration allocation** only within an included range. Gaps,
malformed addresses, excluded rows, and special-use blocks remain unknown.
Registration-prefix fallback is not implemented.

### Generated output and meaning

`src/config/countryAllocations.generated.json` contains 282 MID mappings and
192 ICAO24 ranges: 14,148 raw bytes and 5,394 deterministic gzip-9 bytes. It
has SHA-256
`f621390e58660f42a4c5351b7a93b0b4b1464c98e5add78f498fc6ecc918f7a9`.

`npm run check:country-allocations` validates it offline.
`npm run update:country-allocations` fetches only configured sources, enforces
byte/hash bounds, canonicalizes and hash-checks mutable SPARQL results, applies
the reviewed exclusion and ISO-alias inventory, and refuses changed bytes
under the existing output version.

The displayed country and ISO code describe identifier allocation only. They
do not establish operator, owner, crew, citizenship, departure, destination,
location, current jurisdiction, or verified current registration.

## Weather observations: NOAA/NWS Aviation Weather Center

- API documentation: <https://aviationweather.gov/data/api/>
- OpenAPI schema:
  <https://aviationweather.gov/data/schema/openapi.yaml>
- METAR endpoint: <https://aviationweather.gov/api/data/metar>
- NWS disclaimer and data-use terms: <https://www.weather.gov/disclaimer>
- Authentication: none
- Product: worldwide METAR terminal observations, including SPECI updates
- Published request limit: 100 requests/minute
- Published typical result maximum: 400 records
- Browser access: CORS is explicitly not permitted; server-to-server access is
  required
- Data status: U.S. government information is generally public domain unless a
  product is specifically marked otherwise

This decision was verified on 2026-09-19. A bounded planning request for EETN,
EFHK, EGLL, and KJFK returned HTTP 200, a 1,838-byte JSON body,
`Cache-Control: max-age=60`, and no browser CORS header. That observation proves
the current request shape only; it is not an availability, worldwide coverage,
or capacity guarantee.

LiveTrafficStan requests only explicit four-letter ICAO codes from the pinned
large/medium OurAirports projection inside the current eligible viewport. The
set is uppercase, sorted, unique, and capped at 50 without truncation. Enabling
the optional layer sends those visible station IDs through the application
host to AWC. The application and Worker do not log station IDs or raw
observations, but Cloudflare, AWC, and network intermediaries still process
ordinary request metadata.

The adapter renders only `METAR` and `SPECI`; schema-permitted `SYNOP`, `BUOY`,
and `CMAN` rows are not silently reclassified. It reads `icaoId`, treats
`obsTime` as Unix seconds, preserves qualified visibility such as `6+` or
`10+`, accepts numeric/`VRB` wind direction, keeps a missing flight category
as unavailable, and deterministically selects the newest valid report per
station. HTTP 204 is a successful empty set. Malformed nonempty payloads,
unrequested station IDs, redirects, timeouts, oversized responses, and unsafe
content types are errors.

There is no startup request or periodic poller. Request starts remain at least
60 seconds apart per browser session and honor longer `Retry-After` guidance.
Reports are current through 75 minutes and expire after 120 minutes. The
interface displays observation time, application retrieval time, source,
terms, and modified-presentation wording.

METAR/SPECI is observed aviation weather, not a forecast, airport operational
status, arrival/departure board, route source, or coverage guarantee. Coverage
is constrained by both AWC reporting and the reduced airport projection; an
empty response cannot establish that no weather exists. No radar, model
forecast, paid feed, provider selector, or weather-derived traffic inference is
added.

The reports are fetched at runtime rather than bundled or redistributed as a
database. Visible in-product attribution and this source record satisfy the
current provenance need; no additional `NOTICE` entry is required for this
slice. Recheck the official terms before public deployment or a retention,
cache, redistribution, or product-scope change.

## Marine traffic: Fintraffic Digitraffic

- Marine documentation: <https://www.digitraffic.fi/en/marine-traffic/>
- API instructions: <https://www.digitraffic.fi/en/support/instructions/>
- Terms: <https://www.digitraffic.fi/en/terms-of-service/>
- OpenAPI: <https://meri.digitraffic.fi/swagger/openapi.json>
- MQTT over WebSocket: `wss://meri.digitraffic.fi:443/mqtt`
- REST locations: `https://meri.digitraffic.fi/api/ais/v1/locations`
- REST vessel metadata: `https://meri.digitraffic.fi/api/ais/v1/vessels`
- Authentication: none
- License: Creative Commons Attribution 4.0 (CC BY 4.0)
- Required attribution: `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY`

Visible attribution links both the source and license and states that
LiveTrafficStan filters and normalizes the provider data.

CC BY 4.0 permits reproduction and adaptation, including applicable database
rights, subject to linked source/license attribution and an indication of
modification. Issue #9 retains provider-qualified normalized Digitraffic
observations in the same explicit opt-in, origin-local store as aircraft data.
Stored rows use decision ID
`fintraffic-cc-by-local-playback-2026-09-19`. No server, export, shared history,
or cross-device database is part of that decision. Destination, ETA, and
current-only enrichment remain excluded.

The provider was reevaluated on 2026-09-19 against AISstream.io, Datalastic,
and Kpler/MarineTraffic. It remains the only reviewed option that is keyless,
browser-native, and covered by a clear open-data license for this public map.
The complete matrix and bounded stream measurement are in
[Marine Provider Evaluation](marine-provider-evaluation.md).

Digitraffic is suitable for the current application:

- its AIS coverage returned current Tallinn-area vessel positions during verification;
- its REST location endpoint supports latitude, longitude, and radius filters;
- its REST API supports browser CORS, including the recommended `Digitraffic-User` header;
- its official browser example supports MQTT over secure WebSockets;
- its terms permit commercial and non-commercial reuse with attribution.

Digitraffic is a regional source, not a global AIS provider. Its official
material says marine data is gathered from Finnish Transport Infrastructure
Agency sources, the AIS service provides Class A position and metadata
messages, and fishing vessels are filtered upstream. No authoritative exact
coverage boundary or completeness guarantee was found. An empty result
therefore means no vessels are currently shown, not that no vessels exist or
that the location is known to be outside coverage.

Digitraffic recommends a five-minute REST fetch interval for both AIS locations and vessel metadata. LiveTrafficStan therefore uses MQTT for live position updates rather than over-polling the REST endpoint. REST supplies an initial location snapshot for the eligible viewport's conservative enclosing circle and a compact metadata snapshot, then MQTT updates positions and metadata in real time.

The live MQTT connection is reused while the eligible viewport changes, and
the provider-wide message cache is refiltered immediately. Viewport movement can
request a new bounded REST snapshot no more than once every five minutes.
Reconnect
attempts are spaced at least 15 seconds apart, keeping automatic retry below
Digitraffic's documented limit of five connection requests per minute per IP.

Browser requests identify the application as `LiveTrafficStan/1.0`; no personal information is included in the header or MQTT client identifier.

Vessel length and width are derived from the AIS reference-point dimensions:

- length = reference point A + reference point B
- width = reference point C + reference point D

Invalid or missing dimensions remain unavailable and are never guessed.

Digitraffic vessel metadata exposes the AIS ship type field defined by
[ITU-R Recommendation M.1371](https://www.itu.int/rec/R-REC-M.1371/en).
LiveTrafficStan maps only type 30 to fishing, type 52 to tug, 60-64/69 to
passenger, 70-74/79 to cargo, and 80-84/89 to tanker artwork. Reserved subcodes
65-68, 75-78, 85-88, and 95-98 remain unknown rather than being folded into a
defined category. Other towing, service, special-purpose, missing, invalid,
and unsupported codes retain the generic vessel silhouette. Names, navigation
status, speed, and destination do not change that classification. Digitraffic
currently filters type 30 fishing vessels upstream; the type-30 mapping remains
a truthful provider-boundary fallback if an authorized compatible source
supplies that code later.

The local filter taxonomy additionally groups 31, 32, 50-55, 58, and 59 as
`tug-service`; 20-24, 29, 33-37, 40-44, 49, 90-94, and 99 are known `other`.
This affects only normalized display filtering. It does not create another
provider category, alter marker inference, or change upstream traffic.

## Port context: Natural Earth Ports

- Repository: <https://github.com/nvkelso/natural-earth-vector>
- Source notes:
  <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/>
- Terms: <https://www.naturalearthdata.com/about/terms-of-use/>
- Tag: `v5.1.2`
- Commit: `f1890d9f152c896d250a77557a5751a93d494776`
- Source file: `geojson/ne_10m_ports.geojson`
- License/status: public domain
- Runtime access: optional immutable same-origin static asset

The source file is pinned by commit and SHA-256. The deterministic projection
retains only Natural Earth ID, name, scalerank, longitude, and latitude. It
contains 1,081 points and is distributed at
`/ports/natural-earth-v5.1.2-v1/ports.geojson`. The committed manifest records
the exact source/output checksums, counts, rank distribution, and measured
raw/gzip sizes; `npm run check:ports` verifies them without network access.

Natural Earth's port points are generalized and incomplete. Its official notes
warn that some locations may be approximate by up to 20 miles, and the dataset
omits relevant regional terminals including Muuga, Paldiski, and Porvoo. It is
therefore used only as optional geographic context. LiveTrafficStan does not
represent it as a port authority, current facility inventory, navigation aid,
coverage source, or operational harbour database, and does not infer a port
call, berth, facility, destination, ETA, or nearby-vessel relationship.

The layer is off by default and makes no startup request. First enable loads
the complete immutable asset under a deadline and byte cap, validates its
SHA-256 and full grammar, and caches only a fulfilled dataset for the current
session. Blocking or corrupting the asset leaves aircraft and marine traffic
unchanged. Source, projection, generator, or generated-byte changes require a
new immutable version path.

## Airport context: OurAirports

- Downloads and terms: <https://ourairports.com/data/>
- Data dictionary:
  <https://ourairports.com/help/data-dictionary.html>
- Repository: <https://github.com/davidmegginson/ourairports-data>
- Commit: `5ed85eed28722bea80ebdde9e255e09b1e7317a8`
- Source file: `airports.csv`
- Source publication instant: `2026-09-19T01:53:15Z`
- Source bytes: `12,725,082`
- Source SHA-256:
  `6c890e97b82939a2501938b32eb597b18d5c5ce803576d3193e2049a149a58bb`
- License/status: public domain
- Runtime access: optional immutable same-origin static asset

OurAirports releases all data to the Public Domain, requests but does not
require credit, and provides no guarantee of accuracy or fitness. Its exports
are updated nightly, but LiveTrafficStan pins one reviewed commit rather than
changing runtime data in place.

The deterministic projection retains every `large_airport` and
`medium_airport`, sorted by persistent numeric OurAirports ID. It contains
5,280 points: 1,174 large and 4,106 medium. The immutable output is
`/airports/ourairports-2026-09-19-v1/airports.geojson`, with 1,329,838 raw
bytes, 225,625 deterministic gzip-9 bytes, and SHA-256
`1edb55fe75653367895ed913f2725915ef0b529aed12eecf9d931ed8c38df9d6`.
`npm run check:airports` verifies the committed projection without network
access.

The source's persistent numeric `id`, `ident`, explicit optional `icao_code`,
explicit optional `iata_code`, municipality, country code, name, type, and
coordinates have distinct meanings. In particular, `ident` is not always an
ICAO code and is never substituted for a missing explicit ICAO field.
Municipality identifies the primary municipality served and is not necessarily
the physical municipality.

The layer is off by default and makes no startup request. First enable loads
and validates the complete immutable asset under a deadline, byte cap, exact
size, and checksum; only a fulfilled dataset is cached for the page session.
Failure remains separate from the map and traffic providers. The UI describes
the points as static reference context and does not infer current scheduled
service, operating status, navigation authority, routes, arrivals, departures,
or relationships to visible aircraft.

## Source-code license versus data licenses

LiveTrafficStan source code is licensed under Apache License 2.0 and includes a
`NOTICE` file identifying the original project and author. Under section 4 of
the license, distributed derivative works must retain applicable notices and a
readable copy of the `NOTICE` attribution. This is a permissive source-code
license: compliant derivative products may use different terms for their own
additions.

Runtime map, place-search, aircraft, and marine data retain their providers'
separate licenses and attribution requirements:

- map data: OpenStreetMap/OpenMapTiles/OpenFreeMap attribution
- place-search data: Photon with OpenStreetMap contributor/ODbL attribution
- live aircraft data: ADSB.lol, ODbL 1.0
- static aircraft metadata derivative database: Mictronics
  aircraft-database, ODC-By 1.0
- bundled vessel MID projection: michaeljfazio/MIDs, Apache-2.0, intersected
  with a CC0 Wikidata cross-check
- bundled aircraft address allocation projection:
  ibosoftnet/icao-aircraft-addresses, CC0 1.0, with a CC0 Wikidata ISO
  crosswalk
- marine data: Fintraffic Digitraffic, CC BY 4.0
- optional port context: Natural Earth Ports, public domain
- optional airport context: OurAirports, public domain

The application does not persist or redistribute a live traffic database. It
does distribute the separately identified static aircraft metadata derivative
database under ODC-By 1.0, the separately identified Apache-2.0/CC0 country
allocation projections, and the separately identified public-domain Natural
Earth port projection and OurAirports airport projection.
