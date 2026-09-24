# Configuration

## Environment overrides

LiveTrafficStan works with checked-in defaults. Optional Vite environment
variables can be placed in `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Default | Validation and meaning |
| --- | --- | --- |
| `VITE_CENTER_LATITUDE` | `59.437` | Finite number from -90 through 90 |
| `VITE_CENTER_LONGITUDE` | `24.7536` | Finite number from -180 through 180 |
| `VITE_CENTER_LABEL` | `Tallinn, Estonia` | Non-empty display label; blank uses the default |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` | HTTPS URL or root-relative path |
| `VITE_MAP_DARK_STYLE_URL` | `https://tiles.openfreemap.org/styles/dark` | HTTPS URL or root-relative path |
| `VITE_GEOCODER_ENDPOINT` | `https://photon.komoot.io/api` | HTTPS Photon-compatible forward-search endpoint or root-relative deployment path; protocol-relative and credential-bearing URLs are rejected |
| `VITE_AIRCRAFT_ENDPOINT` | `/api/aircraft` | HTTPS URL or root-relative path |
| `VITE_AIRCRAFT_PHOTO_ENABLED` | `false` | Exact `true` or `false`; exposes the direct-browser selected-details and fine-pointer hover evaluation paths and does not add a proxy |
| `VITE_FLIGHT_ROUTE_ENABLED` | `false` | Exact `true` or `false`; controls only whether the browser presents selected-flight lookup |
| `VITE_FLIGHT_ROUTE_ENDPOINT` | `/api/flight-route` | Root-relative same-origin route with no query or fragment; protocol-relative and absolute URLs are rejected |
| `VITE_WEATHER_ENDPOINT` | `/api/weather/metar` | Root-relative same-origin METAR route with no query or fragment; protocol-relative and absolute URLs are rejected |
| `VITE_MARINE_REST_ENDPOINT` | `https://meri.digitraffic.fi` | HTTPS URL or root-relative path |
| `VITE_MARINE_MQTT_ENDPOINT` | `wss://meri.digitraffic.fi:443/mqtt` | Secure WebSocket URL or root-relative path |

Invalid numeric ranges, malformed URLs, or disallowed URL protocols fail
explicitly during application startup. Trailing slashes are removed so provider
paths can be appended consistently.

Every `VITE_*` value is embedded in browser JavaScript. These variables are
configuration, not a secret store. Never place API tokens, private endpoints,
credentials, or personal information in them.

## Operational defaults

The following behavior is centralized in `src/config/appConfig.ts` rather than
spread through components:

