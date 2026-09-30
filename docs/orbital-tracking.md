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
production source `18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8`. The layer
remains a default-off user preference, while the protected Worker deployment
sets `ORBITAL_CATALOG_ENABLED=true`, serves the same-origin catalog route, and
runs the checked two-hour scheduler. A deployment with that Worker flag off
still returns `404` and removes the Cron.

Issue #211's first PR is infrastructure only. It stages schema 2 catalog
`celestrak-curated-v1` from the ordered groups `visual`, `stations`,
`weather`, `gnss`, and `science`, but deliberately does not add catalog
discovery or zoom tiers to this browser. The released browser remains schema 1
until the coordinated follow-on; the source-contract PR must not be deployed
alone.

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

For exact current identities `HST` / NORAD `20580` and `ISS (ZARYA)` / NORAD
`25544`, selected details also show a concise NASA-supported purpose,
source/review dates, immutable manifest version, and one bundled historical
NASA photograph with source, credit, usage-policy link, capture date, and
modification statement. The photograph is explicitly not a live view of the
current modeled position.

Every other object shows **Purpose and image unavailable**. This includes
rocket bodies and debris: the application does not transfer a payload mission
to a discarded stage, infer purpose from an object name, or display a generic
satellite/rocket picture. The full source and rights review is
[Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md).

Desktop mouse hover gets a compact exact-object tooltip with name, NORAD ID,
catalog type, reviewed purpose when available, and the modeled/not-live
caveat. It makes no request. The same result buttons remain
keyboard-accessible and expose the compact reviewed purpose. A tooltip image
appears only after selected details have bounded and validated the immutable
same-origin response and created a session Blob URL. The tooltip reuses that
URL and cannot initiate an image request. Touch continues to use
selection/details instead of hover.

One-second position changes are not placed in an ARIA live region.

## Data and execution flow

```text
staged Issue #211 source contract:
Cloudflare Cron
  -> named SQLite Durable Object cadence admission
  -> visual GP + SATCAT, then stations, weather, gnss, science
  -> independent group joins + one strict NORAD-ID union
  -> complete normalized schema-2 snapshot
  -> one final orbital:catalog:v2:curated-v1 publication

released browser contract:
explicit ORBITS enable
  -> same-origin GET /api/orbits/catalog
  -> strict schema-1 validation + fulfilled current-tab cache
  -> dedicated module Web Worker
  -> satellite.js SGP4 propagation
  -> persistent MapLibre GeoJSON sources/layers
```

The schema-2 server union has 462 unique records (369 payloads, 91 rocket
bodies, and 2 debris objects) from the final
`2026-09-30T18:25:59.094Z` probe. Six reviewed overlaps agree and all GP rows
join SATCAT. The ten responses total 353,281 decoded bytes. The immutable
239,460-byte bootstrap at
`/orbital-data/curated-2026-09-30-v1/catalog.json` has canonical digest
`5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`.

Browser camera, Home, geolocation, selection, cookies, authorization, and
arbitrary caller headers never reach CelesTrak. Camera changes start only local
prediction work and never fetch a catalog. Scheduled source requests send only
`Accept: application/json` and the stable public LiveTrafficStan
`User-Agent`. The Workers runtime host `fetch` is invoked through
`globalThis`, preserving its required receiver without adding a browser,
provider, or scheduler path.

Schema 2 keeps canonical record serialization in numeric NORAD order and
derives `displayOrder` only from reviewed group order plus numeric NORAD ID.
Every group has a complete unique GP-to-SATCAT join before unioning; validated
extra SATCAT rows are allowed. Newest valid OMM epoch wins across groups.
Identity/type conflict or equal-epoch propagation conflict rejects the entire
refresh. The schema-1 KV key and immutable `v1`/`v2` assets remain for
rollback, while the existing Durable Object admission row retains cadence,
in-progress, `Retry-After`, and terminal-block state.

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

The current-point layer uses four repository-generated MapLibre symbol images:
a satellite-like payload, spent-stage rocket body, irregular debris fragment,
and neutral unknown object. Shape and the existing type color both come only
from exact SATCAT type; the symbol represents the catalog class, not the exact
craft. Selection remains a separate circular halo and the predicted track
remains a line. No text labels or DOM markers are added.

The idempotent style installer restores current data, visibility, selection,
track, theme-specific images, and symbol layout after `map.setStyle`.
Deterministic order is:

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

Those are the released schema-1 browser bounds. The staged schema-2 scheduler
has separate 10-second/512-record/512-KiB per-response,
90-second/4-MiB aggregate, and 512-record/512-KiB publication bounds. The
follow-on browser PR must define its compatible consumption bounds before
coordinated release.

The browser route is a literal `/api/orbits/catalog` and has no environment
override. A build cannot redirect orbital reads to CelesTrak, another origin,
or an alternate same-origin path.

## Deterministic validation

The automated suite covers:

- exact curated URL/order, strictly sequential requests, independent joins,
  deduplication, newest-epoch selection, conflicts, all source bounds and
  deadlines, v1/v2 separation, immutable history, candidate selection, and
  unchanged coordinator state;
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
npm run check:orbital-enrichment
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

The current exact application release is:

- source: `18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8`;
- distinct symbol implementation/release PRs: #218 and #220;
- smoke implementation/release PRs: #222 and #224;
- exact merged-`main` validation:
  [36641143297](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36641143297);
