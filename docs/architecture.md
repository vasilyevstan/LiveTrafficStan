# Architecture

## System shape

LiveTrafficStan V1 is a browser application with no authentication, account
database, or general backend. Production adds one fixed-route Cloudflare Worker
for browser-incompatible aircraft and weather access plus a
disabled-by-default aviationstack route. One SQLite-backed Durable Object stores
only global route-attempt timestamps. React owns controls and selected-object
UI state. Provider adapters own external protocols and normalization. MapLibre
owns high-frequency geographic rendering.

```text
                       visibility lifecycle
                               |
ADSB.lol -> same-origin aircraft proxy -> aircraft adapter -> normalized Aircraft[]
                                                        |
Digitraffic REST + MQTT -> marine adapter -> normalized Vessel[]
                                                        |
                           freshness + local vessel filters + bounded history
                                                        |
                           React overlays <-> persistent MapLibre map

selected Aircraft -> static metadata index + prefix shard -> details panel only
selected live Aircraft + explicit Find route
             -> same-origin Worker -> global attempt quota -> aviationstack
             -> strictly matched origin/destination
             -> bounded six-hour tab cache -> details panel only
selected ICAO24/MMSI -> bundled validated allocation tables -> details only
PORTS toggle -> validated static Natural Earth projection -> port map/details
AIRPORTS toggle -> validated static OurAirports projection -> airport map/details
METAR toggle -> explicit airport ICAO codes -> same-origin AWC route
             -> normalized observations -> weather map/details
current Aircraft[] -> local literal search -> existing traffic selection

coordinate text -> local parser ------------------------+
named text -> Photon adapter -> PlaceSearchResult[] ----+-> view navigation
session Home / one-shot location -----------------------+
```

Local development and preview use fixed Vite same-origin proxies. Production
uses a strict Cloudflare Worker that accepts only the validated ADSB.lol point
route, canonical AWC METAR route, and exact aviationstack route request. Vite
does not proxy aviationstack; credentialed local testing uses `wrangler dev`.
Only the aviationstack path holds a provider credential or creates server-side
state, and both remain inert while its client and Worker flags are false.

## Source responsibilities

| Area | Responsibility |
| --- | --- |
| `src/config/` | Typed defaults and validation of browser-safe environment overrides |
| `src/domain/` | Application-owned traffic/port/airport/weather/flight-route types, local discovery and filters, pure country-allocation lookup, geographic helpers, location-input parsing, versioned preferences/share state, unit conversion, and formatting |
| `src/providers/aircraft/` | ADSB.lol request, runtime payload checks, normalization, and unit conversion |
| `src/providers/aircraftMetadata/` | Bounded same-origin static metadata loading, provenance/schema/hash validation, exact identity matching, and shard LRU |
| `src/providers/flightRoute/` | Explicit same-origin route requests, bounded response validation, typed unavailable/error results, and aviationstack attribution |
| `src/providers/marine/` | Digitraffic capabilities, REST/MQTT lifecycle, metadata merging, normalization, and opt-in development diagnostics |
| `src/providers/ports/` | Bounded lazy same-origin port loading plus checksum, schema, and source-provenance validation |
| `src/providers/airports/` | Bounded lazy same-origin airport loading plus checksum, schema, and source-provenance validation |
| `src/providers/weather/` | Canonical same-origin AWC requests, bounded JSON validation, METAR/SPECI normalization, newest-report selection, and source provenance |
| `src/providers/geocoding/` | Photon request construction, response bounds, runtime GeoJSON validation, result normalization, and attribution identity |
| `src/app/` | React hooks/controllers for provider lifecycle, unified preference persistence, place-search cancellation/cache, bounded selected-route session cache, navigation intent, time ticks, offline state, and traffic-history orchestration |
| `src/history/` | Provider-qualified observation projection, bounded session history, IndexedDB transactions, settings, indexes, playback, and gap-aware historical trails |
| `src/traffic/` | Filtering, freshness/expiry, interpolation, and selected-trail history |
| `src/map/` | MapLibre lifecycle, external/local-fallback styles, GeoJSON sources/layers, feature selection, and marker images |
| `src/components/` | Status, controls, and selected-object details |
| `worker/` | Fixed upstream proxies, sanitized route matching, and the timestamp-only global route quota |
| `scripts/pwa-shell.mjs` | Deterministic shell allowlist/versioning, request classification, two-generation cleanup, and normal/retirement worker source |
| `public/manifest.webmanifest` | Root-scoped standalone install metadata and versioned maskable icons |