| Setting | Current value |
| --- | --- |
| Initial Home framing | Comparable to a 20 km local view |
| Maximum eligible enclosing radius | 100 km |
| Touch marker hit extension | 8 CSS pixels per axis after an exact miss |
| Vessel minimum-length presets | 0, 25, 50, 100, 150 m |
| Vessel maximum-length presets | 24, 49, 99, 149 m, or none |
| Default minimum vessel length | 50 m |
| Default unknown vessel length | Excluded until explicitly included |
| Vessel search/result bound | 64 characters / 20 accessible results |
| Reported-speed boundary | 1 knot = 1.852 km/h |
| Aircraft refresh | 20 seconds |
| Aircraft maximum rate-limit backoff | 5 minutes |
| Aircraft stale / expiry | 45 seconds / 120 seconds |
| Aircraft search/result bound | 64 characters / 20 accessible results |
| Aircraft metadata request deadline | 5 seconds across index and shard reads |
| Aircraft metadata response caps | 512 KiB index / 512 KiB shard |
| Aircraft metadata shard cache | 8 validated prefix shards |
| Aircraft metadata snapshot age | Valid through 45 days; 24-hour future-clock tolerance |
| Aircraft photo lookup | Disabled by default; explicit selected-details action or 500 ms fine-pointer dwell, exact live ICAO24 only |
| Photo request deadline / response cap | 8 seconds / 32 KiB |
| Photo JSON tab cache | 32 successful or no-photo entries / 1 hour |
| Selected-flight route lookup | Disabled by default; explicit action only |
| Route client / Worker deadline | 10 seconds |
| Route client / Worker response cap | 16 KiB validated response / 512 KiB provider response |
| Route global budget | 90 reserved attempts in a rolling 31-day window |
| Port asset request deadline / cap | 5 seconds / 512 KiB |
| Port records / rendered zoom range | 1,081 / zoom 5 through 13 |
| Airport asset request deadline / cap | 5 seconds / 1.5 MiB |
| Airport records | 5,280 large and medium airports |
| Airport rendered zoom thresholds | Large points/labels 4/5; medium points/labels 7/8 |
| Traffic clustering | Off by default; separate aircraft/vessel sources, 42 px radius, 3-point minimum, maximum cluster zoom 10 |
| METAR station bound / request start gate | 50 explicit ICAO stations / at least 60 seconds |
| METAR client and Worker deadline / response cap | 8 seconds / 256 KiB |
| METAR stale / expiry | 75 minutes / 120 minutes |
| Marine metadata refresh | 5 minutes |
| Marine query REST refresh gate | 5 minutes |
| Marine MQTT connect timeout / reconnect | 10 seconds / 15 seconds |
| Marine REST lookback | 15 minutes |
| Marine snapshot flush | 1 second |
| Marine stale / expiry | 2 minutes / 10 minutes |
| Selected trail | Shown by default; visibility/duration remembered; observations session-only; 5, 15, 30, or 60 minutes |
| Trail point caps | 12 points/minute per object; 50,000 points overall |
| Session observation history | 60 minutes; 50,000 records; 16 MiB logical payload |
| History sampling | Newer provider source time; at most one sample per provider/entity per 10 seconds |
| Durable local history | Disabled by default; 1, 6, or 24 hours; default 1 hour |
| Durable history caps | 100,000 records; 32 MiB logical payload; first reached limit wins |
| Pending durable queue | 5,000 records or 4 MiB; oldest uncommitted records drop visibly |
| IndexedDB write / maintenance | 250 records per batch / prune every 5 minutes |
| Playback | 0.5×, 1×, 2×, or 4×; cursor publication at most every 100 ms |
| Historical trail gaps | Aircraft 120 seconds; vessels 600 seconds; session/navigation changes also split |
| Maximum interpolation duration | 1.5 seconds |
| Query/geolocation coordinate precision | 3 decimal places |
| Settled-viewport delay | 350 ms |
| Geolocation timeout / cached-position age | 20 seconds / 5 minutes |
| Place-search result/query limit | 5 results / 100 characters |
| Place-search cooldown / timeout | 1 second / 8 seconds |
| Place-search `429` fallback | 60 seconds when no readable `Retry-After` is exposed |
| Place-search session cache | 20 successful or empty queries / 15 minutes |

Changing these constants changes application behavior and should include
targeted tests where the value affects filtering, freshness, history, or motion.

Trail duration and visibility are fields in the versioned preference schema.
The released
15-minute/180-point behavior remains the default. Reducing
the duration prunes immediately; increasing it collects future provider
observations only and does not reconstruct points that were not retained.
Hiding the trail changes only the selected-object line and does not change
provider acquisition.

Private history settings use
`livetrafficstan.history.settings.v1`. Observations use IndexedDB database
`livetrafficstan-history`, schema version 1, with primary key
`[provider, entityId, observedAt]`. BroadcastChannel
`livetrafficstan-history` is primary cross-tab invalidation; storage key
`livetrafficstan.history.invalidate.v1` is the fallback. These names are
versioned data contracts, not environment-variable overrides. Invalidation
messages are typed; destructive messages include the committed recording epoch
and Clear includes its receipt-time boundary. Pending batches retain their
enqueue epoch and are never rewritten under a later authorization.

