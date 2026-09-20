# Engineering Decisions

## Static-first V1

LiveTrafficStan is a local-first browser application with no server database,
accounts, authentication, or persistent backend. This keeps the V1 deployable
as static assets except for the aircraft CORS proxy described below. V1.4 adds
an opt-in browser IndexedDB for private, origin-local traffic history. It is
not a server, account, shared database, or backend.

## React, TypeScript, Vite, and MapLibre

React and TypeScript provide a small typed component model. Vite supplies the development server, production build, and the smallest local proxy needed for aircraft data. MapLibre GL JS provides an open map renderer and efficient GeoJSON sources and layers.

## OpenFreeMap map style

OpenFreeMap's Positron style is the V1 base map because it is OSM-based, MapLibre-compatible, key-free, muted, and replaceable through one configuration value. The application adds stronger blue traffic and control styling rather than maintaining a large custom map style.

## ADSB.lol remains the sole aircraft provider

The dated
[aircraft-provider evaluation](aircraft-provider-evaluation.md) retains
ADSB.lol because its point/radius API remains the smallest compatible,
currently keyless, ODbL-licensed option.

Airplanes.live now publishes a closely compatible v2 contract, but its current
endpoint is contact-gated and its API-specific data rights, rate, caching,
attribution, and public-display terms are unresolved. OpenSky's current terms
require a written license for operational REST use in a live product, and its
bounding-box state-vector contract, OAuth credentials, and daily credits add
material complexity.

ADSB.lol does not currently provide general browser CORS headers. Vite handles
development and preview; production uses a strict same-origin Cloudflare
Worker. No provider secret is involved. The Worker validates only the current
aircraft point route, uses a total deadline and body cap, preserves provider
status/body/`Retry-After`, disables invocation URL logs, and does not cache live
responses.

No provider selector, automatic failover, aggregation, or alternative adapter
is added. Those mechanisms would introduce provenance, duplicate-resolution,
licensing, credential, and operational complexity without a demonstrated
requirement. The existing application-owned provider interface is sufficient
for a future deliberate replacement.

## Aircraft route enrichment remains blocked

The dated
[aircraft route enrichment evaluation](aircraft-route-enrichment-evaluation.md)
found no authorized source that can associate origin and destination with the
selected flight occurrence using provider identity plus bounded temporal
context.

Keyless standing-route sources are callsign-only, and ADSB.lol's optional
route path adds only geographic plausibility. OpenSky supplies historical
track-derived estimated airports and requires a written agreement for
operational REST use. FlightAware AeroAPI and AeroDataBox have credible
operational fields but require unconfigured accounts, server-held credentials,
approved budgets, applicable display/combination/retention terms, and
provider-specific occurrence matching.

Issue #44 is therefore the explicit source-authorization blocker. No provider
interface, route fields, unavailable-only UI, Worker endpoint, secret name,
cache, or placeholder response is added before that gate is complete.

A future route association must use a provider-issued occurrence/leg identity
plus bounded temporal context. Callsign and registration are corroborating
evidence only. Movement, heading, position, nearest airports, geographic
plausibility, and static Mictronics metadata never infer a route.

Route enrichment starts only after explicit aircraft selection. Live ADSB.lol
polling, camera movement, trails, map updates, metadata refreshes, and provider
retry never start or refresh it. Failure, expiry, throttle, cancellation, or
ambiguity cannot alter the live marker, position age, freshness, aircraft
cadence/backoff, trails, static metadata, selection, map health, or another
provider.

The source blocker and Issue #39 remain separate: source authorization can be
proved before a public deployment exists, but credentialed route enrichment
cannot ship until the selected secret-holding production path is deployed and
validated.

## Airport arrival and departure boards remain blocked

Airport/time-window boards are independent of selected-flight route lookup.
The dated
[airport board evaluation](airport-board-evaluation.md)
found no currently configured and authorized source with the complete
account/plan, rights, retention, source-age, Tallinn-sample, quota, cost, and
server-held credential contract required by Issue #5.

OpenSky's airport flights are previous-day-or-earlier overnight
reconstructions with estimated airports/times, not current operational rows.
FlightAware AeroAPI and AeroDataBox are technically credible but require
project-specific commercial authorization and unresolved combination,
retention, source-age, and plan evidence. aviationstack is likewise
unconfigured. Human-facing airport, airline, and tracker pages will not be
scraped.

Issue #46 is therefore the explicit board authorization blocker. No board
component, domain record, Worker route, credential name, cache, placeholder,
or mock production response is added. A future board failure must remain
independent of ADS-B, marine traffic, static airport context, and the map.