## Provider boundaries

UI and map code never consume raw provider payloads. Each adapter:

1. checks the top-level response shape;
2. validates coordinates and stable identifiers;
3. normalizes timestamps and movement direction;
4. converts provider units to metric values;
5. preserves unavailable data as unavailable rather than guessing it;
6. emits application-owned `Aircraft` or `Vessel` records.

An eligible map viewport produces a center rounded to three decimal places and
a conservative enclosing radius no greater than 100 km. Aircraft requests
convert that radius to an outward-rounded integer nautical-mile query for
ADSB.lol. Eligibility is decided first, so an exact 100 km viewport uses 54 NM
(100.008 km) for transport without widening the display boundary.

Digitraffic REST supplies an initial location snapshot for the same enclosing
circle and the current vessel metadata set. MQTT then updates location and
metadata records. The adapter retains only the latest record per MMSI, removes
expired locations, and filters its cache to the enclosing circle before
emitting a snapshot.

The marine boundary also exposes one immutable capability descriptor. It
records direct keyless browser access, radius REST, the all-published-vessels
stream, CC BY 4.0 obligations, regional source scope, unknown exact coverage,
and documented Class A/fishing-vessel exclusions. It is not a provider
registry and does not drive networking or infer a coverage polygon.

After provider normalization, the application filters both traffic kinds to the
actual unwrapped viewport polygon. An object inside the enclosing circle but
outside the visible rotated or pitched footprint is not displayed.

Place search is a separate non-traffic boundary. Strict decimal coordinate
pairs are parsed, range-checked, and rounded locally. Other non-empty submitted
text reaches the Photon adapter only after explicit form submission. The
adapter permits one fixed configured endpoint, bounded query/result sizes, no
credentials, and no browser geolocation bias. It validates GeoJSON Point
features, preserves provider order, deduplicates stable OpenStreetMap
identities, and emits bounded application-owned `PlaceSearchResult` records.
Raw Photon payloads never enter React or MapLibre.

Selected-aircraft metadata is another independent boundary. It accepts only the
normalized live ICAO24, registration, and type identity. The provider loads no
asset until selection, then reads one validated index/type dictionary and at
most one two-hex-prefix TSV shard under one deadline. Exact ICAO24 is primary;
present live registration and type must agree, duplicated registrations are
unavailable, and missing live registration produces an explicit ICAO24-only
confidence label. Metadata remains separate from the live `Aircraft` object and
never changes provider health, freshness, history, or marker artwork.

Country allocation is a smaller bundled boundary. Pure synchronous helpers
derive an optional country name and ISO code from the selected entity's
existing ICAO24 or ordinary ship-station MMSI. The generated tables are
validated at build time and imported with the application bundle, so opening
details creates no request, cache, loading state, persistence, provider work,
or history-schema change. Unknown, special-purpose, conflicting, invalid, and
excluded source rows produce no detail row.

Vessel discovery is an application-owned display boundary after freshness and
exact viewport filtering. Search and typed filters consume only normalized
`Vessel` fields and never alter provider queries, the global MQTT
subscription, REST/metadata gates, cache ownership, or source snapshots.
Unknown category, navigation, speed, and length values remain explicit rather
than being coerced into known values.

