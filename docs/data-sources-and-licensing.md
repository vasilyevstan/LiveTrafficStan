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
- Browser access: direct mode requires provider-approved CORS; current
  production remains on the same-origin Worker path

The deployed API documentation says the API is currently free to use, asks
production users to make contact so integrations are not broken accidentally,
and licenses public ADSB.lol data under ODbL 1.0. The API source repository
separately announces future feeder-linked API keys. Neither statement is a
capacity guarantee or current SLA.

LiveTrafficStan polls one small geographic query approximately every 20
seconds while the page and viewport are eligible. Vite proxies local
development and preview while current production uses the strict same-origin
Cloudflare route. The protected source also contains a fixed
`adsb-lol-direct` build mode, but that mode remains undeployed until ADSB.lol
approves browser production use and successful plus throttled responses expose
usable CORS.

The selected production-recovery transport keeps ADSB.lol as the sole
aircraft provider. A private, non-caching OCI relay uses one stable network
identity, the same fixed point route and User-Agent, one aggregate upstream
start per 20 seconds, and provider `Retry-After` backoff. It does not rotate
addresses, add a provider, alter attribution, or claim additional capacity
permission. Production application source
`e2b2afaa04466116719310d6286441f8e6ba60ca` uses active relay source
`18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8` through the fixed Workers VPC
Service and private Tunnel, with
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` retained as relay rollback; see
[OCI Aircraft Relay](oci-aircraft-relay.md).

The production proxy identifies the public project to ADSB.lol, forwards no
browser credentials or arbitrary headers, follows no redirect, and applies no
shared live-response cache. Fingerprinted application assets are cached
separately. The former shared-egress `429` remains relevant only to the
`worker-proxy` rollback/diagnostic mode. Current `oci-private-relay`
production requires an eventual real aircraft payload and treats provider
`429` as a failed activation rather than evidence of reliable delivery.
The production-access request is
[adsblol/website#272](https://github.com/adsblol/website/issues/272), and the
scoped upstream CORS proposal is
[adsblol/api#63](https://github.com/adsblol/api/pull/63). Neither an open issue
nor source support is an access grant.

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
an exact six-character ICAO24 on committed live selection or a stable
500 ms fine-pointer hover, accepts only the documented
API/CDN/photo-page origins, shows the photographer credit and source link, and
writes no response, URL, credit, or image byte to application-managed storage.
Startup, ordinary camera movement, HISTORY and vessels never use this path.

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
boundary, deterministic evidence, live result, and enablement requirements.

## Vessel photos: Open Waters lookup and reviewed Commons derivatives

Selected or stably hovered vessels without a bundled match can request
`GET /api/vessel-photos/{IMO-or-MMSI}`. The fixed Worker route retrieves
Open Waters' documented media response at
`https://openwaters.io/ais/vessels/media/{number}`. This route is necessary
because that metadata endpoint has no browser CORS allowance; it is not a
general image proxy. AISStream and Open Waters remain complementary traffic
feeds, but only Open Waters supplies this media lookup.

Lookup prefers a checksum-valid reported IMO, then an ordinary vessel MMSI.
The UI labels provider number/category matching separately from reviewed
exact-hull identity and warns that MMSIs can be reassigned. Only fully
attributed supported CC BY, CC BY-SA, CC0 or public-domain images are accepted.
The unchanged thumbnail loads directly from an allowlisted Commons image
host, anonymously and without referrer. Visible artist, file-page and license
credit stays beside it. Neither the provider lookup nor our code guarantees
that every current hull has a photo.

No coordinates, Home, search text, browser credentials or private AIS token
are sent. No photo metadata or image bytes enter backend archives, traffic
history, service-worker storage or IndexedDB. Full source review, bounded
transport, failure/empty distinction and tab-only retention are documented in
[Vessel Photo Evaluation](vessel-photo-evaluation.md).

LiveTrafficStan also retains eight bundled historical reference photographs selected
through a file-by-file review:

- Tarmo, IMO `5352886`;
- Finlandia, IMO `9214379`;
- Romantika, IMO `9237589`;
- Victoria I, IMO `9281281`;
- Viking XPRS, IMO `9375654`;
- MSC Magnifica, IMO `9387085`;
- Megastar, IMO `9773064`;
- MyStar, IMO `9892690`.