Vessel search and filters are serializable React state, not provider
configuration. All criteria combine with AND after freshness and exact viewport
filtering. `all` includes unknown values; a specific known category,
navigation state, or speed band excludes unknown values; an explicit
`unknown` choice selects only unknown values. The one-knot split is exact:
below means `< 1.852 km/h`, while one knot or faster means `>= 1.852 km/h`.
Zero is a known reported speed. Minimum and maximum lengths are inclusive, and
missing length passes only when **Include unknown length** is selected.

## Changing the center

For example, a local Tallinn-area variant can use:

```dotenv
VITE_CENTER_LATITUDE=59.45
VITE_CENTER_LONGITUDE=24.70
VITE_CENTER_LABEL=Tallinn Bay
```

The configured center is the immediate fallback and session home. If browser
location permission is already granted, the app resolves a rounded one-shot
position before starting provider queries. If permission changes to granted
while the page remains open, one lookup updates the session home automatically.
Otherwise it starts at the configured center and offers an explicit
`Use location` action. The lookup remains bounded but allows up to 20 seconds
for a cold operating-system position; a timeout keeps the current Home and
leaves the action available for an explicit retry.

A settled pan, zoom, rotation, pitch, Home, or real resize changes the traffic
viewport. The full map canvas is included even where floating controls cover
it. Center returns to the session Home using a fixed local camera framing;
there is no selectable traffic radius. Neither Home nor viewport coordinates
are persisted. A named-place or coordinate navigation changes only the current
view; it never changes session Home, so Center still returns to the latest
configured or rounded geolocated Home.

## Coordinate entry and named-place search

The Location control submits only when the user activates **Go** or presses
Enter. Two strict decimal numbers separated by one comma are validated and
rounded locally, then used directly as the next camera target. Valid coordinate
input never calls a geocoder. Exponent notation, non-finite values, incomplete
pairs, extra numeric segments, and out-of-range coordinates are rejected.
Ordinary names containing commas remain named queries.

Named text uses the configured Photon-compatible endpoint with `q` and a
bounded `limit=5`. The browser sends `Accept: application/json`, omits
credentials, and adds no custom `User-Agent`, geolocation bias, or automatic
retry. Only one request remains active. New input, Escape, result selection,
Center, Use Location, coordinate navigation, or manual camera movement cancels
obsolete work.

Search starts only on explicit submit, with a one-second per-tab cooldown.
Successful and empty results are cached in session memory for 15 minutes, up to
20 entries. A `429` honors a readable `Retry-After`; otherwise the app requires
one minute before another network search. This is a local fair-use safeguard,
not a claim about an aggregate provider quota.

The default endpoint is called directly from the browser. Submitted place text
therefore appears in the Photon request URL, and Photon receives ordinary
network metadata such as the client IP address. Browser-derived Home
coordinates are not sent to Photon. A root-relative
`VITE_GEOCODER_ENDPOINT` is only a deployment substitution point; the checked
Cloudflare Worker does not add a geocoder proxy.

## Aircraft endpoint and proxy

The default browser request is root-relative:

```text
/api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}
```

Vite development and preview rewrite `/api/aircraft` to
`https://api.adsb.lol`. Production uses the checked Cloudflare Worker.
Setting `VITE_AIRCRAFT_ENDPOINT` to an absolute URL bypasses those same-origin
routes, but it works only if the target explicitly allows browser CORS.

The protected deployment and rollback workflows expose only two fixed
aircraft-delivery values:

- `worker-proxy` builds with `/api/aircraft` and is the current production
  mode;
- `adsb-lol-direct` builds with `https://api.adsb.lol`.

The direct mode is source-ready but not authorization: deploy it only after
ADSB.lol confirms the browser path and the live API returns an accepted
`Access-Control-Allow-Origin` value for both successful and throttled
responses. The client request remains credential-free and `no-store`, times
out after 12 seconds, and rejects responses larger than 4 MiB. Arbitrary
workflow endpoint URLs are not accepted.