Aircraft discovery is another local display boundary after exact viewport and
freshness filtering. Literal case-insensitive matching covers current callsign,
registration, ICAO24, and provider-reported type. Exact, prefix, and substring
ranking preserves display order for ties. Typing never filters map markers,
moves the camera, queries a provider, or loads static metadata; selecting a
result reuses the existing traffic selection path.

Optional port context is not a traffic provider. The runtime provider makes no
request until the PORTS layer is enabled, then loads one immutable same-origin
GeoJSON file under a five-second deadline and 512 KiB cap. It verifies UTF-8,
JSON, complete feature grammar, ordered IDs, coordinates, ranks, record count,
rank distribution, and SHA-256 before a fulfilled-only session cache is
created. Ports have separate IDs and selection and never enter traffic counts,
trails, provider health, destination/ETA logic, or vessel relationships.

Optional airport context is likewise not a traffic provider. AIRPORTS starts
off and lazily loads one immutable same-origin GeoJSON projection under a
five-second deadline and approximately 1.5 MiB cap. The provider verifies the
exact byte count, SHA-256, UTF-8/JSON grammar, ordered persistent IDs,
coordinates, field grammar, record count, and large/medium distribution before
creating a fulfilled-only session cache. Static airport points have separate
IDs and selection and never imply operating status, route, arrival, departure,
or a relationship to visible aircraft. A geometrically valid map footprint
remains available to this static context even when its enclosing radius is too
wide for live traffic; the 100 km provider gate does not disable airport
listing or selection.

Optional weather observations are a separate, non-traffic provider boundary.
METAR starts off, reuses only explicit four-letter `icaoCode` values from the
pinned large/medium-airport projection, and sends a sorted unique set of at
most 50 IDs through `/api/weather/metar`. The browser never calls AWC directly,
forwards credentials, derives stations from visible traffic, or treats static
airport `ident`/IATA values as ICAO codes. The adapter accepts only requested
METAR/SPECI records, validates Unix-second observation time and bounded fields,
and keeps the newest valid report per station.

## Lifecycle and failure isolation

Aircraft and marine providers have separate state, cancellation, and error
paths. A failure in one provider produces `PARTIAL` status while the other
continues to render.

- Aircraft requests never overlap. A revision-aware controller cancels obsolete
  work, rejects late old-area results, and prevents request starts more often
  than every 20 seconds. Polling pauses when the browser is offline, the
  document is hidden, or the viewport is ineligible; restoration resumes at
  the next cadence-safe or `Retry-After` boundary without reconstructing the
  controller.
- Marine REST requests are deduplicated by controller state. MQTT reconnects
  no more often than every 15 seconds after disconnection. Eligible viewport
  changes immediately refilter cached provider-wide MQTT records, reuse the live
  connection, and permit a location REST refresh no more than every five
  minutes. Hidden or ineligible states stop active REST, interval, timeout, and
  MQTT resources while retaining the provider, cache, and all timing gates;
  unmount performs final shutdown.
- Provider errors remain visible until a successful request or subscription
  recovers that provider.
- Place search has its own cancellable controller and UI state. It permits one
  active request, rejects stale revisions, enforces local submit and
  rate-limit deadlines, and keeps a bounded session-only success/empty cache.
  Search failure does not change the current camera or either traffic provider.
- Aircraft metadata has its own selected-identity controller. It aborts on
  aircraft changes, vessel/empty selection, or unmount. State carries the full
  identity key plus a monotonic revision, so late A callbacks cannot render
  after A to B to A selection changes. Only complete valid assets enter one
  index cache and an eight-shard LRU; failure remains local to the detail card.
- Port loading has its own lazy state and retry. Failure remains inside the
  layer control, leaves MapLibre and both traffic providers usable, and never
  creates a success-shaped empty port dataset.
- Airport loading has its own lazy state and retry with the same isolation.
  Disable or unmount aborts unfinished work; an obsolete success or failure
  cannot publish into current UI state.
