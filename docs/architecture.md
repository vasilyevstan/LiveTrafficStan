# Architecture

## System shape

LiveTrafficStan V1 is a browser application with no authentication, account
database, or general backend. Production adds one fixed-purpose Cloudflare
Worker for browser-incompatible aircraft/weather access, the protected
scheduled CelesTrak snapshot, an optional isolated marine-stream relay and
the fixed Open Waters vessel-photo metadata route.
Plausible route lookup, Digitraffic marine traffic, place search, map data,
and aircraft photos use reviewed direct browser paths.
Vessel photos prefer reviewed versioned same-origin assets, then use a bounded
reported-IMO/MMSI lookup and credited Commons image. React owns controls and selected-object UI state.
Provider adapters own external protocols and normalization. MapLibre owns
high-frequency geographic rendering.

The recovery architecture for Cloudflare-shared-egress throttling preserves
that public boundary and inserts a private Workers VPC Service, Cloudflare
Tunnel, and fixed-purpose OCI relay only behind the aircraft route. The relay,
remote-managed Tunnel, VPC Service, and QUIC connector are deployed. The
Worker selects that path only through the protected `oci-private-relay`
deployment mode and fails closed rather than reverting to shared egress.
Production source `1f9a2fd322f141fe761d3bf00113e1ab60526e6c` and the relay
originally activated the private path together. The relay-memory recovery
receipt records application `1afa175d8bb6b3f0636c2a02576cc82a35ced373`.
Canonical run `37214110439` deployed Cloudflare version
`cb5b199b-5fc9-46f4-b7d8-f816928eae5f` and passed full production smoke.
Application code is unchanged from the #316 ship release; its earlier failed
aircraft smoke remains historical evidence. The #174 guest-memory diagnosis
removed only automatic DNF metadata prefetch by disabling
`dnf-makecache.timer`. It does not change this topology, provider contracts,
security agents, kdump, package upgrades or admission. Observation crossed the
former timer boundary without a telemetry gap; final same-boot guest and
private-route checks passed in the [relay record](oci-aircraft-relay.md).
The application continues to use
relay source `18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8`; relay source
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` is retained as the relay rollback
release.

The #300 layout remains: no full-width bar, with a 280x88 px
floating status card. Search, results and privacy text share the existing
Settings body and retain one mounted input/model. Center is outside menus in
the main rail/dock. The right desktop
rail, inward panels, opposite inspector and mobile bottom dock remain.
Impeccable's installed guidance and detector informed this CSS-led refinement
without adding state or a design framework. It changes no provider, worker,
or sampling boundary. The earlier #307 adds the retained atlas basemap treatment
through the existing MapLibre installer, preserving that layout and those
provider boundaries; the exact/shared-style rules are described below.
Release #316 adds display-only MMSI-country flags and restores normal yacht
speed/freshness filtering without changing those infrastructure boundaries.
The earlier #275 Starlink release remains intact: the same
route negotiates a 512-record shell-balanced schema 2 while retaining
the fresh 150-record schema 1 for predecessor clients. The two public members
come from one complete GP/SATCAT normalization and one final KV bundle write.
The map still uses one MapLibre instance and one shared physical orbital
worker; exact 192/384/512 display tiers, selected exceptions, separate
curated/Starlink channels, and independent aircraft/marine lifecycles remain.
Pre-release Chrome acceptance retained one MapLibre canvas,
all 26 Starlink pages, one active
physical orbital worker, responsive touch movement, exact theme restoration,
and zero browser CelesTrak or external vessel-photo request.

The first exact-source orbital-enrichment run `36627068064` deployed healthy
application/orbital/enrichment assets as Cloudflare version
`7b1233c9-3461-440b-ac5f-1d30b02c0525` but exposed recurrent OCI
guest/network unavailability behind the unchanged VPC/Tunnel path as aircraft
HTTP `502`. Diagnostic reboot restored real aircraft JSON and the canonical
exact-source rerun passed without application rollback. Marine, orbital,
weather, and static-asset partial operation remained truthful throughout.

```text
                       visibility lifecycle
                               |
ADSB.lol <- private OCI relay <- Tunnel/VPC <- same-origin aircraft proxy
                                                    |
                                     aircraft adapter -> normalized Aircraft[]
                                                        |
Digitraffic REST + MQTT -> marine adapter -> normalized Vessel[]
AISStream + Open Waters -> shared marine relay -> same-origin WebSocket
                                              -> normalized Vessel[] fusion
                                                        |
                           freshness + local vessel filters + bounded history
                                                        |
                           React overlays <-> persistent MapLibre map

selected Aircraft -> static metadata index + prefix shard -> details panel only
committed selected live Aircraft
             -> direct ADSB.lol standing-route JSON
             -> exact callsign + local route-position plausibility check
             -> bounded six-hour tab cache + failure cooldown
             -> compact details result + explicit refresh/retry only
selected live Aircraft or 500 ms fine-pointer hover
             -> direct Planespotters hex API -> validated unchanged thumbnail
             -> shared bounded one-hour tab cache -> credited source-page link
selected live Vessel or 500 ms fine-pointer hover -> reported IMO, else MMSI
             -> reviewed bundled IMO match, otherwise fixed Open Waters lookup
             -> licensed historical image with matching/identity caveat
selected ICAO24/MMSI -> bundled validated allocation tables -> country text
visible Vessel MMSI -> same allocation lookup + bundled pixels -> flag badge
PORTS toggle -> validated static Natural Earth projection -> port map/details
AIRPORTS toggle -> validated static OurAirports projection -> airport map/details
METAR toggle -> explicit airport ICAO codes -> same-origin AWC route
             -> normalized observations -> weather map/details
ORBITS toggle -> same-origin complete CelesTrak snapshot
              -> dedicated SGP4 worker -> modeled point/crossing/track state
STARLINK child -> same-origin bounded systematic sample
               -> isolated logical channel on the same physical worker
current Aircraft[] -> local literal search -> existing traffic selection