For an eligible viewport, the rounded camera center and conservative enclosing
radius are sent to ADSB.lol. The application decides eligibility against the
100 km limit before rounding outward to the provider's integer nautical miles.
An exact 100 km viewport therefore requests 54 NM, or 100.008 km of transport
coverage, while the client still displays only objects inside the actual
viewport polygon. Deployment proxies must not alter coordinates, units, or
this boundary behavior.

The production Worker enforces the exact `/v2/point` path, canonical coordinate
ranges, and integer 1-54 NM radius. It rejects query strings and every other
method/path, never follows upstream redirects, keeps a ten-second total
deadline, rejects responses over 4 MiB, and preserves upstream status, body,
`Content-Type`, and `Retry-After`. It sends a stable public project User-Agent
because ADSB.lol rejects generic Worker identification; no browser cookie,
authorization, or arbitrary header is forwarded.

Live aircraft responses are never placed in a shared deployment cache.
Fingerprint-named application assets are cached immutably instead. See
[Hosting and Deployment](hosting-and-deployment.md).

## Aircraft photo evaluation

The browser photo section is omitted unless:

```dotenv
VITE_AIRCRAFT_PHOTO_ENABLED=true
```

This flag contains no credential and does not enable a Worker route. Source
configuration remains fail-closed at `false`; the protected V1.5.3 production
dispatch explicitly sets it to `true` after exact-origin acceptance from
<https://livetrafficstan.syntal.workers.dev>. The published low-volume browser
terms do not require an API key, email, membership account, or prior provider
contact.

The protected production workflow exposes the same value as the required
`aircraft_photo_enabled` dispatch input. That keeps activation explicit and
allows an accepted application source to be redeployed with `false` if a later
provider-contract or exact-origin check fails. It does not relax the direct
browser, unchanged-URL, attribution, storage, or provider-origin rules.

When enabled for deterministic evaluation, selecting an aircraft still makes
no request by itself. The user can activate **Load aircraft photo**, or a fine
pointer can remain on one live aircraft for 500 ms. Only a valid
six-character ICAO24 is sent directly from the browser to the fixed
Planespotters hex endpoint. Moving away before the hover dwell cancels that
automatic attempt. Requests omit credentials, reject redirects, use
`cache: no-store`, enforce an eight-second deadline and 32 KiB response cap,
and never use the Worker.

Accepted responses contain zero or one photo. The regular thumbnail must use
the exact configured Planespotters CDN origin, and the returned source link
must use the exact Planespotters `/photo/` origin/path. Both URL strings remain
unchanged. The image loads directly from the provider CDN, links to the source
page in a new tab, and shows visible photographer credit.

Successful and no-photo JSON results may remain in one shared 32-entry
least-recently-used current-tab cache for at most one hour, so hover followed by
selected details does not spend another lookup. Errors are not cached. A `429`
blocks another manual attempt until its readable `Retry-After`, or for one
minute when that header is unavailable. Hover errors do not automatically
retry, and there is no selection-time prefetch.

No JSON, returned URL, credit, or image byte is written to Web Storage,
IndexedDB, Cache API, service-worker cache, Worker cache, KV, or R2. HISTORY
and vessel hover/details never start or expose the photo path. See
[Aircraft Photo Evaluation](aircraft-photo-evaluation.md) for the exact terms,
deterministic evidence, failed live-CORS gate, and enablement requirements.

## Selected-flight route evaluation

The browser route section is omitted unless:

```dotenv
VITE_FLIGHT_ROUTE_ENABLED=true
VITE_FLIGHT_ROUTE_ENDPOINT=/api/flight-route
```

These browser-visible values contain no credential and cannot enable the
Worker by themselves. The Worker separately requires
`AVIATIONSTACK_ENABLED=true`, the `AVIATIONSTACK_ACCESS_KEY` secret, and the
`FLIGHT_ROUTE_QUOTA` Durable Object binding. A caller that bypasses the UI
therefore cannot activate a disabled route.

