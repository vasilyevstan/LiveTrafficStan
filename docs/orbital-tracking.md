# Orbital Tracking

## Scope and release status

Issue #162 established a default-off **ORBITS** layer. Issue #211 expands the
browser source contract to CelesTrak's reviewed `visual`, `stations`,
`weather`, `gnss`, and `science` groups, adds deterministic zoom tiers and
complete local catalog discovery, and preserves the same modeled-data
boundary. The browser models current sub-satellite points, identifies ground
tracks that cross the settled visible map within 90 minutes, and draws one
bounded selected-object track.

This is cataloged orbital-object context, not another live-traffic provider:

- payload, rocket-body, debris, and unknown types come only from SATCAT;
- positions are propagated from GP/OMM elements with SGP4;
- no point is an observation or live telemetry;
- a ground-track crossing does not prove illumination or naked-eye visibility;
- powered ascent, reentry, impact, conjunction, and hazard claims are outside
  this feature.

The browser implementation and scheduled catalog infrastructure are active in
production source `e2b2afaa04466116719310d6286441f8e6ba60ca`. The layer
remains a default-off user preference, while the protected Worker deployment
sets `ORBITAL_CATALOG_ENABLED=true`, serves the same-origin catalog route, and
runs the checked two-hour scheduler. A deployment with that Worker flag off
still returns `404` and removes the Cron.

Issue #211's source-contract and browser PRs delivered schema 2 catalog
`celestrak-curated-v1`, and coordinated release #235 completed the checked
`dev` to `main` production path with exact-SHA acceptance.

Issue #257 adds a separate default-off STARLINK child layer. It uses a bounded
systematic sample rather than expanding the curated catalog or claiming the
full constellation. ORBITS remains the parent lifecycle and one-map surface.

## User experience

The **ORBITS** preference defaults off and remembers explicit visibility.
Its single toggle appears in the primary rail/mobile dock beside
**AIRCRAFT** and **SHIPS**, while the
detailed result list and attribution remain under **Operations -> More**. It
adds one fragment field, `orbits=0|1`. The preference stores only visibility.
Catalog bytes, modeled positions, crossings, selected object, track, clock
anchor, camera, and Home remain session-only.

After enable, the collapsed Operations panel keeps a compact
**ORBITS · shown · passes ≤90m** summary visible. SHOWN is the number of
matching markers actually rendered inside the current map, not the complete
modeled population. A compatible map with a pending prediction says **PASSES
UPDATING** rather than zero. **VIEW** opens the existing disclosure and the
Orbits task without another disclosure. The task has separate **Nearby** and
**Catalog** views while the existing More body remains the only vertical scroll
owner. The floating card's Provider details mirrors the compact ORBITS state;
the redundant brand subtitle is hidden in the minimal layout. Its **LIVE**,
**PARTIAL**, and **OFFLINE** health still describes only aircraft and marine
providers, so modeled orbital availability cannot mask a traffic outage.
Provider details remains available through its native disclosure on mobile;
the primary ORBITS toggle and compact summary remain reachable.

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

For a safely representable local view in Auto globe or Flat, Nearby lists
objects currently in the map first and then future crossings ordered by their first approximate
crossing time. It exposes at most 20 detailed results while retaining the
truthful total. Counts distinguish catalog records, accepted worker records,
safe current modeled positions, catalog matches, modeled matches, objects in
the footprint, shown objects in the footprint, future crossings, and rows in
the current catalog result set. Current footprint and shown-in-footprint
counts come from the same current safe-position revision and settled viewport;
they remain available while a compatible prediction is pending. Only the
future-crossing count waits for a prediction with the current viewport and
exact filters. Unsafe footprints or a missing settled raw zoom report map-area
counts as unavailable rather than zero.

The map applies local deterministic display tiers to matching safe current
positions in schema-v2 `displayOrder`: below zoom 2 it shows at most 192,
from zoom 2 through below zoom 4 at most 384, and from zoom 4 every match
through the 512-record contract cap. Tier boundaries use the exact settled
`map.getZoom()` value; the separately rounded camera value remains only for
sharing/privacy. Before a raw settled zoom exists, no tier or SHOWN count is
claimed, and selected details say **Map display unavailable; no settled map
zoom is available** before any subset or exception wording. Once display is
available, one exact safe selected object outside the zoom or exact-filter
subset remains shown and is labeled **Selected exception**. A matching
zoom-tier exception is included in matching SHOWN and reduces the hidden
count; a filter-excluded exception is reported separately as `+1` and never
inflates matching SHOWN, MODELED, or IN MAP totals. Hidden-by-rank objects
cannot be picked.