coordinate text -> local parser ------------------------+
named text -> Photon adapter -> PlaceSearchResult[] ----+-> view navigation
session Home / one-shot location -----------------------+
```

Local development and preview use fixed Vite same-origin proxies for aircraft
and weather. Production uses a strict Cloudflare Worker that accepts only the
validated ADSB.lol point route and canonical AWC METAR route. Plausible route
lookup is a credential-free direct GET with no Worker state. Ordinary Vite
development leaves the orbital route disabled; local enabled acceptance runs
the built client through `wrangler dev --local` so it exercises the actual
storage/bootstrap-only Worker route.

The deployment configuration retains a deleted-state `FlightRouteQuota`
tombstone solely to retire the namespace provisioned by the removed
aviationstack design. No route class or binding exists at runtime, and the
tombstone can be removed after Cloudflare confirms that deletion has applied.

## Captured journey overviews

An explicit Show path action captures an immutable `JourneySnapshot`, separate
from live aircraft/vessels, counts, search, normal trails, metadata/photos,
orbital state and optional device history. The shared `JourneyDetails` inspector
uses the released pinned X and one outer scroll owner. `journeyStyle` maintains
one persistent GeoJSON source and idempotent layers; style reload restores the
same snapshot without fetching or moving the camera.

Aircraft retain validated ordered airport coordinates from the incumbent
standing-route result. Exact selected identity and one plausible current leg
are required for estimates; ambiguous or incompatible legs keep useful observed
portions only. Bounded geodesic estimates have no invented observation clocks.
Ship acquisition lives in `MarineJourneyCapture`, not JSX: one bounded anonymous
history GET and isolated exact-MMSI Portnet context, followed by at most two
sections from a single fulfilled bundled-network load. A failure of that asset
does not automatically retry for the second phase. Provider reception breaks
and independent sparse time gaps remain distinct, unconnected segments.

Show path claims explicit navigation intent before asynchronous work, fences
old identity/revision callbacks and issues one existing view request. Public
MapLibre Mercator conversion and `cameraForBounds` compare three or fewer
actual-geometry orientations; `easeTo` applies the chosen center/zoom once,
with no retained padding or second camera scheduler. The fit accounts for the
visual viewport, inspector, controls and credits. Surface round trips reject
globe back-side framing, and polar/over-wide geometry reports an explicit
limitation. The traffic footprint remains the entire canvas with the original
100 km bound.

Manual movement cancels pending framing/preparation, not an already captured
snapshot. Hide/X stop an owned pending fit and remove context without starting
another movement. Return local restores the rounded pre-fit camera and label,
not session Home. New selection, committed navigation, HISTORY and unmount fence
obsolete work; hidden/offline transitions cancel pending acquisition. Ordinary
aircraft cadence/backoff, marine connections and orbital deadlines stay owned
by their existing independent controllers.

## Modeled water-depth context

`BathymetryRuntime` owns only depth imagery/values on the existing MapLibre
instance. It consumes the already-settled full-canvas orbital viewport
geometry and zoom, independently of the traffic 100 km contract. Stable
source-cell candidates are generated in the domain layer; rendered ocean
polygons and projected screen spacing gate up to twelve candidates. Values
never enter traffic entities, freshness, counts, selection, trails, captured
journeys, orbital workers or device history.

`DepthValuesController` allows at most two physical requests, including
superseded promises still settling, with revision/abort fencing and one
eight-second batch deadline. Only complete validated values and explicit
no-data enter its bounded TTL/LRU cache. Pan, disable, hidden/offline and
unmount fence late results; source-specific Retry-After survives toggles.
It has no polling or automatic retry timer.

The native `modeled-depths` raster protocol reads a fixed matching `2020`
world-image/land-mask pair, checks bounded PNG bytes and dimensions, subtracts
land alpha in an OffscreenCanvas, and closes decoded images. It does not
infer depth from color. The existing MapLibre image queue owns raster
scheduling; fulfilled composed PNG buffers are copied from a bounded tab
cache so consumer transfers cannot detach cached data. The default fetch
adapter preserves the native Window receiver rather than invoking `fetch`
as a tile-loader method.

Persistent raster and GeoJSON sources install below operational overlays.
Style reloads reinstall them idempotently and restore current data/visibility.
Optional depth errors are consumed before the generic basemap fallback;
unsupported image composition can leave numeric context usable. Static model
context remains available in HISTORY but pauses network work while hidden,
offline or disabled. No new renderer, worker, backend, camera loop or traffic
acquisition path is introduced.

The UI explicitly separates older shading (EMODnet 2018 / GEBCO 2019) from
current service-grid numbers and their LAT/nominal-MSL datums. Default-on
requested-area disclosure and [product rights](data-sources-and-licensing.md#modeled-water-depths-emodnet-and-gebco)
are part of the feature contract.

## Source responsibilities

| Area | Responsibility |
| --- | --- |
| `src/config/` | Typed defaults and validation of browser-safe environment overrides |
| `src/domain/` | Application-owned traffic/port/airport/weather/flight-route/orbital types, independent traffic and orbital viewport geometry, local discovery and filters, pure country-allocation, exact-IMO vessel-photo, and exact-NORAD orbital-enrichment lookup, location-input parsing, versioned preferences/share state, unit conversion, and formatting |
| `src/providers/aircraft/` | ADSB.lol request, runtime payload checks, normalization, and unit conversion |
| `src/providers/aircraftMetadata/` | Bounded same-origin static metadata loading, provenance/schema/hash validation, exact identity matching, and shard LRU |
| `src/providers/aircraftPhoto/` | Disabled-by-default direct Planespotters hex lookup, bounded response validation, exact returned-origin enforcement, and typed local failures |
| `src/providers/flightRoute/` | Direct ADSB.lol standing-route requests, bounded response validation, geographic plausibility checks, typed unavailable/error results, and attribution |
| `src/providers/marine/` | Digitraffic REST/MQTT, optional same-origin marine stream, source normalization, exact-MMSI fusion, capabilities and opt-in development diagnostics |
| `src/providers/ports/` | Bounded lazy same-origin port loading plus checksum, schema, and source-provenance validation |
| `src/providers/airports/` | Bounded lazy same-origin airport loading plus checksum, schema, and source-provenance validation |
| `src/providers/weather/` | Canonical same-origin AWC requests, bounded JSON validation, METAR/SPECI normalization, newest-report selection, and source provenance |
| `src/providers/bathymetry/` | Fixed matched image/mask acquisition, bounded composition/cache and strict actual WMS grid-value normalization |
| `src/providers/orbital/` | Strict same-origin snapshot reads, streamed byte bounds, exact schema/header/digest validation, ETag revalidation, and fulfilled current-tab caching |
| `src/providers/geocoding/` | Photon request construction, response bounds, runtime GeoJSON validation, result normalization, and attribution identity |
| `src/app/` | React hooks/controllers for provider and orbital lifecycle, unified preference persistence, place-search cancellation/cache, bounded selected-photo, selected-route, and exact-NORAD image tab caches, navigation intent, time ticks, offline state, and traffic-history orchestration |
| `src/history/` | Provider-qualified observation projection, bounded session history, IndexedDB transactions, settings, indexes, playback, and gap-aware historical trails |
| `src/traffic/` | Filtering, freshness/expiry, interpolation, and selected-trail history |
| `src/map/` | MapLibre lifecycle, external/local-fallback styles, persistent traffic/context/orbital GeoJSON sources and layers, feature selection, and marker images |
| `src/workers/` | Dedicated orbital protocol, validated pure SGP4 propagation, local crossing prediction, selected-track splitting, and revision fencing |
| `src/components/` | Status, controls, and selected-object details |
| `worker/` | Fixed aircraft and weather proxies plus the feature-gated CelesTrak orbital snapshot scheduler/reader, with sanitized route matching, explicit protected aircraft delivery mode, VPC/KV/Durable Object binding injection, atomic orbital cadence admission, and fail-closed relay authentication |
| `infra/oci/aircraft-relay/` | Dependency-free fixed ADSB.lol relay, persistent global admission, loopback HTTP adapter, hardened systemd units, exact-SHA deployment, and Tunnel installation |
| `scripts/pwa-shell.mjs` | Deterministic shell allowlist/versioning, request classification, two-generation cleanup, and normal/retirement worker source |
| `public/manifest.webmanifest` | Root-scoped standalone install metadata and versioned maskable icons |
| `public/vessel-photos/` | Immutable reviewed vessel-photo derivatives plus co-located file-specific license records; excluded from the application-shell cache |
| `public/orbital-data/` | Immutable normalized CelesTrak bootstraps. Schema-1 `v1`/`v2` paths remain byte-for-byte rollback assets; the curated schema-2 catalog uses `curated-2026-09-30-v1`; Starlink retains `starlink-2026-10-02-v1` and adds the never-reused schema-2 `starlink-shell-balanced-2026-10-02-v1`. All are excluded from the application-shell cache |
| `public/orbital-enrichment/` | Immutable exact-NORAD NASA photographs plus co-located rights/provenance notices; selected on demand and excluded from the application-shell cache |

## Control composition

Presentation uses a shared opaque surface/token system: white Light panels
and slate Dark panels, restrained borders and shadows, system typography,
and a solid three-pixel keyboard focus ring. A compact floating card groups
the brand and traffic status without an edge-to-edge top bar. It keeps
mode, shown counts, marine source scope, and update age visible. Its
native **Provider details** disclosure exposes independent transport/error
messages and coverage limitations on every screen size; Escape closes it and
restores summary focus. Presentation does not change provider state or polling.

`TrafficControls` composes App's brand/status slot with navigation, one
location-search model, and three stable native disclosures with the same `name`.
**Center**, Aircraft, Ships, ORBITS, **More**, and **Settings** form a right
desktop rail and a bottom mobile command dock. Center is always outside the
menus and uses the existing session-Home callback, not another location
request. Six mobile slots retain the existing dock height and touch targets.
Search remains in Settings. The floating card is 280x88 px, inset 16 px on
desktop and 12 px on mobile. Its redundant brand subtitle is hidden;
counts, freshness, and provider disclosure stay visible, with unchanged 44 px
search/status targets. **More** opens the Explore
map panel inward to the left of the rail
or above the dock and separates secondary tools
into session-only Layers, Find, Context, Orbits, and Sources views; **VIEW**
opens Orbits and focuses the first result without moving the map or fetching
again. The task strip uses the same application button, focus, and active-state
system as the primary controls rather than browser-default buttons. The
Starlink sample presents modeled, in-map, and next-pass counts before compact
source/model caveats. The duplicate traffic legend is intentionally absent;
textual state and limitations remain in controls and selected details. The
collapsed orbital summary is omitted while the detailed Orbits view is open,
avoiding repeated information and preserving result space. The single mounted
location input remains mounted inside Settings when any peer panel is closed.
**Settings** opens View & settings with location input and search feedback,
and the existing privacy/attribution copy together, followed by Appearance
(Auto/Light/Dark and Trails), browser location, history setup, preferences,
sharing, reset, and application state. No controls or disclosure identities
are duplicated or remounted.

**In view** is the third peer, below Settings on desktop and reached through
an entry inside Settings on mobile. Its mobile wrapper has no dock layout
box, so it adds no seventh slot. Explicit Close/Escape returns to the desktop
summary or reopens Settings and focuses its actual mobile entry; opening
another peer does not reopen Settings. `InViewPanel` is presentational, with
no provider or map lifecycle. It reuses the shared aircraft query/row text
and orbital ranking/pagination helpers. Aircraft and Orbits mount at most 20
rows per page. Ships instead caps the entire shortlist at the existing
`VESSEL_RESULT_LIMIT` (20): Longest by default, or Deepest draught. The other
reported measurement breaks ties, then exact MMSI; sorting never mutates the
input array or splices source objects. Unknown/nonpositive/nonfinite values
are excluded only from the ranking requiring that measurement.

Ship candidates are the same filtered, unexpired `vessels` used by the map,
not its cluster symbols. The complete filtered count remains separate from
rankable and shortlisted counts. Existing More / Find search and filters
still refine that pool; ranking occupies the search-row space rather than
adding another mobile control row. Focus follows retained row identity;
removal returns to the visible search field or active ship-ranking control.
Selected ships outside the shortlist remain a separately labeled exception,
not an extra ranked row.

`domain/inView.ts` consumes current unexpired aircraft/ships and independently
validated modeled positions, not raw payloads. Traffic availability gates
HISTORY, unsettled/ineligible views, failures, and offline retained data;
last-local fading context never enters the list. A live marine aggregate may
still report a constituent-source error; the shortlist labels that partial
operation without discarding useful observations. Orbital rows use the current
safe footprint and exact NORAD deduplication. Curated ownership wins a tie
unless an eligible selected owner is present. Each row retains one complete
original position, element set and source clock; it never splices snapshots.
Display visibility is the union of matching shown identities. Selected
objects outside the view or filters are qualified separately, not added to
matching totals. Unsafe geometry is unavailable, and independent source
failure remains partial. The compact summary uses the same unique shown
count; bounded future crossing counts remain source-split, not falsely
deduplicated or summed. Existing curated filters and Starlink sample semantics
are unchanged. Selection reuses the ordinary owner-correct details and
enrichment paths without moving the camera.

Opening any peer disclosure closes the others without remounting the search model.
Operational recovery and app/storage/history recovery have separate promotion
slots beside/above the dock rather than extra default corner cards. Active
HISTORY playback remains outside the disclosures. The existing visual-viewport
effect publishes width, height and left/top offsets as CSS variables. Both
the interface and native MapLibre control container use that rectangle;
named size-container queries apply responsive layout to its visible size,
not the unchanged layout viewport. No inverse scaling, camera adjustment or
map resize is introduced for page magnification. Without `visualViewport`,
the effect uses the layout dimensions and zero offsets, with CSS viewport-unit
defaults before measurement. The expanded controls use at most 58% of the
current visual viewport. Each
disclosure body is its only vertical scroll owner; the task selector scrolls
away rather than covering short-view results, and orbital results remain fully
expanded inside the outer scroll region, including `.in-view-results`.
The mobile sheet leaves a 48 px map
strip beside the control stack; the collapsed dock needs no scrolling.
Only compact closed header/dock surfaces prevent Ctrl-wheel page zoom and
direct touch pinch. The native wheel listener belongs to the existing shell
effect and is removed with it; ordinary or already-handled wheel events are
untouched. Open panels permit magnification and retain their vertical scroll
owner. Browser keyboard/menu zoom and MapLibre gestures are not intercepted.
Live selected details occupy a left desktop inspector opposite the controls or a reserved mobile
area below the floating card. `--workspace-header-bottom` reserves the card's
bottom edge at 104 px on desktop or 100 px on mobile; the desktop rail is
independently inset 16 px from the upper-right corner. A mobile
ineligible-viewport prompt has its own row,
so neither selection nor More can hide the zoom/tilt instruction. These
separate height budgets keep the last result and its focus ring reachable.
Mobile HISTORY playback also reserves its own bottom control area. Opening a
historical object's detail sheet temporarily hides the tool rail, without
resetting disclosure state or discarding the selected object; closing the sheet restores the rail,
while the playback controls stay reachable throughout. Mobile attribution opens
above the command dock rather than beneath its buttons. None of these DOM/CSS
positions changes the full-canvas viewport used by MapLibre or provider queries.

All five detail components share `DetailsPanel`, including both aircraft and
ships and historical traffic. Its direct-child sticky close anchor belongs
to the whole scrolling inspector, not the shorter heading. The 44 by 44 px
icon-only X has an opaque themed backplate and an object-specific accessible
name. All inspector content reserves a right-side gutter, so scrolled text,
images and attribution links never pass beneath the control; scroll padding
preserves focus reachability.
The existing airport-board sticky heading and traffic identity scroll reset
remain. Unhandled Escape bubbles only within the focused inspector; existing
App close callbacks still own selection clearing and visible focus return.
The shell introduces no map, provider, persistence or document-wide keyboard
lifecycle.

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

The same adapter can use either the root-relative checked Worker route or the
fixed public ADSB.lol origin selected at protected build time. Current
production uses the Worker route. The direct-browser mode changes only
transport: it preserves the controller, query construction, normalization,
viewport filtering, cancellation, cadence, and backoff. Browser reads retain a
12-second timeout and the Worker's 4 MiB response-size ceiling. It may be
activated only after provider-approved CORS is live; there is no runtime
failover, aggregation, or client-selected destination.

Digitraffic REST supplies an initial location snapshot for the same enclosing
circle and the current vessel metadata set. MQTT then updates location and
metadata records. The adapter retains only the latest record per MMSI, removes
expired locations, and filters its cache to the enclosing circle before
emitting a snapshot.

With the default-off supplement enabled, `MultiSourceMarineProvider` composes
that unchanged controller with `MarineStreamProvider`. Newer observed
positions win exact-MMSI deduplication; equal times prefer Digitraffic, Open
Waters, then AISStream. Compatible missing static metadata can be filled
without replacing position provenance or borrowing unknown motion fields.
Incompatible identity changes stop interpolation and clear only that vessel's
live trail. Provider loss cannot clear another source's observations.

`MarineTrafficRelay` is a separate SQLite Durable Object with fixed identity
`marine-live-viewers-v1`, not the aircraft host or orbital coordinator. It
owns one fixed-origin connection per supplemental provider, conservatively
encloses the union of eligible viewers, splits wrapped boxes and preserves
already-admitted interests when a new viewer would exceed capacity. No
viewer means no upstream work. The same-origin upgrade rejects foreign
Origin, query parameters and invalid/unrounded views; browsers receive no key
or raw provider payload.

Native Open Waters snapshot events retain the position clock. Its REST
snapshot is metadata-only because `seen` can advance on static reports.
Locations expire at ten minutes, metadata is bounded to an hour, and caches,
frames, HTTP bodies and aggregate pending client bytes have explicit limits.
Each client acknowledges a revision/sequence-fenced snapshot before another
is sent; a ten-second slow reader is closed. Operational daily quota
reservations and provider/metadata retry deadlines survive restarts in
SQLite; vessel records and view coordinates do not. Limits live in the
dependency-free `marineStreamConfig.ts` leaf re-exported by `appConfig.ts`.

The browser preserves unexpired raw observations across a cold relay
reconnect, rather than interpreting an empty initializing cache as vessel
deletion. Compatible cached static context may bridge that reconnect; its
original observation expiry is not extended by newer positions or repeated
disconnects. Normal continuous same-source reports still replace unavailable
fields. This keeps selection and yacht eligibility stable through recovery
without turning temporary metadata into an unbounded cache.

The marine boundary exposes either the original regional descriptor or a
global-best-effort multi-source descriptor. They describe capability and
attribution, not a provider registry or a coverage polygon. Partial source
failure stays visible even while the composite is live. A connected empty
view does not establish that the area has no vessels.

After provider normalization, the application filters both traffic kinds to the
actual unwrapped viewport polygon. An object inside the enclosing circle but
outside the visible rotated or pitched footprint is not displayed.

Place search is a separate non-traffic boundary. Strict decimal coordinate
pairs are parsed, range-checked, and rounded locally. Numeric-looking
comma-separated attempts with broken dots, signs, spacing, or exponent syntax
are rejected locally before query submission; recognizing numeric intent does
not make those forms valid coordinates. Names containing commas or numbers
remain queries. Other non-empty submitted text reaches the Photon adapter only
after explicit form submission. The adapter permits one fixed configured
endpoint, bounded query/result sizes, no credentials, and no browser geolocation
bias. It validates GeoJSON Point
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

Aircraft photos form a separate fail-closed direct-browser boundary, explicitly
enabled in the protected production build. They accept only the normalized
live ICAO24. Selected details start one automatic attempt and retain an
explicit retry action; a fine pointer can also start one
automatic lookup only after remaining on the same live aircraft for 500 ms.
One cancellable lookup targets only the fixed Planespotters hex endpoint.
Runtime validation accepts an empty photo array or exactly one regular
thumbnail from the exact provider origins
`https://cdn.planespotters.net` or `https://t.plnspttrs.net`, plus a source
page under `https://www.planespotters.net/photo/`; returned URL strings are
not rewritten. The second thumbnail origin was observed in the live browser
API response during the 2026-09-23 production check. The image loads directly
from the returned provider origin and is the plain credited source-page link.