## Cloudflare Worker plus Static Assets

Cloudflare Workers with Static Assets is the smallest production boundary for
the Vite client and required ADSB.lol/AWC proxies. Static files bypass Worker
execution; only `/api` and `/api/*` invoke code. The fixed aircraft and METAR
routes construct hard-coded upstream destinations and cannot act as general
forwarders.

The free plan's 100,000 dynamic requests/day covers about 23 continuously
active browser sessions at the application's nominal 4,320 request/day upper
envelope, while static asset requests are documented as free and unlimited.
This is a budget estimate, not ADSB.lol capacity permission or an SLA.

Netlify is technically viable but places production deploys, bandwidth,
requests, and function compute in one 300-credit monthly budget without
providing a capability this two-route application needs. GitHub Pages plus a
separate Worker would add a second deployment unit or split-origin CORS.

Fingerprint-named assets use immutable browser caching. Aircraft responses use
upstream and downstream `no-store`; successful METAR responses use the
source-aligned 60-second guidance. No shared application cache or rate-control
service is added without measurements and provider-policy evidence. Worker
observability is disabled because routes contain rounded camera coordinates or
visible station IDs.

Deployments require an exact current `main` SHA, rerun the complete validation
suite, serialize production operations, deploy code and assets atomically, and
verify matching client/MapLibre-worker bytes plus bounded provider smoke.
Account selection and credentials remain the explicit external blocker in
Issue #39 rather than a client-side secret or temporary-account workaround.

## Digitraffic MQTT plus REST metadata

Digitraffic explicitly recommends five-minute REST polling, which is too infrequent for smoothly updated live vessel positions. V1 uses the provider's MQTT-over-WebSocket feed for live location and metadata messages.

REST remains useful for an initial bounded position snapshot and an initial vessel metadata snapshot. The metadata response observed during planning contained fewer than one thousand records and was under 300 KB uncompressed, so one startup fetch is simpler and lighter than dozens of per-vessel requests.

Eligible viewport changes reuse the MQTT connection and immediately refilter
the global in-memory message cache. A new location REST snapshot for the
viewport's enclosing circle is allowed only after the five-minute query refresh
gate. Automatic reconnect
attempts are spaced 15 seconds apart to remain within Digitraffic's documented
connection allowance.

## Digitraffic remains the sole marine provider

The dated
[marine-provider evaluation](marine-provider-evaluation.md) retains
Fintraffic Digitraffic because it remains the only reviewed provider that is
keyless, browser-native, and licensed under clear CC BY 4.0 terms for this
public map.

Digitraffic is represented as a regional source with an unknown exact coverage
boundary. The UI describes transport as connected separately from coverage and
says how many ships are shown rather than treating zero as proof that no
vessels exist. Officially documented Class A scope and upstream fishing-vessel
filtering remain explicit.

AISstream.io requires a server-side key and relay while its returned-data
rights remain unresolved. Datalastic requires a paid server-held key, has a
50-NM/92.6-km radius limit, and does not establish permission to expose raw
coordinates in this public client. Kpler/MarineTraffic requires a commercial
agreement for public display and redistribution.

No relay, provider selector, automatic geographic selection, alternate
adapter, failover, aggregation, or MMSI source-precedence framework is added.
Browser-local filtering of Digitraffic's all-published-vessels MQTT stream
reduces display work, not incoming network bandwidth.

## Local vessel discovery after provider normalization

Vessel search and filters run only on normalized, fresh, exact-viewport
entities in React. This keeps one Digitraffic MQTT subscription, preserves the
five-minute REST/metadata gates and provider-owned caches, and avoids adding a
server search endpoint or a second scheduler.

The released 50 metre minimum remains the default. Search covers only current
name, callsign, MMSI, and IMO fields. Category, navigation, reported-speed, and
inclusive length filters combine with AND. Unknown values are explicit:
`all` includes them, specific known choices exclude them, and missing length is
included only when the user opts in. One knot is exactly 1.852 km/h and zero is
a known speed. The accessible result list is deterministically ordered and
bounded to 20 while every match remains on the map.

AIS reserved subcodes are not treated as defined categories. Passenger is
60-64 or 69, cargo is 70-74 or 79, tanker is 80-84 or 89, and the reserved
subcodes between those values remain unknown. Search/filter state never mutates
the provider snapshot, and hiding SHIPS keeps matching counts truthful while
disabling result selection.

## Local aircraft discovery after viewport and freshness filtering