Catalog searches the complete accepted snapshot by normalized name, canonical
NORAD ID, or international designator. Ranking is exact, prefix, substring,
then `displayOrder`, normalized name, and numeric NORAD ID. Exact type and
source-group filters can change map and crossing eligibility; text changes
only the list. Results use 20-row pages. Records without a safe current
position remain searchable as **Position unavailable** and cannot be selected.
An empty source designator remains valid unavailable data and is rendered as
**Designator unavailable** in Catalog and selected details.
There is no fuzzy matching, punctuation stripping, mission inference,
provider request, URL state, or persistence.

For a whole-world footprint, every safe current sub-satellite point is
geographically in the map even when a zoom tier intentionally hides some.
The UI therefore does not invent a useful "next crossing" ranking. For a
partial world-spanning or otherwise invalid footprint, current points remain
available but crossing calculation and map-area counts are explicitly
unavailable.

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

Terra, Aqua, Midori II, ALOS-2, Hitomi, XRISM and ACS3 additionally have
exact-identity, NASA/JAXA-supported descriptions in `2026-10-07-v1`, with
**Verified image unavailable** rather than a substitute photo. Unreviewed
objects still show **Purpose and image unavailable**. The application does
not transfer a payload mission
to a discarded stage, infer purpose from an object name, or display a generic
satellite/rocket picture. The full source and rights review is
[Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md).

COSMOS 1953 / NORAD `19210` has **Community context**, distinct from Purpose:
Wikidata records its 1988-06-14 launch, Tselina-D spacecraft class and Tsyklon-3
launch vehicle. The pinned source revision, CC0 link, retrieval/review dates
and exact identity are visible. This summarizes structured historical facts;
the source has no English individual description, and the app does not infer
a verified mission or present operational status. Its image remains unavailable.
Nearby results and hover preserve the community label. All selected objects
have an explicit external N2YO reference; neither N2YO nor Wikidata is
contacted unless the user follows a link.

Desktop mouse hover gets a compact exact-object tooltip with name, NORAD ID,
catalog type, reviewed purpose when available, and the modeled/not-live
caveat. It makes no request. The same result buttons remain
keyboard-accessible and expose the compact reviewed purpose. A tooltip image
appears only after selected details have bounded and validated the immutable
same-origin response and created a session Blob URL. The tooltip reuses that
URL and cannot initiate an image request. Touch continues to use
selection/details instead of hover.

One-second position changes are not placed in an ARIA live region.

### Starlink child experience

STARLINK appears inside **Operations -> More -> Orbits**. Its preference is
remembered and shareable but starts off; it becomes effective only while
ORBITS is on and Live mode is active. The control reports source population,
published sample, accepted records, safe modeled positions, current map/shown
positions, and predicted crossings separately. A 20-row paged sample list is
keyboard accessible and uses the existing Operations More body as the only
vertical scroll owner.

Starlink selection uses `orbital:starlink:<NORAD>`. A duplicate NORAD in the
curated layer remains a different representation: selection, halo, track,
tooltip, details, and failure state resolve only from the owning channel.
Starlink details identify whether the fulfilled representation is the
shell-balanced schema-2 sample or the systematic schema-1 compatibility
sample, retain separate GP/SATCAT retrieval times, and never infer curated
purpose or imagery. A separately sourced **Constellation context** explains
Starlink's general internet service, explicitly not a verified purpose or
operational status for the individual object. Schema 2 also reports its four exact inclination-band
quotas. Exact payloads use the flat-panel spacecraft silhouette; exact rocket
body, debris, and unknown records keep their type silhouettes.

The compact parent line combines owner-split shown/pass state, for example
`ORBITS · 12 SHOWN (C 8 / S 4) · 5 PASSES ≤90M`. Failure remains partial:
`C UNAVAILABLE · S 7` and `C 8 · S UNAVAILABLE` do not hide the working owner.
One selected exception is reported once even when it is already included in a
rank-limited shown count.

## Data and execution flow