Successful and no-photo JSON results may remain in a 32-entry, one-hour
current-tab LRU shared by hover and selected details. A cache write publishes
to another active controller only when its selected ICAO24 matches, so
select-first/hover-second displays the result in the already-open details panel
without a second provider request. Subscription lifetime, including React
development Strict Mode cleanup/replay, owns that notification. Hover change,
pointer leave, selection change, close, HISTORY entry, and unmount abort and
revision-invalidate obsolete work. Errors are not cached, an automatic hover
does not loop or retry, and `429` blocks another manual attempt without
scheduling a retry. No photo JSON, URL, credit, or image byte enters traffic
models, history, Web Storage, IndexedDB, Cache API, the service worker, or a
Worker route. The published terms require no prior email or account-side API
setup for this low-volume browser path. Production remains enabled only while
the authorized exact production origin continues to satisfy the live-CORS and
rendering gate in the aircraft-photo evaluation.

Vessel photos first use the synchronous reviewed eight-image manifest for a
valid exact AIS-reported IMO. Other selected or stably hovered vessels use
Open Waters' media lookup, preferring that valid IMO and otherwise using the
exact ordinary MMSI. A provider number/category match is explicitly distinct
from reviewed hull identity, particularly because MMSIs can be reassigned.
Names, locations, sister ships, class and visual similarity are never
fallback keys.