- Weather loading has a separate generation, abort controller, and
  session-lived start gate. There is no startup request or recurring poller.
  Starts remain at least 60 seconds apart across station changes, refreshes,
  retries, hide/show, and `Retry-After`. Hidden, disabled, superseded, and
  unmounted work aborts; a fulfilled same-view result survives hide/show and
  theme/style changes. Weather failure does not alter map health, traffic,
  airport/port context, camera, or provider schedules.

## Freshness, motion, and history

Freshness is derived from a provider observation timestamp where available and
the receipt timestamp otherwise.

- Aircraft becomes stale after 45 seconds and expires after 120 seconds.
- Marine traffic becomes stale after 2 minutes and expires after 10 minutes.
- Weather observations become stale after 75 minutes and expire after 120
  minutes.
- Expired objects are removed from display.

The map interpolates for at most 1.5 seconds between two provider-observed
positions. It never extrapolates beyond the newest observation. Trails contain
only observed positions and render only for the selected object. Users can hide
the line or choose 5, 15, 30, or 60 minutes; the default remains 15 minutes.
The selected duration permits at most 12 points per minute for each object, and
the whole in-memory trail map is capped at 50,000 points with deterministic
oldest-first eviction. A committed coordinate, place-result, Center, or
successful Use Location navigation clears selection and resets retained trail
points so observations from the previous area are not connected to the new
view. Invalid input and failed search do not alter the existing selection or
history.

The history boundary has two stores:

- an always-on volatile session store bounded to 60 minutes, 50,000 records,
  16 MiB logical payload, and one provider/entity sample per 10 seconds;
- an explicit opt-in IndexedDB store bounded to 1, 6, or 24 hours, 100,000
  records, and 32 MiB logical payload.

Both store only versioned normalized ADSB.lol or Fintraffic Digitraffic
observations with provider, license-decision, source-time, receipt-time,
session, and navigation-segment identity. Interpolation frames, route data,
destination/ETA, browser location, current METAR, and third-party aircraft
metadata are not persisted. Vessel metadata is visible in history only after
its own observation time.

IndexedDB writes recheck opt-in authorization and a monotonic recording epoch
inside the transaction. Clear and Disable increment that epoch atomically with
deletion, so queued work cannot repopulate old observations. Every pending
batch retains the epoch under which it was enqueued. Typed cross-tab Clear
invalidations clear volatile session history and pending writes before reload;
Disable clears pending writes. Failed batches remain queued, while quota or
transaction suspension remains visible until explicit recovery.

Startup validation, malformed-row deletion, canonical-row repair, metadata
recount, and optional pruning share one readwrite transaction. The repair
preserves the transaction-current authorization and epoch, enforces exact
provider/kind/license tuples, strips fields outside the persistence allowlist,
and recomputes logical bytes. It cannot write an earlier metadata snapshot over
a concurrent Clear or Disable.

Playback freezes the available range on entry and has `live`,
`history-paused`, and `history-playing` states. Scrubbing pauses; playback
publishes at no more than 10 Hz and stops at the frozen endpoint. Live
acquisition continues through the existing controllers while eligible, but
offline, hidden, unmounted, and ineligible-view states still pause provider
work without resetting cadence or reconnect gates. Historical snapshots use
separate durable and session indexes so current ingestion does not rebuild a
100,000-record index. Successfully committed rows accumulate as bounded
in-memory deltas and merge into the durable index when volatile rows begin
pruning; ordinary long-running recording does not rescan the complete
IndexedDB store every minute.

## Map rendering

`TrafficMap` creates one MapLibre instance. Aircraft, vessels, and the selected
trail use persistent GeoJSON sources and layers whose data or visibility is
updated in place. This avoids one React component or DOM marker per traffic
object. Stable feature IDs use incremental `GeoJSONSource.updateData` diffs for
ordinary traffic movement; style replacement and forced recovery still install
complete source snapshots.