```text
Issue #211 source contract:
Cloudflare Cron
  -> named SQLite Durable Object cadence admission
  -> visual GP + SATCAT, then stations, weather, gnss, science
  -> independent group joins + one strict NORAD-ID union
  -> complete normalized schema-2 snapshot + pre-substitution schema-1 visual
  -> one internal bundle / one final orbital:catalog:v2:curated-v1 write

browser contract:
explicit ORBITS enable
  -> same-origin GET /api/orbits/catalog with fixed schema-2 Accept
  -> strict schema/source-contract-2 validation + fulfilled current-tab cache
  -> dedicated module Web Worker
  -> satellite.js SGP4 current positions + filtered crossings
  -> complete safe-position MapLibre GeoJSON source
  -> local zoom/type/group shown-ID filter + selected exception
  -> Nearby and complete Catalog views

optional Starlink channel:
effective ORBITS + STARLINK
  -> same-origin GET /api/orbits/starlink with schema-2/schema-1 preference
  -> strict selected-media/population/sample/source-clock/digest validation
  -> second logical channel on the same physical orbital worker
  -> separate persistent Starlink point/highlight/track sources and layers
  -> owner-aware combined orbital picking and child sample list
```

The immutable Starlink bootstraps were published from the single paired
`2026-10-02T08:40Z` acquisition. GP and SATCAT each contained 11,125 records;
the validated population had zero extra SATCAT rows. Schema 2 contains exactly
512 records, 128 per fixed inclination band, occupies 254,275 bytes, and has
canonical digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
The retained schema-1 predecessor contains 150 records, occupies 74,982 bytes,
and has digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.
These counts describe the source generation and sample only, not active,
operational, or optically visible spacecraft.

Release #275 deploys schema 2 at exact application source
`d565b56278e81ff2478ab1e476c269084f2297d4` while preserving schema 1 for
predecessor tabs. The browser's fixed preference list can receive fresher
schema 1 in the same request when schema 2 is beyond the 24-hour hard expiry.
Immediate production proof exercised default, wildcard, combined, exact-v1,
exact-v2, `q=0`, representation-specific ETag/`304`, and
cross-representation-validator behavior without contacting CelesTrak.

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
refresh. The validated visual pair produces an exact public schema-1 snapshot
before a newer cross-group propagation winner can replace its fields. An
internal publication-version-1 envelope stores that member beside public
schema 2 in one atomic v2-key write; the envelope is never served and its
version is independent from both public schemas and coordinator state. The
schema-1 KV key is never rewritten, and it plus immutable `v1`/`v2` assets
remain read-only rollback/default candidates. The existing Durable Object
admission row retains cadence, in-progress, `Retry-After`, and terminal-block
state.

The client route is fixed and same-origin:

```text
GET /api/orbits/catalog
```

The new client sends the fixed, non-user-derived
`Accept: application/vnd.livetrafficstan.orbital-catalog+json;version=2`,
omits credentials, rejects redirects, and may send only the last accepted
schema-2 weak digest ETag. Requests without that exact media type retain the
newest valid schema-1 representation among the current bundle, retained v1 KV,
and immutable v1/v2 assets. Equal newest retrieval times with different
digests fail closed. Both representations return `Vary: Accept`, carry
distinct weak ETags, and conditionally revalidate only against their own
digest. A pre-bundle raw schema-2 KV value remains readable during rollout.
The literal route, method, query rejection, provider inputs, and acquisition
lifecycle do not change.

The schema-1 default must remain through at least one full checked production
release after the schema-2 browser release. Removing that compatibility
representation requires a separate reviewed change after predecessor rollback
and support are no longer required. The weak validator survives Cloudflare
content-encoding changes without changing snapshot identity. The new client
accepts exact `200` or a valid schema-2 `304`. A complete schema-2 `200` must
pass:

- strict JSON media type and fatal UTF-8 decoding;
- 512 KiB streamed body limit;
- exact schema and field allowlists;
- one through 512 records;
- canonical increasing NORAD IDs, including six-plus-digit support;
- exact fixed group/source URLs, per-record ordered source membership, and
  schema-v2 display order;
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
- keeps one crossing prediction in flight plus only the latest desired
  view/selection/exact-filter request;
- yields every eight objects so an obsolete prediction can be replaced without
  publishing a partial result;
- acknowledges the latest prediction start and fences obsolete catalog,
  position, prediction, and error responses;
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