Aircraft search runs over current `DisplayAircraft[]` after provider
normalization, exact viewport filtering, freshness calculation, and expiry.
It performs case-insensitive literal matching over callsign, registration,
ICAO24, and provider-reported type, ordered by exact, prefix, then substring
match with stable display-order ties.

The input is bounded to 64 characters and the accessible result list to 20.
Search does not hide nonmatching markers, move the camera, change Home, query a
provider or geocoder, load metadata while typing, or create another scheduler.
Selecting a result reuses the existing traffic details, trail, and
selected-aircraft metadata path.

## Pinned Natural Earth ports as optional context

Natural Earth Ports `v5.1.2` at commit
`f1890d9f152c896d250a77557a5751a93d494776` is selected as a compact
public-domain geographic context layer. The deterministic projection retains
only Natural Earth ID, name, scalerank, and coordinates: 1,081 points,
154,218 raw bytes, and 22,482 deterministic gzip-9 bytes.

The source is not a comprehensive or operational port database. It omits
relevant regional terminals, and Natural Earth warns that some points may be
approximate by up to 20 miles. The UI and details therefore say generalized
and incomplete and do not show or infer country, facilities, berths, capacity,
operational status, port calls, nearby-vessel relationships, destination, or
ETA.

The layer is off by default and makes no startup request. One immutable
same-origin asset is loaded lazily with a deadline, byte cap, SHA-256, strict
grammar/count/rank validation, and fulfilled-only session caching. Failure is
local to the PORTS control. Ports use separate IDs, selection, styling, and
details; traffic picking retains priority, and ports never enter traffic
counts, trails, provider health, or provider queries.

NGA World Port Index was not selected for this slice because its official CSV
export returned HTTP 403 during review, so a stable current export and
dataset-specific rights/update contract could not be inspected reproducibly.
That does not make Natural Earth equivalent in completeness; it supports only
the narrower generalized-context feature.

## Pinned OurAirports points as optional context

OurAirports at commit
`5ed85eed28722bea80ebdde9e255e09b1e7317a8` is selected for the
static airport layer. Its Public Domain terms permit the projection, request
credit, and disclaim accuracy and fitness. The source's persistent numeric ID
is retained; `ident`, explicit ICAO, and explicit IATA values remain separate.

The deterministic projection includes all 5,280 current large and medium
airport records rather than treating `scheduled_service` as a live operational
guarantee. It is one 1,329,838-byte immutable GeoJSON asset, compressed to
225,625 deterministic gzip-9 bytes.

The layer is off by default and makes no startup request. One same-origin load
is guarded by a deadline, body cap, exact bytes, SHA-256, full grammar/count
validation, and fulfilled-only session caching. Large and medium points use
separate zoom thresholds, render above generalized ports and below traffic,
and remain available at high zoom. Valid wide-view geometry can continue to
filter and select this static context even while the 100 km live-traffic gate
is paused.

A bounded "Airports in this view" list gives keyboard users the same static
selection path as map users. Airport, port, weather, and traffic selections are
mutually exclusive. Exact traffic and traffic touch fallback retain priority;
weather, airport, and port use that order within exact and validated-touch
context hits. Static details never claim navigation authority, operating
status, current service, route, arrival, departure, or a relationship to a
visible aircraft.

## Application-owned traffic models

Provider payloads are decoded and normalized at the provider boundary. Map and UI code consume application-owned aircraft and vessel models and do not depend on raw ADSB.lol or Digitraffic response shapes.

## MapLibre sources and layers

Aircraft, vessels, and the selected trail are represented as GeoJSON sources. MapLibre symbol and line layers are updated in place, avoiding a React component or DOM marker for every traffic object.

## Bounded provider-reported silhouette vocabulary

The map uses ten original canvas images: light/small fixed-wing, generic
fixed-wing, heavy fixed-wing, helicopter, cargo, tanker, passenger, fishing,
tug, and generic vessel. Cyan still means aircraft and amber still means marine
traffic; category is conveyed by shape rather than a new color system.

Normalization maps only trusted provider fields to application-owned icon keys.
ADS-B A1/A2 use light fixed-wing, A5 heavy fixed-wing, and A7 helicopter.
A3/A4/A6 retain their existing labels and scales but use generic fixed-wing
art. AIS type 30 uses fishing, type 52 tug, 60-64/69 passenger, 70-74/79 cargo, and
80-84/89 tanker. Reserved subcodes and every unsupported or missing category
use the corresponding generic fallback.

No model/type string, speed, name, route, operator, position, or movement is
used to infer a category. This keeps the vocabulary truthful and avoids a
classification service or dataset. The ten images are generated once per theme
and reinstalled through the existing single-map style lifecycle.