- deployment:
  [36642794309](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36642794309);
- Cloudflare version: `fea1642f-8b45-4801-89ae-d2a9dca554a6`;
- client asset: `assets/index-8clesHre.js`;
- deployed `index.html` SHA-256:
  `8f7da07d43d096de68adde373597d3f337ff46ec07557e429977cfa114bc16b1`.
- catalog response at `2026-09-29T23:01:56.988Z`: source `bootstrap`, schema `1`,
  156 records, retrieval `2026-09-29T18:52:12.000Z`, digest
  `f6183329084286f4fbb5cdfcea16e827e751569e7d5919d9e8222eadf95f017d`.

The protected deployment and full smoke passed. First exact-source run
[36627068064](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36627068064)
deployed healthy application, catalog, and enrichment assets as Cloudflare
version `7b1233c9-3461-440b-ac5f-1d30b02c0525`, but exposed recurrent
private-relay guest/network unavailability as aircraft HTTP `502`. A supported
OCI diagnostic reboot restored the unchanged VPC/Tunnel path. The canonical
exact-source rerun passed without application rollback or provider/privacy
change.

At `2026-09-29T20:31:40.271Z`, approximately 14 minutes after the next
`20:17Z` schedule, the public route still returned
`X-LiveTrafficStan-Orbital-Source: bootstrap` with the exact current retrieval
time and digest. A checked local Workers-runtime reproduction subsequently
proved that the scheduled updater invoked Cloudflare's receiver-sensitive
`fetch` with an options object as `this`, producing `TypeError: Illegal
invocation` before publication. The #162 repair preserves the fixed URLs,
coordinator state, cadence, schema, prior snapshot, and rollback while calling
the default host function through `globalThis`. The repaired release also moves
fallback to the new immutable `v2` bootstrap retrieved at
`2026-09-30T17:08:30.000Z`; the published `v1` bytes remain unchanged. The
first successful ordinary production KV publication remains open until that
source is deployed and a later Cron serves
`X-LiveTrafficStan-Orbital-Source: kv`.

Public Wiki commit `7bb657c8b90fda6150860f5dcba22010cf9cdf8d`
updates the comprehensive
[Orbital Tracking](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Orbital-Tracking)
and
[Infrastructure and Hosting](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Infrastructure-and-Hosting)
pages and synchronizes the related public testing, release, troubleshooting,
accessibility, Home, map, generated class-symbol, single-scroll, smoke, and
current-production content.

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

Cache-disabled public-origin enrichment acceptance used real current Hubble
`20580`, ISS `25544`, and exact rocket body `733` features. It observed zero
image requests before selection, exactly one uncached same-origin `Fetch` for
each reviewed JPEG, exact manifest byte counts and dimensions, and the same
validated ISS Blob URL in details and tooltip. Hover, theme, re-selection, and
fallback made no image request; a forced terminal failure did not retry. No
NASA runtime request, same-origin failure, runtime exception, or console error
occurred, and one MapLibre canvas persisted.

At 390x844, selected ISS details measured 303.828125 px high with a
159.984375 px image and reached the exact 931 px maximum scroll. At 390x568,
the panel measured 115 px with an 87.984375 px image and reached the exact
1,048 px maximum scroll. Both retained source/rights text, map attribution,
and no horizontal overflow.

Issue #194 development acceptance then exercised a deterministic 24-object
crossing fixture at 390x844 and 390x568. All 20 detailed results shared the
single Operations More scroll region; the orbital list itself had no height cap
or nested overflow. Touch drag, wheel, Page Down, and Tab navigation reached the
final result, while the combined controls stayed exactly within 58vh with no
horizontal overflow. VIEW, resize, scrolling, and compact attribution retained
one canvas and one catalog load with no direct CelesTrak request or runtime
error.

A later real-device report exposed two gaps in that acceptance: the emulation
did not separate the shorter visual viewport from the layout viewport, and a
sticky task selector could cover the final result while a bounds-only check
still passed. The corrective layout follows `window.visualViewport.height`,
splits Operations More into session-only Layers, Find, Context, Orbits, and
Sources views, and lets the selector scroll away. Corrective rendered checks
cover 390x844, 390x568, a 315x517-class view, and an 844 px layout viewport
with a forced 517 px visual viewport. All 20 results remain in one outer scroll
region; the last result is topmost under hit testing, task labels are
unclipped, and one canvas and one catalog request remain unchanged.

The strengthened #194 deterministic harness had run against the deployed
`bb9829bd0bb59c819b936777fe4e2cdfe32239a3` production bundle. It rendered all
20 results with one scroll owner at 390x844, 390x568, and a 315x517-class view;
touch, wheel, Page Down, and 25 Tab steps reached the final result. A separate
844 px layout / 517 px visual viewport run retained the 299.86 px control
budget. The final result was topmost under hit testing in every case, while one
canvas, one catalog request, zero browser CelesTrak requests, compact
attribution, and no console/runtime error were retained.

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
- [Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Hosting and Deployment](hosting-and-deployment.md)
- [Data Sources and Licensing](data-sources-and-licensing.md)
- [Development and Testing](development-and-testing.md)
- [Troubleshooting](troubleshooting.md)