Each bundled result is tagged with entity ID, exact IMO, and manifest version, so A to
B to A selection or hover cannot retain another hull. The full historical
image appears near the top of live selected-ship details with author, fixed
Commons revision, selected license, and modification notice. After the
existing 500 ms fine-pointer dwell, the compact map tooltip may load the same
asset with fixed source, author, license, exact-IMO, and historical-reference
context. Sub-dwell, search, marker, trail and HISTORY states start no photo
work. Missing usable identity has no fallback image. The bundled match remains entirely
synchronous; dynamic identity includes entity ID, number kind and number and
is revision-fenced through the shared `PhotoController`.

The bundled image is a versioned same-origin file under `/vessel-photos/`, loaded only
when a matching details card renders or the exact rendered hover remains
stable. It is excluded from the service-worker shell and all application
persistence. Dynamic metadata instead uses only
`GET /api/vessel-photos/{IMO-or-MMSI}`. The Worker fixes the Open Waters origin,
rejects arbitrary queries/redirects/foreign Origins, strips browser context,
caps streamed JSON at 128 KiB, applies an eight-second deadline
and returns no-store responses. The browser's ten-second adapter validates
at most eight photo records, hosts, Commons file pages, dimensions, artist and
supported licenses.
Only an unchanged allowed Commons image URL is loaded directly, anonymously
and without referrer. Fulfilled/empty results share a bounded 32-entry,
one-hour tab cache; failure Retry-After and 429 deadlines are shared without
automatic retries. Hidden, offline, HISTORY, changed identity and unmount
cannot revive obsolete work. The complete contracts are in the vessel-photo
evaluation.