## Pinned static selected-aircraft metadata

The dated
[aircraft metadata evaluation](aircraft-metadata-evaluation.md) selects the
Mictronics aircraft-database at commit
`1724959f854f540c95f11872bcd377ecfeb698a2`. Its exports are explicitly offered
under ODC-By 1.0, allowing a compact derivative database with visible
attribution and the full license conveyed alongside the data.

The projection retains only ICAO24, registration, type, model description,
configuration, wake category, and explicit duplicate-registration ambiguity.
Owner, operator, photos, notes, and the unlinked operator directory are
excluded. Registered owner or a callsign prefix is not the current operating
airline, so the feature deliberately adds no airline claim.

Static same-origin assets are smaller and more reliable than adding a runtime
metadata API, credential, quota, or server cache. Nothing loads at startup.
Selecting an aircraft loads one index/type asset and one two-hex-prefix shard
under a five-second total deadline and byte caps. A fulfilled index plus eight
fulfilled shards are the only caches; partial, malformed, rejected, or aborted
work is not cached.

Exact ICAO24 is primary. Present live registration and type must agree, and
duplicated source registrations are unavailable. An exact ICAO24 lookup without
live registration is labeled ICAO24-only and keeps the source registration
distinct. There is no registration fallback, punctuation stripping, fuzzy
match, owner/operator lookup, or callsign inference.

The source publication instant is dataset-wide age, not per-aircraft
verification. The snapshot is valid through 45 days, rejects dates more than
24 hours ahead of the client clock, and reevaluates while open without another
request. Updating any pin, schema, generator, or generated bytes requires a new
immutable output URL.

This metadata never changes the provider-reported marker vocabulary. Model,
configuration, and wake category are selected-object context only.

## Bundled identifier-allocation country context

Selected details derive optional country context locally rather than adding an
enrichment provider. Aircraft use only exact six-character ICAO24 addresses
against validated inclusive state-allocation ranges. Vessels use only valid
nine-digit ordinary ship-station MMSIs beginning with 2 through 7 and an
unambiguous assigned MID.

The result is display-only `Country name (ISO)` text labelled **Registration
allocation** for aircraft or **Flag state** for vessels. It is not operator,
owner, crew, citizenship, route, location, operating area, current
jurisdiction, or live-registry evidence. Unknown, special-purpose, unassigned,
conflicting, malformed, and excluded values omit the row.

The projection uses pinned open-licensed third-party source data plus a
canonical hash-pinned CC0 Wikidata cross-check. It copies no ITU/ICAO
publication layout or text, excludes every known ambiguous or invalid source
row, and is checked offline in CI. Registration-prefix fallback and decorative
flags are intentionally deferred.

Keeping this as a pure domain lookup avoids changes to provider normalization,
map/source properties, history records, persistence, loading, cache, or
networking. Live and historical details therefore use the same deterministic
derivation.

## Explicit MapLibre worker bundling

MapLibre 6 loads vector tiles through a separate module worker. Vite prebundles the main dependency, which makes MapLibre's inferred adjacent worker URL point at a file Vite did not emit. The result is a loaded style with vector tiles stuck indefinitely in a loading state.

V1 imports `maplibre-gl-worker.mjs` through Vite's `?worker&url` handling and calls `setWorkerUrl` before constructing the map. This keeps the worker URL correct in both development and hashed production output without adding a plugin or custom build system.

## Observed-position interpolation

V1 animates briefly between two positions already supplied by a provider. It does not continue movement beyond the latest observed coordinate. This removes abrupt visual jumps without presenting predicted positions as live facts.

## Bounded session history and selected trails

Recent provider-observed positions are always kept in a bounded volatile
session store. Only the selected object's configured trail is rendered.
Refreshing clears that session store; the separate explicit opt-in durable
boundary is described below.

## Repository documentation and Wiki

Version-controlled documents under `docs/` are the canonical technical record. The GitHub Wiki provides a comprehensive project-oriented view and links back to canonical files where appropriate. GitHub requires the user to initialize the first empty Wiki page; all subsequent Wiki content is managed through Git.

## Bounded viewport-driven traffic

The visible MapLibre canvas is the traffic display boundary. After settled pan,
zoom, rotation, pitch, Home, or real resize changes, the map reports its
sampled full-canvas perimeter and camera center. Floating controls remain
overlays and do not reduce the geographic area that must be covered.

