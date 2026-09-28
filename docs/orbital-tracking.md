# Orbital Tracking

## Scope and release status

Issue #162 adds a default-off **ORBITS** layer for CelesTrak's bounded
`visual` catalog. The browser models current sub-satellite points, identifies
ground tracks that cross the settled visible map within 90 minutes, and draws
one bounded selected-object track.

This is cataloged orbital-object context, not another live-traffic provider:

- payload, rocket-body, debris, and unknown types come only from SATCAT;
- positions are propagated from GP/OMM elements with SGP4;
- no point is an observation or live telemetry;
- a ground-track crossing does not prove illumination or naked-eye visibility;
- powered ascent, reentry, impact, conjunction, and hazard claims are outside
  this feature.

The browser implementation and the scheduled catalog infrastructure are
separate release gates. The production Worker continues to return `404` while
`ORBITAL_CATALOG_ENABLED` is off. Production activation requires the checked
release workflow, first Cron/KV evidence, rendered browser acceptance, and
rollback proof.

## User experience

The remembered **ORBITS** preference starts off. It appears under
**Operations -> More -> Layers** and adds one fragment field, `orbits=0|1`.
The preference stores only visibility. Catalog bytes, modeled positions,
crossings, selected object, track, clock anchor, camera, and Home remain
session-only.

When enabled, the control shows distinct states for:

- loading;
- current modeled data;
- refreshing while retaining the current complete snapshot;
- stale retained data;
- cold or retained offline operation;
- invalid device clock;
- unavailable or expired catalog;
- page-hidden pause;
- HISTORY pause;
- a valid catalog with no currently propagatable positions.

For a local safely representable Mercator view, the bounded result selector
lists objects currently in view first and then future crossings ordered by
their first approximate crossing time. It exposes at most 20 detailed results
while retaining the truthful total count.

For a whole-world view, every valid current sub-satellite point is in view.
The UI therefore does not invent a useful "next crossing" ranking. For a
partial world-spanning or otherwise invalid footprint, current points remain
available but crossing calculation is explicitly unavailable.

Selected details show:

- name, NORAD catalog ID, international designator, and exact catalog type;
- modeled coordinates, altitude, speed, and modeled-for time;
- first map crossing when the selected object is in the bounded result set;
- element epoch;
- snapshot retrieval time, schema, and digest prefix;
- visible CelesTrak attribution and usage-policy link;
- explicit modeled-data and visibility limitations.

One-second position changes are not placed in an ARIA live region.

## Data and execution flow

```text
Cloudflare Cron
  -> named SQLite Durable Object cadence admission
  -> fixed CelesTrak visual GP + SATCAT requests
  -> complete normalized schema-v1 snapshot
  -> one final Workers KV publication

explicit ORBITS enable
  -> same-origin GET /api/orbits/catalog
  -> strict browser validation + fulfilled current-tab cache
  -> dedicated module Web Worker
  -> satellite.js SGP4 propagation
  -> persistent MapLibre GeoJSON sources/layers
```

Browser camera, Home, geolocation, selection, cookies, authorization, and
arbitrary caller headers never reach CelesTrak. Camera changes start only local
prediction work and never fetch a catalog.

The client route is fixed and same-origin:

```text
GET /api/orbits/catalog
```

The client sends `Accept: application/json`, omits credentials, rejects
redirects, and may send only the last accepted stable weak digest ETag. The
weak validator survives Cloudflare content-encoding changes without changing
snapshot identity. The client accepts exact `200` or a valid `304`. A complete
`200` must pass:

- strict JSON media type and fatal UTF-8 decoding;
- 256 KiB streamed body limit;
- exact schema and field allowlists;
- one through 256 records;
- canonical increasing NORAD IDs, including six-plus-digit support;
- exact fixed group and source URLs;
- finite OMM domains and UTC epochs;
- header/body schema, retrieval time, digest, and ETag agreement;
- recomputed SHA-256 over the canonical digest input.

Only a fully validated response enters the current-tab fulfilled cache. A
failed, aborted, partial, malformed, oversized, or digest-mismatched response
does not replace it.

## Browser model boundary

Application-owned orbital types live in `src/domain/orbital.ts`. They are
intentionally separate from `Aircraft`, `Vessel`, traffic freshness, trails,
clusters, and history.

A modeled position carries:

- stable `orbital:<norad-id>` identity;
- exact SATCAT type;
- element epoch;
- snapshot retrieval time and digest;
- `modeledFor`, never `observedAt`;
- latitude, longitude, altitude, and velocity.

Orbital values never enter:

- aircraft or marine provider state;
- traffic counts or clusters;
- selected traffic trails;
- aircraft metadata, route, or photo logic;
- vessel photos;
- session or IndexedDB traffic history;
- provider freshness or coverage claims.

## Propagation worker

`src/workers/orbital.worker.ts` owns propagation and prediction. The worker is
created only after the layer is active and a catalog passes browser
validation. It:

- creates `satellite.js` records once per accepted snapshot;
- publishes current valid modeled positions no more than once per second;
- recomputes crossings every 30 seconds or after a settled view/selection
  revision;
- ignores obsolete catalog, position, and prediction responses;
- omits non-finite, decayed, underground, over-age, future-invalid, or
  physically implausible results rather than clamping them;
- pauses and is terminated when the layer is off, the page is hidden, HISTORY
  is active, or the component unmounts.

The dependency is pinned to `satellite.js` 7.1.0 under MIT. Version 7's root
entry also exports optional WASM/Node runtimes, so
`src/workers/satelliteJs.ts` imports only its browser-safe JavaScript SGP4
modules. The exact dependency version remains pinned because those internal
module paths are part of this reviewed build boundary.

## Time and freshness