The map corner keeps basemap credits and a full-data-credit link. Curated and
Starlink sources use identical CelesTrak/SGP4/not-live attribution so MapLibre
shows it once. Provider details and More -> Sources retain the named traffic,
photo and original-source records. Vessel photos fit within the existing
mobile inspector height and keep native scrolling for image credits/details;
the inspector and command-dock layout are unchanged.

Country allocation is a smaller bundled boundary. Pure synchronous helpers
derive an optional country name and ISO code from an existing ICAO24 or
ordinary ship-station MMSI. The generated tables are
validated at build time and imported with the application bundle, so opening
details creates no request, cache, loading state, persistence, provider work,
or history-schema change. Unknown, special-purpose, conflicting, invalid, and
excluded source rows produce no detail row.

Visible aircraft and vessels reuse the same ICAO24/MMSI lookups for a
render-only `flagIcon`.
Bundled 28x22 RGBA images provide 14x11 CSS-pixel country badges at pixel ratio
two, without emoji, external images, asynchronous loading, or a new source.
All 192 accepted aircraft-country codes already have artwork in the existing
226-country vessel asset; its pixels, image IDs and license paths are reused
without generating another flag set.
The screen-aligned `traffic-aircraft-flags` and `traffic-vessel-flags` layers
use their existing traffic sources, omit clusters and unavailable allocations,
and share their own kind's visibility and stale opacity. Fixed-size flags sit
outside the heading-rotated sprites, with the larger aircraft scale accounted
for separately and vessel placement unchanged. Theme rehydration reinstalls
images and layers through the existing installer. Aircraft/hull picking,
stopped badges, selected halos, normalized entities, history, providers and
country text remain unchanged. Flags represent identifier-derived country
allocations, not airline/operator nationality, an independently verified
current registry, or a vessel-specific ensign.

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

On-demand airport boards are another separate context boundary. Selecting
an airport does not fetch its board: the explicit action calls the fixed
same-origin `/api/airports/board?icao=<ICAO>` route. The Worker normalizes
AeroDataBox data into application-owned board models, with independent
loading, error, empty/unavailable, clock and identity state. No board field
enters aircraft/marine health, map entities, trails, metadata matching,
selection inference or history.

One demand-driven `AirportBoardCoordinator`, distinct from marine/orbital
owners, serializes the shared free allowance. Its single SQL admission record
contains only observed billing quotas and conservative retry/in-flight
reservations, never airport identifiers or flight rows. A free health call
initializes/revalidates quota only for explicit demand. One bounded producer
coalesces at most 16 matching consumers; the last cancellation aborts it.
Complete normalized boards alone enter an eight-airport, short-lived memory
LRU. There is no updater Cron or persistent board cache. Browser controllers
fence A-to-B-to-A and pauses, retain provider retry deadlines, and make no
automatic refresh. See the [complete contract](airport-board-evaluation.md).

Optional weather observations are a separate, non-traffic provider boundary.
METAR starts off, reuses only explicit four-letter `icaoCode` values from the
pinned large/medium-airport projection, and sends a sorted unique set of at
most 50 IDs through `/api/weather/metar`. The browser never calls AWC directly,
forwards credentials, derives stations from visible traffic, or treats static
airport `ident`/IATA values as ICAO codes. The adapter accepts only requested
METAR/SPECI records, validates Unix-second observation time and bounded fields,
and keeps the newest valid report per station.

Orbital objects are a separate modeled-data boundary. ORBITS starts off and
loads one complete same-origin schema-2 `celestrak-curated-v1` snapshot only
after explicit enable. The browser performs streamed byte, fatal UTF-8,
exact-field/source/order, header, ETag, and SHA-256 checks before a fulfilled
current-tab cache is created. It sends no camera, Home, geolocation, search,
filter, selection, cookie, or credential data and cannot select another
catalog or provider.

The schema-2 scheduler owns one fixed ordered source set: `visual`, `stations`,
`weather`, `gnss`, and `science`. It performs GP then SATCAT reads serially for
each group, validates unique per-group IDs and complete joins, and only then
builds one union. Cross-group identity and SATCAT type must agree after outer
whitespace normalization. Newer OMM epoch wins; an equal-epoch propagation
conflict rejects the refresh. Published records remain numerically ordered by
NORAD ID, while `displayOrder` is derived only from reviewed group order and
numeric NORAD ID for later clutter control.

A dedicated module worker prepares `satellite.js` SGP4 records and emits only
application-owned modeled positions, filtered local crossing results, and one
selected track. It keeps one prediction in flight plus the latest desired
request, yields in bounded chunks, acknowledges the latest prediction start,
and fences obsolete success and errors by catalog revision/request ID. The
orbital controller anchors time to the response clock plus
`performance.now()`, guards initial skew and later wall-clock jumps, and
revalidates no more often than every two hours. Orbital IDs and timestamps
never enter traffic normalization, freshness, clustering, trails, metadata,
photos, route lookup, session history, or IndexedDB.

Starlink is a subordinate modeled-data channel, not another map or traffic
provider. The bounded sample follows ORBITS and Live mode directly; there is
no separate STARLINK switch. The version-1 preference allowlist drops only
the retired `starlinkVisible` field. The share parser still strictly validates
legacy `starlink=0/1` but ignores it, preserving every unrelated override and
the atomic camera; serializers omit it. ORBITS stays opt-in. Page visibility,
offline, HISTORY, clock, expiry and channel-specific request deadlines retain
their existing controllers. `useOrbitalObjects` owns one physical
`orbital.worker` hub and exposes two logical channels; every worker message has
an explicit `curated` or `starlink` envelope, and catalog revision,
coalescing, cancellation, errors, and disposal remain channel-scoped. The
physical worker terminates only when no logical channel remains.

The same literal Starlink route negotiates two public representations. Missing
or legacy `Accept` receives the released 150-record schema 1; the browser's
fixed preference list requests the 512-record schema 2 and permits schema 1 as
a rollout fallback. Both are derived from one normalized GP/SATCAT population
inside one private publication envelope and one final KV write. The schema-2
sampler assigns 128 records to each of four fixed inclination bands and fills
16 RAAN by 8 common-time-phase targets per band. Independent ETags, `304`
responses, and `Vary: Accept` prevent cross-representation cache confusion.
If schema 2 is older than the 24-hour browser expiry while schema 1 is fresher,
the combined browser request receives schema 1 without a second request.

The map keeps separate persistent Starlink point, highlight, and track
sources/layers beside the curated sources. Both channels participate in one
orbital pick surface after traffic and before static context. Public Starlink
IDs use `orbital:starlink:<NORAD>`, preventing a duplicate NORAD from borrowing
curated selection, enrichment, tooltip, halo, or track state. Theme/style
rehydration reinstalls both channels idempotently and restores current data,
visibility, filters, selection, and track without reconnecting any provider.
Starlink payloads receive the dedicated flat-panel image; exact `R/B`, `DEB`,
and `UNK` records retain the existing type images.