Domain code canonicalizes and unwraps longitudes around a center rounded to
three decimal places. It rejects non-finite, degenerate, unsafe, or
world-spanning geometry. The farthest footprint point defines a conservative
enclosing circle. Views requiring more than 100 km are ineligible: traffic and
trails are hidden, provider work pauses, invalid selection clears, and the UI
asks the user to zoom in or reduce tilt. The app does not clamp, subdivide, or
claim partial results are complete.

For eligible views, providers receive the enclosing circle while display
filtering uses the actual unwrapped polygon. The 100 km decision occurs before
ADSB.lol's required whole-nautical-mile rounding, so the boundary request uses
54 NM (100.008 km transport coverage) but display eligibility remains 100 km.
Center restores a session Home framing comparable to the earlier 20 km view;
that value is camera framing, not a selectable traffic radius.

## Provider-safe viewport updates

ADSB.lol publishes dynamic rather than fixed rate limits. Settled camera
changes replace the latest desired query in the existing 20-second polling
schedule instead of starting extra requests. Obsolete work is canceled or
ignored, and rate-limit responses remain visible and back off explicitly.

Digitraffic sends global vessel updates over the existing MQTT subscription.
Eligible viewport changes refilter that cache immediately without reconnecting.
Location REST initialization is throttled rather than repeated for every camera
movement. Aircraft and marine instances remain session-lived across hidden and
ineligible-view pauses, preserving aircraft cadence and `Retry-After`, MQTT's
15-second connection spacing, five-minute REST/metadata gates, and marine
caches.

Layer toggles are display preferences. They do not stop or reconstruct provider
lifecycles.

## Touch-only isolated marker tolerance

Every traffic selection keeps the exact rendered-point query first. A completed
single-touch tap may use an 8 CSS-pixel extension in each axis only when that
exact query is empty. The fallback deduplicates world copies by application ID
and selects only one unique currently eligible entity.

Mouse and unknown-modality clicks remain exact, including mouse input on hybrid
devices. A later mouse pointer-down clears prior touch evidence. Drag, pinch,
cancel, stale/hidden entities, clusters without application IDs, and multiple
nearby IDs do not activate a guessed selection. The tolerance is expressed in
CSS pixels and is not multiplied by device pixel ratio.

## Privacy-safe browser location

Location is one-shot and session-only. The app automatically reads it when
permission is already granted or changes to granted while the page is open;
otherwise it starts at Tallinn and offers an explicit action. Coordinates are
rounded before provider use, never persisted, not reverse-geocoded, and not
displayed with unnecessary precision. Continuous tracking is outside scope.

Browser permission and position acquisition are separate states. A granted
permission means that the application may request location; it does not promise
that the operating system can return a cold or delayed fix before the configured
timeout. A timeout therefore keeps the current home usable and must remain
retryable without weakening the one-shot, rounded, session-only privacy
contract.

## Explicit coordinates and Photon forward search

One compact Location form handles both direct coordinates and named places.
Strict decimal `latitude, longitude` input is recognized before any provider
path, validated against coordinate ranges, rounded with the existing
three-decimal privacy precision, and navigated locally. Named text is sent only
after explicit submit; typing never schedules network work.

Photon's public endpoint was selected after a dated comparison with the public
Nominatim instance. Photon's current terms permit project use subject to fair
use, throttling, service changes, and no availability guarantee. Public
Nominatim's official one-request-per-second maximum applies to the sum of all
users of an application, which a static browser-local limiter cannot enforce.
Adding a proxy solely to approximate that aggregate policy would be larger than
the required feature.

The Photon adapter is replaceable through one validated HTTPS or root-relative
configuration value, but the checked deployment adds no geocoder proxy or
credential. Requests omit browser credentials and custom `User-Agent` headers,
carry no geolocation bias, and return at most five normalized Point results.
One active request, revision cancellation, a one-second local submit cooldown,
an eight-second total timeout, bounded session caching, and explicit `429`
deadlines contain load without claiming a provider quota. Search failure leaves
coordinates and the map usable.

Search result labels and submitted text are not persisted. The UI discloses
that submitted text appears in the Photon URL and that the provider receives
ordinary network metadata. Visible Photon and OpenStreetMap attribution remains
next to the control.

## Separate Home and explicit-view intent

Session Home is a Center destination, not the current search target. Coordinate
navigation and Photon results change the view without changing Home. A later
Center action therefore returns to the most recent configured or rounded
geolocated Home.

A small revision-based intent boundary prevents asynchronous geolocation from
overriding newer explicit work. Search submission, coordinate navigation,
Center, Use Location, and trusted manual camera movement win over an older
automatic location callback. That older callback may still update Home
silently, so a later Center can use it. Programmatic navigation retains its
label, while trusted canvas movement changes the label to `Custom view`.