Selecting an aircraft does not make a route request. The user must activate
**Find route** for each attempt. The selected live aircraft must have a
six-character ICAO24 address and an ICAO-like callsign with three leading
letters and at least one digit. Selection, callsign, ICAO24, registration,
history-mode, or unmount changes abort and clear obsolete work. Ordinary
ADSB.lol position updates, map movement, theme changes, and provider refreshes
do not start or repeat a lookup.

The same-origin Worker reserves one of 90 global attempts in a rolling 31-day
window before making exactly one fixed aviationstack `/v1/flights` request. It
does not retry, paginate, follow redirects, place responses in a shared cache,
or refund attempts after provider failure or cancellation. A result is
displayed only for one active non-codeshare row whose flight ICAO and aircraft
ICAO24 match exactly; conflicting registrations, multiple matches, and
incomplete pagination remain unavailable.

The browser keeps only successful validated routes in a 32-entry in-memory
least-recently-used cache keyed by the exact normalized callsign, ICAO24, and
optional registration. Each entry remains eligible for reuse for six hours;
closing or reloading the tab clears it sooner. Reopening the same exact flight
reuses the route without a provider request; **Refresh route** deliberately
makes a new request. Unavailable, ambiguous, incomplete, configuration, quota,
provider, aborted, and expired results are never cached. No route enters
`localStorage`, `sessionStorage`, IndexedDB, traffic history, or the
service-worker cache.

Vite has no aviationstack proxy. Credentialed local evaluation must use the
actual Worker runtime:

```bash
cp .dev.vars.example .dev.vars
# Replace the placeholder with an authorized evaluation key.
VITE_FLIGHT_ROUTE_ENABLED=true npm run preview:worker
```

`.dev.vars` is ignored by Git. Never place the access key in `.env.local`, a
`VITE_*` value, source code, test fixture, issue, screenshot, or browser log.
Issue #44 limits initial live evaluation to ten calls and still blocks public
enablement until the exact account terms, display/attribution rights, and
sample behavior are recorded.

## Weather observations and proxy

The default browser request is root-relative and canonical:

```text
/api/weather/metar?ids=EETN%2CEFHK
```

The application derives the station set only from explicit four-letter
`icaoCode` values in the pinned large/medium OurAirports projection that fall
inside the current eligible live-traffic viewport. IDs are uppercase, sorted,
unique, and limited to 50. An over-limit view is not truncated; the UI asks the
user to zoom in. `ident`, IATA, visible aircraft, routes, movement, and nearby
geometry are never used as station inference.

Vite development/preview rewrites the fixed route to the AWC JSON endpoint,
discards unsupported browser query parameters, forces `format=json`, removes
browser credentials and forwarding headers, and sends the public project
User-Agent. Production uses the stricter Worker validation described in
[Hosting and Deployment](hosting-and-deployment.md). Setting
`VITE_WEATHER_ENDPOINT` remains a same-origin path substitution point for an
approved deployment boundary, not an upstream-provider selector. Absolute and
protocol-relative values are rejected, and the client verifies the resolved
origin before sending station IDs.

There is no startup request and no periodic weather poller. First enable,
settled station-set changes, explicit refresh, and retry share a session-lived
minimum 60-second request-start gate and preserve a longer `Retry-After`.
Hidden, disabled, superseded, or unmounted work aborts. A fulfilled same-view
result survives hide/show and theme/style changes without persistence or
refetch. Reports are marked stale after 75 minutes and removed after 120
minutes.

Enabling METAR sends the visible qualifying ICAO station IDs through the
application host to AWC. The UI shows source and retrieval time. Coverage is
limited by both AWC reporting and the pinned airport projection; an empty
result is not proof of no weather or global coverage.

## Selected-aircraft metadata

Static metadata configuration is intentionally not exposed through `VITE_*`
variables. `src/config/aircraftMetadataSource.json` pins the source archive,
license, checksums, schema, immutable output version, age policy, and expected
projection measurements. `src/config/appConfig.ts` derives the same-origin
asset base and runtime limits from that checked manifest.