Orbital purpose and imagery are a second, static display-only boundary. The
ten-record schema-2 manifest is compiled into the browser and matches the current
feature only when NORAD ID, object name, international designator, and exact
SATCAT type all equal the reviewed identity. Purpose labels therefore require
no request. A selected image uses one immutable same-origin path through a
session-scoped loader that omits credentials and referrer, rejects redirects,
applies a five-second deadline, streams under the exact expected byte count,
verifies final media type/length/SHA-256, and creates a Blob URL only after
complete validation. Concurrent calls share one promise; fulfilled URLs are
reused by selected details and tooltips. Tooltips receive only already
validated path-to-Blob mappings and cannot fetch. Obsolete work is aborted,
failures remain terminal for the running tab, and Blob URLs are revoked on
invalidation or teardown. Failed, mismatched, or unreviewed entries remain
unavailable and cannot change propagation, crossings, selection, provider
state, or traffic. Seven additional reviewed missions have description-only
records; ISS and Hubble retain their exact historical images. Separately
labeled Starlink service context is not exact-object enrichment or a claim
about current operation. Purpose/context precedes telemetry in selected
details. Nine records retain official `mission-purpose` context; COSMOS 1953
uses `community-metadata` with a pinned Wikidata revision and CC0 license.
The shared summary helper carries the distinction into nearby rows and hover,
not just selected details. The record cap remains 16. Context makes no network
request, adds no normalized orbital field, and never changes catalog freshness.
The N2YO reference is a normal explicit external link, not a fetch or embed.

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
- Aircraft photos have an independent selected-identity controller. Selection
  starts one automatic attempt. Work is aborted and revision-guarded across
  A to B to A changes, close, HISTORY, and unmount. Provider, timeout,
  throttling, forbidden, invalid-response, and network failures remain local
  and never alter ADS-B selection, polling, map state, or route lookup.
- Plausible routes have an independent selected-identity controller. A new
  eligible committed aircraft identity starts one lookup; same-key position
  updates only refresh the coordinates available to a later manual refresh.
  Cached routes render without a request. A to B changes abort obsolete work,
  and unavailable/error results never schedule a retry after cooldown.
- Bundled vessel photos derive an exact synchronous manifest result from
  entity ID, valid IMO and manifest version. Other valid IMO/MMSI identities
  reuse the shared photo-controller lifecycle, with independent provider state,
  bounded fulfilled-result cache and shared Retry-After deadline. Selection
  replacement or HISTORY entry removes obsolete imagery; failure cannot
  substitute another hull or affect any AIS provider.
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
- Orbital loading, propagation, and prediction have independent revisions.
  Layer-off, hidden, HISTORY, and unmount states terminate the worker and
  cancel unfinished reads without discarding a complete accepted snapshot or
  resetting its two-hour revalidation boundary. Resume before that boundary
  recreates only the worker. Camera, selection, style, and theme changes never
  fetch a catalog. Stale, offline, clock-invalid, expired, unavailable, and
  successful-empty states remain distinct, and no orbital failure changes
  another provider or map lifecycle.

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

Both store only versioned normalized ADSB.lol, Fintraffic Digitraffic or
attributed AISStream/Open Waters observations with provider, license-decision, source-time, receipt-time,
session, and navigation-segment identity. Interpolation frames, route data,
destination/ETA, browser location, current METAR, and third-party aircraft
metadata or photos are not persisted. Bundled vessel reference photos and
their manifest are static application assets, not history records, and are
never rendered in HISTORY. Vessel metadata is visible in history only after
its own observation time, or no earlier than receipt when mixed-source
metadata has no trustworthy report time. Playback deduplicates vessel IDs
across providers and retains separate source trail segments.

IndexedDB database version 2 retains the existing record schema, stores,
consent, recording epoch and rows. It fences old version-1 readers whose
unknown-provider repair would delete new records. Use updated code with the
supplement disabled for rollback; older code may report a database version
error but must not be used to erase the store.

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

The optional port, airport, weather, and orbital sources are separate from
traffic. Port rank groups
appear progressively from zoom 5 through 10, all port rendering stops at zoom
13 because the coordinates are generalized, and neutral theme-aware styling
stays below airport and traffic layers. Large airport points start at zoom 4
and labels at zoom 5; medium points and labels start at zoom 7 and 8, with no
upper zoom cutoff. METAR circles and labels render above ports/airports and
below orbital points and traffic; stale reports include text as well as reduced
opacity. The orbital point source retains every safe current position.
MapLibre layer filters and the matching selectable-ID set apply exact
type/source-group eligibility plus stable schema-v2 `displayOrder` tiers: 192
below zoom 2, 384 from zoom 2 through below zoom 4, and every matching safe
position up to 512 from zoom 4. One safe selected object outside the tier or
exact filters is appended as a labeled selected exception only when map display
is available. Before a settled raw zoom exists, nothing is claimed as shown
and selected details state that map display is unavailable. Orbital symbols
and the selected line/highlight render above static context and below the
selected traffic trail/live traffic. The same point layer uses the exact
reviewed enrichment identity to enlarge and label only Hubble/NORAD `20580`
and ISS/NORAD `25544` when the active style exposes a usable text font.
Unreviewed or identity-mismatched objects retain the ordinary exact-SATCAT
symbol with no inferred featured label.

Picking is deterministic: exact traffic, cluster expansion, validated traffic
touch fallback, exact orbital, validated orbital touch fallback, then exact
weather, airport, and port followed by their touch fallbacks. Selecting
traffic, orbital, weather, airport, or port clears the other selection kinds;
an empty map click clears all. Orbital selection never moves the camera.
Rank-hidden orbital IDs are absent from both exact and touch selection.

App-owned cluster, port, airport, and weather text reuses a font stack already
declared by the active base style instead of MapLibre's unsupported default
stack. A glyph-free local fallback style uses browser system fonts. A
server-glyph style that declares no usable font stack fails closed by omitting
app-owned text while retaining its points, circles, and picking surfaces.

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

If the enclosing radius exceeds 100 km or the geometry is unsafe, live traffic
and trails are removed, selection is cleared, providers pause and the interface
shows a zoom or tilt prompt. The application never clamps the query, divides
the viewport into hidden partial requests, or treats an empty successful
response as proof of coverage.

The #370 zoom-out hand-off adds one explicit display-only exception: a
**last local traffic sample**, not wider live coverage. App retains only the
last eligible footprint/zoom/navigation revision and reuses the provider's
already-held observations inside that footprint. It creates no second
observation cache or acquisition lifecycle. Context requires a lower zoom in
the same navigation, online live mode, and observations no older than two
minutes or their existing provider expiry, whichever is shorter. Initial wide
views have no sample; committed navigation clears its footprint. HISTORY
hides context without resetting observation age; returning to live may reuse
only still-recent provider observations, never historical playback records.

`map/trafficZoomContext.ts` deterministically selects at most twelve entities
per kind, separated by at least 64 CSS pixels within each kind's projected
sample, without changing observed coordinates. A separate render-only
`zoomContext` property drives native opacity: 85% of the normal freshness
opacity at zoom 7 and above, continuously down to zero at zoom 3. The existing
sources, icon/flag/badge layers and source-diff path are reused; sampled
context disables interpolation and source clustering without changing the
saved clustering preference. Settled movement/resize resamples through the
existing render scheduler; style/theme reload reinstalls the current sample.