Committed navigation clears selection and resets old retained trail points,
then uses the existing settled full-canvas viewport pipeline. It does not
recreate MapLibre, change filters/layers/themes, add a provider scheduler, or
reconnect marine MQTT.

## Configurable trails and private local playback

Selected-object trail observations stay session-only. Their
visibility/duration preference is remembered, retains the released visible
15-minute default, offers 5/15/30/60-minute choices, and remains bounded by both
per-object and 50,000-point aggregate caps. Hiding a trail is a display choice,
not a provider or recording policy.

The dated 2026-09-19 rights review authorizes the shipped persistence boundary
only for explicit opt-in, personal, origin-local playback:

- ADSB.lol labels the live API ODbL 1.0. ODbL grants extraction, derivative
  databases, and permanent reproduction, while public use of a derivative
  database or its produced work can add share-alike and machine-readable-access
  obligations.
- Fintraffic licenses Digitraffic open data under CC BY 4.0 with linked source
  and license credit plus a notice that LiveTrafficStan filters and normalizes
  the data.
- No user history is uploaded, exported, shared, synchronized, served from a
  backend, or placed in a service-worker response cache.
- Public retained-history output, export, shared/cross-device history, or a
  backend requires a fresh provider-rights decision before implementation.

The store remains off by default and records only an allowlisted versioned
observation schema. Session history is separately bounded and volatile.
Durable history uses 1/6/24-hour retention plus 100,000-record and 32 MiB
logical limits; the first reached limit prunes oldest receipt-time records.
Clear and Disable atomically increment a recording epoch and delete rows, and
every queued write rechecks both authorization and epoch inside its
transaction. Pending batches retain their enqueue epoch. Typed cross-tab Clear
invalidations also clear volatile history and pending work, while Disable
clears pending work. Failed batches remain queued behind a visible suspension.

Stored-row validation reconstructs the exact allowlisted schema, requires the
approved provider/kind/license tuple, drops additional properties, and
recomputes logical bytes. Validation, malformed-row deletion, metadata recount,
and pruning occur in one readwrite transaction so repair cannot overwrite a
newer authorization epoch. Successfully committed rows are retained as bounded
in-memory deltas until session pruning needs them, avoiding periodic full-store
rescans during ordinary recording.

Playback changes display time only. It freezes its range on entry, supports
scrub, play/pause, and 0.5×/1×/2×/4× speeds, and stops at the endpoint until
the user explicitly returns live. Current provider controllers remain mounted
and continue ordinary eligible acquisition. Offline, hidden, unmounted, and
ineligible-view reasons compose through the existing pause boundary without
resetting aircraft cadence, `Retry-After`, MQTT reconnect, REST, or metadata
gates.

Current-only METAR and third-party aircraft metadata are absent in history.
Destination, ETA, interpolation frames, browser location, export, sharing,
synchronization, service-worker live caching, and backend history remain
outside the decision.

## Explicit Auto, Light, and Dark theme preference

The Positron presentation remains the default Light theme. V1.1 provides an
explicit Dark choice backed by the OpenFreeMap dark style and CSS custom
properties. Issue #10 adds explicit Auto without changing the default: missing,
invalid, or inaccessible storage still resolves to Light. Auto follows
`prefers-color-scheme`, including later system changes, while explicit Light
and Dark remain overrides. Pre-paint and React resolution use the same
contract to avoid an initial wrong-theme flash.

Issue #12 moves theme into the complete
`livetrafficstan.preferences.v1` schema. The legacy theme key is imported only
when that schema is absent and is mirrored for rollback compatibility; it is no
longer an independent authority.

MapLibre remains a single instance. Because `map.setStyle` removes custom
style-owned state, the map layer installer restores traffic images,
sources, layers, data, visibility, and trail after every `style.load`
without changing camera, selection, provider state, or connections.

Traffic artwork keeps cyan aircraft and amber vessels in both themes. The
theme-specific canvas treatment changes fill luminance, detail color, shadow,
and two-tone edge contrast while retaining silhouettes and heading/course
rotation. Image IDs are replaced through MapLibre when the theme changes,
including when both theme options reference the same style URL. The image cache
contains only the bounded light and dark sets.

## Versioned preferences, fragment sharing, and presentation units

The unified preference schema stores only non-sensitive controls: theme,
presentation units, six layer flags, structured vessel filters without query
text, and selected-trail visibility/duration. Camera, browser Home/location,
searches, selections, provider state, observations, playback, and the separate
private-history authorization/storage contract are excluded.