The optional port, airport, and weather sources are separate from traffic.
Port rank groups
appear progressively from zoom 5 through 10, all port rendering stops at zoom
13 because the coordinates are generalized, and neutral theme-aware styling
stays below airport and traffic layers. Large airport points start at zoom 4
and labels at zoom 5; medium points and labels start at zoom 7 and 8, with no
upper zoom cutoff. METAR circles and labels render above ports/airports and
below traffic; stale reports include text as well as reduced opacity. Picking
is deterministic: exact traffic, cluster expansion, validated traffic touch
fallback, exact weather, airport, and port, then weather, airport, and port
touch fallbacks. Selecting traffic, weather, airport, or port clears the other
selection kinds; an empty map click clears all.

Aircraft and vessel clustering is an optional remembered display preference.
Each traffic kind keeps its own clustered GeoJSON source, count label, and
expansion behavior. Cluster features never become application entity IDs and
are excluded from touch entity fallback. `clusterMinPoints` is fixed at source
creation, while the on/off change uses MapLibre's source cluster options.
Because every `setData()` rebuilds the Supercluster index even above the
display cluster zoom, per-frame interpolation is suspended whenever clustering
is enabled; provider snapshots, filtering, freshness, selection, and request
cadence remain unchanged.

After settled pan, zoom, rotation, pitch, Home, and real resize changes, the map
unprojects a bounded sample of the full-canvas perimeter, including every
corner. Domain code normalizes antimeridian wrapping, rejects invalid or
world-spanning geometry, rounds the query center, and calculates the enclosing
radius. Floating UI panels do not alter this footprint.

If the enclosing radius exceeds 100 km or the geometry is unsafe, traffic and
trails are removed from the map, selection is cleared, and the interface shows
a zoom or tilt prompt. The application never clamps the query, divides the
viewport into hidden partial requests, or treats an empty successful response
as proof of coverage.

Marker silhouettes and compact state badges are generated by repository-owned
canvas drawing code. A pure presentation boundary derives render-only icon,
movement, altitude-band, vertical-trend, and rotation properties after live or
historical reconstruction. These values enter only the MapLibre GeoJSON
projection; provider-owned `markerIcon` values and historical observations
remain byte-compatible.

Provider normalization chooses one application-owned icon key; React and
MapLibre never parse raw ADS-B or AIS category codes. The bounded vocabulary is:

| Source field | Application silhouette |
| --- | --- |
| ADS-B A1/A2 | Light/small fixed-wing |
| ADS-B A3/A4/A6, missing, or unsupported | Generic fixed-wing |
| ADS-B A5 | Heavy fixed-wing |
| ADS-B A7 | Helicopter |
| AIS ship type 30 | Fishing |
| AIS ship type 52 | Tug |
| AIS ship types 60-64 or 69 | Passenger |
| AIS ship types 70-74 or 79 | Cargo |
| AIS ship types 80-84 or 89 | Tanker |
| Other, missing, invalid, or unsupported AIS types | Generic vessel |

The presentation boundary may replace the rendered generic vessel silhouette
with an exact type shape for normalized `Sailing vessel`, `Pleasure craft`, or
`High-speed craft`. These additional image IDs are not persisted marker keys.
Cargo, unknown, broad `other`, names, dimensions, and movement never imply a
yacht or unsupported cargo subtype.

The local filter taxonomy is slightly broader than the artwork vocabulary:
types 31, 32, 50-55, 58, and 59 are `tug-service`; known non-filter categories
20-24, 29, 33-37, 40-44, 49, 90-94, and 99 are `other`. Reserved subcodes such
as 65-68, 75-78, 85-88, and 95-98 remain `unknown`; they are not silently
folded into passenger, cargo, tanker, or other.

The category is never inferred from speed, altitude, name, callsign, operator,
route, location, or movement. A later provider-reported category can change the
icon key while the stable entity ID preserves selection, trail, freshness,
camera, layer, and provider state.