No request occurs before an aircraft is selected. One five-second deadline
covers loading the index/type dictionary and the selected ICAO24 prefix shard.
Both response streams have 512 KiB caps. Only a fulfilled validated index and
up to eight fulfilled validated shards are cached in session memory.

The source publication time is valid through the exact 45-day boundary and is
rejected only after that instant. A date more than 24 hours ahead of the browser
clock is invalid. This policy is reevaluated while a detail panel remains open
without refetching.

Changing the source, schema, generator, or generated bytes requires a new
`outputVersion` and immutable URL. Do not point an existing version at
different bytes.

## Optional port context

Port data configuration is intentionally not exposed through `VITE_*`
variables. `src/config/portsSource.json` pins Natural Earth tag `v5.1.2`,
commit `f1890d9f152c896d250a77557a5751a93d494776`, the source and output
SHA-256 values, source publication instant, public-domain terms, schema,
record/rank counts, measured sizes, and immutable output version.
`src/config/appConfig.ts` derives the same-origin asset URL and runtime bounds
from that manifest.

The provider makes no request while PORTS is disabled. First enable loads one
GeoJSON asset under one five-second deadline and 512 KiB cap. Only a complete
validated response enters the fulfilled-only session cache. Hiding and
re-enabling the layer reuses that cache; Retry discards only failed/aborted work
and starts a new bounded attempt.

Major ranks 3-4 render from zoom 5 with labels from zoom 6; medium ranks 5-6
render from zoom 7/8; minor ranks 7-8 render from zoom 9/10. All port layers
stop at zoom 13 because the source points are generalized. Changing the source,
projection, generator, or generated bytes requires a new `outputVersion`; an
existing immutable path must regenerate byte-identically.

## Optional airport context

Airport data configuration is intentionally not exposed through `VITE_*`
variables. `src/config/airportsSource.json` pins OurAirports commit
`5ed85eed28722bea80ebdde9e255e09b1e7317a8`, the source and output
SHA-256 values, publication instant, public-domain terms, schema, record/kind
counts, measured sizes, and immutable output version.
`src/config/appConfig.ts` derives the same-origin asset URL and runtime bounds
from that manifest.

The provider makes no request while AIRPORTS is disabled. First enable loads
one GeoJSON asset under one five-second deadline and 1.5 MiB cap, then enforces
the exact pinned byte count and SHA-256 before validating all 5,280 records.
Only a complete validated response enters the fulfilled-only session cache.
Hiding and re-enabling reuses that cache; Retry discards failed or aborted
work and starts a new bounded attempt.

Large airport points render from zoom 4 and labels from zoom 5. Medium points
render from zoom 7 and labels from zoom 8. There is no upper zoom cutoff.
`ident` is retained as an OurAirports interoperability identifier and is never
silently presented as an ICAO code; explicit optional `icaoCode` and
`iataCode` fields remain distinct. Changing the source, projection, generator,
or generated bytes requires a new `outputVersion`; an existing immutable path
must regenerate byte-identically.

## Map style

The style must be readable by MapLibre and all referenced tiles, glyphs, and
sprites must allow browser access. Provider attribution from the source
metadata must remain visible.

MapLibre's module worker is explicitly bundled through Vite in
`TrafficMap.tsx`. If the bundler or MapLibre integration changes, verify both
`npm run dev` and `npm run preview`; loading the style JSON alone is not proof
that vector tiles are being parsed.

`VITE_MAP_STYLE_URL` configures the Light style and
`VITE_MAP_DARK_STYLE_URL` configures the Dark style. The stored
`livetrafficstan.preferences.v1` theme field may be `auto`, `light`, or `dark`.
The legacy `livetrafficstan.theme` value is imported only when the unified key
is absent and remains a rollback mirror. A missing preference, invalid value,
or unavailable storage selects Light to preserve the previous default. Auto
resolves the browser system color scheme and follows later changes; explicit
Light/Dark choices remain overrides. Map center coordinates are never stored.

