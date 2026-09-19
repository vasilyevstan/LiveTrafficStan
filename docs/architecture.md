# Architecture

## System shape

LiveTrafficStan V1 is a browser application with no authentication, database,
or persistent backend. React owns controls and selected-object UI state.
Provider adapters own external protocols and normalization. MapLibre owns
high-frequency geographic rendering.

```text
                       visibility lifecycle
                               |
ADSB.lol -> Vite proxy -> aircraft adapter -> normalized Aircraft[]
                                                        |
Digitraffic REST + MQTT -> marine adapter -> normalized Vessel[]
                                                        |
                                 freshness + filters + bounded history
                                                        |
                           React overlays <-> persistent MapLibre map
```

The only server-side behavior in local V1 is Vite's same-origin proxy from
`/api/aircraft/*` to `https://api.adsb.lol/*`. It exists because ADSB.lol does
not currently provide browser CORS headers; it does not hold a credential.

## Source responsibilities

| Area | Responsibility |
| --- | --- |
| `src/config/` | Typed defaults and validation of browser-safe environment overrides |
| `src/domain/` | Application-owned traffic types, geographic helpers, and formatting |
| `src/providers/aircraft/` | ADSB.lol request, runtime payload checks, normalization, and unit conversion |
| `src/providers/marine/` | Digitraffic capabilities, REST/MQTT lifecycle, metadata merging, normalization, and opt-in development diagnostics |
| `src/app/` | React hooks for provider lifecycle, time ticks, and trail history |
| `src/traffic/` | Filtering, freshness/expiry, interpolation, and bounded history |
| `src/map/` | MapLibre lifecycle, GeoJSON sources/layers, feature selection, and marker images |
| `src/components/` | Status, controls, and selected-object details |

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

## Lifecycle and failure isolation

Aircraft and marine providers have separate state, cancellation, and error
paths. A failure in one provider produces `PARTIAL` status while the other
continues to render.

- Aircraft requests never overlap. A revision-aware controller cancels obsolete
  work, rejects late old-area results, and prevents request starts more often
  than every 20 seconds. Polling pauses when the document is hidden or the
  viewport is ineligible; restoration resumes at the next cadence-safe or
  `Retry-After` boundary without reconstructing the controller.
- Marine REST requests are deduplicated by controller state. MQTT reconnects
  no more often than every 15 seconds after disconnection. Eligible viewport
  changes immediately refilter cached provider-wide MQTT records, reuse the live
  connection, and permit a location REST refresh no more than every five
  minutes. Hidden or ineligible states stop active REST, interval, timeout, and
  MQTT resources while retaining the provider, cache, and all timing gates;
  unmount performs final shutdown.
- Provider errors remain visible until a successful request or subscription
  recovers that provider.

## Freshness, motion, and history

Freshness is derived from a provider observation timestamp where available and
the receipt timestamp otherwise.

- Aircraft becomes stale after 45 seconds and expires after 120 seconds.
- Marine traffic becomes stale after 2 minutes and expires after 10 minutes.
- Expired objects are removed from display.

The map interpolates for at most 1.5 seconds between two provider-observed
positions. It never extrapolates beyond the newest observation. Trails contain
only observed positions, are pruned after 15 minutes, are capped at 180 points
per object, and are rendered only for the selected object.

## Map rendering

`TrafficMap` creates one MapLibre instance. Aircraft, vessels, and the selected
trail use persistent GeoJSON sources and layers whose data or visibility is
updated in place. This avoids one React component or DOM marker per traffic
object.

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

Marker silhouettes are generated by repository-owned canvas drawing code.
Direction uses normalized provider heading/course data and remains absent when
the source does not provide a trustworthy value.

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
| AIS ship types 60-69 | Passenger |
| AIS ship types 70-79 | Cargo |
| AIS ship types 80-89 | Tanker |
| Other, missing, invalid, or unsupported AIS types | Generic vessel |

The category is never inferred from speed, altitude, name, callsign, operator,
route, location, or movement. A later provider-reported category can change the
icon key while the stable entity ID preserves selection, trail, freshness,
camera, layer, and provider state.

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
- The complete ten-image silhouette set is generated once per theme and reused;
  style rehydration updates the same bounded image IDs.
- Motion animation samples normalized state rather than adding provider points
  on every frame.
- History is bounded by both time and count.
- Network work pauses while the page is hidden or the viewport is ineligible,
  without resetting session timing or cache state.

## Deployment boundary

The built client is otherwise static. A production deployment needs:

1. a static host for `dist/`;
2. HTTPS and WebSocket access to the configured map and marine providers;
3. a same-origin `/api/aircraft` proxy with the Vite rewrite semantics, or an
   alternative aircraft endpoint that explicitly permits browser CORS;
4. unchanged visible provider attribution.

Adding hosting, CI, caching, or a production proxy is intentionally deferred to
the deployment roadmap issue.

## Navigation and viewport boundaries

The application keeps session Home and current camera behavior distinct while
making the settled visible canvas the traffic contract:

```text
permission-aware startup --> homeCenter (session only)
                                   |
                  Center ----------+
                                   v
                         MapLibre Home framing
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
MapLibre has usable geometry. `App` owns the latest assessment and Home command.
Provider data never moves or fits the camera.

The aircraft hook creates one revision-aware polling controller after the first
eligible query and retains it for the session. The marine hook does the same
with its provider. Query changes replace the latest desired request or refilter
the cache without creating another scheduler. Page visibility and viewport
eligibility compose as pause reasons. Layer visibility remains display-only.

## Theme lifecycle

Application colors are CSS custom properties selected by a validated
`light | dark` preference stored under `livetrafficstan.theme`. Missing,
invalid, or unavailable storage selects Light. The map uses the corresponding
configured OpenFreeMap style.

Theme changes call `map.setStyle` on the existing instance. An idempotent
installer runs after `style.load` to restore repository-owned images, GeoJSON
sources, layers, current data, visibility, and selected trail.
Interaction listeners remain registered once, and a style revision prevents a
late obsolete load from winning. Provider hooks, React selection/history, and
camera state do not restart.
