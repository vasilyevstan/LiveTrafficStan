# TrackStan

TrackStan (formerly LiveTrafficStan) is a lightweight live map of aircraft and
significant vessels in receiver-covered regions, starting around Tallinn,
Estonia. It combines
best-effort traffic feeds with MapLibre GL JS in one React application, without
user accounts or a server-side vessel history archive.

Public production: <https://trackstan.xyz>

Current application: `28235e72acd9cc9c8b9ac47765dbf45160d59592`,
with the [ranked ships in In view release](docs/hosting-and-deployment.md#ranked-ships-production-receipt-2026-10-09).
Later documentation-only commits do not replace that running source.

The existing <https://livetrafficstan.syntal.workers.dev> address remains
available. Preferences, permissions, installed apps and private history are
separate for each origin; they are not automatically migrated.

The visible logo/wordmark, browser title and install name are **TrackStan**.
The existing radar symbol is retained. `LiveTrafficStan` remains the GitHub
repository, Worker and compatibility namespace; saved data and installed-app
identity are not renamed or reset.

![TrackStan Light interface with Center visible in the main map dock](https://github.com/user-attachments/assets/07c7ef28-7bb4-43be-bc39-945f741ca191)

## Current features

- Live aircraft from [ADSB.lol](https://www.adsb.lol/) with approximately
  20-second refreshes.
- Lazily loaded selected-aircraft model, configuration, and wake-category
  context from a pinned ODC-By aircraft database, with exact identity checks,
  source age, confidence, and local failure isolation.
- Small, upright country flags beside aircraft and vessel markers, with
  accessible country text in selected details: aircraft registration allocation
  from vetted ICAO24 ranges and vessel flag state from valid ordinary MMSIs.
  Unknown, special-purpose, conflicting, and malformed identifiers are omitted
  rather than guessed. Flags reuse bundled artwork and add no network requests;
  they are allocation context, not airline nationality or verified registry data.
- Local current-aircraft search by callsign, registration, ICAO24, or reported
  type. Search ranks exact, prefix, and substring matches without changing the
  map, camera, providers, or visible marker set.
- Live marine traffic from
  [Fintraffic Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) using
  REST initialization and MQTT over secure WebSockets, with optional
  complementary [AISStream](https://aisstream.io/) and
  [Open Waters AIS](https://openwaters.io/ais/) reception for wider Class A/B
  coverage. The supplement uses a shared server-side connection per source,
  private credentials and exact-MMSI deduplication; reception remains
  best effort, not a worldwide completeness promise.
- OpenStreetMap-derived vector maps from
  [OpenFreeMap](https://openfreemap.org/), rendered with MapLibre GL JS.
- Smooth automatic globe when zooming out, with native interpolation to a
  flat local map between zoom 11 and 12. **Settings → Appearance → AUTO GLOBE /
  FLAT** provides the persistent alternative without another toolbar control,
  renderer, map instance, or provider.
- An atlas-style treatment of the default maps: blue water, visible forests
  and parks, warm roads, and clearer building and harbour detail. Light uses
  a warm paper palette; Dark uses deep-blue water with forest and bronze
  detail. This is cartographic styling, not new imagery, terrain, or 3D
  building geometry. Custom styles and the offline fallback retain their
  original paint; the separately chosen map projection still applies.
- Explicit Auto, Light, and Dark theme preferences. Auto follows the browser
  color-scheme signal, while Light and Dark remain persistent overrides; all
  three switch the base map without recreating MapLibre or resetting traffic.
- One versioned device-local preference schema remembers theme, projection, metric or
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
- A smoother zoom-out hand-off retains a small **last local traffic sample**
  at real observed positions, with no wider requests. At most twelve aircraft
  and twelve ships are decluttered and faded between zoom 7 and 3; observations
  expire within two minutes. The labelled, read-only sample is not wider live
  coverage and never enters live counts, details, trails or history.
- A 30 km session Home/Center framing plus privacy-safe one-shot browser
  location: already-granted permission and grants made while the page is open
  are used automatically; otherwise location is an explicit action with
  Tallinn fallback.
- One explicit-submit location field accepts rounded decimal coordinates
  locally or named places through Photon. Malformed numeric pairs, including
  repeated dots or signs, stay local and show an input error rather than a
  place search. Search failure never blocks coordinate navigation, Center,
  or the live map.
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
- Production-enabled, explicitly loaded AeroDataBox arrivals/departures in
  the airport inspector. Enable **More -> Layers -> AIRPORTS**, select an
  airport, then choose **Load board**. Both directions share one six-hour
  request window; source-update time remains unavailable and rows are not
  linked to live aircraft. The free allowance is shared by the entire app,
  with no automatic refresh or paid fallback.
  [Release #46](docs/hosting-and-deployment.md#airport-board-production-receipt-2026-10-08)
  first shipped at `c0ed2bea4e6291bcb4054df28482fd564012c676`;
  the current application retains the enabled board feature and its quota fences.
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
  its compact summary reports unique exact-NORAD objects shown in the
  current map, with curated (`C`) and Starlink (`S`) source counts and
  separately reported predicted passes within 90 minutes. Source counts can
  overlap; future passes are not summed into a purported unique total.
  The summary is mirrored in the
  floating status card's Provider details without changing aircraft/marine health.
  **More → Orbits** separates Nearby crossings from complete
  Catalog discovery. Search and exact type/source-group filters are local to
  the accepted snapshot; no camera, search, filter, selection, or theme change
  starts another catalog request.
  Exact SATCAT type, element epoch, snapshot age, and limitations remain
  visible; these are modeled positions, not live telemetry or optical
  visibility predictions. Exact NORAD `20580` (Hubble) and `25544` (ISS) use
  the same reviewed identity boundary for larger labeled map symbols and also
  have a bundled NASA purpose and historical photograph. Seven more exact
  missions (Terra, Aqua, Midori II, ALOS-2, Hitomi, XRISM and ACS3) have sourced
  description-only context. COSMOS 1953 / NORAD `19210` has separately labeled
  **Community context**: revision-pinned Wikidata CC0 launch, spacecraft-class
  and launch-vehicle facts, not an official individual mission or current
  operational claim. Details provide source/review dates, the exact revision,
  licensing and an explicit outbound N2YO reference without loading that site.
  Starlink has separately labeled general internet
  service context, not a per-object operational claim. Other objects remain
  explicitly unavailable without an inferred mission, featured label or
  generic picture. Hover uses bundled text only; a selected
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
- The bounded Starlink sample is included whenever **ORBITS** is enabled;
  **More → Orbits** retains its sample/source context and independent retry.
  Issue #386 removes the separate switch introduced by #257. ORBITS remains
  off by default, and neither orbital route is requested while it is off.
  Legacy saved `starlinkVisible` values are ignored on hydration and omitted
  on the next ordinary preference save; startup does not rewrite existing
  version-1 storage. Valid old `starlink=0`
  or `starlink=1` share fields are ignored without losing other settings or
  shared navigation. New share links omit the retired field. Issue #271 adds a
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
  exact ICAO24 hex lookup on committed live selection or one stable 500 ms
  fine-pointer hover, preserves the returned thumbnail and photo-page URLs,
  shows visible photographer credit, keeps bounded JSON only in current-tab
  memory, and publishes a completed hover result into already-open matching
  selected details without a second provider request.
- On-demand vessel photographs from Open Waters / Wikimedia Commons by valid
  reported IMO, with ordinary MMSI fallback and an explicit reassignment
  caveat. Selected details and stable hover preserve artist, source and
  license. A bounded same-origin metadata route keeps coordinates and
  credentials out of photo lookup; approved thumbnails load directly without
  referrer or cross-origin cookies. Eight reviewed bundled IMO photographs
  remain the first-choice fallback and require no media API request.
- Pointed ship hulls with container decks, tanker tanks, passenger
  superstructures, outriggers, sails or twin hulls, retaining blue colors,
  reported-length scale, bearings, flags and stopped/stale cues. Provider
  details and More → Sources name the feeds; the corner keeps basemap
  attribution and a compact Data credits link.
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
  Every object inspector has an accessible, top-right X that stays visible
  while scrolling. Escape closes an inspector when focus is inside it;
  either action preserves the camera and returns focus to the existing
  selection control or visible More/Settings fallback.
  White Light and slate Dark surfaces share system typography and one accent.
  Counts, marine source scope, freshness, and traffic mode remain visible;
  **Provider details** opens independent provider messages on every screen size.
- **More** (Explore map) and **Settings** (View & settings) open beside the
  desktop rail or above the mobile dock. These stable native disclosures
  retain one scroll owner per panel and session-only
  Layers/Find/Context/Orbits/Sources views. **Settings** groups the single
  explicit-submit location input, results, and search privacy text before
  **Appearance**. **Center** stays outside menus in the main rail/dock.
  The search controls stay mounted when Settings is closed;
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
- **In view** opens below Settings in the desktop rail. On phones, choose
  **Settings → Aircraft, ships & orbits in view**; the six-slot bottom dock stays
  unchanged. Aircraft and Orbits have local search and 20-row pages, with
  complete individual counts rather than cluster-symbol counts. **Ships**
  shows a shortlist of up to 20 **Longest** or **Deepest draught** matches,
  not every vessel. Ranking uses reported measurements within the current
  vessel filters; the full in-view count, rankable population and unknown
  measurements stay distinct. Ship search/filtering remains in **More → Find**.
  Ranking does not change the ships on the map. Current
  modeled orbits deduplicate exact NORAD across both sources and distinguish
  shown objects from zoom-hidden matches. Paused traffic, partial sources,
  offline retained observations, HISTORY, and unsafe globe geometry are
  explicitly qualified, never presented as a successful empty view.
  Opening, searching, ranking, or paging does not move the map or acquire provider
  data. Selecting a row uses the ordinary highlight/details and selected
  metadata/photo/route behavior. Close or Escape restores the trigger;
  one outer scroll owner leaves the full map canvas and its coverage intact.
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

AISStream + Open Waters -> shared bounded marine relay -> same-origin WSS
                       -> normalized supplemental vessels -> exact-MMSI fusion

selected aircraft -> static metadata index + one prefix shard -> details only
selected/hovered live vessel -> reviewed bundled exact-IMO photo, otherwise
                            -> IMO/MMSI -> same-origin Open Waters metadata
                            -> attributed Commons photo -> details/tooltip

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
per second. The optional relay also batches at one second, reuses upstream
subscriptions across view changes and keeps source errors independent.
Aircraft polling and marine connections pause while the document is hidden or
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

Vessel photos preserve the synchronous exact-IMO bundled boundary and add
Open Waters media lookup for other reported numbers. Full identity/revision
fencing, cancellation, bounded fulfilled-only tab caching and shared
Retry-After keep it independent of live traffic. Metadata, URLs and images
never enter history or the service-worker shell. Startup, sub-dwell hover,
camera movement, search and HISTORY start no photo lookup; source failure
never substitutes another hull.

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

| Purpose | Provider | Runtime data license | Runtime access |
| --- | --- | --- | --- |
| Map | OpenFreeMap / OpenMapTiles / OpenStreetMap | Provider and OSM attribution applies | Direct browser access |
| Place search | Photon / OpenStreetMap | OSM ODbL attribution applies | Direct browser access on explicit submit |
| Aircraft | ADSB.lol | ODbL 1.0 | Same-origin Vite/Cloudflare proxy by default; protected direct-browser build only after provider-approved CORS |
| Aircraft metadata | Mictronics aircraft-database derivative | ODC-By 1.0 | Immutable same-origin static assets, loaded only after selection |
| Selected-aircraft photos | Planespotters Photo API | API-specific and general terms apply | On-demand direct browser request and unchanged returned thumbnail; enabled in production |
| Vessel photos | Open Waters / Wikimedia Commons; eight reviewed bundled files | Individual CC BY, CC BY-SA, CC0 or public-domain rights | IMO-first/MMSI-fallback same-origin metadata lookup and direct Commons image; bundled exact-IMO matches remain local |
| Country allocations | michaeljfazio/MIDs, ibosoftnet ICAO24 transcription, Wikidata cross-check | Apache-2.0 and CC0 1.0 | Bundled deterministic local lookup |
| Marine | Fintraffic Digitraffic | CC BY 4.0 | Direct regional REST and MQTT |
| Supplemental marine | AISStream and Open Waters AIS | Documented service use / original per-source terms and credit | Optional shared server-side streams; normalized same-origin WebSocket |
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

### TrackStan public identity (#354)

The requested rename applies to the desktop/mobile header, browser title,
page description, application/Apple install metadata, manifest name and short
name, favicon title and user-facing notices. The neutral radar artwork,
immutable icon files, root manifest ID/scope and existing preference, history
and shell-cache identifiers are preserved. Provider headers and the
repository/Worker names remain unchanged.

Existing tabs use the normal **Refresh app** update action. Browser and
operating-system launcher labels can update on their own schedule; the
application does not reinstall itself or delete local data. The
[delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/354)
records the exact production source, browser evidence and compatible fallback.
This is a naming change, not a map redesign or a globe/airport-board release.

The companion #355 change moves **Center** into the existing right-side
desktop rail and bottom mobile dock, outside menus, without adding mobile
dock height. It reuses session Home: browser-granted location supplies one
rounded position; prompt/denied states keep the configured fallback.
**Settings → Use location** remains the explicit permission/retry action.
Center does not start continuous tracking or save coordinates.

### Browser magnification and controls (#359)

The floating header, dock, menus and corner credits follow the browser's
visible viewport, including its width and pan offsets. Native page
magnification is separate from map zoom: enlarged text is not counter-scaled,
and the full map canvas still determines traffic coverage.

Closed compact header/dock surfaces ignore accidental page-pinch/Ctrl-wheel
zoom. Ordinary scrolling, map gestures, browser keyboard/menu zoom and
magnification in open information/settings panels remain available.
Intentional Ctrl-wheel on those compact surfaces is also ignored because the
browser does not reliably distinguish it from trackpad pinch. If an older
shell leaves controls offscreen, reset browser zoom with Cmd+0 on macOS or
Ctrl+0 on Windows/Linux, then use **Refresh app**; do not clear site data.

### Smooth globe (#163)

Automatic globe is the default, including for older saved preferences without
a projection field. Native map zoom, not browser page magnification, drives
the transition. Flat remains available in Appearance and in explicit shared
views. Theme and fallback changes preserve the projection and valid camera,
selection, and overlays in the same map.

A visible limb, included pole, or other unsafe footprint pauses aircraft and
ships rather than inventing worldwide coverage. The existing full-canvas
100 km limit remains unchanged. Enabled modeled orbital points and tracks
remain useful at globe scale, but unsafe footprints report map/crossing counts
unavailable; back-side objects are not selectable through the Earth.

The exact application/Worker release, deployment, production browser evidence
and Wiki receipt are recorded in
[#163](https://github.com/vasilyevstan/LiveTrafficStan/issues/163).
The preceding receipts below remain historical and rollback evidence.

### TrackStan domain activation (#334)

Public production is live at <https://trackstan.xyz> on the existing
Cloudflare Workers Free application, with workers.dev retained. The domain
activation application source was `2fffb5a1556f883a014ce88ec8f721e76424671e`;
deployment `37417266192` installed Worker
`d4800a30-8303-4180-b591-c744aef9668b` at `2026-10-06T05:11:53Z`.
Both origins passed the full exact-release smoke. Normal Chrome on the new
origin rendered real traffic, opened native marine WebSockets, decoded actual
BALTIC WHALE and PH-BHH photos, and displayed both orbital catalogs and
purpose/image context with one retained map.

The owner removed the two imported parking A records; blocker #350 is
resolved without changing credentials. Cloudflare manages the apex DNS and
certificate; GoDaddy remains the registrar. No fixed IP, `www` binding,
redirect, paid service or branding change was added. See the
[activation receipt](docs/hosting-and-deployment.md#trackstan-domain-activation-334)
for the earlier partial failure, recovered aircraft response, unchanged
provider/state contracts and compatible rollback. This remains the historical
domain-activation receipt, not the source of a later application release.

### Aircraft registration-country flags predecessor (#341/#342)

The accepted aircraft-flag application source was
`99baed2dece100f9066f31fecb215df26e781911`, released through #341/#342.
Exact-main Validation `37385967766` and deployment `37386217568` passed;
Worker `aa62b10d-03d6-40d4-bdd2-2cdd2dacaeff` passed full exact-release
smoke at `2026-10-05T23:03:57.186Z`.

Aircraft now have the same small, upright country badges as vessels, derived
from the existing ICAO24 allocation and unchanged bundled artwork. Normal
Chrome observed 11 real Amsterdam-area aircraft and 11 Netherlands/UK flags,
then selected G-JZBE / `407181` / EXS75NE with United Kingdom country text.
One canvas, 226 shared images and zero extra flag requests or browser errors
remained. The [production receipt](https://github.com/vasilyevstan/LiveTrafficStan/pull/342#issuecomment-6005079795)
distinguishes that observation from the accepted local theme/mobile/rotation/
clustering fixtures and records an intermediate recovered aircraft `503`.

All prior provider, photo, orbital, marine, history and deployment inputs
remain enabled. Compatible rollback is the verified imagery predecessor
`de9d8603...` / `90338910-c837-46a5-9f55-c4eb513dd885`; no provider/state
migration or optional duplicate rollback drill was added. Wiki revision
`784938953937982381a4f39b5310f372927a8b1d` publishes the flag behavior and
actual runtime receipt. Later documentation-only main commits do not replace
the running application SHA.

### Identity photos and orbital context predecessor (#332/#333)

The preceding application source was
`de9d8603bebe1797a1b57cd0b9f99fe343858f8b`, released through #332/#333.
Exact-main Validation `37351007615` passed. Final restoration
`37355581014` installed Worker `90338910-c837-46a5-9f55-c4eb513dd885`;
full production smoke passed at `2026-10-05T18:24:26.553Z`.

This release adds real IMO/MMSI-based vessel photos, automatic selected-aircraft
photos, pointed ship designs, nine exact orbital descriptions and separately
labeled Starlink service context. Provider details and Sources name the
services/contributors while corner credits are shorter. Digitraffic, AISStream
and Open Waters remain enabled, as do private aircraft delivery, routes and
both orbital catalogs.

Actual production BALTIC WHALE / IMO `9354454` loaded an attributed 960x640
Commons image outside the bundled set. Normal Chrome loaded the real
200x134 Planespotters photo for CS-TJN / ICAO24 `49514E`; the earlier automated
CORS failure was not treated as a global outage. Native production orbital
purpose/image/fallback and touch checks at 390x844/568 retained one map and
reachable source/license controls. Aircraft marker flags were still pending
at this historical release; #341/#342 subsequently delivered them.

That release's compatible rollback was predecessor source `65eb71bad7b873c7980096f6e92a477e76fd6102`
/ Worker `5c6538ce-7fde-44ac-b288-e005f8d3d67b`, with marine still enabled.
Rollback `37354059156` switched to it; an immediate Starlink release-SHA check
failed, then unchanged attempt 2 passed before final restoration. The
[complete receipt](docs/hosting-and-deployment.md#identity-photos-and-orbital-context-332333)
preserves both outcomes. Later documentation-only commits do not redeploy
this application.

The domain setup requested in #334 is now accepted as recorded above.
The separate **TrackStan** logo/name update is implemented under #354 as
recorded above, without renaming the repository or Worker.
The fifteen-page Wiki update is published as
`a903ef941bbd43492d682b5a49e6766b51be3980`;
[production screenshots and evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/333#issuecomment-6001037124)
show the actual delivered imagery and context.

### Complementary marine predecessor (#325/#326)

The preceding accepted application was
`65eb71bad7b873c7980096f6e92a477e76fd6102`, released through #325/#326.
Exact-main Validation `37247107520` passed. Final enabled deployment
`37247800498` installed Worker `5c6538ce-7fde-44ac-b288-e005f8d3d67b`;
full production smoke passed at `2026-10-05T00:31:43.586Z`.

Digitraffic now runs alongside AISStream and Open Waters AIS. The first actual
Cloudflare source check received 63 distinct southern-Baltic vessels with both
supplemental sources live: seven AISStream and 56 Open Waters position owners,
including one reported sailing/pleasure craft at least 8 m. Its first useful
snapshot arrived in 1.504 seconds. These are bounded observations, not a
coverage census or a promise that a particular yacht is currently received.

[Final real production-browser acceptance and screenshots](https://github.com/vasilyevstan/LiveTrafficStan/pull/326#issuecomment-5986155527)
at `00:33:02Z-00:35:12Z` rendered 30 Tallinn vessels, 13 southern-Baltic vessels
and 792 Rotterdam vessels; the Rotterdam view contained 143 reported eligible
yachts. Both supplemental sources were live. Actual selection, source
attribution, both themes, cold-reconnect retention, search/Clear, narrow
layouts and native touch input passed on one persistent map. Those mobile
checks are Chrome emulation, not physical iOS/Android certification.

The same checked source was first deployed with supplementation disabled as
version `9091ba27-073f-4bb5-acbb-f2ebe395525d` (run `37247238771`), enabled,
then actually restored to that compatible version by rollback run
`37247681663` before final re-enablement. Every stage passed production smoke.
That release's primary rollback was **updated code with supplementation disabled**:
IndexedDB version 2 preserves existing history and fences older readers that
would otherwise delete unfamiliar provider records. Do not erase history or
substitute an older binary.

Private aircraft delivery, photos, plausible routes, curated/Starlink catalogs,
KV and Cron remain enabled. Only operational marine quota/retry state persists
server-side; provider keys remain protected and vessel data remains bounded
in memory. See the [complete rollout record](docs/hosting-and-deployment.md)
and [marine acceptance](docs/development-and-testing.md#multi-source-marine-acceptance).
Later documentation-only commits do not replace the running application SHA.

### Yacht/flags and aircraft-recovery predecessor (#316/#319)

The preceding accepted application was
`1afa175d8bb6b3f0636c2a02576cc82a35ced373`, the checked #319 main with
unchanged application code from yacht fix #313, country flags #314 and release
#316 (`e2b2afaa...`). Exact-main Validation `37204522573` passed. Canonical
deployment `37214110439` installed Worker
`cb5b199b-5fc9-46f4-b7d8-f816928eae5f`; full production smoke passed at
`2026-10-04T15:45:14.901Z`. The original ship deployment `37203064394`
remains a failed historical run, not a retrospectively green result.

[#174 recovery](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5980728396)
identified automatic DNF package-metadata generation immediately before the
guest stalled, with retained earlier DNF out-of-memory kills. Only the optional
`dnf-makecache.timer` was disabled. Security agents, package upgrades, kdump,
networking and relay admission remain unchanged. One controlled relay-service
restart preserved admission and recovered exact-source health before canonical
smoke. Observation through `16:21Z` crossed the former `16:15:33Z` timer
boundary with fresh memory telemetry. The final same-boot guest check at
`16:24:56Z` found healthy services and zero OOM kills; the post-window
production request returned valid aircraft JSON. The reboot alone is not
treated as the fix; see the [measured recovery record](docs/oci-aircraft-relay.md#october-4-metadata-prefetch-diagnosis-and-repair).

[Actual production ship acceptance and screenshot](https://github.com/vasilyevstan/LiveTrafficStan/pull/316#issuecomment-5980143455)
at `2026-10-04T12:51:36Z-12:51:41Z` used a fresh Chrome context with native
networking and clock, not response fixtures. It observed 35 supplied ships and
33 rendered country flags, and selected SINILIND (`276014100`): a 16 m
pleasure craft at 0 kn with the Estonian flag and matching details. The same
craft was also observed stopped/stale in the earlier retained receipt. Any
reported speed now includes stopped and unknown-speed eligible yachts; normal
two-minute stale and ten-minute expiry rules still apply. Flags are compact,
bundled MMSI-country allocation badges, not independent current-registry
verification. Class B/ANTARES coverage remains separate under #296.

That recovery left application and relay code, provider/build inputs, KV and
Cron unchanged; its only guest-setting change was the optional metadata timer.
The preceding
installed Worker was `816506f7-2cb1-4e6c-8626-ae990eb62b8a` / application
`e2b2afaa...`. The earlier accepted rollback predecessor is atlas application
`0972ba8d24ba96e18627b13b252e6ac7c5473f10` / Worker
`a22bfa09-03fa-40cd-ac76-3915e0e52eea`; the aircraft-only incident does not
justify rolling back the healthy marine change. Later Markdown-only main
commits do not replace the running application.

### Atlas predecessor (#307)

The previous accepted application was
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
remained open at that point; this was recovery, not a permanent infrastructure
repair.

That release's rollback predecessor was application
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
Earlier relay acceptance established active/enabled loopback health. A
historical bounded public proof returned
real aircraft JSON, then exact-release marked local
`503 Retry-After: 20` with
`X-LiveTrafficStan-Relay-Status: admission`, then real JSON after the advised
wait. Provider `503`, provider `429`, redirects, malformed policy, and failure
to reach eventual real JSON remain release failures.

Public Wiki commit `27a78348c9c79640a6f331cbd2c393fb4bdc4549` synchronizes
fourteen pages for #311/#312: normal yacht filters, MMSI-country flag semantics
and MIT artwork, actual production proof, and the explicit #174 overall-smoke
blocker. It identifies deployed application `e2b2afaa...`, not a later
documentation-only main commit.

Historical Wiki commit `5f9fbd82b77bdd6555379bef65431629f6abf80e` synchronized
thirteen pages for #307: atlas cartography, custom/shared-style preservation,
actual retained-cache/browser evidence, Impeccable use and independent relay
recovery. It identifies that release's application `0972ba8d...`, not a later
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
  filtering does not reduce incoming MQTT bandwidth. The optional AISStream /
  Open Waters supplement adds Class A/B reception without claiming every
  region or vessel is covered. Yacht type and known length at least 8 m remain
  required; absent or delayed static metadata cannot be inferred. Source
  failures, shared capacity limits and exhausted free budgets remain visible.
- Views whose conservative enclosing radius exceeds 100 km pause live traffic.
  **Resume live** keeps the current map center and returns to the reviewed safe
  framing; manual zoom-in or reduced tilt remain available. Partial coverage is
  never presented as complete. A recent preceding eligible view may leave
  labelled, fading local sample markers during zoom-out; an initial wide view
  has no such sample. ORBITS remains opt-in and appears only at real modeled
  positions, so an empty area is not filled with invented orbital objects.
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
- When airport boards are enabled in the deployment, select an airport with
  an explicit ICAO code and choose **Load board** for AeroDataBox arrivals and
  departures. Loading is explicit: opening an airport, changing direction or
  theme, and resizing do not fetch a board. **Reload** becomes available after
  the shared cache/retry boundary. The requested six-hour window is anchored
  to the original request, including when another viewer receives cached data.
  Airport-local times retain dates/UTC offsets; revised times may be estimated
  or actual. Source update time is unknown and codeshares can appear separately.
  The ongoing-free, noncommercial plan allows at most **200 uncached combined
  boards per billing month shared app-wide**, before other charged work.
  Exhaustion is explicit, with no paid fallback, automatic refresh, flight
  archive or inferred connection to map aircraft. See the
  [board contract and evidence](docs/airport-board-evaluation.md) and
  [#46](https://github.com/vasilyevstan/LiveTrafficStan/issues/46).
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
- Dynamic vessel-photo coverage depends on Open Waters / Commons. A reported
  number match is a historical reference, not live confirmation of the
  transmitting hull; MMSIs can be reassigned. Eight bundled IMOs additionally
  retain manual review. Empty, failed and unsupported responses remain
  distinct, with no substitute image or guaranteed yacht coverage.
- Orbital positions and map crossings are SGP4 models from a bounded reviewed
  CelesTrak catalog; the `visual` group is only one member of the curated
  source set. They are not observations, launch or reentry
  telemetry, hazard predictions, or proof that an object is illuminated or
  visible to a person at the map location. The two reviewed NASA photographs
  are historical references to the exact object, not a view of its current
  modeled position. Nine exact objects have reviewed official purpose text;
  COSMOS 1953 has community-maintained historical facts, not a verified mission.
  Other unreviewed objects remain unavailable. Starlink service context is explicitly general,
  not an inferred individual mission.
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