The current behavioral configuration keeps:

| Setting | Decision |
| --- | --- |
| Light map style | OpenFreeMap Positron |
| Dark map style | OpenFreeMap Dark |
| Theme default | Light; Auto is explicit opt-in |
| Aircraft query cadence during camera movement | No faster than 20 seconds |
| Marine query-triggered REST refresh | No more than once per 5 minutes |
| Ineligible viewport behavior | Hide traffic/trails and pause providers |
| Geolocation precision | Rounded to approximately 3 decimal places |
| Geolocation mode | One-shot, permission-aware, session-only |

Navigation timing and privacy values are centralized in
`src/config/appConfig.ts`.

Layer preferences use one plain serializable boolean shape for aircraft,
vessels, ports, airports, clustering, and METAR. It deliberately excludes
provider state, loading/error state, observations, cluster IDs, MapLibre
objects, and selections. The shape is stored inside
`livetrafficstan.preferences.v1`.

The complete preference schema also stores:

- `metric | aviation-nautical` presentation units;
- structured vessel category/navigation/reported-speed/length/unknown-length
  filters, excluding the free-text query;
- selected-trail visibility and 5/15/30/60-minute duration.

It never stores camera, Home/browser location, place/aircraft/vessel search
text, selection, provider state, observations, history consent/retention/data,
or playback. **RESET PREFERENCES** removes the unified key and legacy theme
mirror but leaves private-history storage untouched.

Explicit sharing uses a validated fragment with maximum length 2,048:

```text
#v=1&lat=59.437&lon=24.754&zoom=8.25&bearing=0.0&pitch=0.0&...
```

The camera is all-or-nothing, coordinates use the configured three-decimal
privacy precision, and duplicate/unknown/out-of-range fields reject the share.
Valid fragment fields override saved preferences for that page without being
saved automatically. Browser Home/location, queries, selection, history, and
provider state are never serialized.

## Installable application shell

`npm run build` is the canonical PWA build:

```text
tsc -b && vite build && node scripts/generate-service-worker.mjs
```

The generator fails above 4 MiB of uncompressed allowlisted shell responses.
It emits stable `/sw.js` with a content-versioned cache containing only root/
`index.html`, built `/assets/*`, the manifest, favicon, and versioned icons.
Do not add provider responses, map resources, Photon, weather, aircraft
metadata, airport/port datasets, or history rows to that allowlist.

Deployment headers must keep `/sw.js`, `/index.html`, and
`/manifest.webmanifest` revalidated. Hashed assets and versioned icons are
immutable. `/sw.js` must be JavaScript and expose `Service-Worker-Allowed: /`.

Normal production registration requires a secure context and uses
`updateViaCache: none`. Vite development does not register a worker.
`npm run build:pwa-retire` builds the no-registration rollback shell and emits
the stable retirement worker. In the protected production workflow choose the
`pwa-retirement` artifact for the exact current-main SHA. Do not roll directly
to a release that removes `/sw.js`; dormant browser registrations still need
to receive retirement.

The service worker has no generic navigation fallback. Only `/` and
`/index.html` navigations use cached `index.html` when network fetch fails.
Routes such as `/elsewhere` and every non-shell request preserve ordinary
network/404 behavior.

## Marine endpoints

The REST endpoint must expose Digitraffic-compatible AIS location and vessel
metadata responses. The MQTT endpoint must expose the `vessels-v2` topics over
secure WebSockets:

```text
vessels-v2/+/location
vessels-v2/+/metadata
vessels-v2/status
```

The app sends `Digitraffic-User: LiveTrafficStan/1.0` on REST requests and uses
an ephemeral random MQTT client identifier. Neither value contains user data.

Map movement must not place browser location or other personal information in
that header. Eligible viewport updates reuse the MQTT connection and should
rely on the provider-wide message cache before considering another bounded REST
request. Hidden and ineligible-view pauses retain MQTT, REST, and metadata
deadlines rather than reconstructing the provider.
