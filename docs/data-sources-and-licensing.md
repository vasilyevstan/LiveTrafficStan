# Data Sources and Licensing

This document records the data-provider checks made for LiveTrafficStan V1. Provider behavior and terms can change, so the linked official documentation must be rechecked before any public deployment.

## Visitor analytics

TrackStan uses the free [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/)
product for aggregate visitor statistics on **`https://trackstan.xyz` only**.
The approved geographic scope includes EU visitors. The backup Workers origin,
local development, previews and PWA-retirement builds do not install the beacon.
There is no custom dashboard, paid analytics plan, tag manager, session replay,
custom interaction event, persistent visitor identifier or analytics proxy.

The official hosted module is
`https://static.cloudflareinsights.com/beacon.min.js`; its manual collector is
`https://cloudflareinsights.com/cdn-cgi/rum`. Cloudflare documents a cookie-free
product without browser-storage or fingerprint-based visitor tracking.
The dashboard is aggregate, but **transmission is per-page RUM data**, not just
anonymous aggregate counters. Cloudflare receives ordinary request/network
metadata and load/vitals payloads, including a per-page identifier, timing,
browser/device information and performance attribution. Do not claim that
the hosting/analytics provider never receives an IP address or that using a
cookie-free product settles every operator privacy/legal obligation.

The manual beacon uses `spa:false`. Map movements, selection, menus,
Home/location/search, sharing, preference reset and fullscreen are not pages.
Page URL/referrer reporting omits query strings and fragments; TrackStan adds
no coordinates, submitted text, selected-object identity or device-local
history as analytics fields. Result DOM IDs and relevant detail-heading ARIA
IDs are opaque React IDs because Web Vitals attribution can include a DOM
selector. Exact object IDs remain in models, keyed rendering and selection,
not those selector strings. Review actual outbound payloads, including vitals
attribution, rather than treating sanitized page URLs as sufficient proof.

The hosted script is mutable and runs with normal page-script access.
There is no supported immutable version/SRI promise here; TrackStan does not
vendor, modify, proxy or monkey-patch it. This is an explicit vendor-trust
boundary, not a guarantee that future vendor code cannot change collection.
Script-load failures receive one sanitized application console warning and
never block the map, traffic, search, history or installed-app update.
Collector failures may produce native/vendor network diagnostics; the
application does not suppress them, retry them or provide another collector.

Use Cloudflare's account **Web Analytics** dashboard for visits/page views,
referrers, countries, browsers/devices and performance:

- [Visits](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/)
  are direct/referrer-defined entries, **not unique people**; one visit can
  contain several page views.
- [Dimensions](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/)
  support aggregate filtering. UTM tracking and custom events are not part of
  this integration.