Vessel movement is a separate render state derived only from finite reported
speed over ground: at least one knot is moving, non-negative speed below one
knot is slow/stopped, and missing, invalid, or negative speed is unknown.
Movement uses a screen-upright shape badge as well as text; slow and unknown
vessel silhouettes are north-up rather than implying a stationary course.
Navigation status stays independent, and contradictory speed/status reports
are shown rather than silently reconciled.

Exact normalized sailing and pleasure types use a dedicated visibility branch.
They render only with known length of at least 8 m, finite non-future position
age no greater than the marine stale threshold, and finite speed of at least
one knot. The rule uses the live clock or historical cursor and never falls
through to the ordinary length filter. Non-yachts retain the 50 m default.
Digitraffic publishes Class A AIS only, so this does not claim comprehensive
Class B yacht coverage.

Aircraft keep their cyan provider-reported silhouette. A non-cluster circle
layer adds four sequential reported barometric-altitude bands plus neutral
unknown, while a screen-upright badge combines band number with reported
climb, descent, small vertical rate, or unknown state. Zero and negative finite
altitudes remain in the lowest band and never imply on-ground status.

Marker selection always queries the exact rendered point first. A map-local
pointer tracker permits an 8 CSS-pixel box only after an exact miss from one
completed touch tap. Duplicate world copies collapse by application ID, and the
fallback selects only one unique currently eligible entity. Mouse, unknown,
drag, pinch, canceled, ambiguous, hidden, and expired cases remain exact or
empty.

MapLibre 6 ships its tile parser as a separate module worker. Vite's dependency
prebundling changes `import.meta.url`, so MapLibre cannot safely infer the
worker location. `TrafficMap.tsx` imports the worker with Vite's
`?worker&url` suffix and calls `setWorkerUrl` before map construction. Both
development and production builds must preserve this explicit worker asset or
vector tiles will remain in a loading state.

## Performance choices

- MQTT is dynamically imported so it is a separate production chunk.
- Marine messages are merged continuously but React receives snapshots at most
  once per second.
- MapLibre sources update without rebuilding the map.
- The complete ten-image silhouette set is generated once per resolved theme and reused;
  style rehydration updates the same bounded image IDs.
- Motion animation samples normalized state rather than adding provider points
  on every frame.
- Session and durable history have independent time, count, and logical-byte
  bounds.
- Network work pauses while offline, hidden, or viewport-ineligible, without
  resetting session timing or cache state.
- Aircraft metadata has zero startup requests and lazy prefix loading. Static
  assets use immutable deployment caching, while application memory retains
  only one index and eight validated shards.
- Port context has zero startup requests, one bounded lazy static load, and a
  fulfilled-only session cache. Local vessel search/filter changes perform no
  network work and do not rebuild the map.
- Airport context has zero startup requests, one bounded lazy static load, and
  a fulfilled-only session cache. Local aircraft search changes perform no
  network work and do not rebuild the map.
- METAR has zero startup requests and no periodic poller. A maximum 50-station
  request is bounded to 256 KiB and starts no more frequently than once per
  minute per session. Theme changes, style rehydration, clustering, and
  hide/show of a fulfilled same-view result do not refetch.

## Deployment boundary

Cloudflare Workers with Static Assets is the selected one-unit production
boundary:

1. `dist/` is served as Static Assets;
2. fingerprinted `/assets/*`, versioned `/aircraft-metadata/*`, versioned
   `/ports/*`, and versioned `/airports/*` responses use immutable browser
   caching;
3. Worker code runs first only for `/api` and `/api/*`;
4. the only forwarded routes are the fixed aircraft point route and canonical
   `GET /api/weather/metar?ids=...`;
5. OpenFreeMap, Photon, and Digitraffic HTTPS/WSS remain direct browser
   connections;
6. map, search, aircraft, marine, optional-port, optional-airport, and weather
   attribution remains visible.