Auto globe uses the same safe local polygon contract. Public pole bounds and
project/unproject surface guards reject an included pole, visible limb or sky
before local/whole-world classification; finite unprojection alone can be a
sky-to-limb snap. Current modeled points, valid selection and tracks may still
render, but unsafe map/crossing counts remain unavailable rather than zero or
a guessed whole-world count. Native clipping excludes back-side objects from
rendering and actual point/touch selection. Choosing Flat retains the complete
Mercator-world behavior above. See [smooth globe and safe footprints](architecture.md#smooth-globe-and-safe-footprints).

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
remains a line. Exact enrichment matches for Hubble/NORAD `20580` and
ISS/NORAD `25544` use a larger icon-size expression and `HUBBLE`/`ISS` text in
that same point layer when the active style exposes a usable font. Every other
object, and any identity mismatch, remains unlabeled. No DOM marker or extra
source/layer lifecycle is added.

The idempotent style installer restores current data, visibility, selection,
track, theme-specific images, and symbol layout after `map.setStyle`.
Deterministic order is:

```text
ports -> airports -> weather -> orbital track/points -> selected traffic trail/live traffic
```

The current-point source contains every safe modeled position, regardless of
the current tier. Current points use stable feature IDs and
`GeoJSONSource.updateData` diffs; exact shown IDs drive the point-layer filter
and the selectable-ID set. Style rehydration restores the complete data,
filter, visibility, images, selected exception/highlight, and track. The map
and canvas are never recreated for propagation ticks, zoom, search, filters,
selection, visibility, or theme changes.

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
| Schema / source contract | 2 / 2 (`celestrak-curated-v1`) |
| Response / record cap | 512 KiB / 512 |
| Request deadline | 5 seconds |
| Revalidation | 2 hours |
| Stale / hard age | 6 hours / 24 hours |
| Position cadence | 1 second |
| Prediction refresh / step | 30 seconds / 30 seconds |
| Prediction horizon | 90 minutes |
| Detailed result cap | 20 |
| Prediction cancellation chunk | 8 objects |
| Display tiers | `<2`: 192; `2..<4`: 384; `>=4`: all matches through 512 |
| Discovery query / page | 64 characters / 20 rows |
| Selected track | 15 minutes / 31 points |
| Element age / future tolerance | 14 days / 10 minutes |
| Clock skew / jump limit | 2 minutes / 30 seconds |

The scheduler retains separate 10-second/512-record/512-KiB per-response and
90-second/4-MiB aggregate bounds. It publishes only one complete schema-2
snapshot within the same 512-record/512-KiB browser cap.

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
- source-group/display-order validation and a deterministic 512-record
  streamed hard-cap fixture;
- ordinary SGP4 reference output and six-digit IDs;
- over-age and invalid propagation;
- local, whole-world, dateline, and invalid viewport geometry;
- exact zoom boundaries, stable tier order, selected exception, hidden-ID
  picking exclusion, and complete-source style restoration;
- exact/prefix/substring search ranking, punctuation preservation, exact
  type/source filters, paging/focus, unavailable positions, and distinct
  counts;
- current/future crossing order, filtered/cancellable latest prediction,
  result bounds, and track bounds;
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

The current exact application release is
`e2b2afaa04466116719310d6286441f8e6ba60ca`, deployed by protected run
[37203064394](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37203064394)
as running Cloudflare version
`816506f7-2cb1-4e6c-8626-ae990eb62b8a`. Overall smoke remains failed on
the unrelated aircraft relay (#174); the ship-only release does not claim a
new orbital acceptance or refresh. It uses KV namespace
`59178d55418247c4bab473b52a5dc07d` and Cron `17 */2 * * *`.
The #307 atlas map preserves the #300 layout and #275 sampling, acquisition,
source and compatibility contracts. Its real production acceptance retained
all 26 pages, final-row selection/focus at 315x517 and under a shortened
visual viewport, one catalog request per channel, and the shared worker.
The earlier #282/#288/#291 UI and #275 density/publication records remain historical
evidence, not newly repeated sampling experiments.
Implementation PRs #232 and #233 supplied the source contract and browser
consumer; #235 performed the coordinated catalog release. PR #243 added the
compact rendered/pass summary and exact featured labels, and #246 performed
the checked map follow-up release. PRs #258/#260 added the bounded Starlink
channel, while #264/#267 made immediate bootstrap activation cadence-safe.

The initial #235 curated release's immediate exact-route proof returned:

- default schema/source contract 1 from KV, retrieved
  `2026-09-30T22:17:35.578Z`, 156 records, digest
  `98ca3ae36478113d53f0ecea99d6cd4773232aec8b7eef61bef2a9828f2ccce6`;
- negotiated schema/source contract 2 from the immutable bootstrap, retrieved
  `2026-09-30T18:25:59.094Z`, 462 records, ordered sources `visual`,
  `stations`, `weather`, `gnss`, `science`, digest
  `5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`;
- distinct representation ETags and matching `304`s, `Vary: Accept`,
  cross-representation `200`, and no exposed internal bundle.

The first ordinary admitted schema-2 KV publication was retrieved at
`2026-10-01T02:17:32.034Z`. It contained `462` records
(`369 PAY, 91 R/B, 2 DEB`) with canonical digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`.
The same atomic write supplied a `156`-record schema-1 visual member with
digest
`018ee9ff6c9c161485f37f5a22cfaa5a6fdd2524a4ae7fc49a12947c4478e2e5`
and the same retrieval time. Both public bodies reported
source `kv`, retained their own conditional `304`, and returned `200` for the
other representation's ETag. An ordinary Cron that arrives seconds before the
exact two-hour gate returns `not-due` without provider work; the next later
event remains eligible.

The current #246 map follow-up retained and served the complete KV bundle for
both public representations; it did not reset the named coordinator or
initiate another CelesTrak refresh.

Fresh exact-release Chrome 154 acceptance passed 27/27 checks:

- zero catalog requests before ORBITS enable, exactly one fixed negotiated
  same-origin request afterward, and zero browser CelesTrak requests;
- one MapLibre canvas and one active orbital worker;
- 450 safe modeled positions, with 192 shown at raw zoom 1.5, 384 at zoom 3,
  and all 450 at zoom 4.5;
- all 24 catalog pages, exact name/NORAD/designator query, exact type/group
  filters, and an explicit unavailable-position result;
- rank-hidden NORAD `23802` shown as one selected exception without moving the
  camera, with origin-row focus restored after details closed;
- Light -> Dark style restoration preserving all 450 source features, the
  shown-ID filter, highlight, selection, and the single request;
- 390x844 and 390x568 reachability by wheel, Page Down, Tab, and trusted touch,
  no horizontal overflow, attribution retained, and a trusted touch drag
  moving the map;
- independent successful aircraft, marine REST, and marine MQTT operation,
  followed by truthful traffic pause at the intentionally ineligible world
  view;
- no runtime exception, console/log error, critical HTTP failure, or network
  failure.

The unchanged-tree hard-cap evidence remains 512 fixture records, search p95
1.9 ms desktop / 5.6 ms at 4x CPU, filter p95 1.5 / 6.8 ms, position tick p95
3.1 ms, complete prediction p95 478.7 ms, latest-request acknowledgement 15.7
ms, zero main-thread tasks over 50 ms, and a 602.74-second bounded one-canvas/
one-worker soak. Physical iOS Safari and Android Chrome were unavailable in
the validation environment; their evidence is not claimed.

The October 1 map-follow-up production pass in Chrome `154.0.8037.59` reported
`ORBITS · 192 SHOWN · 0 PASSES ≤90M` for the measured world view, retained 454
safe current positions, and exposed exactly two featured properties:
`HUBBLE`/NORAD `20580` and `ISS`/NORAD `25544`. The active
`Noto Sans Regular` stack rendered both labels; featured icon size was `1.08`
versus ordinary `0.72`. One catalog request occurred only after enable, zero
browser CelesTrak or theme-change catalog requests occurred, one canvas
persisted, 390x568 controls measured 329.4375 px against the 329.44 px budget,
attribution remained visible, and no runtime/log/HTTP error or long task over
50 ms occurred. Evidence and world/mobile screenshots are attached to
[#246](https://github.com/vasilyevstan/LiveTrafficStan/pull/246#issuecomment-5935337522).

Exact #267 Starlink acceptance used the production route and immutable
`starlink-2026-10-02-v1` generation. Before enable there were zero Starlink
requests and no Starlink worker channel. Enabling the child made exactly one
same-origin `200` request and zero browser CelesTrak requests; 150 safe modeled
records and the source population of 11,125 were reported separately. All
eight pages were reachable, including rows 141-150. Selection remained
owner-qualified and stated that purpose/image were not inferred. Light
checksum `208192691`, Dark checksum `162519703`, and restored Light checksum
`208192691` proved image replacement; parent-off terminated the physical
worker while retaining the child preference, parent-on created one active
worker without another request, and 390x568 trusted touch moved the same map.
One canvas persisted with no runtime exception, browser-log error, or failed
response.

The ordinary `2026-10-02T12:17Z` scheduled event occurred before the Starlink
row's exact `20:40:03Z` boundary. At `12:17:59.818Z`, the route still served
source `bootstrap` with GP retrieval `08:40:03Z`, SATCAT/publication
`08:40:05Z`, population 11,125, sample 150, digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`,
and the matching weak ETag. The unchanged generation is the truthful
pre-boundary result.

The first eligible ordinary `22:17Z` event then produced the newer complete
generation without manual acquisition. At `22:19:00.327863Z`, the route
returned `source=kv` for exact release `bba0bf4f...`, with GP retrieval
`22:18:01.730Z`, SATCAT retrieval/publication `22:18:02.211Z`, serve time
`22:19:00.626Z`, population 11,125, sample 150, and digest/weak ETag
`3cd7476fd7d42aed1772a85d4f81c27322c73b088bf58ff217e39454f425f0d7`.
The newer GP clock proves replacement of the `08:40:03Z` bootstrap generation.

For shell-balanced release #275, the ordinary `2026-10-03T14:17Z` event
published aligned schema-1/schema-2 KV members at `14:17:23.055Z`. Schema 1
contained 150 records; schema 2 contained 512 records with exact 128-per-shell
quotas and digest
`cebc2fd1dfe8b58e6dce30ca15dfa1ec0e327d7e1272d2f79690116a6a41356b`.
The normal browser preference selected fresh schema 2. Complete production
record/digest checks and all ten negotiation/ETag cases passed.

Chrome `154.0.8037.95` used the real production route without response
fixtures. It proved zero Starlink startup requests, one schema-2/KV request,
all 26 pages and final rows 501-512, exact 192/384/512 tiers, a 193-ID selected
exception, one map/physical worker, theme restoration, parent off/on without
refetch, and 390x844/390x568 touch and final-result reachability. At `14:30Z`,
the measured full Estonia/Finland desktop view showed six Starlinks and 86
next-90-minute map passes; the narrower mobile canvas showed two and 63.
These are time- and viewport-specific modeled observations, not guaranteed
density. The earlier smaller southern view correctly showed zero current
sample points, confirmed against the exact source records with SGP4.

Protected predecessor rollback `37129586003` and exact restoration
`37129687283` passed; both fresh KV representations retained byte-identical
bodies, digests, ETags, and publication clocks. [Actual production screenshots
and evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/275#issuecomment-5970127249)
record the remaining physical-device evidence limitation.

Public Wiki commit `0d535744e4159cf5b12931db4bf14adf4d5521d9` synchronizes
the shell-balanced release and its fresh publication, production browser,
rollback/restoration, and time-dependent northern-view evidence.

Traffic-recovery Wiki commit `bac76a2994a09e85e1162c5724a6071f0fc35540`
synchronizes that predecessor release, physical vessel scale, eight-photo
coverage, compact counts, exact Hubble/ISS labels, bounded Starlink lifecycle
and scheduled publication, provider/privacy boundaries, same-route
compatibility, single-scroll responsive behavior, validation, troubleshooting,
rollback, and known device-evidence limitation.

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

The earlier namespace-preserving pre-orbital rehearsal remains recorded in
runs `36488117751` and `36488245592`. The curated release additionally proved
schema-2 -> schema-1 -> schema-2 compatibility:

- protected run `36807920596` restored predecessor source
  `f98252f8a22619c67006e4a7c231eebca430dae2` from recorded version
  `2891a8b4-8111-4d7c-be93-1d355ebdf289`, activated version
  `2891a8b4-8111-4d7c-be93-1d355ebdf289`, restored the target Cron, and passed
  target-aware schema-1 smoke;
- protected run `36808295755` restored the then-current curated source
  `538edd25afa49f62c13e93745b322099f662791d` as version
  `83b98933-a609-405e-b07c-3e4f4ded46e8`, passed dual-representation smoke, and immediately
  served the retained schema-2 KV bundle without another provider refresh.

That restored source/version was the byte-exact rollback target for the curated
catalog release and its map follow-up.

Smooth globe #163 subsequently added native zoom interpolation and the
independent Flat preference without changing orbital acquisition, clocks,
expiry or worker ownership. Its [native-browser evidence](development-and-testing.md#smooth-globe-acceptance-163)
and actual release receipt are separate from these historical orbital
releases. Physical iOS Safari, Android Chrome, and supported-device drag-FPS
evidence remain an explicit environment limitation rather than a claimed result.

## Related documentation

- [Orbital Data Source Evaluation](orbital-data-source-evaluation.md)
- [Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Hosting and Deployment](hosting-and-deployment.md)
- [Data Sources and Licensing](data-sources-and-licensing.md)
- [Development and Testing](development-and-testing.md)
- [Troubleshooting](troubleshooting.md)