Explicit sharing creates a readable versioned URL fragment only on user action.
The camera is complete, bounded, and rounded to the existing three-decimal
privacy precision. Valid fragment fields override saved preferences and
defaults for that page, but opening the link does not save them. A shared
camera initializes the one MapLibre instance and wins over asynchronous
automatic geolocation; the location result may still update Home for a later
Center action.

Metric values remain canonical. Aviation/nautical presentation converts metres
to feet, km/h to knots, and m/s to ft/min. Vessel dimensions and filter
thresholds remain metres. Selected vessel speed over ground always shows both
km/h and knots so marine users do not need to switch the global presentation
preference for that value. AWC wind and visibility are normalized to metric at
the provider boundary while retaining bounded visibility relation/source tokens
for truthful aviation formatting. Unit changes never alter provider queries,
viewport eligibility, filter membership, history, selection, or map lifecycle.

Reset restores preference defaults and removes the share fragment without
moving the camera/Home or touching private-history settings, consent, epochs,
or IndexedDB.

## Dependency-free generated application shell

The installable shell uses a small generated native service worker rather than
adding a PWA framework. Vite already emits every required hashed application
chunk, including the MapLibre worker and lazy MQTT bundle, so a post-build Node
step can enumerate and version the exact shell with less policy surface.

Only root/index, hashed assets, manifest, favicon, and versioned icons are
preloaded. APIs, MQTT, external map resources, Photon, AWC, static context
datasets, and private history are excluded. Root navigation is network-first;
shell assets are cache-first; all other requests bypass the worker. This keeps
offline state truthful and prevents stale live/provider output from becoming a
success-shaped response.

Updates keep at most current and predecessor shell caches. This is the smallest
handover that protects old controlled tabs and deferred hashed imports while
bounding cleanup. The candidate records which cache is truly active during
install rather than inferring lineage from CacheStorage insertion order, so a
superseded waiting generation cannot evict the real predecessor. First install
never prompts. Worker policy source participates in the cache identity, while a
same-identity defensive path leaves active metadata untouched. A waiting update
activates only after **REFRESH APP**, then reloads controlled tabs once.
Rollback uses the same path in reverse and searches the active generation
before its predecessor.

The offline map is not a basemap cache. A source-free theme background lets the
existing MapLibre instance calculate viewport geometry and render retained
historical overlays. It states that basemap tiles are not cached and retries
the external style on reconnect.

Rollback to a non-PWA release uses a special retirement build. Its stable
worker activates immediately, deletes only LiveTrafficStan shell caches,
unregisters, and navigates clients once without touching local preferences,
unrelated caches, history settings, or IndexedDB.

## Separate optional traffic clustering

Clustering is a remembered display preference and starts off. Aircraft and
vessels keep separate MapLibre GeoJSON sources, cluster circles, and `AIR`/`SEA`
count labels so unlike traffic kinds are never combined. Filtering, viewport
eligibility, freshness, and expiry run before source data reaches clustering.

Cluster IDs are transient MapLibre implementation details, not application
entity IDs. A click expands the exact cluster under generation guards; touch
entity fallback ignores clusters. Fixed source creation uses a 42 CSS-pixel
radius, minimum count 3, and maximum cluster zoom 10. Runtime toggles change
only the supported `cluster` source option.

MapLibre rebuilds the Supercluster index on every full GeoJSON `setData()` even
above the visible cluster zoom. Per-frame interpolation is therefore
suspended whenever clustering is enabled. Ordinary stable-ID traffic movement
uses `updateData` diffs, while style/source installation and forced recovery
retain complete snapshots. This avoids repeated full index rebuilds without
changing provider acquisition, source observations, selection, or trails.

## Bounded AWC METAR/SPECI observation overlay

NOAA/NWS Aviation Weather Center is selected for one optional
observation-based context layer. Its official API supplies worldwide METAR
terminal observations and SPECI updates, publishes a 100 request/minute limit,
requests a public User-Agent, and explicitly does not permit browser CORS.
The existing Cloudflare boundary therefore adds one strict credential-free
same-origin route rather than a client-side workaround or general proxy.

The station set comes only from explicit four-letter ICAO codes in the pinned
large/medium OurAirports projection inside the eligible viewport. At most 50
sorted unique IDs are sent; an over-limit view asks the user to zoom in rather
than silently truncating coverage. No station, weather, route, or airport
operation is inferred from traffic, movement, proximity, `ident`, or IATA.

