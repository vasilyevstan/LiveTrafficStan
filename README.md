# LiveTrafficStan

LiveTrafficStan is a lightweight live map of aircraft and significant vessels
around Tallinn, Estonia. It combines open traffic data with MapLibre GL JS in a
single React application, without accounts, a database, or persistent tracking.

Public production: <https://livetrafficstan.syntal.workers.dev>

![Released map-first Light interface with live aircraft and vessels around Tallinn](https://github.com/user-attachments/assets/00098d08-b551-4f83-911b-ed2ef96bfb97)

## Current features

- Live aircraft from [ADSB.lol](https://www.adsb.lol/) with approximately
  20-second refreshes.
- Lazily loaded selected-aircraft model, configuration, and wake-category
  context from a pinned ODC-By aircraft database, with exact identity checks,
  source age, confidence, and local failure isolation.
- Offline selected-detail country context: aircraft registration allocation
  from vetted ICAO24 ranges and vessel flag state from valid ordinary MMSIs.
  Unknown, special-purpose, conflicting, and malformed identifiers are omitted
  rather than guessed.
- Local current-aircraft search by callsign, registration, ICAO24, or reported
  type. Search ranks exact, prefix, and substring matches without changing the
  map, camera, providers, or visible marker set.
- Live marine traffic from
  [Fintraffic Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) using
  REST initialization and MQTT over secure WebSockets.
- OpenStreetMap-derived vector maps from
  [OpenFreeMap](https://openfreemap.org/), rendered with MapLibre GL JS.
- An atlas-style treatment of the default maps: blue water, visible forests
  and parks, warm roads, and clearer building and harbour detail. Light uses
  a warm paper palette; Dark uses deep-blue water with forest and bronze
  detail. This is cartographic styling, not new imagery, terrain, or 3D
  building geometry. Custom style URLs and the offline fallback are unchanged.
- Explicit Auto, Light, and Dark theme preferences. Auto follows the browser
  color-scheme signal, while Light and Dark remain persistent overrides; all
  three switch the base map without recreating MapLibre or resetting traffic.
- One versioned device-local preference schema remembers theme, metric or
  aviation/nautical presentation units, layers, structured vessel filters, and
  selected-trail controls. It never stores camera, Home/location, search text,
  selection, provider state, playback, or private-history consent.
- An explicit **Share view** action creates a fragment-only link containing a
  three-decimal camera plus validated presentation state. Opening it does not
  save those overrides, and its camera wins over a later automatic geolocation
  result.
- Viewport-driven traffic after settled pan, zoom, rotation, pitch, Home, and
  resize changes.
- A truthful 100 km enclosing-query limit: wider or unsafe views pause traffic
  and offer **Resume live** to fit the current map center back to the reviewed
  safe framing rather than showing partial coverage as complete.
- A 30 km session Home/Center framing plus privacy-safe one-shot browser
  location: already-granted permission and grants made while the page is open
  are used automatically; otherwise location is an explicit action with
  Tallinn fallback.
- One explicit-submit location field accepts rounded decimal coordinates
  locally or named places through Photon. Search failure never blocks
  coordinate navigation, Center, or the live map.
- Independent aircraft and ship layers plus local vessel search by name,
  callsign, MMSI, or IMO; typed category, navigation, reported-speed, and
  inclusive length filters; explicit unknown-value handling; and a reset to
  the released 50 metre minimum. Selected ship speed is shown in both km/h and
  knots. Reported sailing vessels and pleasure craft with a known length of
  at least 8 metres receive dedicated yacht icons and honor the same speed
  filters as other ships. Any reported speed includes stopped and unknown-speed
  yachts; reports become stale after two minutes and expire after ten.
  The nine exact source-truthful display classes use bold, perceptually tested
  top-down outer silhouettes; names, dimensions, routes, speed, and visual similarity never
  infer a more specific class. Valid AIS reference-point length sets one
  bounded physical marker scale, with each silhouette normalized to the same
  nose-to-stern span so artwork shape cannot reverse ship-size ordering.
  Small upright country flags sit beside ships with an available ordinary
  MMSI allocation. They use bundled artwork, not a flag service, and do not
  claim a fresh vessel-registry check; unknown or excluded identifiers have
  no flag.
- An optional, lazily loaded, zoom-aware Natural Earth port context layer with
  separate selection, failure, and attribution. Port points are generalized
  and incomplete and are never treated as operational harbour or vessel-call
  data.
- An optional, lazily loaded OurAirports layer containing pinned large and
  medium airport reference points, static details, and a bounded keyboard
  list for the current view. It does not imply operational status, routes,
  arrivals, or departures.
- Optional remembered aircraft and vessel clustering, kept in separate
  MapLibre sources with distinct counts and expansion behavior. Clustering
  starts off and never changes provider request cadence or entity identity.
- An optional METAR/SPECI observation layer from the NOAA/NWS Aviation Weather
  Center. It uses explicit ICAO codes from the pinned airport projection,
  shows observation and retrieval age, expires old reports, and remains
  independent of traffic providers and static airport context.
- A default-off modeled orbital layer in this source, backed by CelesTrak's
  reviewed `visual`, `stations`, `weather`, `gnss`, and `science` groups. It
  propagates current
  payload, rocket-body, debris, and unknown subpoints locally with SGP4,
  identifies ground tracks that cross a safe local map view within 90 minutes,
  and draws one bounded selected-object track.
  **ORBITS** stays beside **AIRCRAFT** and **SHIPS** in the layer dock;
  its compact summary reports how many markers are actually shown in the
  current map plus predicted passes within 90 minutes and is mirrored in the
  floating status card's Provider details without changing aircraft/marine health.
  **More → Orbits** separates Nearby crossings from complete
  Catalog discovery. Search and exact type/source-group filters are local to
  the accepted snapshot; no camera, search, filter, selection, or theme change
  starts another catalog request.
  Exact SATCAT type, element epoch, snapshot age, and limitations remain
  visible; these are modeled positions, not live telemetry or optical
  visibility predictions. Exact NORAD `20580` (Hubble) and `25544` (ISS) use
  the same reviewed identity boundary for larger labeled map symbols and also
  have a bundled NASA purpose and historical photograph. Other objects state
  that enrichment is unavailable rather than receiving an inferred mission,
  featured label, or generic picture. Hover uses bundled text only; a selected
  image uses one bounded same-origin load whose media type, byte count, and
  SHA-256 are validated before a session Blob URL can appear in details or a
  later tooltip.
- Issue #211 defines the coordinated source and browser contract:
  schema 2 catalog `celestrak-curated-v1`, ordered groups `visual`, `stations`,
  `weather`, `gnss`, and `science`, 462 unique records (369 payloads, 91
  rocket bodies, and 2 debris objects), and a separate
  `orbital:catalog:v2:curated-v1` KV key. Each successful refresh writes that
  key once with a non-public publication bundle containing the canonical
  schema-2 union and the exact same-refresh schema-1 `visual` representation;
  the retained `orbital:catalog:v1` key is never rewritten. The immutable
  239,460-byte bootstrap is
  `/orbital-data/curated-2026-09-30-v1/catalog.json`, canonical digest
  `5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`.
  Existing schema-1 assets and KV data remain for rollback and predecessor
  clients. The literal `GET /api/orbits/catalog` route defaults to schema 1;
  the new browser requests schema 2 with the fixed
  `application/vnd.livetrafficstan.orbital-catalog+json;version=2` media type,
  with separate ETags and `Vary: Accept`. Default requests choose the newest
  valid schema-1 member across that bundle, retained KV, and immutable rollback
  assets, so predecessor tabs stay current without another provider request or
  publication write. The browser accepts at most 512
  complete records / 512 KiB, keeps every safe current position in one
  persistent GeoJSON source, and applies stable `displayOrder` zoom tiers from
  the exact settled map zoom: 192 below zoom 2, 384 below zoom 4, and all safe
  matches through 512 at zoom 4 or above. One safe selected object remains
  visible as an explicit selected exception without inflating filter-excluded
  matching totals only after map display is available; before a settled raw
  zoom, details explicitly report map display unavailable. The coordinated
  source/browser contract was first released through #235 at exact application
  source `538edd25afa49f62c13e93745b322099f662791d`; the shell-balanced
  Starlink milestone #275 preserved it at
  `d565b56278e81ff2478ab1e476c269084f2297d4`.
- Issue #257 adds a separate remembered **STARLINK** child layer under
  **More → Orbits**. It starts off even when ORBITS is on and
  makes no request until both toggles are effective. Issue #271 adds a
  negotiated schema-2 representation with exactly 512 records: 128 from each
  fixed inclination band `<48`, `48-<60`, `60-<85`, and `>=85` degrees.
  `inclination-shell-raan-phase-grid-v1` deterministically fills a
  16-by-8 RAAN/common-time-phase grid in each band, advancing phase to the GP
  retrieval time before comparison and using numeric NORAD ID for exact ties.
  The released schema-1 150-record
  `inclination-raan-systematic-v1` representation remains available for
  predecessor tabs. Both representations come from one completely validated
  GP/SATCAT population and one atomic publication; no second provider read is
  added. The UI reports source population, sample, modeled, in-map, shown, and
  pass counts rather than presenting either sample as the full constellation.
  It reuses the existing 192/384/512 world/mid/local display tiers. One existing
  CelesTrak Durable Object owns both schedules: curated acquisition remains
  first, while a second SQLite row admits the paired Starlink read at most once
  per 12 hours at the actual GP request start. A fresh production row is seeded
  from the pinned bootstrap GP retrieval time, so the immutable sample may be
  activated immediately while provider work remains blocked until the first
  safe 12-hour boundary; later starts anchor the ordinary cadence. The browser
  uses only literal same-origin `GET /api/orbits/starlink`, one physical orbital
  worker with isolated curated/Starlink channels, and separate persistent
  MapLibre sources/layers. Starlink public IDs are
  `orbital:starlink:<NORAD>`; selection, halo, track, details, and tooltips
  never inherit curated purpose or imagery. Exact payloads use a flat-panel
  spacecraft silhouette, while rocket bodies, debris, and unknown objects
  retain their exact type silhouettes. The schema-2 immutable bootstrap is
  versioned under
  `/orbital-data/starlink-shell-balanced-2026-10-02-v1/`; the released
  `/orbital-data/starlink-2026-10-02-v1/` predecessor remains byte-for-byte
  intact. The one permitted 2026-10-02 acquisition completed GP at
  `08:40:03Z` and SATCAT at `08:40:05Z`: 11,125 rows in each source,
  8,383,437 decoded bytes total, and zero extra SATCAT rows. Schema 2 is
  254,275 bytes with digest
  `56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
  A 145-step retained-source replay improves the Baltic regional mean from
  0.269 to 2.110 objects and empty time from 75.9% to 7.6%; northern Europe
  improves from 0.655 to 5.614 and from 50.3% empty to 0.7%.
- A default-enabled ADSB.lol plausible-route lookup for a selected live
  aircraft. A committed selection starts one lookup and shows a compact result
  directly below the aircraft heading. Hover, HISTORY, and same-flight position
  updates stay passive. It validates one exact normalized callsign plus current
  position against standing-data route segments and never claims a filed plan,
  schedule, or operational status. Successful exact-identity results are
  reused from a bounded six-hour in-memory tab cache; provider `Retry-After` or
  a bounded local cooldown prevents repeated failures without automatic retry.
- A production-enabled Planespotters aircraft-photo path. It accepts only an
  exact ICAO24 hex lookup after **Load aircraft photo** or one stable 500 ms
  fine-pointer hover, preserves the returned thumbnail and photo-page URLs,
  shows visible photographer credit, keeps bounded JSON only in current-tab
  memory, and publishes a completed hover result into already-open matching
  selected details without a second provider request.
- Eight bundled historical vessel reference photos for Tarmo, Finlandia,
  Romantika, Victoria I, Viking XPRS, MSC Magnifica, Megastar, and MyStar. A
  photo appears only in selected live ship details or after a stable
  fine-pointer hover when the AIS-reported IMO is valid and exactly matches the
  reviewed manifest; visible author, fixed Commons revision, license, and
  modification attribution are retained without any runtime image-provider
  request. Selected unmatched and invalid identities state why no reviewed
  image is available instead of failing silently.
- Honest detail cards, provider-specific health, stale/expired handling, and
  partial operation when one provider fails.
- Short interpolation only between observed positions and a selected-object
  in-memory trail configurable to 5, 15, 30, or 60 minutes. Trail visibility
  and duration are remembered, while the provider observations remain
  session-only unless private local history is explicitly enabled.
- Always-on bounded session observation history plus optional private
  origin-local IndexedDB history. Durable recording is off by default, uses
  1/6/24-hour retention choices, and can be cleared or disabled and deleted.
- Explicit historical playback with a frozen range, scrub, play/pause,
  0.5×/1×/2×/4× speed, gap-aware selected trails, and one-action return to
  live. Playback changes display time only; eligible live acquisition
  continues in the background.
- An installable dependency-free application shell. The generated service
  worker caches only the exact HTML, hashed application assets, manifest,
  favicon, and versioned icons; it never caches live APIs, MQTT, map resources,
  search, weather, static context datasets, or private history.
- Truthful cold-offline startup after installation. Live acquisition is marked
  unavailable, external basemap tiles are not promised, and a bundled
  source-free background lets retained IndexedDB traffic and trails render in
  explicit HISTORY mode.
- Non-blocking application updates with an explicit **Refresh app** action,
  bounded current/predecessor shell caches, and a tested retirement build that
  removes only application-shell caches without deleting preferences or private
  history.
- A minimal map workspace in this source: a 280x88 px floating card joins the
  brand and truthful traffic status without an edge-to-edge top bar. The
  existing buttons form a right desktop rail with inward-opening panels and
  remain a bottom mobile command dock. Selected details use a left desktop
  inspector below the card or a reserved mobile sheet. The card is inset
  16 px on desktops and 12 px on phones; the mobile dock remains 70 px tall.
  White Light and slate Dark surfaces share system typography and one accent.
  Counts, regional marine coverage, freshness, and traffic mode remain visible;
  **Provider details** opens independent provider messages on every screen size.
- **More** (Explore map) and **Settings** (View & settings) open beside the
  desktop rail or above the mobile dock. These stable native disclosures
  retain one scroll owner per panel and session-only
  Layers/Find/Context/Orbits/Sources views. **Settings** groups the single
  explicit-submit location input, **Center**, results, and search privacy text
  before **Appearance**. These stay mounted when Settings is closed;
  Auto/Light/Dark and Trails remain under Appearance.
  The mobile zoom/tilt prompt, selected details, and HISTORY playback reserve
  their own space; closing historical details restores the same tool state.
  Visual-viewport-aware sizing, solid keyboard focus rings, non-color
  status/detail labels, required provider/privacy copy, and metric-first
  Starlink modeled/map/pass context accompany a
  small provider-reported set of map-scale aircraft and category-distinct
  vessel silhouettes with generic fallbacks. Orbital payload, rocket-body,
  debris, and unknown classes use exact-SATCAT object symbols instead of
  colored dots. The duplicate traffic legend is intentionally omitted.
  [Local refinement evidence](docs/development-and-testing.md#minimal-right-controls-local-evidence)
  is separate from the historical production release below.
- Touch-specific selection tolerance for isolated markers; exact mouse hits stay
  unchanged and ambiguous nearby traffic is never guessed.

## Quick start

Use Node.js 24 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The checked-in defaults work without API keys.
To change the center or provider endpoints, copy `.env.example` to `.env.local`
and edit only the values you need.

Run all local quality checks with:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run check:aircraft-metadata
npm run check:country-allocations
npm run check:vessel-photos
npm run check:orbital-catalog
npm run check:orbital-enrichment
npm run check:ports
npm run check:airports
npm run build
```

Test the production output and its local aircraft and METAR proxies with:

```bash
npm run preview
```

Test the production Cloudflare boundary locally with:

```bash
npm run build
npm run check:deploy
npm run preview:worker
```

To exercise the enabled orbital bootstrap route for local rendered acceptance:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

## Architecture

Provider-specific code validates and normalizes external payloads before React
or MapLibre sees them:

```text
ADSB.lol polling ───────┐
                       ├─> normalized traffic -> live display + bounded session history
Digitraffic REST/MQTT ──┘                         |
                                                  ├─> optional private IndexedDB
                                                  └─> historical index/playback -> map + UI

selected aircraft -> static metadata index + one prefix shard -> details only
selected/hovered live vessel -> exact valid IMO -> bundled reviewed photo
                              -> details or stable-hover tooltip

PORTS toggle -> pinned same-origin Natural Earth projection -> map + port details
AIRPORTS toggle -> pinned same-origin OurAirports projection -> map + airport details
METAR toggle -> qualifying airport ICAO codes -> same-origin AWC proxy
             -> current observations -> map + weather details

ORBITS toggle -> same-origin complete CelesTrak snapshot -> dedicated SGP4 worker
              -> complete safe modeled-point source
              -> local zoom/type/group display filter + selected exception
              -> Nearby crossings + complete Catalog discovery + selected track

current aircraft -> local literal search -> existing traffic selection

coordinate input ── local validation ─┐
Photon forward search ─> place results ├─> explicit camera navigation
session Home / location ──────────────┘
```

The application keeps one MapLibre instance and updates persistent GeoJSON
sources and layers. Marine MQTT messages are merged and emitted at most once
per second. Aircraft polling and marine connections pause while the document is hidden or
the visible map cannot be covered by the bounded query. Their session-lived
cadence, backoff, reconnect, REST, metadata, and cache state survives the pause.

The application derives a safely unwrapped full-canvas footprint from MapLibre
after settled camera changes. Providers receive its conservative enclosing
circle, while normalized aircraft and vessels are filtered to the actual
viewport polygon before display. Floating controls do not shrink the geographic
query area.

Resolved Light/Dark changes, including Auto system changes, use `map.setStyle`
on that same MapLibre instance. An
idempotent installer restores traffic images, sources, layers, current data,
visibility, and trail after each style load while preserving camera,
selection, provider state, and connections.

Orbital tracking is a separate modeled-data boundary. Explicit enable loads
one strictly validated same-origin snapshot, anchors modeled time to the
response clock, and creates a dedicated propagation worker. Camera and
exact-filter changes run only coalesced local prediction work; text search and
paging do not reach the worker. Every safe current point remains in the
persistent source while MapLibre receives the local zoom/type/group shown-ID
filter. Orbital points, crossing results, discovery rows, and selected tracks
remain outside traffic models, clustering, freshness, trails, metadata,
photos, and history. Wide views can therefore show orbital objects while
aircraft and ships pause under their unchanged 100 km eligibility contract.

The curated updater performs ten strictly sequential fixed requests (GP then
SATCAT for each reviewed group), validates each group before one union,
deduplicates only by canonical decimal NORAD ID, chooses the newest valid OMM
epoch, and performs one final v2 KV write. Any non-200, redirect, malformed or
oversized body, timeout, incomplete join, identity/type conflict, equal-epoch
propagation conflict, or failed publication preserves the previous complete
snapshot. The same Durable Object name and schema-1 admission state retain the
two-hour cadence, in-progress fence, `Retry-After`, and terminal block.

Aircraft metadata is a separate selected-object boundary. It makes no startup
request, loads one immutable index and one ICAO24-prefix shard on first use,
validates the complete assets before bounded caching, and never mutates live
traffic or marker categories.

Vessel reference photos are a smaller synchronous presentation boundary. They
use only a valid exact AIS-reported IMO and a committed file-by-file manifest.
The image bytes are versioned same-origin assets, excluded from the
service-worker shell, and may load only for selected details or after the
existing 500 ms stable fine-pointer hover. Sub-dwell hover, search, unmatched
vessels, and HISTORY remain photo-free.

Vessel discovery is local display filtering after provider freshness and exact
viewport filtering. It does not alter Digitraffic subscriptions, REST gates,
provider caches, or source snapshots. The optional port dataset is another
independent same-origin boundary: it makes no request until enabled, validates
the complete immutable asset before caching, and remains separate from traffic
IDs, counts, trails, selection, and provider health.

Aircraft discovery searches only the current non-expired viewport aircraft
already held by the application. The optional airport dataset follows the same
independent static-context boundary as ports, but keeps large and medium airport
points visible at higher zooms and exposes static provenance rather than
operational flight information.

The optional METAR boundary reuses explicit four-letter ICAO codes from the
pinned airport dataset; it never infers stations from traffic or movement.
There is no startup weather request and no periodic poller. First enable,
settled station-set changes, explicit refresh, and retry share one session
request-start gate of at least 60 seconds. Reports become stale after 75
minutes and expire after 120 minutes. Hiding the layer preserves a fulfilled
same-view result without persisting it.

Presentation preferences are stored under
`livetrafficstan.preferences.v1`. The legacy theme key is imported only when
the unified key is absent and remains a rollback compatibility mirror. Shared
state uses a validated `#v=1&...` fragment with explicit user action; it is not
sent in HTTP requests, but users should still treat browser history and the
clipboard as places where a copied rounded view can remain visible. Metric
values remain canonical for providers, filters, history, and viewport logic;
aviation/nautical units are formatting only.

Traffic history stores only allowlisted normalized provider observations.
Session history is always volatile and bounded. Private IndexedDB recording is
explicit opt-in and bounded by retention time, record count, and logical bytes.
Clear and Disable use an authorization epoch so queued or stale-tab writes
cannot restore deleted observations. Pending batches retain their enqueue
epoch, destructive cross-tab invalidations clear the affected volatile queue,
and failed writes remain queued behind an explicit visible suspension rather
than being reported as saved. Historical mode reuses the normal search, filter,
selection, clustering, and details paths, but disables interpolation and hides
current-only aircraft metadata and METAR context.

`npm run build` generates `/sw.js` from the exact Vite output and worker policy,
and rejects an application shell above 4 MiB uncompressed. Root navigation is
network-first with cached `index.html` only as the offline fallback. Exact shell
assets are cache-first across the current and immediate predecessor generations
so an older controlled tab can finish a deferred hashed import during an
update. Every other request keeps ordinary network behavior and receives no
generic HTML fallback.

The local source-free MapLibre fallback contains only a theme-aware background.
It is installed into the existing map when the configured external style cannot
load and is replaced in that same map after reconnect. It does not imitate or
cache OpenFreeMap land, water, labels, tiles, glyphs, or sprites.

See [Architecture](docs/architecture.md) for component boundaries, data flow,
failure isolation, rendering, and deployment details.

## Configuration

The defaults are centralized and validated in
[`src/config/appConfig.ts`](src/config/appConfig.ts). Browser-safe overrides are
available for:

| Variable | Default |
| --- | --- |
| `VITE_CENTER_LATITUDE` | `59.437` |
| `VITE_CENTER_LONGITUDE` | `24.7536` |
| `VITE_CENTER_LABEL` | `Tallinn, Estonia` |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` |
| `VITE_MAP_DARK_STYLE_URL` | `https://tiles.openfreemap.org/styles/dark` |
| `VITE_GEOCODER_ENDPOINT` | `https://photon.komoot.io/api` |
| `VITE_AIRCRAFT_ENDPOINT` | `/api/aircraft` |
| `VITE_AIRCRAFT_PHOTO_ENABLED` | `false` |
| `VITE_FLIGHT_ROUTE_ENABLED` | `true` |
| `VITE_WEATHER_ENDPOINT` | `/api/weather/metar` |
| `VITE_MARINE_REST_ENDPOINT` | `https://meri.digitraffic.fi` |
| `VITE_MARINE_MQTT_ENDPOINT` | `wss://meri.digitraffic.fi:443/mqtt` |

These variables are embedded in the client bundle and must never contain
secrets. See [Configuration](docs/configuration.md) for validation rules,
operational thresholds, and examples.

## Data providers and licensing

| Purpose | Provider | Runtime data license | V1 access |
| --- | --- | --- | --- |
| Map | OpenFreeMap / OpenMapTiles / OpenStreetMap | Provider and OSM attribution applies | Direct browser access |
| Place search | Photon / OpenStreetMap | OSM ODbL attribution applies | Direct browser access on explicit submit |
| Aircraft | ADSB.lol | ODbL 1.0 | Same-origin Vite/Cloudflare proxy by default; protected direct-browser build only after provider-approved CORS |
| Aircraft metadata | Mictronics aircraft-database derivative | ODC-By 1.0 | Immutable same-origin static assets, loaded only after selection |
| Selected-aircraft photos | Planespotters Photo API | API-specific and general terms apply | Explicit direct browser request and direct unchanged returned thumbnail; enabled in production |
| Selected-vessel reference photos | Reviewed Wikimedia Commons files | File-specific CC BY-SA 3.0, CC BY-SA 4.0, or CC0 1.0 | Bundled immutable same-origin assets selected only by exact valid IMO |
| Country allocations | michaeljfazio/MIDs, ibosoftnet ICAO24 transcription, Wikidata cross-check | Apache-2.0 and CC0 1.0 | Bundled deterministic local lookup |
| Marine | Fintraffic Digitraffic | CC BY 4.0 | Direct regional REST and MQTT |
| Port context | Natural Earth Ports | Public domain | Immutable same-origin static asset, loaded only when enabled |
| Airport context | OurAirports | Public domain | Immutable same-origin static asset, loaded only when enabled |
| Weather observations | NOAA/NWS Aviation Weather Center | U.S. public domain unless marked otherwise | Strict same-origin Worker/Vite route, loaded only when METAR is enabled |
| Selected-aircraft plausible route | ADSB.lol / VRS Standing Data | ADSB.lol ODbL 1.0; underlying standing data CC0 1.0 | One direct browser request on committed live selection; enabled by default |

The repository's Apache License 2.0 applies to source code only. The bundled
aircraft metadata is a derivative database conveyed under ODC-By 1.0 with its
full license alongside the generated files. Distributed derivative works must
preserve the applicable [`NOTICE`](NOTICE) and data-license attribution. The
source license does not relicense map, search, live aircraft, aircraft
metadata, marine data, vessel photographs, country-allocation projections, or
the separately identified public-domain Natural Earth port and OurAirports
projections. See
[Data Sources and Licensing](docs/data-sources-and-licensing.md), the dated
[Aircraft Provider Evaluation](docs/aircraft-provider-evaluation.md), and the
dated [Aircraft Metadata Evaluation](docs/aircraft-metadata-evaluation.md), the
dated [Aircraft Photo Evaluation](docs/aircraft-photo-evaluation.md), the
dated [Vessel Reference Photo Evaluation](docs/vessel-photo-evaluation.md), the
dated [Marine Provider Evaluation](docs/marine-provider-evaluation.md), and the
[Airport Board Evaluation](docs/airport-board-evaluation.md) for verified
contracts, official links, measured/request-volume evidence, and unresolved
authorization gates.

## Deployment

Cloudflare Workers with Static Assets is the selected production boundary. It
deploys the Vite client with strict same-origin ADSB.lol point and AWC METAR
paths as one atomic unit. Plausible route lookup is a credential-free direct
browser request to ADSB.lol standing data, so it needs no Worker route, secret,
quota service, or Durable Object. Hashed assets, including the MapLibre worker,
use immutable browser caching; live aircraft responses use no shared cache and
successful METAR responses receive only the source-aligned 60-second cache
guidance.

The protected workflow records one fixed `aircraft_delivery` choice:

- `worker-proxy` uses the same-origin Worker with shared Cloudflare egress;
- `oci-private-relay` uses the same browser route but sends only its validated
  request through the bound VPC Service, private Tunnel, and loopback OCI
  relay;
- `adsb-lol-direct` builds the browser with
  `VITE_AIRCRAFT_ENDPOINT=https://api.adsb.lol`.

The private mode requires the fixed checked VPC Service and a protected
Worker-to-relay bearer secret. Missing or invalid private configuration fails
closed with `503 Retry-After`; it never falls back to shared Cloudflare egress.
Direct mode must not be deployed until ADSB.lol explicitly approves browser
production use and the deployed API returns browser-readable CORS on both
success and throttling responses. None of these modes is a browser-controlled
provider selector.

The proxy accepts only
`GET /api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}`, validates the
current 1-54 NM transport contract, uses a total upstream deadline and body
limit, rejects redirects, and preserves provider status, body, and
`Retry-After`. It forwards no browser credentials or arbitrary headers and
keeps request URL logging disabled.

Reliable aircraft recovery uses a private
Cloudflare Worker -> Workers VPC Service -> Cloudflare Tunnel -> isolated OCI
E2 Micro relay path. The relay is fixed to ADSB.lol, globally limits upstream
starts to one per 20 seconds, persists only provider admission state, and has
no cache, generic proxy surface, public ingress, or sensitive application
logging. The Tunnel connector uses pinned `cloudflared`, IPv6 QUIC, and a
token file readable only by its dedicated service account. See
[OCI Aircraft Relay](docs/oci-aircraft-relay.md).

The weather route accepts only
`GET /api/weather/metar?ids=EETN%2CEFHK`, with 1-50 sorted unique uppercase
four-letter IDs and no other parameters. It constructs one fixed AWC JSON
request, follows no redirects, forwards no browser credentials, uses an
eight-second deadline and 256 KiB response cap, and preserves `Retry-After`.

The plausible-route path starts once when a new eligible live aircraft is
selected. It constructs one validated ADSB.lol standing-data URL from the
normalized callsign, omits credentials, rejects redirects, enforces a
ten-second deadline and 32 KiB response cap, and accepts only a route whose
airport segments fit the aircraft's current position. Same-flight position
updates do not repeat the request. Successful routes may be reused from the
current tab's 32-entry cache for up to six hours; there is no shared or
persistent route cache.

Public production is live at
<https://livetrafficstan.syntal.workers.dev> on Cloudflare Workers Free with
Static Assets. The current application source is
`0972ba8d24ba96e18627b13b252e6ac7c5473f10`, released through #305-#307.
Exact-main Validation `37187440710` passed, and canonical deployment
`37187599808`, attempt 2, passed complete smoke at
`2026-10-04T08:43:41.594Z` as Cloudflare version
`a22bfa09-03fa-40cd-ac76-3915e0e52eea`. Final gates passed 991 tests in 130 files.
The atlas basemap adds blue water, visible forests/parks, warm streets and
clearer harbour/building detail in both themes using the existing vector data.
Custom/fallback styles are preserved, including shared-stock-URL resets.
The full-width upper bar stays gone: a compact floating status card preserves
counts and provider details, while search and Center live together in Settings.
The right-side buttons and mobile dock remain. Impeccable's installed
context/colorize/craft-floor guidance and detector were used without adding an
application dependency or design framework.
[Actual production screenshots and measured acceptance](https://github.com/vasilyevstan/LiveTrafficStan/pull/307#issuecomment-5978336335)
cover both themes, retained-cache navigation, mobile/short screens, selection,
keyboard/touch, and playback.

The predecessor baseline was healthy at `07:04Z`; attempt 1 later encountered
the recurring private-aircraft `502` while direct ADSB.lol and the exact-release
orbital route remained healthy. One no-retry, fresh-ETag-fenced diagnostic
reboot recovered the recorded instance; the first later probe returned six
aircraft at `08:40:59.167Z`. Eleven before/after resource groups and cost
configuration matched. The same deployment job passed with unchanged inputs.
[Issue #174](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5978306226)
remains open; this is recovery, not a permanent infrastructure repair.

The real rollback predecessor is application
`8117859518155f77e9413fa0d86902a3b371da9e` / Worker
`79f74a36-f1a6-4e1b-b41a-1314a3e92a76`, the accepted #300 floating-header UI.
Later documentation-only commits are not deployed application versions. This
deployment preserves:

- `oci-private-relay`, aircraft photos, and plausible routes enabled;
- the curated orbital and bounded Starlink catalogs enabled with Cron
  `17 */2 * * *`;
- KV namespace `59178d55418247c4bab473b52a5dc07d`;
- the default schema-1 compatibility representation plus negotiated schema-2
  catalog `celestrak-curated-v1`;
- immutable schema-2 bootstrap retrieval `2026-09-30T18:25:59.094Z`, 462
  records, and digest
  `5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`;
- orbital-enrichment manifest `2026-09-29-v1`, exact Hubble/ISS identity
  matching, and two immutable NASA JPEGs totaling 95,457 bytes;
- immutable vessel-photo generation `2026-10-02-v1`, eight exact-IMO entries,
  and 951,872 bundled bytes;
- immutable shell-balanced Starlink generation
  `starlink-shell-balanced-2026-10-02-v1`, 512 records with exact
  `128/128/128/128` inclination-shell quotas, 254,275 bytes, and digest
  `56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`;
- retained predecessor `starlink-2026-10-02-v1`, 150 systematic sample
  records from the same validated 11,125-record population, and digest
  `16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.

Production measured a 280x88 px floating card in both themes at 1280x900,
390x844, 390x568 and 315x517. It is inset 16 px on desktop and 12 px on mobile.
The 76x335 px right rail starts at y=16, its panels open inward, and the
70 px mobile dock is unchanged. Settings contains exactly one 44 px location
input. Local evidence additionally covers 761/900/1024 px widths.
Ordinary cached navigation upgraded `index-KqCAW4Ds.js` to
`index-BRvLbc4q.js`, intentionally retaining `index-B5IN6iN9.css`.
Old shell `84e5a30fc6fce373d145` remained alongside
`068c4381a2493276f835`, without clearing storage or disabling cache; the normal
app-update notice remained visible.

Final orbital rows remained reachable at 315x517 and with an
844-layout/517-visual-height mismatch. Production rendered 87 initial
vector-source features and retained one map and one request per catalog; HISTORY alone
intentionally restarted the orbital worker. Real aircraft and ships rendered;
one later aircraft `503` was recorded without a browser runtime error.
Chrome emulation is not physical iOS/Android or Safari evidence.
The first refresh #282, structural correction #288, smaller bar #291 and
floating-card release #300 remain
[historical release evidence](docs/hosting-and-deployment.md), not the current
layout or a new sampling change.

The October 1 map follow-up was merged through #242, #243, #244, #245, and
#246. Exact-merged-main validation run `36887570850` passed 119 files / 746
tests plus lint, typecheck, static-data checks, build, retirement build, and
deployment dry-run. Production Chrome `154.0.8037.59` then proved:

- all nine maritime-blue vessel classes at 26/29/36/45 CSS px, DPR 1/2,
  Light/Dark, headings, live/stale/selected/stopped states, desktop/mobile,
  picking, exact theme restoration, one canvas/source/layer set, and zero
  fixture-added provider/search/catalog requests;
- `ORBITS · 192 SHOWN · 0 PASSES ≤90M` for the measured world view, 454 safe
  current positions, exactly reviewed `HUBBLE`/NORAD `20580` and
  `ISS`/NORAD `25544` labels, one catalog request only after enable, no browser
  CelesTrak or theme-change request, and no task over 50 ms;
- exact 30 km initial, Home/Center desktop, and mobile framing with zero zoom
  delta from MapLibre's `cameraForBounds`, six rendered aircraft, one
  outward-rounded `34 NM` request inside cadence, one canvas, and visible
  attribution.

Measured evidence and the four hosted screenshots are in
[#246 production acceptance](https://github.com/vasilyevstan/LiveTrafficStan/pull/246#issuecomment-5935337522).

Deployment attempt 1 published version
`45cccadf-0456-4812-aed3-54286886a3c0`, but smoke isolated the known unchanged
OCI guest/network `502`: the exact new release header and all non-aircraft
surfaces were healthy. The supported diagnostic reboot produced
`STOPPING -> STARTING -> RUNNING`; four bounded probes remained `502`, then
real aircraft JSON returned. The exact same authorized deployment inputs
passed on attempt 2 without application rollback, provider fallback, relay
source change, or credential rotation.

The smaller-vessel-marker release followed through #251, #252, and #253.
Exact-main validation run `36908354263` passed, then production Chrome
`154.0.8037.59` proved all nine unchanged classes at 22/24/30/37 CSS px
through the real symbol layer. Every fixture marker remained pickable across
DPR 1/2, both themes, headings, state overlays, desktop 1280x900, and mobile
390x844/390x568. Light -> Dark -> Light restored exact image bytes, one
map/canvas/source/layer set persisted, attribution remained visible, and the
fixture added zero aircraft, marine, orbital, search, or metadata requests.
Deployment attempt 1 again isolated the unchanged private-relay guest/network
`502`; the supported diagnostic reboot progressed through
`STOPPING -> STARTING -> RUNNING`, bounded probes reached real exact-release
aircraft JSON, and the unchanged workflow passed on attempt 2.

The coordinated traffic-recovery release followed through #262-#267.
Protected release validation run `36996187462` passed the combined tree: 127
test files / 950 tests, lint, typecheck, all static-data checks, both builds,
and deployment dry runs. Production acceptance then proved:

- **Resume live** recovered an initially paused retained view from zoom `5.6`
  to the reviewed zoom `8.9776297284`, rendered four aircraft and 28 ships,
  made one bounded `34 NM` aircraft request, retained one MapLibre canvas, and
  reported no browser diagnostic;
- 27 current production vessel features joined exactly by MMSI, image ID, and
  normalized marker scale to the bounded live AIS dimension sample. Visible
  nose-to-stern size increased monotonically from Nafta at 60 m / 22.97 CSS
  px, through the 126 m tug Raduga Proton at 29.08 px and 193 m Romantika at
  35.29 px, to MyStar at 213 m / 37.14 px;
- all eight exact-IMO vessel images loaded from immutable same-origin assets,
  while invalid and valid-but-uncovered IMO states explained why no substitute
  was shown. A-to-B-to-A identity fencing, desktop/390-pixel reachability, and
  zero external photo-provider requests passed;
- the Starlink child layer made zero request before enable and exactly one
  same-origin request afterward, made zero browser CelesTrak requests, exposed
  all eight pages and rows 141-150, retained one canvas and one active physical
  orbital worker, restored Light -> Dark -> Light image bytes, preserved the
  remembered child preference across parent-off/on, and passed trusted
  390x568 touch movement with no runtime, log, or HTTP error.

Deployment attempt 1 (`36996396517`) published exact source as version
`ebee76a9-0555-406f-95ba-285e2e548612` but encountered the independent OCI
relay `502`. One documented `DIAGNOSTICREBOOT` moved the exact instance through
`STOPPING`, `STARTING`, and `RUNNING`; the fifth bounded 20-second probe
returned real aircraft JSON. Attempt 2 (`36997137283`) passed aircraft but met
one transient AWC METAR `504`; production and direct AWC recovered immediately.
Attempt 3 passed unchanged. The rollback rehearsal restored source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` / version
`d83f68ae-907e-4b2d-a086-00b4fde00372`, and exact-current restoration passed
without a standalone secret mutation or provider refresh.

The ordinary `2026-10-02T12:17Z` Cron occurred before the seeded Starlink
boundary. A public route observation at `12:17:59.818Z` still returned source
`bootstrap`, GP retrieval `08:40:03Z`, SATCAT/publication `08:40:05Z`,
population 11,125, sample 150, digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`,
and the matching weak ETag. This is the expected no-replacement result before
the exact `20:40:03Z` admission boundary.

The first eligible ordinary `22:17Z` Cron then published a newer complete
generation without a workflow dispatch, manual scheduler call, or manual
provider acquisition. The first request strictly after the observer's
`22:18Z` target began at `22:19:00.327863Z` and returned HTTP 200,
`source=kv`, and exact release `bba0bf4f...`: GP retrieval
`22:18:01.730Z`, SATCAT retrieval/publication `22:18:02.211Z`, serve time
`22:19:00.626Z`, population 11,125, sample 150, and digest/weak ETag
`3cd7476fd7d42aed1772a85d4f81c27322c73b088bf58ff217e39454f425f0d7`.
A bounded provider-contract review found no cadence, backoff/lock, complete
pair, final-write, last-good, privacy, or failure-isolation blocker.

The October 3 shell-balanced release retains that schema-1 generation for
predecessor clients and adds the negotiated 512-record schema 2. Immediate
post-deploy proof showed default, wildcard, and combined requests selecting
fresh schema 1 from KV while the immutable schema-2 bootstrap was beyond the
browser's 24-hour expiry. Exact schema-2 requests still returned the validated
bootstrap. Both representations used independent ETags and matching `304`s,
opposite-representation validators returned `200`, `Vary: Accept` was present,
and explicit schema-2 `q=0` exclusion selected schema 1. The ordinary
`2026-10-03T12:17Z` observation window remained on the prior schema-1
generation through `12:28:56Z`; no scheduler call or manual provider request
was made. The ordinary `14:17Z` event then published one fresh, aligned
150/512-record KV generation at `2026-10-03T14:17:23.055Z`. Full record,
canonical-digest, four-by-128 quota, and ten-case negotiation checks passed;
the normal browser preference now receives fresh schema 2.

Real production Chrome `154.0.8037.95`, without response fixtures, confirmed
512 modeled records, all 26 pages, exact 192/384/512 tiers, one map/physical
worker, theme restoration, and parent off/on without refetch. At `14:30Z`,
the measured Estonia/Finland desktop view showed six Starlinks and 86
next-90-minute map passes; the narrower mobile canvas showed two and 63.
These are time- and viewport-specific modeled observations, not guaranteed
density or optical visibility. [Production screenshots and exact
evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/275#issuecomment-5970127249)
also record the Chrome-emulation, not physical-device, limitation.

Protected predecessor rollback `37129586003` and exact restoration
`37129687283` passed. Both restored KV representations retained byte-identical
bodies, digests, ETags, and publication clocks without a provider acquisition
or namespace/cadence reset. Those were the #275 Starlink milestone checks.
The separate overall redesign in
[#276](https://github.com/vasilyevstan/LiveTrafficStan/issues/276) subsequently
shipped through #280-#282; it was not silently closed by the compact controls.

Earlier #194 production-bundle acceptance used a deterministic 24-object
crossing fixture and exposed all 20 bounded results at both 390x844 and 390x568.
Operations More was the single scroll owner; touch, wheel, Page Down, and 38
Tab steps reached the final result with no nested orbital-list overflow. The
stacks measured 489.515625 px against 489.52 px and 329.4375 px against
329.44 px. One catalog request, zero browser CelesTrak requests, one unchanged
MapLibre canvas, compact deduplicated attribution, and zero console/runtime
errors were retained. The compact unavailable-route and aircraft-photo cards
also retained the required standing-data, provider/privacy, cache, and rights
wording.

A later real-device report showed that the first evidence was incomplete: it
varied the layout viewport but did not force a shorter visual viewport below
mobile browser chrome, and its geometry-only final-result check could not
detect a sticky task selector covering the result. The deployed corrective
acceptance tracks a forced 517 px visual viewport beneath an 844 px layout
viewport, keeps the controls at 299.859375 px against the 299.86 px budget,
and verifies the final result with hit testing as well as bounds. The normal
390x844,
390x568, and 315x517-class runs expose all 20 results, keep task labels
unclipped, and retain one scroll owner, one canvas, one catalog request, and
zero browser CelesTrak requests or runtime errors. Physical iOS Safari and
Android Chrome evidence remains separate and must not be inferred from CDP.

Cache-disabled public-origin enrichment acceptance then used real current
Hubble, ISS, and NORAD `733` map features. It made zero image requests before
selection and exactly one uncached same-origin `Fetch` for each reviewed JPEG;
both returned exact `200 image/jpeg`, immutable one-year caching, manifest
content lengths, and no Service Worker or disk-cache response. Hubble decoded
at 437x640 and ISS at 640x425. Details and the later ISS tooltip used the same
validated Blob URL, while hover, theme, re-selection, and the unreviewed
rocket-body fallback made no image request. A forced terminal image failure
did not retry. One MapLibre canvas persisted with zero NASA requests,
same-origin failures, runtime exceptions, or console errors.

At 390x844, ISS details measured 303.828125 px high with a 159.984375 px
image and reached the exact 931 px maximum scroll. At 390x568, the panel
measured 115 px with an 87.984375 px image and reached the exact 1,048 px
maximum scroll. Neither layout overflowed horizontally, and source, rights,
map attribution, and the single canvas remained reachable.

The #162 publication repair deployed exact source
`f98252f8a22619c67006e4a7c231eebca430dae2` through run
`36752704240` as Cloudflare version
`2891a8b4-8111-4d7c-be93-1d355ebdf289`. It calls Cloudflare's
receiver-sensitive runtime fetch through `globalThis` while preserving the
named coordinator, two-hour admission, backoff, terminal block, prior
snapshot, and rollback assets. An ordinary `2026-09-30T18:17:39.801Z` event
published schema 1 to KV with 156 records and digest
`a47b1b24f8f43bcd2853a742b19366eb7619d9a77eb4e66528548c51586d1220`;
the later admitted `22:17:35.578Z` event published digest
`98ca3ae36478113d53f0ecea99d6cd4773232aec8b7eef61bef2a9828f2ccce6`.
The schedule may arrive seconds before the exact two-hour gate and truthfully
return `not-due`; the next later scheduled event remains eligible without a
manual refresh.

The coordinated vessel and curated-orbital release is exact source
`538edd25afa49f62c13e93745b322099f662791d`, merged through #235 and deployed
by run `36788698617` as initial Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8`. Immediate production proof returned
fresh default schema 1 from KV and the immutable 462-record schema-2 bootstrap
on the same literal route. The representations had distinct ETags and matching
`304`s, `Vary: Accept`, cross-representation `200`, and no exposed internal
publication envelope.

Exact-release Chrome 154 acceptance passed 27/27 checks. ORBITS made zero
catalog requests before enable and exactly one negotiated same-origin request
afterward, with zero browser CelesTrak requests and one MapLibre canvas/worker
lifecycle. The live modeled population was 450: raw zoom 1.5 showed 192, zoom
3 showed 384, and zoom 4.5 showed all 450. All 24 catalog pages, exact local
query/filter behavior, unavailable-position rows, a rank-hidden selected
exception without camera movement, focus restoration, style replacement,
390x844/390x568 reachability, and trusted touch movement passed. Aircraft and
marine remained independent. No runtime, console, critical HTTP, or network
failure occurred. Physical iOS Safari and Android Chrome were unavailable in
the validation environment and are not claimed.

The first ordinary schema-2 KV bundle was retrieved at
`2026-10-01T02:17:32.034Z`. It contained `462` records
(`369 PAY, 91 R/B, 2 DEB`) with canonical digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`; the same atomic
write supplied a schema-1 visual representation retrieved at the same instant
with `156` records and digest
`018ee9ff6c9c161485f37f5a22cfaa5a6fdd2524a4ae7fc49a12947c4478e2e5`.
Both public
representations returned source `kv`, their own conditional `304`, and
cross-representation `200`; the private bundle remained absent.

Protected rollback run `36807920596` restored schema-1 release
`f98252f8a22619c67006e4a7c231eebca430dae2` and recorded Cloudflare version
`2891a8b4-8111-4d7c-be93-1d355ebdf289` with target-aware smoke. Restoration
run `36808295755` restored exact application source
`538edd25afa49f62c13e93745b322099f662791d` as Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8`; schema 2 immediately returned the retained KV bundle
without another provider refresh.

The immediate byte-exact rollback target for the smaller-marker release is the
prior map follow-up: source
`560a9bb409a92036996e391500ec36b1d7b0e728`, recorded Cloudflare version
`6b6043b8-3a14-49c0-8af3-b5843f8eb09f`. The curated release above remains
the older rehearsed rollback/restoration evidence.

The matching aircraft relay still runs
`18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8` and retains
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` as its prior rollback release.
Exact loopback health is active and enabled. A bounded public proof returned
real aircraft JSON, then exact-release marked local
`503 Retry-After: 20` with
`X-LiveTrafficStan-Relay-Status: admission`, then real JSON after the advised
wait. Provider `503`, provider `429`, redirects, malformed policy, and failure
to reach eventual real JSON remain release failures.

Public Wiki commit `5f9fbd82b77bdd6555379bef65431629f6abf80e` synchronizes
thirteen pages for #307: atlas cartography, custom/shared-style preservation,
actual retained-cache/browser evidence, Impeccable use and independent relay
recovery. It identifies running application `0972ba8d...`, not a later
documentation-only main commit.

Historical Wiki commit `3d89ccd30469960061838a6be33bc07a0aef2ae3` preserves
the thirteen-page #300 floating-card and Settings-navigation release record
for application `81178595...`.

Historical Wiki commit `c5206cf8cc477a1a6266f7988b11da9e050116db`
published thirteen pages for the #291 minimal right-hand interface, actual
Impeccable use, selected/history layout, retained-cache and production evidence,
release identity, independent relay recovery, and rollback. It records running
application `cd05a38f...`, independently of later documentation-only repository
commits.

Historical Wiki commit `61b8be294ea39aed57f98440856c1847719cda87` preserves
the first-refresh #282 evidence for application `9f5ee37d...`.

Historical public Wiki commit `0d535744e4159cf5b12931db4bf14adf4d5521d9`
synchronizes the shell-balanced release across fourteen pages, including the
fresh scheduled publication, real production browser evidence,
rollback/restoration, provider/privacy boundaries, and the separately open
overall redesign in #276 at that time. It records application `d565b562...`, not a later
documentation-only repository commit.

Traffic-recovery public Wiki commit
`bac76a2994a09e85e1162c5724a6071f0fc35540` synchronizes the predecessor
production identity, live-traffic recovery, physical vessel sizing, all eight
exact-IMO photos, bounded Starlink lifecycle and scheduled publication,
browser acceptance, independent relay recovery, rollback/restoration,
provider/privacy boundaries, troubleshooting, and physical-device
limitations.
See [Hosting and Deployment](docs/hosting-and-deployment.md) for the dated
platform matrix, request budget, proxy contract, exact-SHA workflow, smoke,
monitoring, privacy, and rollback procedure.

## Known limitations

- Public providers offer no application SLA, and live traffic coverage varies
  by receiver availability and time.
- Aircraft production depends on one no-SLA OCI Always Free VM, Cloudflare
  Tunnel, and Workers VPC beta. Relay admission, Tunnel/OCI failure, and
  provider failure remain truthful aircraft-only states; local `503`
  `Retry-After` guidance delays the existing scheduler, and production never
  falls back to shared Cloudflare egress.
- Digitraffic is a regional source with an unknown exact coverage boundary.
  Its all-published-vessels MQTT stream is filtered in the browser; this local
  filtering does not reduce incoming MQTT bandwidth. Digitraffic exposes
  Class A AIS only, so Class B yachts are unavailable and the eligible yacht
  population can be small or empty.
- Views whose conservative enclosing radius exceeds 100 km pause live traffic.
  **Resume live** keeps the current map center and returns to the reviewed safe
  framing; manual zoom-in or reduced tilt remain available. Partial coverage is
  never presented as complete.
- Selected trails remain intentionally limited to one object. Volatile session
  history disappears on refresh; explicitly enabled private local history may
  survive within its configured bounds.
- Browser location is one-shot, rounded, and session-only; it is not continuous
  tracking and exact coordinates are not persisted.
- Preferences are origin-local browser storage. Shared links are deliberate
  snapshots, not live synchronization, and include a rounded camera that can
  remain in browser history or the clipboard.
- Named place text is sent to Photon only after explicit submission. Photon is
  a fair-use public service with no availability guarantee; direct coordinate
  entry remains local and available during search failure or throttling.
- Aircraft metadata is available only for an exact, non-conflicting selected
  ICAO24 record in the pinned snapshot. The snapshot becomes intentionally
  unavailable after its 45-day publication-age boundary until a reviewed new
  immutable version is deployed.
- Natural Earth ports are optional generalized geographic context, not a
  complete port inventory. Some source points may be approximate by up to
  20 miles, and the app does not infer facilities, berths, operational status,
  port calls, nearby-vessel relationships, destinations, or ETAs.
- OurAirports points are optional static reference context. The source
  disclaims accuracy and fitness, and the app does not infer current service,
  airport operations, aircraft relationships, routes, arrivals, or departures.
- Current arrival and departure boards remain blocked on an authorized
  airport/time-window provider contract in
  [Issue #46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46).
- Auto follows the browser's color-scheme preference, not solar time or map
  location.
- METAR coverage is limited by both AWC reporting and the pinned large/medium
  airport projection. It is observed aviation weather, not a forecast,
  airport board, operational status, or global coverage guarantee. Enabling it
  sends visible qualifying ICAO station IDs through the application host to
  AWC.
- Plausible route lookup is callsign-based standing data checked against the
  current aircraft position. It can be stale, absent, or wrong and is not a
  date-specific schedule, filed flight plan, airport board, diversion signal,
  or route-history service.
- Aircraft photos are enabled through direct browser JSON and unchanged image
  URLs. The published low-volume browser path requires no API key, email,
  membership account, or prior provider contact, but the photo surface must
  remain public and free. Provider JSON stays in a bounded one-hour,
  32-entry current-tab cache, and no URL, credit, or image byte is persisted or
  proxied.
- Vessel photos cover only eight manually reviewed vessels. They are historical
  reference images matched solely by valid exact AIS-reported IMO, not live
  views or independent confirmation of the transmitting hull. Missing,
  invalid, or unmatched IMO shows an explicit unavailable reason and no
  real-image substitute. No general yacht photo coverage is promised.
- Orbital positions and map crossings are SGP4 models from a bounded reviewed
  CelesTrak catalog; the `visual` group is only one member of the curated
  source set. They are not observations, launch or reentry
  telemetry, hazard predictions, or proof that an object is illuminated or
  visible to a person at the map location. The two reviewed NASA photographs
  are historical references to the exact object, not a view of its current
  modeled position; every unreviewed payload, rocket body, debris object, or
  unknown type remains purpose/image unavailable.
- There is no reverse geocoding, radar, precipitation forecast, account, saved
  center preference, or offline basemap guarantee. An installed shell can
  start cold offline and replay retained private local history over a plain
  local background; no cached provider response or map resource is presented
  as current.

Planned work is tracked in
[GitHub Issues](https://github.com/vasilyevstan/LiveTrafficStan/issues), not
silently expanded into V1.

## Project documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Data Sources and Licensing](docs/data-sources-and-licensing.md)
- [Orbital Tracking](docs/orbital-tracking.md)
- [Orbital Data Source Evaluation](docs/orbital-data-source-evaluation.md)
- [Orbital Purpose and Image Source Evaluation](docs/orbital-enrichment-source-evaluation.md)
- [Aircraft Provider Evaluation](docs/aircraft-provider-evaluation.md)
- [Aircraft Metadata Evaluation](docs/aircraft-metadata-evaluation.md)
- [Aircraft Photo Evaluation](docs/aircraft-photo-evaluation.md)
- [Vessel Reference Photo Evaluation](docs/vessel-photo-evaluation.md)
- [Aircraft Route Enrichment Evaluation](docs/aircraft-route-enrichment-evaluation.md)
- [Airport Board Evaluation](docs/airport-board-evaluation.md)
- [Marine Provider Evaluation](docs/marine-provider-evaluation.md)
- [Hosting and Deployment](docs/hosting-and-deployment.md)
- [Development and Testing](docs/development-and-testing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Engineering Decisions](docs/decisions.md)
- [GitHub Wiki](https://github.com/vasilyevstan/LiveTrafficStan/wiki)

## License

LiveTrafficStan source code is available under the
[Apache License 2.0](LICENSE). Redistributions and derivative works must retain
the applicable license, copyright, and [`NOTICE`](NOTICE) attribution. This
keeps the project open for permissive personal and commercial use while
preserving credit to the original project and author. The bundled orbital
propagator retains its
[`satellite.js` 7.1.0 MIT notice](public/licenses/satellite-js-7.1.0-MIT.txt).
The two bundled NASA photographs are separate informational media, excluded
from Apache-2.0, and documented in
[`public/orbital-enrichment/2026-09-29-v1/LICENSES.md`](public/orbital-enrichment/2026-09-29-v1/LICENSES.md).
