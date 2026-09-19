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
separately. Permanent production activation remains tracked by Issue #39.

Visible attribution must identify ADSB.lol and link ODbL 1.0. An interactive
map or screenshot is an ODbL Produced Work; a publicly used derivative
database has additional share-alike and machine-readable access obligations.
The application's Apache License 2.0 covers source code only; it does not
relicense provider data.

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
LiveTrafficStan maps only type 30 to fishing, type 52 to tug, ranges 60-69 to
passenger, 70-79 to cargo, and 80-89 to tanker artwork. Other towing, service,
special-purpose, missing, invalid, and unsupported codes retain the generic
vessel silhouette. Names, navigation status, speed, and destination do not
change that classification. Digitraffic currently filters type 30 fishing
vessels upstream; the type-30 mapping remains a truthful provider-boundary
fallback if an authorized compatible source supplies that code later.

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
- aircraft data: ADSB.lol, ODbL 1.0
- marine data: Fintraffic Digitraffic, CC BY 4.0

The application does not persist or redistribute a derived traffic database in V1.