- [Current retention/sampling](https://developers.cloudflare.com/web-analytics/faq/)
  is six months of dashboard history, with received unsampled data retained
  for seven days and older aggregation around 10% of original volume.
  Adaptive sampling and blockers, old browsers or network failure can affect
  counts; do not interpret them as an exact census.

The account now uses manual JS installation (`autoInstall:false`), verified
after authorized Manage site setup on 2026-10-13. The earlier protected PUT
was denied and was not retried. The origin's root/index
`Cache-Control: no-transform` remains an additional duplicate-injection guard,
leaving the single source-controlled manual beacon.
The public installation token grants no account administration or dashboard
access. See [setup, read verification and disabling](hosting-and-deployment.md#manual-web-analytics-account-setup-440).

Fresh manual collection is accepted as of 2026-10-13: a native official
page-load POST returned `204` with the correct allow-origin, and a protected
exact-host read subsequently returned **1 page view / 1 visit, sampling
interval 1**, after an initial complete zero result. #448 preserves the
earlier `404` evidence and resolution without a token/app change. The counts
are dashboard-backed received data, not unique-person counts or proof of
every dimension, country or physical device. See the dated runtime receipt
for exact windows and the aggregation delay.

## Device-local Saved identities

Saved objects are an origin-local browser identity list, separate from public
object links, fragment view sharing and opt-in IndexedDB history. Records
contain canonical ICAO24, MMSI, NORAD, OurAirports ID or Natural Earth
`ne_id`, plus bounded save-time display/corroboration hints. They contain no
coordinates, trails, provider payloads, orbital elements, modeled positions,
photos, Home, camera or history observations.

The list is not sent to TrackStan, Cloudflare Web Analytics, providers, object
sharing, a service worker, an account, sync, export or backup endpoint.
Rendering it makes no request. A later explicit Find/Locate/catalog/orbital
action retains the existing provider disclosure, rate, cancellation,
attribution and privacy boundary.

Aircraft ICAO24 and vessel MMSI can be reassigned or spoofed; registration and
valid reported IMO are corroboration rather than ownership or immutable
airframe/hull truth. NORAD state is modeled from accepted catalog elements,
not observed or live. Static airport/port references inherit the pinned
OurAirports/Natural Earth snapshot limits.

Anyone using the same browser profile can inspect Saved. TrackStan provides no
account separation or application lock. Clear Saved removes the active Saved
document from that origin/profile boundary but cannot remove screenshots,
clipboard copies, browser/OS backups, provider logs, existing public links or
separate private-history rows. Removing an installed shortcut may leave
browser site data intact.

## Public object links

**Share object** is explicit publication of a small public aircraft, vessel or
orbital snapshot through the existing Cloudflare Worker and one D1 database.
It is distinct from fragment-only Share view and optional device-local history.
Anyone with the URL can open it during its 24-hour server lifetime; the random
token is a bearer link, not authentication, encryption or a secrecy promise.
Do not publish private information through it.

The record contains a version, object kind/canonical identifier, bounded public
label, compatible registration/IMO/designator, necessary source attribution,
optional three-decimal public object position and its real observation/model
instant, and server creation/expiry. Orbital context also retains exact SATCAT
type, originating owner, snapshot digest/retrieval and element epoch, never
elements. New records also contain the visible `light | dark` display theme,
not the sender's saved Auto preference. This is a recipient visit-only
override, not a saved preference transfer. Legacy records omit it.
A link explicitly created in View from here adds only the orbital
`view: "from-here"` intent. The recipient uses its current valid model, not a
stored eye, attitude, look direction or playback time. It does not contain sender Home, full camera, other preferences, search
text, free-form messages, photos/enrichment, provider payloads, trails or
private history.

Source credits remain ADSB.lol; Fintraffic Digitraffic and applicable
AISStream/Open Waters contributors; or the actual orbital source
Space-Track.org / USSPACECOM or CelesTrak. Existing provider rights and
modeled-not-live/not-optical caveats remain. Schema validation does not certify
sender-supplied source, name, position or time as a provider observation.
Opening a snapshot adds no external identifier lookup. A validated satellite
link enables the existing ORBITS channels for that session unless an explicit
layer choice wins; ordinary startup and saved preferences remain unchanged.
These are the normal same-origin cache-only curated/bounded-Starlink reads,
not direct GP acquisition or arbitrary satellite discovery. Ordinary eligible
map reception and a real selection retain their existing provider/metadata/
photo contracts.

The quiet Earth day/night overlay is a local approximation using displayed
time, with a soft night-side transition rather than a drawn boundary. The
512x512 shade image is generated in memory, not requested from an imagery
service. It adds no solar-data provider, request or persistence and is not
an atmospheric twilight model,
spacecraft lighting, eclipse or optical-visibility prediction. Existing
basemap and orbital source credits remain required.

An exact token path redirects to the root fragment without reading the record.
Startup strips the fragment before analytics. Fixed sharing requests carry
tokens/records in same-origin POST bodies, omit browser credentials/referrer,
and are outside HTTP/application-shell caches. Application logs do not record
the token, identity, coordinates or body. Cloudflare necessarily handles the
short-path request and API data; this is not a claim that hosting infrastructure
receives no request metadata or retains no operational records.

Resolution checks expiry against server time. Bounded scheduled deletion
removes expired active records; delayed cleanup does not extend validity.
Daily per-kind/identifier aggregate counts retain 30 UTC days, without
tokens, positions, visitor IDs, IP/referrer/user-agent history or a clickstream.
Active-data deletion is not instantaneous vendor-backup erasure:
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) document
7-day Time Travel on Free (30 days on Paid), and
[point-in-time recovery](https://developers.cloudflare.com/d1/reference/time-travel/)
is always on. Do not restore old public links/counters as a routine rollback.

Native Cloudflare Web Analytics remains unchanged and cannot count custom
share actions or rank objects. Fixed queries in the existing authenticated
Cloudflare D1 console count
**created links**, not messages sent, and **valid resolutions**, not unique
people, bot-free opens or confirmed rendered selections. Public identifiers
can be reassigned; popularity is not a verified physical-object/owner history.
GitHub Actions is public for this repository; protected dispatch does not
make its job summaries private. Setup publishes only qualification checks
and synthetic measurements, not account usage or sharing statistics.
See [private queries, caps and retention operations](hosting-and-deployment.md#exact-object-sharing-operations).

## Map: OpenFreeMap

- Style service: <https://tiles.openfreemap.org/styles/positron>
- Documentation: <https://openfreemap.org/quick_start/>
- Terms: <https://openfreemap.org/tos/>
- Authentication: none
- Browser access: supported; the style endpoint returned `Access-Control-Allow-Origin: *` during V1 verification.
- Data: OpenStreetMap-derived vector tiles using the OpenMapTiles schema.
- Attribution: preserve the attribution supplied through the OpenFreeMap tile metadata, including OpenMapTiles and OpenStreetMap contributors.

OpenFreeMap is free and open, requires no application key, and is directly compatible with MapLibre GL JS. Its public service is provided as-is without an uptime guarantee. The style URL is therefore configuration rather than an application-wide assumption.

### Existing-vector map detail

Grass, farmland, rock, sand, wetland and close-zoom building geometry reuse
the same OpenFreeMap/OpenMapTiles source and its existing attribution.
Ordinary top-down land-use shading, rail corridors, earlier road names and
ranked named station/ferry/civic labels use that same source. These names
are static cartographic context, not live observations, application discovery
results or independently selectable objects. Coverage and label availability
depend on actual tile content and native collisions; an allowed class is not
a promise that its names exist at every zoom. Existing hosted fonts can load
additional glyph ranges; the matched trial observed approximately 24 kB for
one range, with no additional geographic tile URLs.

Building heights may be derived from OSM levels; they are approximate cartographic
context, not surveyed heights. Unknown/ambiguous default heights and hidden
outlines are not extruded. No new lookup, feed, dataset download or imagery
service is added for these vector details.

## Optional land relief: Mapzen Terrain Tiles

- Registry: [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/).
- Documentation: [Tilezen/Joerd](https://github.com/tilezen/joerd/tree/master/docs).
- Fixed public browser tile path:
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
- Rights: [required source attribution and licenses](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
  and [underlying datasets/resolution/known issues](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md).
- No account, application key, paid service, proxy or upstream credentials.
  An actual public GET with Origin returned HTTP 200 and
  `Access-Control-Allow-Origin: *` on October 19, 2026.

RELIEF is on by default, with a session-only off switch in Layers. Reload
and Reset preferences restore on; there is no saved relief field.
Supported views can therefore contact Mapzen/AWS at startup. The browser
loads coarse 256 px Terrarium DEM tiles only for native hillshading,
with a source maximum zoom of 7. Terrain geometry is not enabled, no numeric
height/depth values are inferred from shading, and no navigation, optical
accuracy or surveyed-building claim is made. It is separate from DEPTHS.
The dataset combines older source products: the documented v1/v1.1 builds
date to 2016/2017, with no promise of regular global updates. Tile URLs reveal
the requested map area to AWS. No browser credentials, personal headers,
Home coordinate payload, application persistence, backend archive or shell
cache is added. Native HTTP caching and in-memory map tile handling remain.

The map's relief credit links to the complete contributor/license notice;
OpenFreeMap/OpenMapTiles/OpenStreetMap and other existing credits remain.
Underlying terrain rights are not the application's Apache-2.0 license and
are not a blanket CC0 claim. Required contributor credit includes ArcticDEM
(NSF awards 1043681, 1559691, 1542736; DigitalGlobe-derived DEMs), Geoscience
Australia/Commonwealth of Australia 2017, Austria's open DGM, Canada under
the Open Government Licence, EU-funded Copernicus EU-DEM, NOAA ETOPO1,
INEGI Continental relief 2016, New Zealand LINZ/Crown copyright 2011,
Kartverket, the UK Environment Agency 2015, and USGS 3DEP/GMTED2010/SRTM.
The linked official attribution page provides the exact required notices
and individual license links. Preserve that accessible notice when using
the public tiles; do not relabel their source or imply current survey data.

Native source errors are isolated from traffic and the basemap error path.
An unavailable activation does not silently substitute another terrain
service or automatically retry on theme/style changes. Only explicit
off/on starts a new activation. The public endpoint is as-is, not an
application SLA or proof of physical-device performance.

## Modeled water depths: EMODnet and GEBCO

DEPTHS is enabled by default, using the public services below without an
account, key, paid plan, new tileserver or proxy. Models are approximate
seabed context, not live soundings, forecasts, tide corrections, clearance,
navigability or a safe course. Preserve both source names and these limitations.

### Matched global shading

- [Official WMTS capabilities](https://tiles.emodnet-bathymetry.eu/wmts/1.0.0/WMTSCapabilities.xml)
  advertise `baselayer` and `baselayer_land` with matching Web Mercator
  matrices, a `2020` URL release and 256 x 256 PNG tiles.
- Fixed image paths:
  `https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png`
  and the matching `/baselayer_land/` path. The app limits source zoom to 12
  rather than treating further enlargement as new source detail.
- [World Base Layer v1 metadata](https://sextant.ifremer.fr/geonetwork/srv/api/records/386fe2aa-84c4-4cea-9e22-fcba4d5f2e75/formatters/xml)
  identifies EMODnet **2018** around Europe (about 100 m) and GEBCO **2019**
  elsewhere (about 500 m), with a separate land compilation. The `2020`
  URL is a product release, not a current survey year.
- The app removes the matched land alpha from the colored image. It does not
  recolor land, replace OpenFreeMap or derive numerical depth from image
  colors. Browser CORS and actual alpha were verified, not inferred from
  `TRANSPARENT=TRUE`.

Raw EMODnet mean and GEBCO relief WMS images proved opaque over land.
The separately published EMODnet `mean_multicolour` image has transparent
land, but is not interchangeable with a single-band elevation layer.
Combining GEBCO 2026 imagery with an older EMODnet land mask produced coastal
fringes and was rejected. Only the matched world-product pair is used.

### Actual numeric grid values

The browser uses bounded single-value WMS 1.1.1 GetFeatureInfo, maximum twelve
stable candidates and two concurrent requests, after settled zoom 10+ views:

| Service | Data and interpretation |
| --- | --- |
| `https://ows.emodnet-bathymetry.eu/wms`, `emodnet:mean` | Complete JSON FeatureCollection, at most one `Depth`; negative elevations become approximate positive metres below LAT. Current service is documented as DTM 2024. |
| `https://wms.gebco.net/mapserv`, `GEBCO_LATEST_2` | Strict single-feature text with returned cell coordinates and `value_list`; current latest grid was 2026 at source review. Metres relative to nominal MSL, with shallow/coastal-source datum exceptions. |

EMODnet uses a one-pixel virtual image. GEBCO queries pixel `(1,1)` in a
`3x3` virtual image over the same one-grid-cell bounds, still requesting only
one feature, not an image or nine values. The real Monterey check found
GEBCO's `1x1` request returned its explicit `Search returned no results.`
text at a valid ocean cell, while the center-pixel request returned `-854`
at the matching native cell. A longitude-wrapping control stayed empty;
no alternate-longitude workaround or extra fallback request was added.
That exact complete empty form is valid no-data, never zero depth; malformed
or additional content and mismatched coordinates still fail closed.

[DTM 2024 metadata](https://sextant.ifremer.fr/geonetwork/srv/api/records/cf51df64-56f9-4a99-b1aa-36b8d7b743a1/formatters/xml)
describes the 1/16-arc-minute EMODnet grid and LAT reference.
[GEBCO's product documentation](https://www.gebco.net/data-products/gridded-bathymetry-data)
describes its 15-arc-second global grid and vertical-datum limitations;
the 2026 product DOI is `10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa`.
`LATEST` is mutable, not a pinned 2026 numeric endpoint.

These newer numbers and older shaded imagery are **not the same survey/date**.
Source selection is per entire local viewport, never mixed LAT/MSL numbers
within one batch. Rendered ocean polygons exclude inland/dry areas. Complete
empty JSON/text, explicit null/NaN and nonnegative elevations mean no printable
underwater value, not zero depth; malformed or implausible data is an error.
Labels remain in metres regardless of presentation-unit preference.
The app does not use WCS or its observed inappropriate radiance-unit metadata
to infer units; the authoritative bathymetric product descriptions apply.

### Rights, attribution and privacy

[EMODnet's composite-DTM documentation](https://www.emodnet-bathymetry.eu/composite-dtm)
states that its harmonized DTM is available without restriction; this is
distinct from the access/rights of underlying original surveys.
The [EU catalogue record](https://data.europa.eu/api/hub/search/datasets/emodnet_bathymetry?locale=en)
identifies public access and the European Commission reuse notice /
[Decision 2011/833/EU](http://data.europa.eu/eli/dec/2011/833/oj).
Retain product provenance and applicable third-party/source notices rather
than treating access metadata as a blanket license for original survey data.

GEBCO's primary grid product page identifies the grid as **public domain**,
free of charge, with requested attribution and its
[conditions/disclaimers](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use).
It is not described here as CC BY 4.0. The app's Apache-2.0 source-code license
does not replace the source products' terms. Layers/Sources and native map
credits retain EMODnet/GEBCO; OpenFreeMap/OSM credits remain intact.

Only the three fixed source origins are added to `connect-src`. Requests omit
credentials/referrer and reject redirects; they necessarily reveal the
requested map area, potentially including the currently viewed Home area.
No extra browser location is attached. The app does not claim control over
provider retention. Complete imagery/value caches are bounded and tab-only;
no sample locations enter preferences, private history, the service-worker
shell cache or a backend archive. Moving/disabling/hiding/offline/unmounting
cancels obsolete work; Retry-After and eight-second deadlines are enforced.
Optional-source errors do not become traffic or basemap outages.

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

## Explicit object lookup: ADSB.lol and Open Waters

One Find input combines distinct source contracts, not a global directory or
merged traffic feed. Typing searches received observations, cached Digitraffic
identities with their original metadata timestamps, and loaded catalogs locally.
Explicit named **Search** sends text to Photon for places, and compatible
ship/aircraft queries to their existing bounded endpoints. Submitted text
appears in the Photon URL; Home/current view coordinates are not added as
bias. Valid decimal coordinates never reach any search provider. There is no
typeahead, reverse geocoder, new provider or persisted query/result.

The first explicit named Search reads the same pinned airport/port assets,
independently of marker visibility, reusing any existing layer/weather load.
It adds no catalog endpoint, credential, geocoder or provider query. Result
navigation opens static OurAirports/Natural Earth details, not a live entity
or inferred airport/port operation. Markers may stay completely off; airport
boards and weather retain their own explicit request/enable boundaries.

Explicit aircraft lookup uses only ADSB.lol's documented
`/v2/hex/{icao24}`, `/v2/reg/{registration}` and `/v2/callsign/{callsign}`.
It is partial receiver coverage, not an aircraft-name directory. Preserve
ADSB.lol/ODbL attribution. Snapshot `now` is epoch milliseconds and `seen_pos`
is seconds: only `now - seen_pos * 1000` establishes position time.
Receipt time or ordinary `seen` is not a substitute. Missing/old positions
remain identity-only; a qualified **Go to last report** is not a live selection.

Anonymous Open Waters lookup uses the documented
[`/v1/vessels`](https://openwaters.io/api/ais/) name-prefix search and exact
MMSI route. The free service returns at most 50 identities; cap/truncation
and partial receiver coverage are disclosed. Exact IMO lookup is not available
on this anonymous path. No account, token, payment or scraping is added.
REST `seen` can advance on static reports and is not an original position
clock. Consequently **all identity/metadata lookup geometry is discarded**;
identity search alone never permits navigation.

An explicit **Locate** on a ship identity separately requests that exact
supported MMSI's [`/v1/vessels/{mmsi}/track`](https://openwaters.io/api/ais/) over
one captured 24-hour window, with `interval=0&limit=1&format=geojson`. The explicit
zero interval selects newest-first limiting; `limit=1` alone is not treated as
proof of newest. The Worker requires the exact echoed identity/window, original
aligned observation time, zero or one valid point and complete contributing
credits within 32 KiB. A valid empty response is distinct from HTTP, malformed,
oversized or incomplete failure. It performs no pagination, second-source
fallback, token use, cache, polling or archive download.

A qualified report may navigate once to a dated local view. Report/retrieval
times and original track credits remain visible, with no current-position or
live-reception promise. Locate does not manufacture a traffic entity, marker,
count, selection, trail, enrichment/photo request or history record. Ordinary
reception after navigation keeps its independent filters/freshness contract.
Safe map framing, including the conservative absolute 85-degree latitude bound,
is separate from whether the provider has a geographically valid point.

Find's flag/country hints reuse bundled MMSI flag-state and ICAO24-allocation
lookups without another request or normalized traffic field. They are not
current location or inferred ownership. Ship identity responses do not supply
a city/current-location country; no per-row position or geocoder request fills
that gap. Airport/Photon locality is shown only when supplied by that source.
ORBITS remains explicit and retains its own accepted catalog/sample/clock
boundaries. Compact result disclosures preserve individual source credits
and original clocks; shared limits are disclosed once.

Each ship result requires nonempty original contributing-source attribution.
Open Waters aggregates Digitraffic, AISHub, AISStream and station contributions;
their individual rights/caveats continue to apply. This qualified transient
identity lookup is not a blanket CC0/redistribution claim or a data-rights
waiver. The separate transient position operation retains those same source
attribution/use caveats; it is not a new blanket license claim.
Known non-vessel kinds are excluded; malformed/unsupported or wholly
invalid responses are not silently treated as successful empty searches.
See the pinned source review in [Marine Provider Evaluation](marine-provider-evaluation.md).

Browser POST `/api/find/aircraft` and `/api/find/ships` contains bounded
`{by,q}` JSON. The browser URL and result DOM IDs do not contain submitted
names/identities, avoiding resource-URL/selector analytics attribution.
The fixed Worker GET still sends the submitted identifier to the named
upstream, which processes ordinary transport metadata. No browser cookies,
authorization, Home/view bias, arbitrary headers, query-bearing logs or
shared result cache are forwarded/created. There is no retention guarantee
for third parties. Queries/results stay ephemeral and do not enter live
traffic, trails, freshness, counts, photos, metadata enrichment or history.

Lookup has one active operation, finite body/result/deadline limits,
cancellation and source-specific cooldown/Retry-After, without auto-retry.
The same private aircraft relay identity and persistent global 20-second
admission handle point and identifier work together. No direct fallback,
new quota identity or extra traffic polling is introduced.

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

## Captured ship journeys

An explicit Show path may request one anonymous recent track from
`https://ais.openwaters.io/v1/vessels/{mmsi}/track` and regional coded voyage
context from Digitraffic Portnet. Neither source supplies guaranteed complete
voyages. Open Waters' root Feature `attribution` credits are retained alongside
retrieval/report clocks, simplification, truncation, provider reception breaks
and separately identified sparse time gaps. The selected source's underlying
terms remain applicable; the app does not relabel the aggregated observations
as public domain or solely Digitraffic.

Portnet calls must match exact MMSI and compatible reported IMO, have an
unambiguous recent actual departure and plausible actual/estimated chronology.
The source explicitly warns about unmoderated and implausible clocks. A real
Finneco II proof had 2015 actual events with 2026/2027 estimates; it did not
establish a current voyage. Null LOCODE geometry can resolve only through the
exact area code referenced by that call. No nearest port, averaged area, AIS
destination geocoding or fuzzy match is substituted.

Illustrative uncovered sections use the graph data (not the JavaScript npm
package) from `johnx25bd/searoute`, commit
`4fc696c55c4c31bdc4c8286ba76e3261d7bc5a0e`. The original 618,209-byte GeoJSON,
modified source-form projection, full MPL-2.0 license and detailed NOTICE are
co-located under `public/marine-routes/searoute-4fc696c5/`. The repository records
Eurostat/EUPL and ORNL shipping-lane provenance; its linked GeoCommons mirror
permits public download/view but supplies no separate formal data-license
instrument. This is not a claim of unrestricted/public-domain upstream data.
The independent application code remains Apache-2.0.

The shipped 467,117-byte projection removes **821 known land-intersecting or
land-touching edges**, retaining 6,825. The reproducible filter uses the same
pinned Natural Earth v5.1.2 commit as port context, its public-domain 1:10m land
polygons, Mercator segment intersections, polygon holes and antimeridian
splitting. It shifts no point and adds no replacement connector. Generalized
coastlines omit small islands/detail; excluding canals can disconnect valid
waterways. Remaining node/endpoint gaps stay visible and are at most 5 km.
This coarse network is **not** evidence of actual/future vessel travel, canal
permission, shoreline precision, draught clearance or navigability.

There is no new stream, polling, pagination, raw archive or paid account.
History/port-call results are bounded session-only data and never enter the
optional device history. Requests omit credentials/referrer and reveal only
the explicit selected public identity and time window; no provider-retention
guarantee is made. Only the immutable public graph uses ordinary HTTP caching.

## Airport arrival/departure boards: AeroDataBox

When the checked airport-board deployment flag is enabled, TrackStan offers
explicitly requested arrivals/departures in airport details. Airport/time-window
enumeration remains separate from selected-aircraft plausible-route enrichment.

The 2026-10-07
[Airport Arrival and Departure Board Evaluation](airport-board-evaluation.md)
identified the selected ongoing-free source, not a paid-plan prerequisite:
**AeroDataBox Basic via RapidAPI**, for a small noncommercial on-demand board.
Its 400 API units/month permit at most **200 uncached combined-board calls
shared across the whole app**, before other charged work. The 2026-10-08
protected-key and bounded EETN proof resolved the access dependency. The
gateway confirmed 400 units and its free-plan limits; one combined board used
two units. Published Basic has no paid overage; the implementation also reserves
and persists actual remaining quota before forwarding. Applicable published
terms authorize the selected noncommercial display, not bulk/API redistribution.

Visible AeroDataBox attribution links retain only the application origin as
referral data, not a user location/query. Normalized boards are memory-only,
bounded and served for at most five minutes (one minute empty/unavailable);
active browser display expires after 30 minutes and drops records on close,
selection change or pause. SQL stores only operational quota/reset/retry data.
There is no board history, analytics export, raw-response archive or paid
fallback. Committed fixtures/screenshots use invented records; real acceptance
retains minimal aggregate/schema evidence rather than a flight-data archive.

The following alternate-source observations remain historical research,
not additional active providers:

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
records project access, implementation, activation and rollback evidence.
There is no automatic board polling or paid fallback. No board is
constructed from visible aircraft, heading, proximity, callsign, static airport
points, or cached plausible-route lookups.

## Aircraft metadata: Mictronics aircraft-database

- Source repository:
  <https://github.com/Mictronics/aircraft-database>
- Pinned commit:
  `d31104a82bdc429be7fe94726247fc45aa0c49a4`
- Source publication instant: `2026-10-25T09:05:04Z`
- Internal database version: 528
- License:
  [Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/)
- Pinned archive SHA-256:
  `fdff9ab076f279658d21aa4bc61f7b2b8310410000a8e51b7cd3c29989a094f7`
- Pinned license SHA-256:
  `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b`
- Immutable projected path: `/aircraft-metadata/2026-10-25-v1`

This decision was last re-verified on 2026-10-28. The source README explicitly
makes its exports available under ODC-By and describes a weekly update process.
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
and becomes unavailable after `2026-12-09T09:05:04Z`. A date more than 24 hours
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

## Captured orbital map illustrations (#508)

View from here reuses one already accepted, exactly owner-qualified modeled
position and its actual snapshot. It does not request new GP, SATCAT, catalog,
image, mission, terrain, cloud or optical data. Existing Space-Track.org /
USSPACECOM or legacy CelesTrak source credit, exact reported type, element
epoch, retrieval time and source-policy links remain in Model & source;
native membership-reference credit remains separate from fresh GP provenance.
The ordinary OpenFreeMap/OpenMapTiles/OpenStreetMap attribution stays visible.
This adds no source right or accuracy guarantee.

The #514 moving upgrade propagates only that selected accepted object at the
existing one-second cadence and interpolates accepted poses for display.
It does not acquire newer elements or extend their lifetime. Pause freezes
the displayed model time, not source clocks or expiry. The Earth-facing
motion is modeled, not a live observation or telemetry stream.

The #529 framing refinement uses native FOV/sky only; it adds no terrain,
imagery, object or peer source. Existing building heights are not exaggerated.
When entry already has an eligible local traffic area, the existing aircraft
and marine controllers can continue receiving for that same rounded query
and exact polygon. Aircraft retain the ordinary 20-second cadence and
Retry-After; marine reception retains existing connection, REST and retry
limits. This is sustained existing-provider work, not zero network or
spacecraft/global coverage. Entry without an eligible area keeps them paused.
No eye coordinate or look/resize is sent as a new traffic query.

Read-only low-view glyphs are ground annotations of genuine previous-area
reports with ordinary expiry, not true-height aircraft or optical sightings.
High Earth-framed views omit these glyphs. Other satellites remain omitted
after a bounded native rendering candidate failed; no ground-subpoint
substitute is presented as a 3D peer. Existing source credits, independent
errors and observation clocks remain available in scoped provider details.

The copied SGP4 geodetic height is used with a spherical Earth renderer.
The result is an approximate Earth-facing map, not spacecraft
attitude, live telemetry, an optical observation, camera imagery, illumination
or navigational clearance. Starlink remains a bounded sample, not the full
constellation. No modeled position becomes aircraft/marine traffic, a trail,
photo, enrichment match or recorded history.

Capture alone publishes nothing and has no persisted viewer pose or custom
analytics event. Explicit Share uses the existing [public object-link](#public-object-links)
record with that minimal viewpoint intent, never camera offsets or elements.
Genuine incoming traffic retains its existing source rights
and consent-controlled history path; modeled viewer poses do not enter it.
It adds no object/provider lookup path; ordinary map tiles can still
disclose the displayed geographic area to the incumbent map host. Existing
independent page analytics retain their documented trust boundary.
There is no new provider/account/credential, acquisition cadence or licensing
change. The optional publication uses the existing sharing backend and bounds.
#510 originally deployed this presentation without changing
the native GP source. See [usage and validity](orbital-tracking.md#captured-orbital-views-508)
and the [production receipt](hosting-and-deployment.md#captured-orbital-view-production-receipt-2026-10-19).

## Native Space-Track GP-only source (schema 3)

Production uses server-side `ORBITAL_CATALOG_SOURCE=space-track` as the primary
orbital source and checked deployment default. Issue #488's ordinary complete
curated and Starlink publications passed on both origins on 2026-10-17,
followed by actual desktop/narrow marker selection and source/type acceptance.
The [production receipt](hosting-and-deployment.md#native-orbital-primary-production-acceptance-2026-10-17)
records exact generations and evidence limits. CelesTrak remains an explicit
legacy selection, never automatic acquisition failover. No account credential
is public.

The official [basic SSA redistribution authorization](https://www.space-track.org/documentation#/odr)
(`odr_redistBasicSSAInfoDetails`, verified 2026-10-17) gives express blanket
approval for transferring basic SSA data/services, including TLE/OMM and
SATCAT, with appropriate citation, including analysis. The verified section
SHA-256 is `983ffb6f23c811f4dcfa766b599df114b172535f8cbaf34b40f840516e63b6b7`.
This resolves #489's earlier generic signup-agreement reading; it does not
authorize advanced services or credential sharing. Current official website
access policy is no charge, not a permanent pricing guarantee. Visible
Space-Track.org / USSPACECOM credit accompanies native modeled results.

Only the fixed authenticated GP class is used. A bounded form POST establishes
a scoped, memory-only session; at most one subsequent fixed GP request returns
the nineteen selected public fields. Numeric strings are validated before
conversion, UTC-unzoned epochs are interpreted explicitly as UTC, and
`OBJECT_TYPE` supplies the reported application type. Unsupported reported
types remain unknown; no name, orbit, mission, or membership inference is added.
There is **no SATCAT request, fabricated SATCAT URL/count, advanced-data request,
browser login, cookie persistence, credential-bearing URL, or arbitrary proxy**.

Curated membership is pinned in `src/config/spaceTrackCurationReference.json`:
460 exact NORAD IDs and ordered memberships derived from the validated CelesTrak
snapshot retrieved `2026-10-17T12:17:07.523Z`, source digest
`d062e417f365701d3ef2951e400a9196700c514ced47960305f010681d0da5c0`.
Only identity, membership, reference date, and provenance are retained: old
names, elements, and types are not carried forward. Every pinned ID must have
one complete valid native GP row before publication. Additions/removals require
a reviewed reference revision; this is not automatic CelesTrak group expansion.

Revision `curated-reference-2026-10-17-v2`, reviewed on 2026-10-28 for #616,
removes only NORAD `67686` (UITMSAT-2, `1998-067YD`) from the original 461 IDs.
An ordinary native attempt returned 460 of 461 required records, identifying
that exact missing ID. Independently, the public
[CelesTrak SATCAT record](https://celestrak.org/satcat/records.php?CATNR=67686)
reports `DECAY_DATE: 2026-10-22`, corroborated by
[N2YO's no-longer-on-orbit notice](https://www.n2yo.com/satellite/?s=67686).
The primary SATCAT response verified at `2026-10-28T23:22:32.879Z` has SHA-256
`8c03150c9fba5858da2407755b4ddeb1713397284c04a4ca1f29bd3c121a411f`.
The original membership source date/digest remain unchanged; all other IDs
and memberships, including ISS/HST/Tiangong, are preserved. This is an
offline reviewed retirement, not a new runtime SATCAT request, automatic
pruning, partial publication, or a fresh timestamp on retained elements.

The separate Starlink GP predicate requests public, undecayed `PAYLOAD` rows
whose names contain `STARLINK` and whose epochs satisfy the source's ten-day
window. Every returned row is validated, not just the eventual sample; a bounded
30-second transfer allowance applies to the epoch lower-bound check. The
explicit 15,001-row overflow sentinel rejects populations above 15,000 instead
of silently sampling a truncated response. The unchanged four-band,
128-per-band inclination/RAAN/phase algorithm publishes 512 objects. Its
population is the declared native predicate, not an assertion of equivalence
to CelesTrak's group or the entire constellation.

Curated responses remain bounded at 512 KiB/512 rows; the single native
Starlink response uses the original 12 MiB aggregate budget as its response cap.
Normalized publications remain at most 512 records/512 KiB. New catalog IDs,
version-3 media types, and `orbital:space-track:{curated|starlink}:v3` keys retain
real GP-only provenance. Browsers still use only the literal same-origin
`GET /api/orbits/catalog` and `GET /api/orbits/starlink`, never Space-Track.
They validate native schema 3 and complete source-qualified legacy snapshots
for rolling compatibility. A missing native key may temporarily use a whole
legacy cached snapshot; a corrupt native key returns unavailable. There is no
record mixing, refreshed timestamp on old data, or acquisition fallback.

## Legacy orbital source: CelesTrak GP/OMM and SATCAT (schemas 1/2)

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
same-origin `/api/orbits/starlink` when ORBITS is effective; #386 removes only
the separate visibility switch, not source/cadence/failure isolation.
Opening, searching, ship ranking or paging In view adds no acquisition.
Ship rankings use only existing normalized reported length/draught; they do
not infer displacement, water depth or missing metadata. Starlink names and SATCAT types are source
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