The production proxy accepts canonical finite latitude/longitude values and
integer radii from 1 through 54 NM. It rejects query strings, other methods,
other paths, redirects, responses over 4 MiB, and work exceeding the ten-second
total deadline. It constructs a fixed ADSB.lol destination, forwards only a
JSON accept header and stable public project User-Agent, preserves upstream
status/body/content type/`Retry-After`, and sets no-store behavior in both
directions.

No application database, general backend, provider scheduler, shared live
cache, preview deployment, or server-side marine relay is added. Worker
observability is disabled because request URLs contain rounded camera
coordinates or visible station IDs. Cloudflare and upstream network
intermediaries still process ordinary request metadata.

Production activation, public browser smoke, and rollback against a prior
version wait only on the permanent account/credential prerequisite in Issue
#39. See [Hosting and Deployment](hosting-and-deployment.md).

## Navigation and viewport boundaries

The application keeps session Home, explicit view targets, and the current
camera distinct while making the settled visible canvas the traffic contract:

```text
configured / allowed auto location -> session Home + initial view
session Home ------------------------------ Center ----------+
explicit Use Location -----------> session Home + view ------+
coordinate / Photon result -------------------------------> view request
                                                              |
                                                     MapLibre framing
                                                              |
settled pan / zoom / rotate / pitch / resize
                                                              |
                         full-canvas footprint
                                   |
                    +--------------+--------------+
                    |                             |
          <= 100 km eligible              invalid / too wide
                    |                             |
       enclosing-circle provider query       providers paused
                    |                         traffic hidden
          exact-polygon display filter       zoom/tilt prompt
```

`TrafficMap` mounts before any provider query and reports a viewport only after
MapLibre has usable geometry. `App` owns the latest assessment, session Home,
current target label, and monotonic view request. Provider data never moves or
fits the camera.

Explicit coordinate submission, place-result selection, Center, Use Location,
and trusted manual map interaction advance a navigation-intent revision. An
older asynchronous geolocation callback may still update session Home, but it
cannot steal the camera after a newer explicit intent. A successful explicit
Use Location may move the view only while it remains the latest intent.
Coordinate and place navigation never mutate Home.

Programmatic view requests retain their target label. Trusted canvas wheel,
double-click, supported map-keyboard input, or pointer movement beyond the
drag threshold changes the visible label to `Custom view`. Simple marker clicks
do not. All navigation reuses the same MapLibre instance and settled viewport
pipeline; it does not add another traffic scheduler or reconnect marine MQTT.

The aircraft hook creates one revision-aware polling controller after the first
eligible query and retains it for the session. The marine hook does the same
with its provider. Query changes replace the latest desired request or refilter
the cache without creating another scheduler. Page visibility and viewport
eligibility compose as pause reasons. Layer visibility remains display-only.

## Portable preferences, explicit sharing, and units

`livetrafficstan.preferences.v1` is the one complete allowlisted preference
schema. It stores theme, presentation units, six layer flags, structured vessel
filters without free text, and selected-trail visibility/duration. It excludes
camera, browser Home/location, searches, selections, provider state,
observations, history settings/data, and playback.

Startup resolves each supported field from a valid explicit `#v=1&...`
fragment, then saved preferences, then defaults. A fragment camera is atomic,
rounded to three decimals, initializes MapLibre directly, schedules the same
settled viewport assessment as a normal fit, and synchronously fences off
automatic geolocation. Camera reporting is independent of viewport-assessment
deduplication so even repeated ineligible views can be shared accurately.
Opening a link never writes its overrides automatically.

Domain, filter, provider, viewport, and history values remain metric.
`metric | aviation-nautical` changes formatting only: altitude, speed, vertical
speed, METAR wind, and numeric/qualified visibility. Vessel dimensions and
length filters remain metres. AWC wind and visibility are normalized at the
provider boundary; bounded source visibility tokens are retained so aviation
qualifiers round-trip without invention.