Samples are excluded from picking, live counts/search, selected-object
metadata/photos, trails and all history inputs. The masthead labels the sample
instead of claiming that zero ships are shown; the zoom notice retains the
paused/no-wider-coverage warning even on compact layouts. Eligible views
restore normal clustering, interpolation, count and interaction behavior.
Orbital opt-in, modeled positions, display tiers, workers, clocks and catalog
cadence do not change; no nearby orbital point is fabricated to fill a gap.

Marker silhouettes are generated by repository-owned canvas drawing code. A
pure presentation boundary derives render-only icon, movement, altitude-band,
vertical-trend, and rotation properties after live or historical
reconstruction. These values enter only the MapLibre GeoJSON projection;
provider-owned `markerIcon` values and historical observations remain
byte-compatible.

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

Each supported vessel image uses a recognizable top-down boat: pointed bow,
longitudinal hull and deck/superstructure, with cargo containers, tanker tanks,
passenger decks, fishing outriggers, a tug wheelhouse, asymmetric sails,
pleasure-craft cockpit or high-speed twin hulls. The 22-44 CSS-pixel reference
scale, blue palette and physical-length normalization are unchanged.
Deterministic tests protect geometry, longitudinal size, nautical structures
and aircraft colors. Artificial pairwise-outline difference thresholds were
removed because they encouraged slabs, capsules and notches rather than
recognizable ships. Actual-scale browser review in both themes remains
mandatory; image IDs and numerical pixel differences are not visual proof.
These are category symbols, not depictions of the exact vessel. Light/Dark
changes update the same bounded maritime-blue MapLibre image IDs and preserve
the source, selection, heading, stale opacity, stopped badge, and one map
instance.

Valid AIS reference-point length drives one monotonic bounded scale: 20 m and
smaller use the 22 CSS-pixel reference floor, large hulls rise materially
toward the 44 CSS-pixel reference ceiling, and missing/invalid dimensions keep
the explicit 40 m fallback rather than inferring size from class or name. A
render-only
per-silhouette factor normalizes every outer contour to the same longitudinal
map span before applying that physical-length scale, so a tug, passenger ship,
tanker, and cargo vessel with the same reported length occupy the same
nose-to-stern distance.

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
Only slow/stopped traffic receives a compact red screen-upright dot; moving and
unknown traffic add no circular badge over the silhouette. Slow and unknown
vessel silhouettes are north-up rather than implying a stationary course.
Navigation status stays independent, and contradictory speed/status reports
are shown rather than silently reconciled. Aircraft use the same one-knot
render-only motion boundary; a slow/stopped aircraft is north-up and receives
the same red dot, while unknown speed does not claim stopped or on-ground.

Exact normalized sailing and pleasure types use a dedicated visibility branch.
They render only with known length of at least 8 m and finite non-future position
age no greater than the normal marine expiry threshold. The existing
reported-speed filter applies: Any includes stopped and unknown-speed yachts;
explicit below-one-knot, moving and unknown choices remain restrictive. Normal freshness
marks reports stale after two minutes and removes them after ten. Invalid
reported speeds remain rejected. The rule uses the live clock or historical
cursor and never falls through to the ordinary length filter. Query, category,
navigation and maximum length still apply; non-yachts retain the 50 m default.
Digitraffic publishes Class A AIS only. Supplemental Class B reception still
requires actual positions plus transmitted type/dimensions and does not
promise comprehensive yacht coverage.

Aircraft retain their provider-reported silhouette category, but the
silhouette fill itself carries four sequential reported barometric-altitude
bands plus neutral unknown. Each of the four aircraft shapes therefore has
five bounded render-only color variants; there is no ordinary per-aircraft
altitude circle. Reported climb, descent, small vertical rate, or unknown state
remains available in selected details rather than obscuring the marker with a
second badge. Zero and negative finite altitudes remain in the lowest band and
never imply on-ground status.

One reusable mouse-hover popup resolves the rendered entity against the
already-loaded application model. Aircraft show flight/callsign, reported type,
reported altitude in the active unit system, and registration/ICAO24 fallback.
Vessels show name/MMSI fallback, flag state derived locally from the MMSI
allocation table, speed over ground in both km/h and knots, and the reported
AIS destination. Provider strings are inserted through `textContent`. When the photo path is
enabled, a fine pointer that remains on one live aircraft for 500 ms can start
one direct photo lookup and add the validated thumbnail, visible credit, and
exact source-page link. A stable 500 ms vessel hover may instead resolve the
already-committed exact-IMO manifest and load one same-origin image with fixed
Commons revision, author, license, and historical-reference context. Hover
never starts metadata, route, traffic-provider, polling, reconnect, Wikimedia,
Wikidata, or tracker work, and AIS destination is never described as a
complete route. Click/touch selection and the concise details panel remain the
accessible full-information path.

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
- The 10 persisted silhouettes, 3 exact render-only vessel shapes, and 20
  aircraft altitude-color variants are generated once per resolved theme and
  reused; style rehydration updates the same bounded 33 image IDs.
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
- ORBITS has zero startup requests. The strict catalog is loaded on explicit
  enable, while SGP4 position/crossing work runs in a dedicated module worker.
  Current points update at most once per second; crossing work is bounded to
  256 objects, a 90-minute horizon, 30-second samples, and 20 detailed
  results. Stable feature IDs update persistent sources without rebuilding the
  map. The worker chunk is about 28 kB in the current production build.

## Deployment boundary

Cloudflare Workers with Static Assets is the selected one-unit production
boundary. The selected aircraft recovery path keeps it as the public boundary
and gives only the aircraft proxy one private outbound dependency:

1. `dist/` is served as Static Assets;
2. fingerprinted `/assets/*`, versioned `/aircraft-metadata/*`, versioned
   `/ports/*`, versioned `/airports/*`, versioned `/orbital-data/*`, and
   versioned `/orbital-enrichment/*` responses use immutable browser caching;
3. Worker code runs first only for `/api` and `/api/*`;
4. the only forwarded browser routes are the fixed aircraft point route and
   canonical `GET /api/weather/metar?ids=...`; the fixed
   `GET /api/orbits/catalog` route reads only KV or an exact-release bootstrap,
   defaults to the newest valid schema-1 candidate for predecessor clients,
   returns schema 2 only for the fixed vendor `Accept` media type, varies caches
   by `Accept`, and never performs an upstream request; the literal
   `GET /api/orbits/starlink` route likewise reads only its complete KV or
   immutable exact-release samples, defaults to schema 1, negotiates schema 2,
   and varies by `Accept`;
5. a protected two-hour Cron, independent of browser requests, may fetch only
   after the existing named SQLite Durable Object atomically admits the start;
   it then performs the ten fixed, strictly sequential GP/SATCAT requests for
   `visual`, `stations`, `weather`, `gnss`, and `science`, validates one union
   plus the pre-substitution schema-1 `visual` snapshot, persists the provider
   outcome, and publishes both public representations in one non-public
   versioned bundle to `orbital:catalog:v2:curated-v1` with one final write;
   after curated work, a separate 12-hour SQLite row may admit one complete
   fixed Starlink GP/SATCAT pair; one normalization creates the exact released
   schema-1 systematic member and the schema-2 shell-balanced member, then one
   final write publishes the aligned bundle to
   `orbital:catalog:v2:starlink-shell-balanced-v1`;