There is no startup request and no periodic poller. First enable, station-set
changes, refresh, and retry share a session-lived 60-second start gate and
longer provider `Retry-After` deadlines. Reports become stale after 75 minutes
and expire after 120 minutes. Hidden, disabled, superseded, and unmounted work
aborts; fulfilled same-view data survives hide/show and style changes in memory
only.

AWC reports are generally U.S. public-domain information unless marked
otherwise. The app shows source and retrieval times, visible attribution,
terms, and modified-presentation wording. METAR/SPECI is observed weather, not
a forecast, operational status, route, board, or coverage guarantee. Radar,
forecast processing, paid services, persistent weather storage, provider
selection, and shared application caching remain out of scope.

## `dev`-based pull request delivery

Feature and documentation branches start from `dev` and merge into `dev`
through checked pull requests. Releases enter `main` only through a checked
`dev` to `main` pull request. Repository rulesets require pull requests and
block force pushes/deletion while retaining an explicit administrator emergency
bypass. Required human self-review is intentionally not configured because it
would deadlock CLI-owned changes; automated validation is the technical gate.

Project-specific Copilot instructions and focused read-only reviewers preserve
the MapLibre, provider-rate, privacy, and delivery lessons from V1. They support
implementation and review but do not introduce another approval layer.

GitHub's repository-wide automatic merged-branch deletion remains disabled.
Release pull requests use persistent `dev` as their head, so global automatic
deletion can remove the branch even when branch rules otherwise describe it as
persistent. Merged feature branches are deleted explicitly; `dev` is never
treated as disposable.

## Issue-scoped delivery and external blockers

One GitHub Issue owns one primary delivery workstream. Broad Issues may use
additional focused pull requests when their acceptance groups are independent
or when an external prerequisite is resolved later. Partial work uses
non-closing references and does not close the parent until all non-blocked
criteria are complete.

An unrelated defect discovered during implementation, review, or release
acceptance receives its own Issue. It joins the active work only when it is
tightly coupled to the change or blocks a documented acceptance criterion;
otherwise it remains separately prioritized instead of broadening the current
delivery.

Provider access, credentials, account roles, data rights, or licensing become a
separate blocker only after concrete evidence identifies the missing
prerequisite. The blocker records affected criteria and measurable completion
evidence while unrelated ready work continues. Placeholder adapters, inferred
data, client-side secrets, and success-shaped fallbacks are not acceptable
substitutes.

## Compact controls and rendered interaction evidence

The primary map controls remain intentionally small and split by task. The
upper Navigate and Explore panel keeps one location input plus Center, Aircraft,
and Ships visible; its native disclosure contains search feedback, location,
secondary layers, discovery, context, and source detail. The lower Settings
panel keeps Auto, Light, Dark, and Trails visible; its native disclosure
contains trail duration, local-history setup, units, sharing, reset, and
application detail. The two disclosures share one native `name`, so at most one
is open.

The location input stays mounted while its feedback is collapsed, preserving
entered text and in-flight state. Active historical controls and one urgent
actionable recovery remain visible outside both disclosures, and mandatory map
or selected-item attribution is never hidden. The combined expanded stack,
rather than each panel independently, owns the 58vh budget.

Selection updates must retain the complete MapLibre feature-property contract.
In particular, `removeAllProperties` is terminal in the installed source-diff
implementation and cannot be combined with properties expected to survive or be
re-added.

Pure tests, server-rendered markup, and HTTP smoke cannot establish that a
marker remains painted, focus returns to a visible control, or a mobile map
strip is touchable. Those claims require a real-browser check with measured
camera, source properties, overlay bounds, attribution, and an actual input
gesture.

## Deterministic checks before live probes

Repeated lifecycle and rate-limit verification uses local fixtures, fake clocks,
fake maps, mocked fetch, and mocked MQTT. A release milestone then performs one
bounded real-provider smoke. This preserves evidence for cancellation, retries,
pause/resume, style rehydration, and error isolation without turning test loops
into provider load.

## Apache-2.0 with preserved project attribution

The source-code license changes from MIT to Apache License 2.0 and adds a
`NOTICE` file identifying LiveTrafficStan and its original author. Apache-2.0
remains a standard permissive open-source license, permits commercial and
proprietary derivative products, includes an explicit patent grant, and
requires distributed derivative works to preserve applicable notices and a
readable copy of the project's attribution.

This meets the goal of keeping the repository public and broadly reusable while
retaining credit if the software becomes part of another product. A custom
advertising clause was rejected because it would reduce compatibility with
standard open-source licensing. Provider data remains under its own licenses
and attribution requirements.
