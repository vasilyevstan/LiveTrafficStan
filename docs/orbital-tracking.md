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

The browser implementation and scheduled catalog infrastructure are active in
production source `ddc414e26dd8dacb5a9d4e1f528ccec44dc0bf4f`. The layer
remains a default-off user preference, while the protected Worker deployment
sets `ORBITAL_CATALOG_ENABLED=true`, serves the same-origin catalog route, and
runs the checked two-hour scheduler. A deployment with that Worker flag off
still returns `404` and removes the Cron.

## User experience

The remembered **ORBITS** preference starts off. Its single toggle appears in
the primary **Operations** row beside **AIRCRAFT** and **SHIPS**, while the
detailed result list and attribution remain under **Operations -> More**. It
adds one fragment field, `orbits=0|1`. The preference stores only visibility.
Catalog bytes, modeled positions, crossings, selected object, track, clock
anchor, camera, and Home remain session-only.

After enable, the collapsed Operations panel keeps a compact orbital summary
visible. A local view reports current in-view objects and next-90-minute pass
count while the detailed result list remains inside **More**. **VIEW** opens
the existing disclosure and focuses the first modeled object result when one
exists, otherwise the already-visible primary ORBITS toggle. The upper-left
status panel mirrors the same compact ORBITS state and labels an eligible view
**Visible traffic and orbital area**. Its **LIVE**, **PARTIAL**, and **OFFLINE**
health still describes only aircraft and marine providers, so modeled orbital
availability cannot mask a traffic outage. Compact mobile layouts retain the
existing rule that hides provider-detail copy; the primary ORBITS toggle and
summary remain visible there instead. These surfaces prevent a valid zero-object
local view from looking like a failed layer and add no request or camera
movement.

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

The direct full-world share URL is:

<https://livetrafficstan.syntal.workers.dev/#v=1&lat=0&lon=0&zoom=0&bearing=0&pitch=0&orbits=1>

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

## Production activation and visibility evidence

Production activation completed on 2026-09-28:

- source: `46cb2007bc0cc27d1905fab32db6149a91d17576`;
- final restoration deployment:
  [36488245592](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36488245592);
- Cloudflare version: `0138d581-2162-491a-bcb5-619a97cf31fb`;
- KV namespace: `59178d55418247c4bab473b52a5dc07d`;
- Cron: `17 */2 * * *`;
- bootstrap schema/count/digest: schema `1`, 156 records,
  `2cbe00a3285c7bdfd80fe07661b6a14b48279d0629e44c026c6306bb20453d5b`;
- bootstrap retrieval time: `2026-09-28T18:45:06.958Z`;
- stable validator:
  `W/"2cbe00a3285c7bdfd80fe07661b6a14b48279d0629e44c026c6306bb20453d5b"`.

The current compact-control release is:

- source: `ddc414e26dd8dacb5a9d4e1f528ccec44dc0bf4f`;
- implementation PR: #195;
- ancestry PR: #196;
- release PR: #197;
- exact merged-`main` validation:
  [36598593975](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36598593975);
- deployment:
  [36599339842](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36599339842);
- Cloudflare version: `98147f84-68c6-49c0-84a3-bc7dc1481897`;
- client asset: `assets/index-Bm-WP8Xp.js`;
- deployed `index.html` SHA-256:
  `dc2f367f02764016570915cc3706494c7c0a6dbb0f1891800720a2994ba75e74`.

The protected deployment and full smoke passed. The first exact-source attempt
[36598727844](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36598727844)
exposed recurrent private-relay guest/network unavailability as aircraft HTTP
`502`, but a supported OCI diagnostic reboot restored the unchanged
VPC/Tunnel path. The canonical exact-source rerun passed without rollback.

The restoration deployed its triggers at `2026-09-28T21:46:41Z`, before the
first eligible `22:17Z` schedule. Bounded public observations at `22:19:30Z`
and every two minutes through `22:31:54Z` still returned
`X-LiveTrafficStan-Orbital-Source: bootstrap` with the exact activation
retrieval time and digest. That evidence proves that no compatible KV snapshot
had become publicly available in that window; it does not claim whether the
scheduled delivery was delayed or an admitted refresh failed. The bootstrap
kept the layer operational. The first successful production KV publication
remains open in #162.

Public Wiki commit `5f9cd06b84f4921f146a3f7a73ed64158cae20b8`
updates the comprehensive
[Orbital Tracking](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Orbital-Tracking)
and
[Infrastructure and Hosting](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Infrastructure-and-Hosting)
pages and synchronizes the related public testing, release, troubleshooting,
accessibility, Home, map, single-scroll, and current-production content.

Fresh rendered production acceptance proved exactly one primary ORBITS toggle,
zero catalog requests before enable, one same-origin request afterward, zero
browser CelesTrak requests, matching Operations and upper-left summaries,
focus-safe **VIEW**, and one unchanged canvas. The desktop evidence showed
`LIVE / 4 aircraft / 33 ships shown` with four visibly rendered aircraft and a
time-dependent `0 IN VIEW · 3 PASSES ≤90M` orbital summary. A 16 px
brand/control gap remained at 1024, 900, and 761 CSS pixels. The 390x844 and
390x568 controls stayed within the exact 58vh bounds with all four primary
controls on one row and no horizontal overflow. Deterministic tests retain the
stable one-pass summary/focus fixture because live crossing counts are
time-anchored. Earlier exact selection, style rehydration, touch, and long-task
evidence remains valid because this release does not change those paths.

Issue #194 development acceptance then exercised a deterministic 24-object
crossing fixture at 390x844 and 390x568. All 20 detailed results shared the
single Operations More scroll region; the orbital list itself had no height cap
or nested overflow. Touch drag, wheel, Page Down, and Tab navigation reached the
final result, while the combined controls stayed exactly within 58vh with no
horizontal overflow. VIEW, resize, scrolling, and compact attribution retained
one canvas and one catalog load with no direct CelesTrak request or runtime
error.

The same deterministic harness then ran against the deployed
`ddc414e26dd8dacb5a9d4e1f528ccec44dc0bf4f` production bundle. It again
rendered all 20 results with one scroll owner, reached the final result through
touch, wheel, Page Down, and 38 Tab steps, retained exact 58vh stack bounds,
one canvas, one catalog request, zero browser CelesTrak requests, compact
deduplicated attribution, and no console/runtime error.

Rollback run
[36488117751](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36488117751)
successfully deployed the exact pre-orbital target with an unreachable live
coordinator export, no orbital binding, and no Cron. The route returned `404`
with target release `3370dfe3f1cc2614feff894643ed865978ec7edc`. The final
restoration run reattached the retained namespace, restored the Cron and
catalog, and passed full production smoke. The optional globe remains separate
in #163. Physical iOS Safari, Android Chrome, and supported-device drag-FPS
evidence remain explicit outstanding acceptance for #162.

## Related documentation

- [Orbital Data Source Evaluation](orbital-data-source-evaluation.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Hosting and Deployment](hosting-and-deployment.md)
- [Data Sources and Licensing](data-sources-and-licensing.md)
- [Development and Testing](development-and-testing.md)
- [Troubleshooting](troubleshooting.md)