6. after private-relay activation, the aircraft route may use only its
   configured fixed transport and never fail over within a request;
7. OpenFreeMap, Photon, and Digitraffic HTTPS/WSS remain direct browser
   connections;
8. map, search, aircraft, marine, optional-port, optional-airport, weather, and
   orbital attribution remains visible when the corresponding data is shown.

The production proxy accepts canonical finite latitude/longitude values and
integer radii from 1 through 54 NM. It rejects query strings, other methods,
other paths, redirects, responses over 4 MiB, and work exceeding the ten-second
total deadline. It constructs a fixed ADSB.lol destination, forwards only a
JSON accept header and stable public project User-Agent, preserves upstream
status/body/content type/`Retry-After`, and sets no-store behavior in both
directions.

In private-relay mode, the Worker keeps that public validation contract but
replaces only the upstream transport. The VPC Service is fixed to HTTP
`127.0.0.1:8788` through one named Tunnel. The relay repeats canonical
validation, authenticates the Worker, enforces one in-flight request and one
upstream start per 20 seconds across all clients, and persists only bounded
backoff state. It has no public hostname, cache, queue, provider fallback, or
coordinate-bearing application log. See
[OCI Aircraft Relay](oci-aircraft-relay.md).

The coordinator table, class, binding, namespace, and fixed object name do not
change for catalog schema 2. Its schema-1 cadence state therefore preserves
`lastStartedAt`, in-progress admission, `Retry-After`/`nextAllowedAt`, terminal
block, and the two-hour gate across rollout. The prior
`orbital:catalog:v1` value and both schema-1 bootstrap generations remain for
rollback and as read-only predecessor candidates. The bundle version is
internal and independent from public catalog and coordinator-state schemas; a
failed final KV write exposes neither newly derived representation.

No application database, general backend, shared live traffic cache, preview
deployment, or server-side marine relay is added. The only provider scheduler
is the fixed CelesTrak catalog Cron plus its single named
SQLite coordinator; it accepts no browser input, stores no user data, and
cannot fetch another provider/group/path. Worker
observability is disabled because ordinary request URLs can contain rounded
camera coordinates or visible station IDs. Cloudflare and upstream network
intermediaries still process ordinary request metadata.

Orbital production activation, exact-origin browser acceptance,
namespace-preserving pre-orbital rollback, Cron removal, and exact restoration
are complete. The layer remains a default-off user preference and a protected
deployment flag, not an always-visible map surface. See
[Hosting and Deployment](hosting-and-deployment.md) for release, version, and
workflow evidence.

The #275 Starlink milestone's byte-exact rollback target was source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`, recorded Cloudflare version
`146e74df-c960-4a41-bc0c-6d5b9fa0d660`. Protected run `37129586003` proved
that target and run `37129687283` restored source `d565b562...` / version
`e9e473d1-fac5-4594-b62b-7ba68573efeb`. Both fresh Starlink representations
retained byte-identical bodies and the `2026-10-03T14:17:23.055Z` publication.
Neither operation mutated the retained KV/coordinator namespaces, OCI relay source,
Tunnel, or VPC Service.

The subsequent #282 UI release's real predecessor is `d565b562...` /
`e9e473d1-fac5-4594-b62b-7ba68573efeb`, not a later documentation-only commit.
Its backend/provider contracts and protected rollback mechanism are unchanged.

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
                    |                       live traffic hidden
          exact-polygon display filter       zoom/tilt prompt
```

During zoom-out only, the separately labelled bounded last-local sample may
remain as described above. It does not change either query branch.

          The same settled map event derives a second, independent orbital footprint.
          A safely unwrapped local polygon drives only 90-minute crossing prediction. A
          raw span of at least 359.5 degrees is whole-world only when the sampled canvas
          also covers both Mercator latitude limits; it then lists all valid current
          subpoints without a crossing rank. Partial spans at least 180 degrees and
          invalid polygons suppress crossing prediction while retaining valid current
          points. This classification cannot authorize or resize an aircraft/marine
          query.

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
schema. It stores theme, projection, presentation units, layer flags, structured vessel
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

## Smooth globe and safe footprints

`mapProjection.ts` translates the independent `auto | flat` preference to
native globe or Mercator on the existing MapLibre instance. Automatic globe
uses the installed engine's zoom 11-12 interpolation, not a second renderer,
threshold toggle, listener, or animation loop. Settings, preference reset and
explicit share state use the same validated field; no location is persisted.

Both traffic and orbital assessment use the same 32-point full-canvas sample.
On globe, public `getBounds()` rejects an included pole and public
`unproject`/`project` round trips check a one-pixel outward guard. Finite
coordinates alone are insufficient: globe unprojection can snap sky to the
limb. The guard's 0.01 px tolerance never expands the actual display polygon.
An unsafe surface fails closed before radius or whole-world classification.
Flat whole-world orbital behavior and the exact traffic 100 km contract remain.

Unsafe geometry pauses aircraft/marine through their existing independent
controllers and cadence. Orbital current positions, valid selection and tracks
remain separate from crossing geometry: the globe may display modeled points
while map/crossing counts are unavailable. Projection, camera and theme do not
refetch the catalog or reset its clock/expiry/worker boundaries. Native globe
clipping handles back-side symbols, highlights and tracks; actual point/touch
queries and rendered pixels, not broad line/circle query lists, establish
rendering and picking behavior.

Initial, external, fallback and replacement styles use one generation-fenced
loader. `transformStyle` installs the chosen projection before native camera
migration. If public `getStyle()` is undefined, the unready previous style is
discarded before replacement: otherwise MapLibre can wait for that abandoned
load before applying `transformStyle`. Rehydration then restores current
sources, images, layers, visibility and selection. A shared initial camera is
replayed after projection installation only while its original view request
and interaction generation still own the camera. This preserves negative
polar globe zoom without letting late initialization steal newer navigation.

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
and any loaded port, airport, weather, or orbital source/selection/track.
Interaction listeners remain registered once, and a style revision prevents a
late obsolete load from winning. Provider hooks, React selection/history, and
camera state do not restart.

The same installer applies `basemapCartography.ts` to the resolved default
OpenFreeMap style before restoring the traffic overlays. It changes existing
background, water, vegetation, urban/building, road, boundary, and label paint;
the existing wood layer becomes available at zoom 5 rather than 10. Removing
the Dark style's wood sprite pattern lets its forest color render consistently.
It adds no map source, layer, image, fetch path, camera change, or geographic
inference. Source geometry, filters, label content/font/placement,
road widths, boundary dash patterns, and attribution remain provider-owned.

The treatment is gated by the exact resolved default URL for each theme.
Custom styles, opposite-theme overrides and the fallback are not recolored;
their separately selected projection still applies. Every external style
replacement reapplies the palette through the
existing generation-fenced installation; it does not create a second style
loader or provider lifecycle. If both themes share one stock URL, leaving that
URL's atlas-owning theme reloads the original style through the same loader.
The same-URL reset uses `diff: false` so `style.load` reliably restores overlays;
otherwise application paint could leak into the deliberately custom override.
It keeps the map, camera, selection, and provider controllers. The palette
itself adds no terrain, building heights, projection change, or automatic tilt.

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
sprites, Photon, AWC, Planespotters API/CDN requests, aircraft metadata,
airports, ports, and IndexedDB history. Root/index navigations are
network-first with cached `index.html`
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