Reset removes only unified preferences, the legacy theme compatibility key,
and the current share fragment. It does not move the camera/Home or alter
private-history consent, epochs, settings, or IndexedDB. Existing selection
invalidation still applies when reset defaults hide or filter the selected
object.

## Theme lifecycle

Application colors are CSS custom properties selected by a validated
`auto | light | dark` field in `livetrafficstan.preferences.v1`.
Missing, invalid, or unavailable storage preserves the prior deterministic
Light default. Auto resolves `prefers-color-scheme: dark` before first paint
and subscribes to system changes; explicit Light/Dark overrides do not.
The map receives only the resolved Light or Dark theme and corresponding
configured OpenFreeMap style.

The legacy `livetrafficstan.theme` key is read only when the unified key is
absent and is mirrored for rollback compatibility. Pre-paint and React apply
the same fragment/unified/legacy/default precedence.

Theme changes call `map.setStyle` on the existing instance. An idempotent
installer runs after `style.load` to restore repository-owned images, GeoJSON
sources, layers, current data, clustering options, visibility, selected trail,
and any loaded port, airport, or weather source/selection.
Interaction listeners remain registered once, and a style revision prevents a
late obsolete load from winning. Provider hooks, React selection/history, and
camera state do not restart.

## Application-shell and offline lifecycle

The service worker is build output, not hand-maintained source. After Vite emits
the exact hashed application, MapLibre-worker, and lazy MQTT files,
`scripts/generate-service-worker.mjs` scans `dist`, computes a content version,
including the worker policy source so worker-only changes receive a new cache
identity, enforces a 4 MiB uncompressed budget, and writes stable `/sw.js`.

The precache allowlist contains only:

- `/` and `/index.html`;
- built `/assets/*`;
- `manifest.webmanifest`, `favicon.svg`, and the versioned 192/512 icons.

It excludes `/api/*`, Digitraffic REST/MQTT, OpenFreeMap styles/tiles/glyphs/
sprites, Photon, AWC, aircraft metadata, airports, ports, and IndexedDB
history. Root/index navigations are network-first with cached `index.html`
fallback. Exact shell assets are cache-first; any other request is not handled
by the service worker and receives no SPA fallback.

Install precaching is fail-closed. A waiting generation is complete before it
can activate. Cached root-response metadata records the generation that was
actually active when the candidate installed, so a superseded waiting worker
cannot displace the real predecessor. Activation retains only its own cache and
that recorded predecessor, deleting no unrelated caches. The active generation
is always searched first, including rollback to an already-existing cache; the
predecessor remains available for an older tab's deferred hashed import.
An incomplete inactive cache left by browser termination is rebuilt on the next
install attempt; an incomplete cache marked active is never replaced in place.

The application registers only in production secure contexts with
`updateViaCache: none`. First install does not call `skipWaiting`, claim the
open page, or show an update action. A later waiting worker appears as
**REFRESH APP**; the user action authorizes `skipWaiting`, conditional
`clients.claim`, and one guarded reload per controlled tab.

When an external style cannot load, `TrafficMap` installs a bundled
source-free, theme-aware background into the same MapLibre instance. It then
installs the normal traffic/history sources and reports a viewport, allowing
retained IndexedDB entities and trails to render without claiming an offline
basemap. Reconnect retries the configured external style in the same map and
preserves camera, selection, history, and provider controllers.

`npm run build:pwa-retire` disables normal registration and emits an
unconditionally activating retirement worker at the same `/sw.js` path. The
protected production workflow selects the `pwa-retirement` artifact for this
exact-SHA deployment. It deletes only `livetrafficstan-shell-*` caches,
unregisters, and navigates controlled windows once. Preferences, history
settings, unrelated caches, and IndexedDB are outside that boundary. A pre-PWA
rollback must continue serving this worker at `/sw.js` for dormant
registrations.