The original five vessels were observed through Digitraffic in the
Tallinn-Helsinki operating area during the 2026-09-26 review. Tarmo and
Romantika were observed live in Tallinn and MSC Magnifica in the Baltic Sea
during the 2026-10-02 expansion. Identity evidence binds the valid exact IMO to
one Wikidata item and one Commons image, then pins the reviewed Commons
file-page revision. Matching for this bundled fallback uses only the exact AIS-reported IMO of
the selected or stably hovered live vessel. It never uses MMSI, name, call
sign, class, sister ship, or fuzzy matching and never performs a runtime
Wikimedia/Wikidata search.

The selected file licenses are:

- CC BY-SA 3.0 for Tarmo, Finlandia, and Victoria I;
- CC BY-SA 4.0 for Romantika, Viking XPRS, MSC Magnifica, and Megastar;
- CC0 1.0 for MyStar.

The seven ShareAlike derivatives remain under their listed file-specific
license versions. Every source thumbnail was resized to a 640-pixel maximum
dimension and stripped of embedded metadata without cropping or retouching.
Visible selected-details credit includes author, fixed Commons revision,
license link, and modification notice even for the CC0 file, where attribution
is not required.

The repository's Apache-2.0 license does not relicense the image files.
`src/config/vesselPhotoManifest.json` records the complete identity, source,
revision, original/thumbnail measurements, rights, bundled measurements, and
checksums. The co-located
`public/vessel-photos/2026-10-02-v1/LICENSES.md` conveys the file-specific
credits and licenses.

Images are versioned same-origin static assets. The browser requests one only
when a matching live vessel details card renders or after a stable 500 ms
fine-pointer hover over that exact live vessel. The compact hover image links
the fixed Commons revision and shows author, source, license, exact-IMO, and
historical-reference context. No Wikimedia, Wikidata, tracker, gallery, image
API, Worker proxy, KV, R2, Web Storage, IndexedDB, or service-worker cache is
involved in the bundled fallback. A missing bundled match may use the dynamic
lookup above; historical and sub-dwell hover vessels do not. Historical source
`e2b2afaa04466116719310d6286441f8e6ba60ca` retains immutable generation
`2026-10-02-v1`; release #267 exact Chrome acceptance loaded all eight declared
assets with their image MIME types and one-year immutable caching, distinguished
missing/invalid IMO from valid-but-uncovered IMO, and made zero external
photo-provider request. See
[Vessel Reference Photo Evaluation](vessel-photo-evaluation.md) for the
complete reviewed inventory, validation, takedown, and yacht limitations.

## Selected-aircraft plausible routes: ADSB.lol standing data

LiveTrafficStan can show a callsign-based plausible origin and destination for
one selected live aircraft. A committed eligible selection starts one lookup;
hover, HISTORY, and same-flight position updates do not.