Modeled time does not trust the device wall clock by itself. The provider
captures `X-LiveTrafficStan-Served-At`, compares it with the request wall-clock
midpoint, and anchors accepted server time to `performance.now()`.

The controller:

- rejects initial skew greater than two minutes;
- advances modeled time from the monotonic clock;
- detects wall-clock jumps greater than 30 seconds relative to monotonic time;
- suppresses positions and predictions in `clock-invalid`;
- re-anchors locally after a normal visibility resume;
- requires a valid same-origin revalidation to recover from an invalid clock.

The snapshot is:

- revalidated no more often than every two hours;
- labeled stale after six hours;
- unavailable after 24 hours;
- retained during an ordinary refresh failure until the hard age is reached.

Individual elements are accepted for propagation only from ten minutes in the
future through 14 days old. These are client safety bounds, not accuracy
guarantees.

## Viewport and crossing semantics

`TrafficMap` reports two independent settled footprints:

1. `ViewportAssessment` remains the unchanged aircraft/marine 100 km contract.
2. `OrbitalViewport` is used only for local crossing prediction.

The orbital footprint samples the full canvas, including the area beneath
floating controls. A raw longitude span of at least 359.5 degrees is
whole-world only when the perimeter also reaches both Mercator latitude
limits. A local footprint must remain under 180 degrees after safe unwrapping
around the rounded camera center and must have nonzero polygon area. Partial
world-spanning and invalid geometry are rejected.

For each bounded catalog object, local prediction:

- samples now through 90 minutes;
- uses 30-second steps;
- tests current points and consecutive valid ground-track segments against the
  visible polygon;
- does not join a segment across an antimeridian jump or invalid propagation
  gap;
- records the first approximate segment-entry time;
- sorts current in-view objects before future crossings;
- returns at most 20 detailed results plus the complete count.

The selected track is labeled **Predicted sub-satellite ground track** in the
UI documentation. It covers 15 minutes with at most 31 points. A known selected
crossing centers the window; otherwise the window starts at current modeled
time. Antimeridian and invalid gaps split line segments.

## Map lifecycle and selection

The orbital map uses three persistent GeoJSON sources:

- current modeled points;
- selected highlight;
- selected predicted track.

It uses circle and line layers only. Payload, rocket body, debris, and unknown
have distinct colors; no text labels or DOM markers are added.

The idempotent style installer restores current data, visibility, selection,
track, and theme after `map.setStyle`. Deterministic order is:

```text
ports -> airports -> weather -> orbital track/points -> selected traffic trail/live traffic
```

Current points use stable feature IDs and `GeoJSONSource.updateData` diffs.
The map and canvas are never recreated for propagation ticks, selection,
visibility, or theme changes.

Selection priority is:

1. exact aircraft/vessel;
2. traffic cluster;
3. unique eligible traffic touch fallback;
4. exact orbital point;
5. unique eligible orbital touch fallback;
6. weather, airport, then port context.

Selecting an orbital object clears traffic and context details but never moves
or fits the camera. Theme changes, style reloads, propagation ticks, and
ordinary manual camera movement retain it. Hiding ORBITS, entering HISTORY,
committed navigation, catalog expiry, or another mutually exclusive selection
clears it.

## Offline and partial operation

Cold offline enable has no catalog and reports unavailable/offline. A
fulfilled complete current-tab snapshot may continue to produce modeled
positions while that tab remains open, until clock or snapshot hard-age rules
make it unsafe.

Orbital failure never pauses or mutates aircraft, marine, weather, search,
camera, Home, basemap recovery, PWA state, or history. At a wide map view,
the notice says **Aircraft and ships paused** because orbital points can remain
available independently.

## Configuration

All behavioral limits are centralized in `src/config/appConfig.ts`.

| Setting | Value |
| --- | ---: |
| Endpoint | `/api/orbits/catalog` |
| Response / record cap | 256 KiB / 256 |
| Request deadline | 5 seconds |
| Revalidation | 2 hours |
| Stale / hard age | 6 hours / 24 hours |
| Position cadence | 1 second |
| Prediction refresh / step | 30 seconds / 30 seconds |
| Prediction horizon | 90 minutes |
| Detailed result cap | 20 |
| Selected track | 15 minutes / 31 points |
| Element age / future tolerance | 14 days / 10 minutes |
| Clock skew / jump limit | 2 minutes / 30 seconds |

The browser route is a literal `/api/orbits/catalog` and has no environment
override. A build cannot redirect orbital reads to CelesTrak, another origin,
or an alternate same-origin path.

## Deterministic validation

The automated suite covers:

- strict catalog bytes, schema, digest, ETag, headers, 304, and cache admission;
- ordinary SGP4 reference output and six-digit IDs;
- over-age and invalid propagation;
- local, whole-world, dateline, and invalid viewport geometry;
- current/future crossing order, result bounds, and track bounds;
- clock skew, visibility, HISTORY, enable/disable, cadence, and no-fetch camera
  or selection changes;
- source/layer idempotence, visibility, stable IDs, theme reinstallation, and
  all static-layer installation permutations;
- preference/share defaults and orbital controls/details semantics.

The required full checks remain:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run check:aircraft-metadata
npm run check:country-allocations
npm run check:vessel-photos
npm run check:orbital-catalog
npm run check:ports
npm run check:airports
npm run build
npm run check:deploy
```

For local rendered testing of the same-origin bootstrap route:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

Ordinary `npm run dev` does not contact CelesTrak and does not emulate the
scheduled KV/Durable Object boundary.

## Related documentation

- [Orbital Data Source Evaluation](orbital-data-source-evaluation.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Hosting and Deployment](hosting-and-deployment.md)
- [Data Sources and Licensing](data-sources-and-licensing.md)
- [Development and Testing](development-and-testing.md)
- [Troubleshooting](troubleshooting.md)