- ADSB.lol public data is identified as ODbL 1.0.
- The underlying
  [VRS Standing Data](https://github.com/vradarserver/standing-data)
  repository applies CC0 1.0.
- The browser requests one exact static JSON route from
  `https://vrs-standing-data.adsb.lol`.
- Visible attribution identifies both ADSB.lol and VRS Standing Data.
- Successful results may remain only in a bounded six-hour current-tab cache.

The route is accepted only when the exact normalized callsign matches and the
aircraft's current position is geographically compatible with at least one
returned airport segment. This is a local validation of standing data, not
evidence of a filed flight plan, schedule, date-specific occurrence, status,
diversion, arrival, or departure.

The previous disabled aviationstack evaluation, key, Worker route, global
attempt quota, and Durable Object were removed when the product requirement
changed from date-specific operational association to a truthfully labeled
plausible route. Issue #44 must be reconciled as superseded rather than marked
technically satisfied.

Public airport boards, airline sites, trackers, and widgets remain outside this
contract and are not scraped.

## Airport arrival/departure boards: no active source

LiveTrafficStan does not currently display airport arrivals or departures.
Airport/time-window enumeration is a separate capability from selected-aircraft
plausible-route enrichment.

The 2026-10-07
[Airport Arrival and Departure Board Evaluation](airport-board-evaluation.md)
identifies a genuine ongoing-free candidate, not a paid-plan prerequisite:
**AeroDataBox Basic via RapidAPI**, for a small noncommercial on-demand board.
Its 400 API units/month permit at most **200 uncached combined-board calls
shared across the whole app**, before other charged work. The actual project
free subscription/key, zero-overage limits and Tallinn coverage proof are still
missing. Published applicable terms can authorize the use; bespoke permission
is required only where those terms say so.

- The September OpenSky review found previous-day-or-earlier overnight
  reconstructed flights with estimated airports/times; they are not a current
  operational board, and operational REST use requires a written agreement.
- The September FlightAware AeroAPI review found strong airport-flight operations and provider
  identity, but the project has no account/key/order/budget. Written
  combination permission may be required for use with ADSB.lol, and published
  documents state conflicting default retention periods that an accepted
  agreement must resolve.
- AeroDataBox RapidAPI Basic is ongoing free; API.Market Basic is only a
  seven-day trial. A board call costs two units and permits a 12-hour window.
  Preserve visible linked attribution, minimized retention (standard maximum
  seven days), confidential server-held credentials and no bulk/API
  redistribution. Board rows have no general source-update timestamp or
  occurrence ID; retrieved-at and unknown source age must remain distinct.
  Coverage may be scheduled, delayed, asymmetric or ADS-B-derived.
- aviationstack advertises an ongoing $0 noncommercial 100-request/month plan
  with real-time flights and HTTPS; dedicated Flight Schedules is paid.
  A free airport-filtered operational board has not been proved.
- AirLabs has an airport-schedules endpoint, but its documented Free fields
  do not include the status, estimated/actual times and UTC fields needed here.
- Public airport, airline, and tracker pages will not be scraped.

[Issue #46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46)
records the actual account, contract and sample evidence still required.
There is no automatic board polling or paid fallback. No board is
constructed from visible aircraft, heading, proximity, callsign, static airport
points, or cached plausible-route lookups.

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

Country rows in selected details and available aircraft/vessel marker flags are bundled
identifier-derived context. They make no runtime request and do not change
traffic providers, normalization, history records, persistence, camera or
selection.

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

### Vessel flag artwork

The small ship-marker badge uses the same MID-derived ISO code, not a second
registration lookup or a claim about a vessel-specific ensign. Aircraft
badges reuse that same artwork with the existing exact-ICAO24 allocation,
not registration-string, callsign, airline or operator inference. Its source is
[flag-icons](https://github.com/lipis/flag-icons), pinned at
`086f7e97d657358203916dbe84f61c2bccaa81eb`, using `flags/4x3` under the MIT
license, Copyright (c) 2013 Panayiotis Lipiridis. The complete license is
distributed at `/licenses/vessel-flags-MIT.txt`.

`src/config/vesselFlags.generated.json` contains bounded pre-rasterized RGBA
pixels for exactly the 226 countries already represented by the accepted MID
projection, plus source, rasterizer and checksum records. Each 28x22 pixel
asset includes a contrasting frame and displays at 14x11 CSS pixels. Artwork
is bundled in JavaScript; displaying or rehydrating a flag fetches no image,
font, registry, flag CDN or provider data. All 192 country codes in the accepted
aircraft ranges are already covered by this unchanged artwork set. Special,
invalid or excluded MMSIs and aircraft addresses do not gain a flag merely
because artwork for a related country exists. The existing asset, image IDs,
source pin and full license path are retained for both traffic kinds.

For an intentional artwork update, retrieve the pinned repository archive into
a dedicated scratch directory and extract only `flags/4x3` and `LICENSE`.
With an isolated loopback Chrome/CDP session running, use
`node scripts/generate-vessel-flags.mjs <flags/4x3 directory> src/config/vesselFlags.generated.json <CDP port>`
from the repository root. The generator accepts only the existing MID
countries, rejects external/executable SVG content, blocks rasterization
network requests and records the actual source/pixel/license digests and
browser version. Retain the complete source license at the published path.
`npm run check:country-allocations` verifies coverage, complete pixels,
checksum, license and the one-MiB raw / 64-KiB gzip bounds. Review real-scale
rendering before changing the pin or pixels; CI never downloads flag artwork.

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

The 2026-10-04 evaluation retains this useful keyless regional source and adds
AISStream and Open Waters as optional complementary sources, without changing
Digitraffic's own terms or lifecycle. A regional receiver network is not the
benchmark for worldwide coverage. The current decision, historical comparison
and bounded stream measurements are in
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

## Marine traffic: AISStream and Open Waters AIS

Reviewed 2026-10-04 for #296. The optional supplement supplies normalized,
exact-MMSI-deduplicated observations through the same-origin
`/api/marine/stream` WebSocket. It does not replace useful Digitraffic
observations or turn any provider into a guaranteed global service.

**AISStream**:

- Service: <https://aisstream.io/>
- API and technical requirements: <https://aisstream.io/documentation>
- Privacy policy: <https://aisstream.io/privacypolicy>
- Fixed upstream: `wss://stream.aisstream.io/v0/stream`
- Authentication: private server-side `AISSTREAM_API_KEY`; never browser code,
  browser URLs or public logs.
- Service-use basis: the documentation describes proxying information clients
  need from an application server, prohibits direct browser connections and
  discusses persisting messages applications cannot afford to lose.
- Scope: best-effort public display of limited normalized observations,
  attributed metadata, bounded observed trails/playback and existing optional
  device-local history; no bulk raw feed or server-side vessel archive.
- Credit: linked AISStream attribution on the map and attributed selected
  records, retained through local playback.

This is use of the documented free service, not a claim that its returned
data has a blanket open-data licence. The MIT message-model/code licence and
privacy policy do not license the feed. An unanswered public question is not
an individual-written-permission requirement: follow actual applicable
published/account terms, rather than inventing a provider approval gate.

**Open Waters AIS**:

- Service and source licensing: <https://openwaters.io/ais/>
- Native API: <https://openwaters.io/api/ais/>
- Public policy and limits:
  <https://github.com/openwatersio/aiscast/tree/main/docs>
- Fixed upstreams: `wss://ais.openwaters.io/v1/stream` and metadata-only
  `https://ais.openwaters.io/v1/vessels`.
- Authentication: protected `OPENWATERS_AIS_TOKEN`. The separately protected
  identity private key is used for account ownership, not Worker deployment.
- Its public policy allows display/screenshots, normalized relaying, bounded
  caches/playback and device-local history, retaining original source terms
  and attribution. Aggregation does not relicense all received data.

| Original Open Waters source | Rights and attribution treatment |
| --- | --- |
| Digitraffic | CC BY 4.0; preserve `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY` |
| AISHub | Preserve AISHub credit; Open Waters' public policy records redistribution/commercial-use confirmation dated 2026-08-22 |
| Kystverket / BarentsWatch | Preserve Norwegian licence for Open Government data (NLOD), Norwegian Coastal Administration and applicable BarentsWatch credit; regional small-craft exclusions still apply |
| Volunteer receptions | CC0 reception data; the volunteer aggregate carries ODbL. Preserve Open Waters and the original attribution, not a uniform CC0 claim |
| AISStream | Retains the documented-service-use context above; receipt through Open Waters is not a new blanket licence |

The normalizer retains supplied source attribution. Known-source fallback
credits are used only when a message omits its credit; an unknown source
without usable attribution is not silently relabeled. Compatible metadata
fusion combines attribution without fabricating a new position source.
React renders these strings as text, not provider-supplied HTML. The map
links AISStream, Open Waters, AISHub and applicable NLOD/volunteer terms.

**Clocks and retention**: native position events carry the position clock.
Open Waters REST `seen` also advances for static messages and must never
refresh or manufacture a live position. REST enriches static fields only.
Missing motion, type, dimensions and class remain unavailable. Server-side
positions/metadata are bounded in memory; persisted SQLite state contains
only operational quota reservations and retry deadlines. No coordinates,
raw messages or vessel history are written there. This does not imply that
the upstream services have no archives or access logs.

The explicit local-history decision is
`marine-per-source-local-playback-2026-10-04`. New source rows require
attribution and retain provider identity, observation/receipt times, existing
retention limits, opt-in authorization and deletion controls. Existing
ADSB.lol/Digitraffic decisions are unchanged. Playback deduplicates vessels
without joining unrelated source trail segments; unknown metadata report
times are not backdated before receipt. IndexedDB database version 2 fences
older readers that would otherwise delete an unfamiliar provider. It retains
the same record schema, stores, consent, recording epoch and existing rows.
Rollback should disable the supplement on this compatible reader, not erase
history or restore a version-1 reader.

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

## Orbital objects: CelesTrak GP/OMM and SATCAT

Issue #162 selected CelesTrak's bounded `visual` group for the released
modeled layer. Issue #211's infrastructure contract expands the reviewed
source set, in fixed order, to `visual`, `stations`, `weather`, `gnss`, and
`science`. It continues to reject the broad `active`, the conflicting
`last-30-days`, and unreviewed large/specialized catalogs documented in the
source evaluation. Every group uses its exact GP/OMM JSON feed for
orbital elements and matching SATCAT JSON feed for public catalog type.
LiveTrafficStan joins and deduplicates only by canonical decimal NORAD catalog
ID and never infers payload, rocket body, debris, or unknown from a name,
suffix, orbit, mission, or source group.

The browser does not contact CelesTrak. One protected Cloudflare Cron may ask
the existing named SQLite Durable Object to atomically admit one ten-request
strictly sequential refresh at most once every two hours. Each GP response is
followed by its group's SATCAT response before the next group starts. Every
group validates unique IDs and a complete GP-to-SATCAT join independently;
validated extra SATCAT rows are ignored. The final union requires exact
cross-group type agreement and name/designator agreement after outer
whitespace normalization only. Newest valid OMM epoch wins, while equal-epoch
differing propagation fields reject the complete refresh.

Each response has a 10-second/512-record/512-KiB limit; the refresh has a
90-second/4-MiB limit; the complete publication has 512-record/512-KiB limits.
There is no truncation, parallel burst, retry, group fallback, rotation, or
partial publication. One successful union produces one final write to
`orbital:catalog:v2:curated-v1`. Browser requests read only
`GET /api/orbits/catalog`; they cannot start provider work or submit a group,
catalog ID, viewport, Home, geolocation, or selection.

The immutable schema-2 bootstrap contains the same normalized source contract
and provides a deterministic first deployment. The final coordinated
2026-09-30 probe produced 462 unique objects (369 `PAY`, 91 `R/B`, 2 `DEB`),
six non-conflicting overlaps, no missing joins, and 353,281 aggregate decoded
bytes. The normalized 239,460-byte bootstrap has canonical digest
`5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`
at `/orbital-data/curated-2026-09-30-v1/catalog.json`. Its path is
never reused; checksum and history guards require a new version for changed
bytes. The previous schema-1 KV key and both `v1` and `v2` bootstrap paths
remain intact for rollback.

Failed, blocked, malformed, oversized, partial, conflicting, or timed-out
refreshes preserve the prior complete schema-2 snapshot. Provider `301`, other
redirects, `403`, and `404` enter a reviewed blocked state; `429` and `5xx`
honor later readable `Retry-After` guidance up to seven days, while longer
guidance blocks for review. Catalog schema changes do not reset the Durable
Object's schema-1 admission state. There is no immediate retry, manual refresh,
browser fallback, provider fallback, or alternate source.

The selected groups are catalog membership, not statements that an object is
visible now, currently operational, scientifically active, transmitting, or
receiving navigation signals. Propagated positions are modeled locally with
SGP4 and must retain element epoch, snapshot retrieval/publication time, exact
SATCAT type, ordered source membership, and attribution. They are not live
telemetry, observed positions, naked-eye predictions, powered-ascent tracking,
reentry alerts, impact predictions, or conjunction assessment.

CelesTrak operates this public orbital-data service as part of its nonprofit
mission but does not publish a conventional formal license covering every
downstream caching and redistribution question. The selected basis is fixed,
noncommercial, minimum-necessary, attributed, value-added use with exact
provenance. Provider text was rechecked for the 2026-09-28 production
activation and the source expansion was probed on 2026-09-30. It must be
rechecked before any material source, group, cadence,
caching, attribution, or public-display change; a prohibition stops further
acquisition rather than introducing a fallback.

The full evidence, alternatives, observed group sizes/composition, cadence,
object-type contract, privacy boundary, and stop conditions are in
[Orbital Data Source Evaluation](orbital-data-source-evaluation.md). Browser
propagation, clock, viewport, lifecycle, and limitation semantics are in
[Orbital Tracking](orbital-tracking.md).

The SGP4 implementation is `satellite.js` 7.1.0, distributed under the MIT
License. That software license covers the propagation library, not CelesTrak
data. The exact package version is pinned because the browser worker imports
its JavaScript-only modules directly to avoid bundling optional Node/WASM
runtimes exposed by the package root. The distributed notice is
[`/licenses/satellite-js-7.1.0-MIT.txt`](../public/licenses/satellite-js-7.1.0-MIT.txt).

### Starlink bounded samples

Issue #257 uses CelesTrak's official fixed `GROUP=starlink` GP/OMM and SATCAT
JSON endpoints through the same protected server-side provider boundary. The
complete observed source is too large for this browser contract, so
LiveTrafficStan validates the full paired population before sampling. The
released schema-1 representation keeps 150 records selected by
`inclination-raan-systematic-v1`. Issue #271 adds schema 2 with exactly
512 records: 128 from each fixed inclination band `<48`, `48-<60`, `60-<85`,
and `>=85` degrees, selected through a deterministic 16 RAAN by 8
common-time-phase grid per band. Neither representation is described as the
full, active, operational, visible, or statistically representative
constellation.

Every GP record requires one exact NORAD SATCAT match; duplicates,
identity/type conflicts, malformed rows, partial responses, oversize bodies,
or impossible retrieval order reject the whole refresh. The immutable
`/orbital-data/starlink-2026-10-02-v1/` predecessor and
`/orbital-data/starlink-shell-balanced-2026-10-02-v1/` schema-2 catalog each
have a co-located notice pinning exact URLs, retrieval timestamps,
record/byte counts, source SHA-256 values, population, extra validated SATCAT
rows, algorithm, canonical digest, and sample size. Neither path is reused.

The browser never contacts CelesTrak and sends no viewport, Home, geolocation,
search, selection, cookie, credential, or referrer data. It reads only
same-origin `/api/orbits/starlink`. Starlink names and SATCAT types are source
facts; purpose, operational state, and curated NASA enrichment are not inferred
or transferred from a duplicate curated NORAD.

The first immutable acquisition started at `2026-10-02T08:40:00Z`. GP
completed at `08:40:03Z` with 11,125 rows / 4,699,409 decoded bytes / SHA-256
`acd397061a2d3880e50a9a703b208c9f568840303d85cbc3d13b0e5bc5349fdf`;
SATCAT completed at `08:40:05Z` with 11,125 rows / 3,684,028 decoded bytes /
SHA-256
`ca962c8ce2601f0c6ad43da8c9ba1d9ca720950fa3cbaf6ef5e23d5467b2ad45`.
The complete join had zero extra SATCAT rows. The schema-2 snapshot contains
512 records, occupies 254,275 bytes, and has canonical digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
The byte-for-byte predecessor remains 150 records / 74,982 bytes / digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.

Release #275 activates same-route negotiation without changing the provider
boundary. Default and legacy requests retain schema 1; the browser prefers
schema 2 and permits schema 1 as a freshness fallback. Each representation has
its own ETag and conditional `304`, responses use `Vary: Accept`, and the
other representation's validator returns `200`. No browser request, viewport,
Home, geolocation, search, selection, cookie, credential, or referrer is added
to the fixed server-side CelesTrak pair.

## Orbital context and images: official sources and Wikidata

Issue #193 adds no live metadata or image provider. Version
`2026-10-07-v1` retains nine exact-object official descriptions: Hubble, ISS, Terra,
Aqua, Midori II, ALOS-2, Hitomi, XRISM and ACS3. Purpose comes from official
NASA and JAXA mission pages, summarized factually with retrieval dates and
source digests. The two historical photographs still come from NASA Library
IDs `s125e011615` and `s132e012212`.

Issue #369 adds one **Community context** record for COSMOS 1953 / NORAD
`19210`, separately typed from official mission purpose. The exact
[Wikidata revision](https://www.wikidata.org/w/index.php?title=Q12753536&oldid=1609633724)
matches both NORAD and COSPAR and supplies historical launch/class/vehicle
facts. Wikidata [structured entity data is CC0](https://www.wikidata.org/wiki/Wikidata:Licensing);
this does not license Wikipedia prose, N2YO paragraphs or linked image files.
The app shows the source, revision, retrieval/review dates, CC0 license and
community/not-current-operation limitation. No new photograph is bundled.

N2YO's [documented API](https://www.n2yo.com/api/) does not expose the prose
shown on its satellite pages. Its [terms](https://www.n2yo.com/about/?a=terms)
assert content copyright; no bulk paragraph-reuse feed was established.
The app therefore supplies an explicit outbound reference, not copied or
embedded N2YO content. No API key, browser scrape, startup/selection request,
or new tracking provider is added. Missing English descriptions stay missing;
community class facts are not promoted into an authoritative individual mission.

The lookup requires the current NORAD ID, CelesTrak name, international
designator, and exact SATCAT type to match the reviewed record. Unreviewed
objects, including rocket bodies and debris, report exact purpose/image unavailable.
No mission, operator, payload relationship, or image is inferred from a name,
orbit, owner code, launch family, or catalog group.

Starlink details separately describe general internet-service context from
its official service overview, explicitly not an individual object's verified
purpose or operational state. This compiled, source-pinned text makes no
request and cannot transfer curated images or enrichment to the sample.

NASA's Images and Media Usage Guidelines say NASA content generally is not
subject to copyright in the United States and permit educational or
informational web use with requested credit, no endorsement implication, and
continued protection for NASA identifiers. The visible credit is
**Photo: NASA**. LiveTrafficStan uses no NASA insignia or logotype as
application branding.

The exact source pages, retrieval dates, HTML/metadata/image SHA-256 values,
dimensions, byte counts, identity chain, rejected sources, request boundary,
and stop conditions are in
[Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md).
The media-specific notice is co-located at
[`public/orbital-enrichment/2026-10-07-v1/LICENSES.md`](../public/orbital-enrichment/2026-10-07-v1/LICENSES.md);
the photographs are not covered by the repository's Apache-2.0 code license.

The manifest is compiled into the browser, so purpose adds no request. Image
bytes use immutable same-origin Static Assets only after exact selection. The
application bounds the load to five seconds and the exact manifest byte count,
then validates the declared media type and SHA-256 before creating a
session-only Blob URL. Only that validated URL can enter selected details or a
later tooltip. Ordinary hover therefore makes no image request and never
contacts NASA. External NASA requests happen only if a user follows a source
or policy link.

Cache-disabled production acceptance for source
`96d67b6da3e395be79acff27b47ad6dee34de309` received each exact asset once
as uncached `200 image/jpeg` with the manifest content length and
`Cache-Control: public, max-age=31536000, immutable`. It observed no NASA
runtime request, no Service Worker image response, one shared validated ISS
Blob URL in details and tooltip, truthful no-image fallback for exact rocket
body NORAD `733`, and terminal-failure no-retry behavior.

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
- optional supplemental marine data: AISStream documented service use and
  Open Waters AIS with its original per-source terms and attribution
- optional port context: Natural Earth Ports, public domain
- optional airport context: OurAirports, public domain
- modeled orbital elements and catalog type: CelesTrak GP/OMM and SATCAT,
  provider attribution and use-policy review required
- orbital propagation software: `satellite.js` 7.1.0, MIT
- exact-NORAD orbital purpose: official NASA mission pages, pinned provenance
- two historical exact-object photographs: NASA informational media guidance,
  visible `Photo: NASA` credit, separate co-located notice

The application does not operate a server-side vessel history archive or bulk
raw-data service. Limited normalized live records are relayed to interested
viewers; optional origin-local history remains under explicit user control.
It does distribute the separately identified static aircraft metadata derivative
database under ODC-By 1.0, the separately identified Apache-2.0/CC0 country
allocation projections, and the separately identified public-domain Natural
Earth port projection and OurAirports airport projection.
