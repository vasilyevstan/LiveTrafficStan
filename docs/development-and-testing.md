# Development and Testing

## Prerequisites and install

Use Node.js 24 or newer and npm 10 or newer. Node 24 is required because the
network-free orbital maintenance commands import the same erasable TypeScript
validator used by the Worker rather than maintaining a second schema.

```bash
npm install
npm run dev
```

The development server normally runs at <http://localhost:5173>. It supplies
the fixed `/api/aircraft` and `/api/weather/metar` proxies required by the
default ADSB.lol and AWC integrations. Plausible routes and Planespotters
aircraft photos remain direct browser requests and are not proxied. Vessel
reference photos are committed same-origin assets and create no Wikimedia,
Wikidata, tracker, or image-provider request. Ordinary Vite development does
not emulate the feature-gated orbital KV/Durable Object route; use the local
Worker command below for enabled ORBITS acceptance.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with hot module replacement, fixed aircraft/METAR proxies, and direct plausible-route support |
| `npm run lint` | Run Oxlint across the repository |
| `npm run typecheck` | Run strict TypeScript project checks without output |
| `npm test -- --run` | Run the deterministic Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run check:aircraft-metadata` | Offline validation of the committed pinned metadata database |
| `npm run update:aircraft-metadata` | Explicit maintainer regeneration from the pinned upstream archive and license |
| `npm run check:country-allocations` | Network-free validation of bundled MID and ICAO24 country allocations |
| `npm run update:country-allocations` | Explicit maintainer regeneration from pinned open-licensed sources and canonical cross-checks |
| `npm run check:orbital-catalog` | Network-free schema-2/canonical-digest validation of the curated bootstrap, pinned probe bytes/hashes/counts, immutable checksum/history guard, and both retained schema-1 rollback contracts |
| `npm run update:orbital-catalog -- --source-dir <probe-dir> --summary <summary.json> --published-at <iso> --output public/orbital-data/<new-version>/catalog.json` | Explicit maintainer normalization of the already-downloaded fixed five-group evidence after exact URL/order/row/byte/SHA-256 checks; never fetches the provider and never reuses a published immutable version |
| `npm run check:starlink-catalog` | Network-free validation of the pending or published immutable Starlink contract, exact source evidence, systematic sample, canonical digest, notice, and immutable history |
| `npm run update:starlink-catalog -- --source-dir <probe-dir> --summary <summary.json> --published-at <iso>` | One-time normalization of an already-downloaded paired Starlink GP/SATCAT acquisition; never fetches CelesTrak and never overwrites a published version |
| `npm run check:orbital-enrichment` | Network-free validation of exact current NORAD/name/designator/type identity, official-source provenance, rights notice, immutable asset inventory, dimensions, size, and SHA-256 |
| `npm run check:vessel-photos` | Network-free validation of exact IMO, source revision, rights, license notice, asset inventory, dimensions, size, and SHA-256 |
| `npm run check:ports` | Network-free validation of the committed Natural Earth port projection |
| `npm run update:ports` | Explicit maintainer regeneration from the pinned Natural Earth source |
| `npm run check:airports` | Network-free validation of the committed OurAirports projection |
| `npm run update:airports` | Explicit maintainer regeneration from the pinned OurAirports source |
| `npm run build` | Type-check and create the production bundle in `dist/` |
| `npm run preview` | Serve the production bundle with the local aircraft/METAR proxies |
| `npm run check:deploy` | Bundle the Worker and Static Assets without credentials or deployment |
| `npm run preview:worker` | Build and run the actual local Cloudflare `workerd` boundary |

For a local same-origin orbital bootstrap:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

This serves the exact Worker route without contacting CelesTrak. Scheduled
updater tests remain fixture-based; do not invoke live provider loops.

The dependency-free OCI relay tests live beside the implementation under
`infra/oci/aircraft-relay/`. The normal Vitest suite covers its HTTP boundary,
authentication, canonical path, concurrency/cadence admission, persisted
backoff, timeout, body limit, redirect behavior, symlinked release entry point,
and static deployment/Tunnel invariants. Shell syntax is additionally checked
with:

```bash
bash -n \
  infra/oci/aircraft-relay/deploy-release.sh \
  infra/oci/aircraft-relay/install-cloudflared.sh
```

Before publishing a change, run:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run check:aircraft-metadata
npm run check:country-allocations
npm run check:orbital-catalog
npm run check:starlink-catalog
npm run check:orbital-enrichment
npm run check:vessel-photos
npm run check:ports
npm run check:airports
npm run build
npm run check:deploy
```

The same commands run in `.github/workflows/validate.yml` for pull requests and
pushes targeting `dev` or `main`. The Wrangler dry run is credential-free and
does not call a live provider.

`npm run update:orbital-catalog` consumes local files only. A maintainer first
makes one coordinated strictly sequential GP/SATCAT read for each of the fixed
groups `visual`, `stations`, `weather`, `gnss`, and `science`, records the
summary plus raw response hashes, and then runs the normalizer once. The
normalizer rejects changed URLs, order, row counts, byte counts, hashes,
duplicates, missing joins, aggregate overflow, union count/type mismatch, or
any schema conflict. Repeated tests use fixtures and the normalized bootstrap;
they never loop against CelesTrak.

`npm run check:orbital-catalog` recomputes the schema-2 canonical digest and
file checksum without network access, verifies the 462-record/239,460-byte
bootstrap and 353,281-byte probe evidence, checks the two retained schema-1
bootstraps byte-for-byte, and rejects unknown padding or noncanonical
serialization. Pull-request validation supplies
`ORBITAL_CATALOG_IMMUTABLE_BASE`; reusing a historical path or changing bytes
under `curated-2026-09-30-v1` fails and requires a new version.

`npm run update:starlink-catalog` is deliberately offline. First perform one
reviewed, strictly sequential GP then SATCAT read only after the 12-hour source
window opens; record exact URLs, completion timestamps, statuses, media types,
decoded bytes, rows, and SHA-256 values. Run the normalizer once against those
saved bytes. If local validation fails, fix it offline rather than requesting
the provider again. `npm run check:starlink-catalog -- --require-bootstrap`
then proves canonical serialization, exact sample indices, source-clock order,
manifest/notice hashes, and the never-reused
`starlink-2026-10-02-v1` path.

The first published generation validates 11,125 GP and 11,125 SATCAT rows,
8,383,437 decoded source bytes, zero extra SATCAT rows, 150 sample records,
74,982 normalized bytes, and canonical digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.

Starlink deterministic acceptance covers zero request while either parent or
child is off; one same-origin request when effective; no request from camera,
theme, filters, list paging, selection, or style changes; one physical worker
with isolated channel disposal; owner-correct selection/details/tooltips;
Light -> Dark -> Light image replacement; exact type silhouettes; 20-row
keyboard paging and final-page reachability under the single Operations More
scroll owner; desktop/mobile/touch layouts; and truthful partial operation when
either curated or Starlink fails.

`npm run check:orbital-enrichment` does not fetch NASA. It verifies the
committed two-record manifest against the committed visual catalog, requires
sorted unique canonical NORAD IDs and exact name/designator/type agreement,
checks the pinned NASA purpose/metadata/image digests and co-located notice,
and fails if a published version path changes. Image files are excluded from
the PWA shell, so building or installing the shell cannot create an enrichment
request.

Deterministic loader tests separately require exact `200`, media type, byte
count, and SHA-256; one concurrent/session request; abort removal for obsolete
selection; terminal invalid/timeout failure without retry; and Blob-URL
revocation. Rendered acceptance disables the browser HTTP cache and proves
zero image request before selection, exactly one request for each reviewed
asset, Blob-URL reuse by the tooltip without a hover request, and no retry
after a terminal image failure.

To build the protected direct-aircraft variant without changing defaults:

```bash
VITE_AIRCRAFT_ENDPOINT=https://api.adsb.lol npm run build
```

This proves only bundle configuration. Real acceptance additionally requires
provider approval and a browser-origin response whose success and throttling
states expose usable CORS. The production and rollback workflows pass `worker-proxy`,
`oci-private-relay`, or `adsb-lol-direct` as the third argument to
`scripts/smoke-production.mjs`; arbitrary endpoint strings are never workflow
inputs. Private-relay smoke honors only a numeric, bounded local
`503 Retry-After`, retries at most twelve times, and still requires a real
`200` aircraft payload before accepting the release. Each delay is at most
30 seconds, so the maximum admission sleep is 330 seconds inside one
nine-minute end-to-end private-relay smoke deadline. Only a marked
relay-generated admission response is retryable; an upstream/provider `503`
fails without another provider request. Rejected local admission attempts do
not create additional ADSB.lol requests.

Plausible route lookup is enabled by default. To exercise the disabled state:

```bash
VITE_FLIGHT_ROUTE_ENABLED=false npm run dev
```

Ordinary deterministic tests use synthetic standing-route records. A bounded
manual acceptance may use one live callsign, but provider responses are not
committed as fixtures.

## Branch and pull request flow

1. Fetch `origin` and align local `dev` to `origin/dev`.
2. Create a focused feature, fix, or documentation branch from `dev`.
3. Open a detailed pull request back to `dev`.
4. Merge only after the `validate` check succeeds.
5. Release accumulated checked work with a `dev` to `main` pull request.

Do not merge an older local `dev` history back into the remote branch after a
squash release. If the trees are equivalent but commit histories differ, update
the local branch reference to `origin/dev` before creating work.

Repository rulesets require pull requests and prevent branch deletion and force
pushes on both protected branches. An administrator bypass exists only for a
declared emergency. Normal CLI-owned changes still use the pull request path.
Do not configure a mandatory self-review that prevents the repository owner
from merging automated work after checks.

Keep GitHub's automatic merged-branch deletion disabled: a release pull request
uses persistent `dev` as its head and the global setting can delete it. Delete
merged feature branches explicitly after verifying the merge; never delete
`dev`.

Keep one primary workstream per Issue. Use another focused pull request under
the same Issue only for an independent acceptance group or a prerequisite that
was unblocked later. Partial pull requests use non-closing references, and an
evidence-backed external blocker remains visibly linked until its criteria are
complete.

Create a separate Issue for an unrelated defect found during implementation,
review, or release acceptance. Fold it into the active work only when it is
tightly coupled or blocks a documented acceptance criterion.

## Automated test coverage

The V1 suite uses sanitized, local values and does not call live providers. It
covers:

- configuration defaults and invalid overrides;
- plausible-route callsign/position validation, one automatic request on a new
  eligible selected identity, no repeat on same-flight position updates,
  cancellation/stale callback handling, exact-identity six-hour session-cache
  reuse, expiry and 32-entry eviction, provider-wide
  `Retry-After`/fallback cooldown without automatic retry, cached-route display
  during cooldown, fixed URL construction, response bounds, geographic
  plausibility, sanitized provider failures, and hover/history isolation;
- aircraft-photo identity validation, explicit and automatic controller
  request guards, A to B to A revision guards, shared hover/details cache
  reuse, abort/throttling behavior, exact returned-origin checks, unchanged
  URLs, visible attribution/link DOM semantics, one-hour 32-entry LRU behavior,
  and storage/service-worker isolation;
- vessel-photo IMO checksum and exact-match behavior, distinct invalid/unmatched
  unavailable reasons with asset omission, selected-identity tagging,
  prominent live-details rendering, author/source/license/modification
  attribution, HISTORY omission, immutable asset integrity, and service-worker
  exclusion;
- ADSB.lol request construction, abort forwarding, response/error validation,
  retry guidance, enclosing-circle transport, and metric conversion;
- Digitraffic REST/MQTT normalization, capabilities, provenance, dimensions,
  ETA, missing metadata, one-connection batching, and bounded diagnostics;
- local vessel search, deterministic result ordering, category/navigation/speed
  filters, inclusive length bounds, and explicit unknown-value behavior;
- local aircraft literal matching and exact/prefix/substring ordering across
  callsign, registration, ICAO24, and reported type;
- current, stale, and expired transitions;
- trail visibility, 5/15/30/60-minute pruning, per-object point caps,
  deterministic 50,000-point aggregate eviction, and future-only expansion;
- versioned preference defaults, partial/invalid storage, legacy-theme
  migration, unavailable/quota storage, reset, and exclusion of camera/search/
  history/radius fields;
- strict fragment version/allowlist/duplicate/length/range validation, atomic
  camera restoration, three-decimal privacy rounding, and URL round-trip;
- exact metric/aviation conversions, qualified METAR visibility round-trip, and
  unchanged vessel one-knot filter membership;
- provider-qualified historical projection, excluded enrichment fields,
  exact provider/kind/license tuples, canonical logical-byte recomputation,
  source-time/receipt-time separation, and vessel metadata cursor gating;
- 60-minute session-history sampling, count/byte pruning, stationary reports,
  navigation segments, and clear boundaries that reject cached resurrection;
- IndexedDB opt-in, authorization epochs, atomic repair versus concurrent
  disable, retention/count/byte pruning, malformed/extra-field removal,
  metadata recount, quota retry/suspension, blocked upgrades, and unsupported
  versions;
- serialized passive loads and explicit mutations, typed destructive
  invalidation, enqueue-epoch batches, failed-batch restoration, and in-flight
  clear invalidation;
- frozen playback ranges, speed/scrub/endpoint behavior, durable/session
  deduplication, split indexes, historical snapshots, and gap-aware trails;
- interpolation bounds and no extrapolation.

Live provider availability, WebSocket behavior, WebGL rendering, and CORS/proxy
configuration require browser smoke testing because unit fixtures cannot prove
those external contracts.

Map-experience tests also cover:

- synchronous MapLibre construction failure without map-resource cleanup or
  application teardown;
- source-diff property updates that retain complete marker identity and styling
  fields; never treat `removeAllProperties` plus additions as a replacement;
- latest-query coalescing and a minimum 20-second aircraft request-start gap;
- obsolete request cancellation/result rejection and rate-limit backoff;
- antimeridian, rotated, tilted, invalid, exact-100-km, and
  outside-polygon/inside-circle viewport geometry;
- marine viewport changes without MQTT reconnect or REST bursts;
- session-lived aircraft and marine pause/resume without cadence, backoff,
  reconnect, REST, metadata, or cache resets;
- Home/camera/viewport eligibility state transitions;
- exact-first touch picking, CSS-pixel threshold, duplicate world copies,
  ambiguity, hidden/expired IDs, drag, pinch, cancellation, unknown modality,
  and touch-followed-by-mouse behavior;
- granted, prompt, denied, unsupported, timeout, and explicit geolocation
  outcomes without coordinate persistence;
- theme storage validation and unavailable-storage behavior;
- Auto theme resolution before paint, modern/legacy system listeners, explicit
  overrides, storage migration, and listener cleanup;
- pre-paint/React parity for shared, unified, legacy, malformed, and default
  theme resolution;
- shared-camera precedence over delayed geolocation, initial viewport
  publication without a fit, and independent camera reporting for repeated
  ineligible views;
- deterministic shell allowlist/content version/budget, exact navigation and
  asset routing, recorded-active predecessor cleanup, superseded-waiting
  workers, atomic failed install, interrupted inactive-cache recovery,
  active-cache preservation, authorized activation, failed-first-install
  presentation, and owned-cache-only retirement;
- manifest root scope, 192/512 icon dimensions, maskable purpose, and mutable/
  immutable deployment headers;
- source-free Light/Dark fallback styles without sprites, glyphs, sources, or
  external URLs;
- idempotent MapLibre style installation and restoration of custom state;
- theme-keyed traffic image replacement, including identical style URLs and
  stale/live opacity updates;
- all 10 persisted silhouette IDs, 3 exact render-only vessel shapes, 20
  bounded aircraft altitude-color variants, ADS-B/AIS category boundaries,
  generic fallbacks, and stable identity when provider metadata changes an
  icon.
- strict coordinate/query classification, including malformed numeric pairs,
  comma-containing place names, range checks, and configured rounding;
- Photon URL/header construction, bounded response reads, GeoJSON Point
  validation, stable-identity deduplication, and provider-order preservation;
- one-active-search cancellation, stale-result rejection, cooldown, timeout,
  `Retry-After` fallback, and bounded success/empty caching;
- explicit-navigation precedence over late geolocation and trail reset after a
  committed view change.
- deterministic aircraft-metadata projection, checksum failure, exact and
  ICAO24-only matching, conflicts, ambiguity, malformed/partial assets,
  streamed byte caps, one total deadline, fulfilled-only caches, A to B to A
  callback races, vessel/empty cancellation, and exact age boundaries.
- deterministic MID/ICAO24 allocation projection, canonical Wikidata
  cross-check hashes, fail-closed ambiguity/source-error exclusions, MMSI
  special-format rejection, exact aircraft range boundaries, and accessible
  selected-detail labels without network work.
- deterministic Natural Earth projection, immutable inventory/checksum/size/
  rank checks, bounded lazy runtime loading, timeout/abort/error isolation,
  fulfilled-only caching, ranked zoom layers, and theme-aware visibility.
- deterministic OurAirports CSV parsing/projection, immutable
  inventory/checksum/size/count checks, bounded lazy runtime loading,
  timeout/abort/error isolation, fulfilled-only caching, zoom tiers, static
  details, viewport list, and deterministic airport/port pick precedence.
- provider-neutral JSON round-tripping for the six layer preferences;
- separate aircraft/vessel cluster source configuration, counts, expansion,
  entity exclusion, generation races, reduced motion, snapshot signatures, and
  interpolation suspension;
- explicit ICAO station selection, over-limit rejection without truncation,
  METAR/SPECI normalization, Unix-second time, qualified visibility, `VRB`,
  stale/expiry, empty 204, newest-report selection, abort, timeout, size cap,
  `429`, and `Retry-After`;
- strict Worker weather route validation, fixed upstream construction,
  redirect/content-type/timeout/oversize handling, safe headers, and no
  credential forwarding;
- weather-before-airport-before-port picking and all six asynchronous static
  layer installation orders.
- strict orbital catalog streamed reads, fatal UTF-8, exact fields/source/
  ordering, schema-v2 source groups/display order, 512-record hard-cap fixture,
  digest/header/ETag agreement, valid cached `304`, fulfilled-only tab caching,
  and rejected partial/malformed/oversized responses;
- SGP4 reference propagation, six-digit NORAD IDs, element-age bounds,
  local/dateline/whole-world/invalid view geometry, 90-minute crossings,
  filtered prediction population, cancellable chunks/latest request,
  20-result cap, bounded selected track, and antimeridian/invalid-gap splitting;
- orbital lifecycle enable, no-fetch view/selection/hide-show behavior,
  two-hour revalidation, page/HISTORY/offline pauses, initial clock skew,
  later wall-clock jumps, stale/expiry truthfulness, and revision fencing;
- persistent orbital sources/layers, stable feature IDs, style rehydration,
  complete safe-position source plus exact shown-ID filters, all 24
  port/airport/weather/orbital installation orders, traffic-first picking,
  hidden-ID exclusion, preference/share defaults, controls, details, and
  attribution;
- exact zoom boundaries and selected exception, distinct catalog/modeled/map/
  shown/pass counts, exact/prefix/substring discovery ranking, punctuation
  preservation, exact type/source filters, 20-row paging, unavailable-position
  rows, focus restoration, and Catalog selection before a settled zoom,
  which must report map display unavailable rather than a subset/exception;
- atomic orbital publication bundles: same-refresh schema-1 freshness across
  successive schema-2 refreshes, one final v2-key write, no v1-key write, no
  extra upstream fetch, failed-write preservation of both prior members,
  raw-v2 rollout compatibility, newest legacy candidate selection, equal-time
  conflict rejection, and representation-specific conditional `304`s;
- the collapsed enabled-state summary for a zero-object local view and the
  keyboard-focus path from **VIEW** to the first modeled-object result.

`npm run check:aircraft-metadata` makes no upstream request. It validates the
pinned source and license identity, configured immutable version, co-located
ODC-By license, exact file inventory, every shard hash and byte count, complete
TSV grammar, type references, aggregate counts, and publication-age policy.

`npm run update:aircraft-metadata` is an explicit maintainer operation and
requires network access plus the system `unzip` executable. It verifies both
downloaded SHA-256 values before reading the archive. Review the generated diff
and measured counts; a source, schema, generator, or byte change requires a new
output version rather than replacement under an old immutable URL.

`npm run check:country-allocations` makes no upstream request. It validates the
generated SHA-256 and deterministic gzip size, exact 282-MID and 192-aircraft
range inventories, excluded ambiguity/error rows, ISO grammar, sorted
non-overlapping ranges, and representative boundary fixtures.

`npm run update:country-allocations` is an explicit maintainer operation. It
downloads exact commit-pinned Apache-2.0 MID and CC0 ICAO24 projections plus two
bounded Wikidata SPARQL responses. Wikidata bindings are schema-checked,
canonically sorted and serialized, then verified against configured SHA-256
values before use. The projection includes only exact unambiguous MID
agreement, rejects invalid/special ICAO rows, verifies the reviewed state-to-ISO
crosswalk, and refuses changed bytes under an existing output version.

`npm run check:vessel-photos` makes no upstream request. It validates at least
five unique exact IMO entries, IMO check digits, review-time Digitraffic
evidence, pinned Wikidata/Commons URL structure, supported file-specific
licenses, complete credit and modification text, safe immutable asset paths,
JPEG/PNG signatures, dimensions, byte counts, SHA-256, per-file and aggregate
budgets, the co-located license record, and exact directory inventory. Adding
or changing a photo requires a new manifest/version directory; never replace
bytes under an existing immutable path.

`npm run check:ports` makes no upstream request. It validates the immutable
directory inventory, raw bytes, SHA-256, deterministic gzip-9 size, complete
GeoJSON grammar, ordered IDs, coordinates, record count, and rank
distribution.

`npm run update:ports` is an explicit maintainer operation. It downloads only
the pinned commit URL, enforces a 1 MiB source cap, verifies the source
SHA-256, regenerates the minimal projection, checks every expected measurement,
and refuses to replace changed bytes under an existing immutable version. Any
source, projection, generator, or generated-byte change requires a new output
version.

`npm run check:airports` makes no upstream request. It validates the immutable
directory inventory, raw bytes, SHA-256, deterministic gzip-9 size, complete
GeoJSON grammar, sorted persistent IDs, coordinates, record count, kind
distribution, and Tallinn fixture.

`npm run update:airports` is an explicit maintainer operation. It downloads
only the pinned commit URL, enforces a separate 16 MiB source cap, verifies the
12,725,082-byte CSV SHA-256, parses quoted UTF-8 CSV including embedded
newlines, regenerates the large/medium projection, checks every expected
measurement, and refuses to replace changed bytes under an existing immutable
version. Any source, projection, generator, or generated-byte change requires
a new output version.

Geolocation tests must distinguish permission from acquisition. A granted
permission can still produce delayed success, timeout, unavailable, or obsolete
late callbacks. Repeated tests use deterministic browser abstractions and fake
time rather than relying on the current machine's location service.
Include a successful result beyond the former eight-second window, timeout then
retry, duplicate permission/click suppression, and unmount invalidation.

## Issue #10 measured impact

Against exact base `2332111f43062c42d95540176e39594a35a6ec67`:

- main JavaScript: +26,811 raw / +7,036 gzip-9 bytes;
- `index.html`: +251 raw / +79 gzip-9 bytes for pre-paint Auto resolution;
- CSS, MapLibre worker, and MQTT chunk: byte-identical;
- Wrangler dry-run Worker upload: 7.41 to 13.64 KiB raw and 2.41 to 3.16 KiB
  gzip as reported by Wrangler;
- no weather bytes or airport asset request occur at startup.

Production-preview fixture acceptance measured a two-animation-frame cluster
toggle between 18.5 and 30.6 ms and first one-station weather list/map
publication within 104 to 105 ms, with no browser long-task entries after the
measurement boundary. The actual local Worker returned 896- to 930-byte
two-station AWC JSON responses with `public, max-age=60`, JSON content type, and
`nosniff`. These bounded local measurements are regression evidence, not a
public-load or provider-capacity claim.

## Issue #9 history acceptance

The deterministic large-history check uses 100,000 valid observations across
1,000 entities. On the accepted implementation it measured:

- actual Chromium IndexedDB read/validation/sort: 948.6 ms;
- observation-index build: 20.9 ms;
- historical snapshot p95 / maximum: 0.5 / 1.0 ms;
- selected 100-point trail extraction: 0.3 ms;
- measured load heap increase: 52,576,573 bytes;
- the application retained 87,038 rows from a 38,551,000-logical-byte seed,
  proving the 32 MiB bound rather than silently keeping all 100,000;
- application reload-to-ready with the bounded retained store: 3,317.5 ms;
- disabling while a full passive reload was active at 4× CPU remained disabled
  after reload and left zero durable rows;
- desktop scrub-to-two-frame paint p95 / maximum: 35.1 / 35.2 ms;
- 390x844 with 4× CPU throttling p95 / maximum: 35.9 / 36.0 ms;
- no measured browser long task above 50 ms in either scrub run.

The production-preview lifecycle check starts from disabled empty storage,
records real provider observations after explicit opt-in, reloads them, scrubs
and plays at multiple speeds, pauses at the frozen endpoint, returns live via
Center and the explicit action, plays while offline, clears, disables/deletes,
and verifies that two-tab Clear invalidates both durable and volatile history.
It also checks one MapLibre canvas, visible attribution, no runtime exceptions,
real touch movement, and direct Return to Live access at 390x844 and 390x568.
Provider HTTP failures are provider-state evidence, not JavaScript exceptions.

## Issue #12 preference, share, and unit acceptance

The PR A Chromium matrix starts from absent preference keys and proves Light and
Metric render without implicit storage. It then persists Dark,
Aviation/Nautical, ports, clustering, a structured cargo filter, hidden
60-minute trails, and verifies that free-text query, camera, radius, history,
and provider state are absent from the stored schema.

The same pass proves:

- unit changes create no additional aircraft request and preserve one map;
- an explicit link contains a three-decimal camera plus nonzero bearing/pitch,
  restores those exact camera fields and controls, and does not overwrite
  different saved Light/Metric preferences;
- delayed already-granted geolocation updates Home but does not steal the
  shared camera; a later Center uses `Home: Near you`;
- a malformed fragment with an otherwise valid Dark field resolves to Light in
  both pre-paint and React paths;
- Clipboard rejection exposes a focusable manual-copy field and status;
- reset removes unified/legacy preference keys and the fragment, restores
  defaults, preserves camera, and leaves the exact private-history settings
  value and IndexedDB record count unchanged;
- one MapLibre canvas, visible attribution, reachable preferences, and the
  58vh control-panel bound hold at 390x844 and 390x568;
- no runtime exception or console error is reported.

## Issue #12 PWA and offline acceptance

The generated normal shell contains 11 URLs and 2,606,624 uncompressed bytes,
including the separate approximately 26 KiB orbital worker and remaining below
the 4 MiB fail-closed budget. Production Chromium reports no
installability errors. First install reaches `activated` without claiming the
page or showing **REFRESH APP**; the next reload is controlled.

Cold-offline acceptance clears the ordinary HTTP cache before reloading. It
proves:

- CacheStorage contains only root/index, five hashed Vite assets, manifest,
  favicon, and two icons;
- live traffic is explicitly unavailable and basemap tiles are explicitly not
  cached;
- the source-free fallback keeps one MapLibre canvas;
- 180 consented IndexedDB observations remain available and three vessels render
  in HISTORY mode;
- the historical Return to Live action and attribution remain visible while
  the scrollable controls stay at or below 58vh at 390x844 and 390x568;
- reconnect restores the external style in the same canvas with one shell
  cache and no unexpected runtime/console errors.

The A→B→A production exercise proves:

- a B network document and new hashed asset load under controller A;
- B waits and prompts, then reloads each of two controlled tabs exactly once;
- B can serve an A-only deferred asset from the predecessor cache;
- only A and B shell generations coexist, and an unrelated cache survives;
- API and static context requests never enter CacheStorage;
- rollback A waits/prompts and reloads both tabs once;
- offline rollback navigation uses current A rather than predecessor B;
- an excluded `/elsewhere` navigation receives no offline HTML fallback;
- a worker with a missing precache asset never becomes waiting, leaves A active,
  and removes its partial cache;
- retirement reloads both tabs once, unregisters without a loop, deletes only
  shell caches, preserves the unrelated cache, exact preferences/history
  settings, and three IndexedDB rows, and leaves retirement `/sw.js` available.

## Browser smoke test

Use `npm run dev` and verify:

1. OpenFreeMap labels and land/water geometry render, not only the overlays.
2. The status reaches `LIVE` or a truthful provider-specific `PARTIAL` state.
3. Aircraft and vessels appear when current provider coverage contains them.
4. Pan, zoom, rotate, pitch, Home, and resize update the visible traffic area
   after settling.
5. Aircraft and ship layer toggles work independently.
6. Selecting an aircraft or vessel opens the correct detail card and leaves the
   same marker rendered and pickable after the immediate source update and
   ordinary refreshes. Record unchanged latitude, longitude, zoom, bearing, and
   pitch; a trail appears only after multiple observations are available.
7. Closing the card, an empty-map hit, committed navigation, choosing mutually
   exclusive context, hiding/filtering the selected entity, or allowing it to
   expire clears selection safely. Failed navigation and ordinary same-entity
   refreshes do not.
8. The default Operations and Location & Settings panels remain compact and
   require no scroll. Center, Aircraft, Ships, and ORBITS stay visible above;
   the one mounted location input, theme, and Trails stay visible below. Other
   operational layers, discovery, context, and source detail live behind
   Operations More; the duplicate traffic legend is absent. Location feedback,
   browser location, history setup, preferences, sharing, reset, and app detail
   live behind Location & Settings More. Verify each panel promotes recovery
   only from its own domain with no duplicated action or alert. Verify the
   brand/status panel and fixed control column do not overlap at 1024, 900, or
   761 CSS pixels. Measure each collapsed panel and the combined expanded stack
   at desktop, 390x844, and 390x568. With 20 orbital results, verify the outer
   Operations body is the only scroll owner, the final result is reachable by
   touch, wheel, Tab, and keyboard scrolling, search state and disclosure
   identity survive rerenders, focus returns to a visible owner, task labels
   remain unclipped, and a real touch drag works on an unobscured map region.
   Include a 315x517-class view and a case where the layout viewport remains
   tall while `window.visualViewport.height` is forced to 517 px. At the final
   scroll position, verify the last result is topmost with
   `document.elementFromPoint()` rather than relying only on bounding boxes.
9. Map and provider attribution remains visible.
10. Strict coordinates navigate with no Photon request; named text makes one
    explicit bounded request and renders Photon/OpenStreetMap attribution.
11. Search results are reachable by keyboard, Enter selects one, and Escape
    closes results and restores input focus.
12. Blocking Photon produces a non-blocking search error while coordinate
    navigation, Center, and live traffic remain usable.
13. No `/aircraft-metadata/` request occurs before aircraft selection. First
    selection requests one index and one prefix shard; a same-prefix selection
    reuses both.
14. Selected-aircraft metadata shows model/configuration/wake, exact confidence,
    snapshot age, Mictronics attribution, and ODC-By. Conflicts and blocked
    metadata requests stay local while live ADS-B, selection, trail, marker,
    and provider status remain unchanged.
15. Vessel search matches normalized name, callsign, MMSI, and IMO without any
    provider request. Combined category, navigation, speed, and inclusive
    length filters keep matching/shown counts truthful. Exact sailing and
    pleasure types render only with known length at least 8 m, finite age from
    0 through 120 seconds at the live clock or historical cursor, and reported
    speed at least one knot. Future, stale, stopped, speed-unknown, and
    length-unknown yachts stay hidden at every size; non-yachts preserve the
    50 m reset state. A selected yacht becoming ineligible clears cleanly.
16. Selecting each reviewed vessel by its exact live IMO shows the correct
    bundled reference photo directly below the ship heading, with author,
    fixed Commons revision, selected license, modification notice, and the
    historical/not-live caveat visible. An invalid or unmatched IMO explains
    why coverage is unavailable and shows no image. Switching matched A to
    matched B to A never flashes the wrong hull; HISTORY and search results
    show no vessel photo. A sub-500 ms hover adds no image request; one stable
    matched-vessel hover loads only the correct same-origin asset with
    fixed-source and rights context. No hover makes a Wikimedia, Wikidata,
    tracker, or image-provider request. Verify all eight same-origin assets
    return `200` with immutable caching.
17. With SHIPS hidden, matching results remain counted but cannot be selected.
    Re-enabling SHIPS restores map visibility without reconnecting MQTT or
    starting REST work.
18. Aircraft altitude-colored silhouettes, red slow/stopped dots for either
    traffic kind, and all nine vessel category shapes exclude clusters and
    click/touch picking, preserve neutral selected halos, follow stale opacity
    and layer visibility, and reinstall after Light/Dark and fallback-style
    changes. A 16x16 map-scale raster assertion keeps every vessel outer
    profile distinct. No ordinary aircraft altitude ring or moving/unknown
    state bubble remains. Exact boundaries are tested at
    1,000/3,000/10,000 m, +/-1.016 m/s, and one knot. Zero or negative finite
    altitude never claims on-ground status; missing or invalid speed never
    receives the red stopped treatment. Mouse hover shows aircraft
    flight/callsign, reported type, reported altitude in the selected unit
    system, or vessel name, MMSI-derived flag, speed over ground in both km/h
    and knots, and explicitly labeled AIS destination using text-safe DOM
    construction. With aircraft photos disabled, hover, leave, drag, style
    replacement, and entity expiry add no aircraft-photo request. A sub-500 ms
    aircraft or vessel hover adds no image request. One stable aircraft hover
    may add one direct provider request; one stable exact-IMO vessel hover may
    load one bundled same-origin image. Leaving, replacement, expiry, or
    HISTORY aborts or omits obsolete work. Metadata, route, traffic-provider,
    reconnect, and polling behavior remains unchanged. Cluster counts and port, airport,
    and weather labels reuse the active style's declared font stack; glyph-free
    fallback uses local system fonts with no unsupported Open Sans request or
    browser diagnostic. Operations More exposes the same exact altitude,
    vertical-rate, one-knot, yacht-length, and freshness thresholds with
    textual equivalents.
19. No `/ports/` request occurs while PORTS is disabled. First enable makes one
    bounded request; hiding and re-enabling uses the fulfilled session cache.
    A blocked/corrupt asset reports a local error and Retry works without
    changing map, aircraft, marine, or traffic-provider status.
20. Port rank groups appear only at their configured zooms, disappear above
    zoom 13, survive Light/Dark style rehydration, remain visually distinct
    from ships, and keep Natural Earth public-domain/generalization wording
    visible.
21. Exact and touch-fallback traffic picking retains priority over ports.
    Port selection is separate from traffic selection, explicit navigation or
    hiding PORTS clears it, and port details never claim facilities, calls,
    nearby vessels, destination, or ETA.
22. Aircraft search matches current callsign, registration, ICAO24, and type
    with literal exact/prefix/substring ranking. Typing, clearing, and a
    no-match result create no aircraft, marine, metadata, Photon, or Worker
    request and do not filter map markers or move the camera.
23. No `/airports/` request occurs while AIRPORTS is disabled. First enable
    makes one bounded request; hiding and re-enabling uses the fulfilled
    session cache. A blocked or corrupt asset reports a local retryable error
    without changing map or traffic-provider health.
24. Large airport points/labels appear from zoom 4/5 and medium points/labels
    from zoom 7/8, remain visible at high zoom, survive Light/Dark style
    rehydration, render above ports and below traffic, and retain visible
    OurAirports/Public Domain attribution.
25. Tallinn airport details show EETN/TLL, persistent OurAirports ID, ident,
    municipality/country, coordinates, source commit/date/output version, and
    explicit non-operational/no-inference wording.
26. The bounded airport list is reachable by keyboard. Closing airport details
    restores focus to the originating result when present or AIRPORTS otherwise.
    Airport, port, and traffic selection clearing and exact-before-near-miss
    precedence remain deterministic.
27. No `/api/weather/metar` request occurs at startup. First METAR enable loads
    the airport asset if needed and makes at most one canonical request for the
    sorted visible ICAO set. Hiding/re-enabling, Light/Dark/Auto changes, and
    style rehydration reuse a fulfilled same-view result without refetching.
28. METAR loading, one-minute waiting, empty, stale, expired, error, retry, and
    refresh states are truthful. Switching A to B to A inside the gate recovers
    at the next allowed boundary rather than permanently suppressing A. A
    blocked weather route leaves map, traffic, ports, airports, search, camera,
    and provider health usable.
29. The weather list is keyboard reachable; EETN details show report/source
    time, retrieval time, normalized fields, raw report, AWC terms, and
    observation-not-forecast wording. Closing restores focus to the originating
    result or METAR toggle.
30. Wide/ineligible or over-50-station views issue no weather request and hide
    obsolete observations. Traffic exact/touch selection precedes weather;
    weather precedes airport and port within exact and touch context hits.
31. AIR and SEA clusters remain separate, expand to the reported zoom, never
    open entity details, and do not increase aircraft, marine, metadata, Photon,
    airport, port, or METAR requests.
32. Durable history starts disabled and empty. Enabling it is explicit, and
    the status distinguishes durable from total currently available records.
33. New provider observations persist after opt-in and survive reload. The
    actual oldest/newest retained range is shown rather than the requested
    maximum.
34. Entering history freezes the range. Scrub pauses, 0.5×/1×/2×/4× playback
    advances without creating an additional provider start, the endpoint
    pauses, and Return to Live is explicit.
35. Historical display remains unmistakable, disables interpolation, hides
    current METAR and third-party aircraft metadata, and gates vessel metadata
    to the cursor.
36. Clear removes session and durable observations without disabling consent.
    Disable turns recording off and deletes rows. Neither action allows queued
    writes to repopulate the database.
37. A second same-origin tab observes clear/disable invalidation. Blocked or
    stale tabs report recovery guidance rather than continuing to write. Clear
    removes both durable and volatile history in the peer, and queued records
    cannot be retagged under the new epoch.
38. Offline historical playback remains usable while live aircraft and marine
    acquisition pause through existing controllers. Returning online preserves
    their cadence, backoff, reconnect, REST, and metadata gates.
39. At 390x844 and 390x568 the control panel remains at or below 58vh, Return
    to Live is not covered by attribution, and a real touch drag can begin on an
    unobstructed map region.

For the viewport-driven map experience, additionally verify:

1. Settled pan, wheel/button/pinch zoom, rotation, pitch, and real resize update
   the desired traffic viewport without snapping the camera back.
2. Rapid camera changes resolve to the latest area without increasing aircraft
   request cadence or reconnecting marine MQTT.
3. A view at or below the 100 km enclosing limit shows exact polygon-filtered
   traffic; an object inside the query circle but outside the visible footprint
   stays hidden.
4. Wider or unsafe views hide traffic and trails, clear selection, pause both
   providers, and show the zoom or tilt prompt. Zooming back in resumes at the
   preserved provider boundaries.
5. Center returns to session Home using the initial local framing.
6. Already-granted location starts near the rounded browser location without a
   prompt; other permission states retain Tallinn until explicit action.
7. Dateline, rotated, pitched, and desktop/mobile resized views remain bounded
   and do not become a falsely small query.
8. Initial load, Home, and Center use the configured 30 km framing. The
   resulting full-canvas assessment remains eligible and below the unchanged
   100 km limit; camera actions do not add aircraft polls beyond cadence or
   display aircraft outside the exact viewport polygon.
9. Auto system changes and repeated explicit Light/Dark overrides preserve
   camera, live traffic, selected object, trail, controls, and provider
   connections.
10. Both themes remain readable on desktop and a narrow mobile viewport.
11. Aircraft, helicopter, and vessel artwork retains its identity over land,
   water, and busy detail at actual marker scale; stale markers remain
   recognizable and distinct from live markers.
12. Light/small, generic, heavy, rotorcraft, cargo, tanker, passenger, fishing,
    tug, and generic-vessel shapes remain distinguishable in Light and Dark
    themes while aircraft altitude colors remain distinct from maritime-blue
    marine traffic and the red stopped dot.
13. Rapid theme changes restore all 33 bounded image IDs and loaded
    static/weather layers once per style generation, preserve one map, and do
    not reconnect or query any provider.
14. A direct touch hit selects normally, an isolated near miss inside the
    8 CSS-pixel box selects the sole eligible ID, and an outside or ambiguous
    tap clears/retains selection according to the normal empty-hit path.
15. Mouse, touch-followed-by-mouse, drag, and pinch interactions do not receive
    the touch fallback, and device pixel ratio does not change the threshold.
16. A coordinate or place result changes only the current view. Center returns
    to the latest session Home, including one updated by a late allowed
    geolocation result that did not steal the explicit camera.
17. Wheel/trackpad, pointer drag, touch drag, double-click, and map-keyboard
    movement change the label to `Custom view`; a marker click and programmatic
    camera fit do not.
18. Repeating the same normalized named query uses the session cache without a
    second Photon request. New input, Escape, Center, location, coordinate
    navigation, or manual movement cancels obsolete results.

For Issue #162 orbital acceptance, run the same built client through:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

Then verify on desktop 1280x900, mobile 390x844 and 390x568, and physical iOS
Safari/Android Chrome for touch claims:

1. No `/api/orbits/catalog` request occurs before explicit ORBITS enable.
2. First enable makes one same-origin request. The browser makes no CelesTrak
   request and sends no viewport, Home, geolocation, selection, or credentials.
3. The response passes schema/digest/header checks and creates one module
   worker. Ordinary pan, zoom, rotate, pitch, resize, theme, selection, and
   hide/show do not make another catalog request.
4. A whole-world view pauses aircraft and ships under their unchanged 100 km
   contract while valid orbital points remain visible. The selector explains
   that all current subpoints are in view and does not claim a useful future
   crossing rank.
5. A local view distinguishes current in-view objects from first crossings in
   the next 90 minutes. The compact ORBITS line uses the rendered
   shown-in-footprint count, distinguishes zero from a pending prediction, and
   keeps singular/plural pass wording. Counts, ordering, exact type, modeled
   time, element epoch, retrieval age, source, and limitations remain truthful.
6. Payload, rocket body, debris, and unknown colors, labels, and generated
   symbols match exact SATCAT type; no name-derived type appears. Map-scale
   raster assertions keep the satellite, stage, fragment, and unknown shapes
   distinct, and Light -> Dark -> Light updates the same four image IDs. Exact
   reviewed Hubble and ISS identities are larger and labeled in the same point
   layer when the active style has a usable font; identity mismatches and
   unreviewed objects have no featured label.
7. Exact traffic and traffic clusters keep pick priority. An exact orbital hit
   or one unique touch fallback selects only the orbital object, does not move
   the camera, and clears mutually exclusive traffic/context details.
8. The selected track never joins an antimeridian or invalid propagation gap,
   remains bounded, and survives ordinary pan, pitch, rotate, resize, and
   Light/Dark/style restoration without fitting the camera.
9. A to B to A selection and rapid view/style revisions cannot publish a stale
   result or track. Hiding ORBITS, committed navigation, HISTORY, expiry, or
   another mutually exclusive selection clears it.
10. Entering HISTORY hides orbital points/results/details and performs no
    catalog request. Return to Live restores from the valid current-tab
    snapshot without resetting the two-hour revalidation boundary.
11. Cold offline enable is explicit offline/unavailable. Going offline after
    one fulfilled snapshot retains only that tab's complete data until clock,
    element, or snapshot hard-age rules suppress it.
12. One `.maplibregl-canvas` persists through enable/disable, propagation,
    selection, theme changes, fallback style, HISTORY, and PWA update handling.
13. CelesTrak attribution stays visible. Controls/details remain keyboard
    reachable, scrollable, at or below the shared 58vh disclosure budget, and
    leave one unobstructed real touch-drag area.
14. The console contains no exception. Worker/timer/listener/source counts and
    post-GC heap do not grow over a ten-minute enable/disable/theme cycle.
15. At the 256-record fixture limit, record worker propagation p95 below
    100 ms, no orbital-attributable main-thread task over 50 ms in a throttled
    60-second trace, and at least 30 fps while dragging on the supported mobile
    device.

For the final Issue #211 browser slice, run the same checks against the exact
schema-2 curated bootstrap and a deterministic 512-record hard-cap fixture,
then additionally verify:

1. Zoom `<2`, zoom `2`, zoom just below `4`, and zoom `4` produce the exact
   192/384/current-all boundaries in stable `displayOrder`; the safe selected
   exception remains once and rank-hidden IDs are not pickable.
2. The persistent orbital point source retains every safe current position
   while the layer filter/selectable-ID set changes. Light/Dark/style
   rehydration restores that data, exact filter, visibility, images,
   selection/highlight, and track on the same canvas.
3. Nearby and Catalog share the existing Orbits task. Search covers name,
   canonical NORAD ID, and designator with exact/prefix/substring ranking;
   exact type/group filters, 20-row pages, unavailable-position rows, range
   text, Previous/Next, page focus, details-close focus, and Escape restoration
   all remain keyboard-operable.
4. Counts separately report catalog, accepted, modeled-now, catalog-match,
   modeled-match, in-footprint or unavailable, shown-in-footprint, future
   crossings, and listed rows. Filtered empty, zoom-hidden, no-safe-position,
   offline, unavailable, and expired states do not collapse together.
5. Text changes only the list. Exact filters and settled camera changes may
   replace one coalesced local prediction but do not fetch, recreate provider
   controllers, or reset cadence. At least 20 combined camera/search/filter/
   selection/theme changes leave one catalog request and zero browser
   CelesTrak requests.
6. At 1280x900, 390x844, 390x568, 315x517, and an emulated tall screen with
   `visualViewport.height=517`, measure no horizontal overflow, one outer
   Operations scroll owner, unbounded `.orbital-results`, reachable
   attribution/final rows, the 58vh budget, one contiguous hit-tested map area,
   and a trusted touch-pointer drag. Physical iOS/Android claims require actual
   devices; Chrome touch/DPR emulation must be labeled as emulation.
7. With 4x CPU throttling, record one-second position p95 below 100 ms,
   90-minute prediction p95 below one second, search/filter p95 below 16 ms
   without throttling and below 50 ms at 4x, latest replacement
   acknowledgement within 100 ms, and no update long task over 50 ms. A
   ten-minute enable/filter/theme soak must show one canvas, at most one active
   orbital worker, no extra catalog request, and no monotonic post-GC
   heap/timer/listener growth.

### Curated release and October 1 map follow-up evidence

The exact combined feature tree
`b6cc3d3f02fdfdb5ff9a0e4158048e77b4507add` passed lint, typecheck, 740
tests, aircraft metadata, country allocations, vessel photos, orbital catalog
and immutable history, orbital enrichment, build, and deployment dry-run.
Base release #235 deployed exact application source
`538edd25afa49f62c13e93745b322099f662791d` through protected run
`36788698617` as initial Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8`.

The current map follow-up merged through #242-#246 at exact application source
`560a9bb409a92036996e391500ec36b1d7b0e728`. Exact-merged-main validation run
`36887570850` passed 119 test files / 746 tests plus lint, typecheck, aircraft
metadata, country allocations, vessel photos, orbital catalog/history,
orbital enrichment, build, PWA retirement build, and deployment dry-run.
Production run `36887715303`, successful attempt 2, passed every deployment
step as Cloudflare version `6b6043b8-3a14-49c0-8af3-b5843f8eb09f`.

The vessel fixture used the production MapLibre image/symbol path for all nine
exact source-truthful classes at 26/29/36/45 CSS px, DPR 1/2, both themes,
0/45/90-degree headings, live/stale/selected/stopped states, desktop/mobile
layouts, picking, and style rehydration. At 26 CSS px / DPR 1, maximum
pairwise silhouette IoU was 0.74813, minimum normalized symmetric difference
was 0.25187, broad hull classes differed in at least three longitudinal width
bands, and minimum identity-feature thickness was 5 CSS px.

The #240 maritime-blue follow-up repeated that production-path fixture in
Chrome `154.0.8037.59` after replacing the hourglass-like passenger outline
with a broad-forward, continuously tapered ferry and adding coarse
container-bay, passenger-deck, tanker-manifold, and tug-wheelhouse line art.
All eight desktop/mobile theme and DPR scenarios retained one map and canvas,
picked every fixture marker, restored exact Light -> Dark -> Light image bytes,
kept attribution visible with no clipping or overflow, and added zero
aircraft, marine, orbital-catalog, search, or metadata requests. The unchanged
morphology gates still measured maximum IoU `0.74813` and minimum symmetric
difference `0.25187`.

The #250 smaller-marker follow-up changed only the vessel layer multiplier
from `1.04` to `0.86`, moving the natural rendered range from roughly 26-45 to
22-37 CSS px while preserving the provider-derived relative scale. The same
deterministic morphology gates pass at the new 22 CSS px DPR 1 floor.
Exact-production Chrome `154.0.8037.59` on source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` then rendered all nine classes
at 22/24/30/37 CSS px across DPR 1/2, both themes, headings, state overlays,
1280x900, 390x844, and 390x568. Every fixture marker remained pickable in all
eight scenarios, every selected halo and stopped badge remained independent,
exact Light -> Dark -> Light restoration retained one map/canvas/source/layer
set, attribution stayed visible without overflow, and the fixture added zero
protected provider/search/catalog requests or browser errors.

The reopened #250 acceptance exercises physical length rather than only
fixture size. Unit tests lock a monotonic 0.8-1.6 model scale from valid AIS
reference-point length, the explicit 40 m unknown fallback, and the large-hull
cap. Each of the nine silhouette contours is normalized to the same
longitudinal source span before the physical scale is applied. Exact production
source `bba0bf4f7a69939e3c07fbeb24470fa959f6f20a` supplied 27 current
GeoJSON vessel features that matched the bounded live AIS dimension sample by
MMSI, image ID, and normalized marker scale. The retained visible-span
measurements were monotonic from 60 m / 22.97 CSS px through a 126 m tug /
29.08 px, 193 m passenger ship / 35.29 px, and 213 m / 37.14 px. One canvas
persisted; one prior 100 m sample vessel had left the current source and was
excluded rather than inferred.

Production Chrome `154.0.8037.59` orbital acceptance passed 27/27 checks:

- zero catalog requests before enable, exactly one fixed negotiated same-origin
  request after enable, zero browser CelesTrak requests;
- public schema/source contract 2, catalog `celestrak-curated-v1`, 462 records,
  canonical bootstrap digest
  `5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`,
  and no exposed internal envelope;
- one canvas and one active orbital worker;
- live tiers of 192/450 at raw zoom 1.5, 384/450 at zoom 3, and 450/450 at
  zoom 4.5;
- all 24 pages, exact name/NORAD/designator query, exact type/group filters,
  unavailable-position handling, selected exception without camera movement,
  and origin-row focus restoration;
- style rehydration preserving 450 source features, 193 shown IDs, highlight,
  selection, and request count;
- 390x844/390x568 final-row and attribution reachability by wheel, Page Down,
  Tab, and trusted touch, with no horizontal overflow and a trusted touch drag
  moving the map;
- independent aircraft, marine REST, and MQTT operation, followed by truthful
  traffic pause at an intentionally ineligible world view;
- no runtime exception, console/log error, critical HTTP failure, or network
  failure.

The #239 compact-count and featured-object follow-up then exercised the built
Worker route in Chrome `154.0.8037.59` with the current 462-record bootstrap.
The world tier reported `ORBITS · 192 SHOWN · 0 PASSES ≤90M`; a later mobile
view kept both the rendered count and a nonzero pass count visible in the
collapsed Operations row. The one existing point layer retained all 454 safe
current features and exposed exactly two reviewed featured properties:
`HUBBLE` for NORAD `20580` and `ISS` for NORAD `25544`. Its icon-size
expression used `1.08` only for those features versus `0.72` ordinarily, and
the active `Noto Sans Regular` stack rendered both labels in the 1280x900
world view. The run kept one canvas through Dark theme restoration, made zero
catalog requests before enable and one after enable, made zero browser
CelesTrak requests, added no request on theme change, kept the 390x568 controls
at 329.4375 px within the 329.44 px budget with attribution visible, and
reported no runtime/log/HTTP error or long task over 50 ms.

The #241 Home-framing follow-up used a deterministic six-aircraft browser
fixture in Chrome `154.0.8037.59`. Initial desktop load, desktop Center after a
manual camera change, and mobile 390x568 Center matched MapLibre's exact 30 km
`cameraForBounds` result with zero zoom or center delta. Each differed from the
former 20 km fit by `0.5849824` zoom levels, the expected `log2(1.5)` framing
ratio. The complete desktop/mobile canvases remained within 71.64/76.35 km of
Home and therefore below the unchanged 100 km eligibility limit. Six aircraft
rendered in each view; the provider path used one outward-rounded `34 NM`
request, and the manual camera change, Center, and resize added no second poll
inside cadence. Both layouts retained one canvas, visible attribution, no
document overflow, and no runtime or browser-log error; the mobile controls
measured 329.4375 px inside the 329.44 px 58vh budget.

The exact production rerun repeated those three focused surfaces against the
deployed bundle. All eight vessel desktop/mobile theme/DPR scenarios passed;
the world orbital view reported `ORBITS · 192 SHOWN · 0 PASSES ≤90M` from 454
safe current positions with exactly the reviewed `HUBBLE` and `ISS` labels;
and desktop/mobile Home/Center matched the exact 30 km fit with one
outward-rounded `34 NM` deterministic aircraft request. One MapLibre canvas,
visible attribution, zero fixture-added provider/search/catalog requests, and
zero runtime/log/HTTP errors persisted. The measured record and four hosted
screenshots are attached to
[#246](https://github.com/vasilyevstan/LiveTrafficStan/pull/246#issuecomment-5935337522).

The coordinated #267 production acceptance then covered the four follow-up
surfaces on exact source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`:

- a retained paused view exposed **Resume live**, returned from zoom `5.6` to
  `8.9776297284`, rendered four aircraft and 28 ships, issued one `34 NM`
  request, retained one canvas, and produced no runtime/log error;
- the vessel lifecycle check rendered 21 current ships across generic, cargo,
  tanker, and passenger images, confirmed all nine image IDs remained
  installed through Light -> Dark, retained one desktop/mobile canvas,
  attribution, and no overflow;
- the eight-photo fixture loaded every immutable current-generation asset,
  distinguished invalid from valid-but-uncovered IMO, fenced A-to-B-to-A
  identity, retained desktop and 390x844/390x568 reachability, and made no
  external photo-provider request;
- isolated Starlink acceptance made zero request before enable and one `200`
  afterward, zero browser CelesTrak requests, reached rows 141-150 on page 8,
  showed owner-correct details without inferred purpose/image, reproduced
  Light checksum `208192691` after Dark checksum `162519703`, retained one
  canvas and one active physical orbital worker, and moved the map by trusted
  touch at 390x568 with no exception, log error, or failed response.

The canonical deployment required three attempts for independent infrastructure
transients, not application changes: run `36996396517` met the recurring OCI
aircraft-path `502`; one documented diagnostic reboot restored real JSON.
Run `36997137283` then met one AWC METAR `504` after aircraft passed; both
production and direct AWC recovered immediately. Run `36997443034` passed the
complete smoke. Target-aware rollback run `36998162009` and exact-current
restoration run `36998245095` passed afterward.

The scheduled-provider acceptance used one attached read-only observer and no
manual acquisition. The pre-boundary `12:17:59.818Z` control remained the
bootstrap. For the first eligible ordinary `22:17Z` Cron, a route request that
began 1.331 ms before the nominal `22:18Z` observer target completed afterward
and still returned bootstrap; attempt 2 at `22:19:00.327863Z` returned
`source=kv`, exact release `bba0bf4f...`, GP retrieval `22:18:01.730Z`,
SATCAT retrieval/publication `22:18:02.211Z`, population 11,125, sample 150,
and digest/weak ETag
`3cd7476fd7d42aed1772a85d4f81c27322c73b088bf58ff217e39454f425f0d7`.
The response headers/body were retained byte-for-byte, and a bounded
provider-contract review found no blocker.

The unchanged-tree hard-cap benchmark used 512 records / 501 safe current
positions. Preparation took 19.4 ms; search p95 was 1.9 ms desktop / 5.6 ms at
4x CPU, filter p95 1.5 / 6.8 ms, position tick p95 3.1 ms, complete prediction
p95 478.7 ms, and latest-request acknowledgement 15.7 ms. There were zero
tasks over 50 ms. The 602.74-second soak retained one canvas, one active
orbital worker, one request, and bounded heap/listener/timer counts.

The first ordinary admitted schema-2 KV publication was retrieved at
`2026-10-01T02:17:32.034Z` with `462` records and digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`;
the atomic schema-1 member had `156` records and digest
`018ee9ff6c9c161485f37f5a22cfaa5a6fdd2524a4ae7fc49a12947c4478e2e5`
at the same retrieval time. Protected rollback run
`36807920596` and restoration run `36808295755` proved target-aware
schema-1 rollback followed by immediate reuse of the retained schema-2 KV
bundle as restored Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8`.

The current traffic-recovery rollback target is source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` and Cloudflare version
`d83f68ae-907e-4b2d-a086-00b4fde00372`. Public Wiki commit
`bac76a2994a09e85e1162c5724a6071f0fc35540` synchronizes the current release
identity, recovery and physical-size behavior, eight-photo coverage, browser
measurements, scheduled Starlink publication, relay recovery, and
rollback/restoration evidence.

No `xcrun simctl`, Android emulator/`adb`, hosted-device credential, or
physical iOS/Android device was available. Chrome DPR, touch,
visual-viewport, and CPU evidence is recorded as real Chrome evidence and is
not mislabeled as physical-device acceptance.

### Issue #162 development acceptance evidence

On 2026-09-28, the built client was exercised through local `workerd` in
Chrome 153 at desktop 1280x900 and emulated mobile 390x844:

- zero catalog requests and no orbital propagation worker existed before
  enable;
- first enable made one same-origin `200` catalog request, no CelesTrak browser
  request, and added exactly one worker target;
- the local Tallinn view truthfully returned one future crossing and no current
  object at that instant;
- zooming to the complete Mercator world paused aircraft/ships while listing
  156 valid current modeled objects without a crossing rank;
- A to B to A selection ended on A, selected details retained exact type,
  element/retrieval/modeled times and limitations, and Dark reinstallation
  preserved the selection with one canvas and no catalog request;
- hide removed the one orbital worker and selection; re-enable restored 20
  bounded results from the current-tab snapshot with no second catalog
  request;
- the open mobile Operations body measured 289.52 px against a 489.52 px
  58vh limit, attribution remained visible, one real CDP touch drag changed
  the shared camera, and one canvas remained;
- the console reported no error or runtime exception;
- a 60-second 4x-CPU idle trace while ORBITS remained active recorded no
  main-thread long task over 50 ms.

A separate real module-worker benchmark used 256 validated records, 4x CPU
throttling, and 25 samples. Current-position p95 was 1.8 ms; worst-case local
90-minute prediction p95 was 83.4 ms with a 93.9 ms maximum.

The final ten-minute lifecycle soak ran 20 enable/disable and Light/Dark cycles
at 30-second intervals. It made zero additional catalog requests and recorded
no runtime exception or console error. The first warm-up cycle added 20
listeners and 256 nodes; cycles 1 through 20 then remained exactly flat at two
documents, two frames, 304 listeners, 1,553 nodes, three worker targets, and
one canvas. Forced-GC used heap fluctuated non-monotonically between 22,778,508
and 24,040,232 bytes after warm-up and ended at 23,919,084 bytes.

The exact enabled Wrangler configuration was also generated with a synthetic
32-hex namespace ID and passed `wrangler deploy --dry-run`, exposing exactly
one `ORBITAL_CATALOG` KV binding, one SQLite
`ORBITAL_CATALOG_COORDINATOR`, the fixed VPC/static-asset bindings, release and
delivery variables, and the checked Cron configuration without credentials or
deployment.

These remain reproducible development checks rather than physical-device
evidence. Production source
`46cb2007bc0cc27d1905fab32db6149a91d17576` subsequently passed:

- exact-current-main deployment and full smoke in run `36487869446`;
- fresh-profile public-browser acceptance with one same-origin request, zero
  CelesTrak browser requests, one canvas, 156 whole-world modeled objects,
  style/selection/touch continuity, and no orbital exception or long task over
  50 ms;
- namespace-preserving pre-orbital compatibility rollback, Cron removal,
  target `404`, and target smoke in run `36488117751`;
- exact-current-main restoration, Cron `17 */2 * * *`, KV namespace
  `59178d55418247c4bab473b52a5dc07d`, and full smoke in run `36488245592`.
- bounded observation of the first eligible `22:17Z` Cron window from
  `22:19:30Z` through `22:31:54Z`; the endpoint remained on the exact validated
  bootstrap, so that release claimed no successful KV publication and #162
  remained open until the later receiver-safe repair and ordinary KV proof.
- comprehensive public Wiki synchronization in commit
  `c2f91bdd74f13b78e20cc3ad50f296b5de94a54b`, including focused orbital and
  infrastructure pages plus the related architecture, provider, testing,
  release, troubleshooting, accessibility, and roadmap updates.

The later enabled-state visibility release is production source
`94c1d35b3687cd26b4d0445005eaf38edfbf7964`, deployed by run `36554328684`
as Cloudflare version `50b2a0a0-b09d-4e7d-8851-61c0817c07cc`. Fresh-profile
acceptance at 1280x900, 390x844, and 390x568 proved:

- the isolated post-release view showed
  `ORBITS · 0 IN VIEW · 0 PASSES ≤90M` before opening More;
- **VIEW** opened the existing disclosure and focused the ORBITS toggle because
  the current result list was empty;
- exactly one same-origin catalog request and zero browser CelesTrak requests;
- one MapLibre canvas, no horizontal overflow, and attribution visible;
- 156 visibly rendered points at explicit whole-world zoom `0`;
- no orbital runtime exception.

Deterministic tests and the clean local production build separately proved
`0 IN VIEW · 1 PASS ≤90M` and focus transfer to COSMOS 2550. The crossing
result is time-anchored and had expired before the isolated production rerun.

Public Wiki commit `bc45563e666d1a5622a9fd29f16771faf1fea2a2`
records that historical visibility release, accessibility, map,
troubleshooting, and operations evidence. Its deployment smoke's independent
aircraft-relay 502 did not invalidate orbital acceptance.

The primary-control/status release is production source
`cea3a1f553266a0c4d21e90506904aed6f484887`, deployed successfully by run
`36589814477` as Cloudflare version
`2fe26151-d18e-4994-a147-887014d84af0`. Fresh rendered acceptance proved:

- exactly one primary ORBITS toggle beside AIRCRAFT and SHIPS, with no
  duplicate under **More**;
- matching compact Operations and upper-left summaries, while the mirrored
  visual clause stays out of duplicate ARIA live announcements;
- zero catalog requests before enable, one same-origin request after enable,
  and zero browser CelesTrak requests;
- focus-safe **VIEW** with no second request, selection, or camera movement;
- one unchanged MapLibre canvas;
- `LIVE / 4 aircraft / 33 ships shown`, with four visible aircraft markers;
- a 16 px brand/control gap at 1024, 900, and 761 CSS pixels;
- 390x844 and 390x568 controls within the exact 58vh bounds, four primary
  controls on one row, no horizontal overflow, and attribution retained;
- no runtime exception.

The first same-source deployment exposed recurrent private-relay guest/network
unavailability and failed only at post-deploy aircraft smoke. After the
supported diagnostic reboot, production progressed from `502` through bounded
`503 Retry-After` to real `200` JSON. The canonical deployment rerun passed, as
did a controlled relay-service restart and post-restart exact smoke. #174 is
closed. Public Wiki commit
`abb4e21ae4c6225d9530675ce66cb9f3c4bc443e` records the same release,
responsive, accessibility, operations, and recovery evidence.

The first #194 compact-control acceptance used only emulated layout viewport
sizes and a bounds-only visibility assertion. A later real-device report showed
that it had not proven the shorter visual viewport below mobile browser chrome,
and the assertion could miss a sticky task selector covering the final result.

Corrective #194 development acceptance uses a deterministic 24-object crossing
fixture in Chrome 153. At 390x844, 390x568, and a requested 315x517-class view
(reported by headless Chrome as 315x526 with a 525.206 px visual viewport), it
renders all 20 bounded results inside one Operations scroll owner. The last
result is fully bounded, topmost under `elementFromPoint()`, and reachable by
touch, wheel, Page Down, and 25 Tab steps; task labels remain unclipped and the
orbital list remains unbounded and overflow-visible. The control stacks measure
489.515625 px against 489.52 px, 329.4375 px against 329.44 px, and
304.609375 px against 304.6197 px respectively.

A separate run keeps the layout viewport at 844 px while forcing
`window.visualViewport.height` to 517 px. The app writes 517 px and 299.86 px
CSS variables, keeps the controls at 299.859375 px, and exposes the unobscured
final result after 958 px of outer scrolling. Both runs retain one MapLibre
canvas, one catalog request, zero browser CelesTrak requests, no horizontal
overflow, and no console or runtime errors. Physical iOS Safari and Android
Chrome remain explicit outstanding evidence rather than an inference from CDP.

The historical corrective #194 release source was
`bb9829bd0bb59c819b936777fe4e2cdfe32239a3`; exact merged-`main`
validation run `36619407782` passed, and canonical deployment run
`36619533493` passed full smoke and published Cloudflare version
`49c704b3-47ec-47b4-b30b-9483dbd35564` with client asset
`assets/index-On-Ohfl9.js`.

The strengthened acceptance was repeated against that deployed production
bundle. It exposed all 20 results through the one Operations scroll owner at
390x844, 390x568, a 315x517-class view, and an 844 px layout / 517 px visual
viewport mismatch. The final result remained topmost under hit testing; task
labels remained unclipped; and the bundle retained one canvas, one catalog
request, zero browser CelesTrak requests, compact attribution, and no console
or runtime error.

Public Wiki commit `c67b33036d63c095e3aadc5d19e492d3aeb53665`
records the same visual-viewport contract, production identity, rendered
evidence, and troubleshooting guidance.

### Issue #193 release acceptance evidence

The exact-NORAD enrichment release is source
`96d67b6da3e395be79acff27b47ad6dee34de309`, delivered through feature PR
#212, zero-tree ancestry PR #213, and release PR #214. Exact merged-`main`
validation run `36626910897` passed. Canonical deployment run `36627748051`
passed full smoke and published Cloudflare version
`3d6c692e-1a29-4fa4-bbee-2ab5545d9d57`, client asset
`assets/index-Cl87tlUV.js`, and deployed `index.html` SHA-256
`140921b505e2043ded16a4ebb09c11a30c4a5f7b8f4d4b8f55120c5bb7f9b97d`.

The release validation covered 115 Vitest files and 682 tests, lint, strict
TypeScript, aircraft metadata, country allocation, vessel-photo, orbital
catalog, orbital-enrichment, airport, and port integrity, normal and
PWA-retirement builds, and both deployment dry runs. The generated
application shell contained 11 URLs and 2,619,551 bytes; both enrichment
images remained excluded.

Cache-disabled public-origin Chrome 154 acceptance used real current Hubble
`20580`, ISS `25544`, and rocket body `733` map features:

- zero enrichment-image requests before selection;
- exactly one uncached same-origin `Fetch` per reviewed asset, both
  `200 image/jpeg`, outside disk cache and the Service Worker;
- exact 46,716-byte/437x640 Hubble and 48,741-byte/640x425 ISS responses with
  `public, max-age=31536000, immutable`;
- the identical validated ISS Blob URL in details and the later tooltip;
- no hover, theme, re-selection, fallback, or NASA runtime request;
- exact A-to-B-to-A purpose/image fencing and truthful rocket-body fallback;
- a forced terminal image failure that remained unavailable and did not retry;
- one unchanged MapLibre canvas, no same-origin failure, no runtime exception,
  and no console error.

At 390x844, the details panel measured 303.828125 px, the image
159.984375 px, and scrolling reached the exact 931 px maximum. At 390x568,
the corresponding values were 115 px, 87.984375 px, and 1,048 px. Both kept
horizontal overflow false and source, rights, map attribution, and one canvas
reachable.

First deployment run `36627068064` deployed the exact source and healthy
enrichment assets as Cloudflare version
`7b1233c9-3461-440b-ac5f-1d30b02c0525`, then failed only on the recurrent
aircraft-relay `502`. The supported diagnostic reboot recovered real ADSB JSON;
the canonical same-source rerun passed without rollback or application change.
#174 records the recovery and is closed.

Public Wiki commit `1cedad08275d9e162aab618bea0af2e0bbf4cb43`
synchronizes the exact identity, source/rights, request boundary, production
measurements, relay recovery, troubleshooting, accessibility, and release
evidence.

### Issues #210, #134, and #221 release acceptance evidence

The earlier exact production source
`18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8` combines the accepted symbol
release and fail-closed deployment-smoke fixes. Feature/release PRs #218 and
#220 delivered the map images; PRs #222 and #224 delivered the smoke policy.
Exact merged-`main` validation run `36641143297` and canonical deployment run
`36642794309` passed 116 Vitest files / 694 tests, lint, strict TypeScript,
all release data checks, production build, Worker dry run, exact deployment,
smoke, and deployment recording. Cloudflare version
`fea1642f-8b45-4801-89ae-d2a9dca554a6` serves client asset
`assets/index-8clesHre.js`; deployed `index.html` SHA-256 is
`8f7da07d43d096de68adde373597d3f337ff46ec07557e429977cfa114bc16b1`.

Fresh-profile public-origin acceptance proved:

- a live Helsinki source with 11 rendered vessels across generic, cargo,
  tanker, and passenger classes while all nine generated vessel image IDs
  remained installed;
- one persistent vessel symbol layer driven by application-owned
  `markerIcon`, one canvas through Light -> Dark restoration, no horizontal
  overflow, and visible attribution at desktop and 390x844;
- one orbital symbol layer driven by exact SATCAT class, all four generated
  orbital images installed, 156 whole-world source features, and recognizable
  payload/rocket-body profiles instead of circles;
- zero catalog requests before enable, one same-origin request after enable,
  zero browser CelesTrak requests, A-to-B-to-A selection, theme restoration
  without refetch, hide/show, touch movement, visible attribution, and bounded
  Operations controls at 390x844 and 390x568;
- zero four-times-throttled orbital-idle tasks over 50 ms during 60 seconds;
- no browser runtime exception. Ordinary aircraft polling encountered a
  truthful local admission `503`; it did not remove marine or orbital data.

The matching OCI relay runs source `18082a1e...`, retains `1f9a2fd...` as
rollback, and passed exact provider-free health with active/enabled systemd
state. A bounded public proof returned real aircraft JSON, then
`503 Retry-After: 20` with
`X-LiveTrafficStan-Relay-Status: admission`, then real JSON after the advised
wait. The Worker propagation helper retries only an otherwise accepted stale
canonical release SHA on the 0/1/2/4/8/15/30-second schedule. Private-relay
smoke retries only marked local admission, for at most twelve attempts,
330 seconds of guided sleep, and nine minutes end to end, while still
requiring eventual real `200 application/json`.

Public Wiki commit `7bb657c8b90fda6150860f5dcba22010cf9cdf8d`
synchronizes Home, map experience, architecture, infrastructure, orbital,
testing, troubleshooting, and release operations with this exact evidence.

Physical iOS Safari, Android Chrome, and supported-device drag-FPS evidence
remain outstanding and must not be inferred from CDP emulation.

Repeat the core check with `npm run build && npm run preview`. Confirm that
`dist/assets/` contains a `maplibre-gl-worker-*.js` file and that the preview
page renders vector tiles. Also confirm the immutable metadata index and one
shard are present in `dist/aircraft-metadata/`, and the exact immutable
`dist/ports/natural-earth-v5.1.2-v1/ports.geojson` and
`dist/airports/ourairports-2026-09-19-v1/airports.geojson` assets are present.
Confirm that a separate `orbital.worker-*.js` asset exists and is listed in
the bounded generated shell without any `/api/orbits/catalog` or
`/orbital-data/` response. This catches easy-to-miss MapLibre/Vite worker,
orbital worker, or static-dataset packaging regressions.

For the production edge boundary, run `npm run preview:worker`. Confirm:

1. `/` returns the built client.
2. The emitted MapLibre worker uses immutable caching and `nosniff`.
3. A missing hashed asset returns 404 rather than HTML.
4. Invalid aircraft coordinates return 400 and unsupported API paths return
   404 without an upstream request.
5. One valid fixed-route aircraft request succeeds with the public project
   User-Agent.
6. Worker responses use no-store and expose no CORS wildcard.
7. A canonical encoded METAR request returns bounded JSON or 204 with
   `nosniff`; malformed IDs, raw commas, extra parameters, unsupported methods,
   redirects, timeouts, oversized responses, unsafe content types, and missing
   API paths are rejected without an open forwarder.
8. With the committed default flag, `/api/orbits/catalog` returns `404`. With
   the explicit local enabled command, default exact `GET` returns the newest
   valid schema 1 and its matching ETag returns `304`; the same literal route with
   `Accept: application/vnd.livetrafficstan.orbital-catalog+json;version=2`
   returns schema 2 and its separate matching ETag returns `304`. Both include
   `Vary: Accept`. When schema 2 comes from KV, production smoke requires the
   default schema-1 retrieval to be at least as current and to contain the
   schema-2 `visual` population. Cross-representation ETags must return `200`;
   query strings, other methods, missing assets, or invalid stored snapshots
   cannot trigger CelesTrak work.

Rollback smoke uses the current checked policy with the checked-out target's
orbital module. Deterministic fixtures cover disabled, schema-1-only,
schema-2-only, and dual-representation targets. Single-representation targets
use only their own schema version, source-contract version, byte limit,
bootstrap path, and ordinary validator; they are not required to export the
current vendor `Accept`, legacy validator, or `Vary: Accept`. The dual fixture
locks both validators, distinct representation ETags, conditional `304`s, and
cross-representation `200`. Each fixture has a fixed same-origin request count
and makes no provider request.

Do not repeatedly use the local edge check as a provider load loop. All path,
timeout, body-size, redirect, status, `Retry-After`, and cancellation cases use
mocked deterministic tests.

## Production deployment validation

The production workflow is manual, exact-SHA, and restricted to the GitHub
`production` environment on `main`. It reruns the full suite and Wrangler dry
run before deploying, then rechecks that the requested SHA is still the current
`origin/main`.

The post-deploy script compares public `index.html` and the dynamically named
MapLibre worker with the validated local bytes. It then checks one ADSB request,
proxy rejection paths, Digitraffic REST/preflight, and one bounded MQTT
subscription. The MQTT client disables reconnect and is force-closed.

This automated check does not replace a real browser acceptance pass for vector
tile rendering, Web Worker execution, browser WSS, themes, attribution,
provider isolation, and mobile layout. V1.5.3 passed that production
acceptance at <https://livetrafficstan.syntal.workers.dev>. V1.6.0 additionally
passed rendered acceptance for explicit plausible-route request, refresh,
wording, and attribution behavior. Application source
`86d8395c61c1348d3de8e11a9d7b36ad4f6271cc` passed selected-details
vessel-photo acceptance for all five matches, unmatched/invalid omission,
A-to-B-to-A identity, immutable headers, no external photo-provider requests,
one MapLibre canvas, and reachable desktop/390-pixel controls and attribution.
Application source `d56f8900d25bd57338c459487df6b992edab62f4`
additionally passed exact production stable-hover acceptance: zero image
request before 500 ms, exact Finlandia image/source/rights afterward,
focus/pointer/Escape behavior, stale-marker cleanup, unmatched omission, one
MapLibre canvas, and no external image-provider request or browser diagnostic.
Exact-main validation run `36265842006` and deployment/smoke run `36266052761`
passed. Later behavior changes still require fresh browser evidence.

Production source `1f9a2fd322f141fe761d3bf00113e1ab60526e6c`
then passed exact-main validation run `36268497210` and private-relay
deployment/smoke run `36268576908`. Browser acceptance observed
`503 Retry-After: 19` followed by exact-release `200` responses, four real
aircraft, one MapLibre canvas, and no horizontal overflow at 1280x900 or
390x844. It also proved select-first/hover-second aircraft-photo publication:
zero selection/sub-dwell requests, exactly one stable-hover request, and the
same image/source in the already-open details panel without a duplicate
request.

Application source `3370dfe3f1cc2614feff894643ed865978ec7edc`
then passed exact-main validation run `36299844911` and deployment/smoke run
`36299895010`. Rendered acceptance selected live `BTI877`, observed exactly
one standing-route request and TLL to BCN, then observed no second route request
after an aircraft polling refresh. Selecting live `FIN7DE` rendered HEL to TLL.
Desktop and 390x844 retained one MapLibre canvas, zero horizontal overflow, the
compact non-filed-plan caveat, and both route attributions.

The [OCI Aircraft Relay](oci-aircraft-relay.md) canary passed exact relay
health, authenticated Worker-to-relay transport, real provider JSON, service
and VM restart recovery, four QUIC connections, no public listener or sensitive
application logging, and zero projected incremental cost. A 70-second resource
sample measured 0.2374% combined relay/cloudflared CPU, approximately 65 MB
combined service memory, zero service restarts, zero swap, no OOM evidence,
and approximately 460 MB available memory.

## Failure and lifecycle checks

Browser developer tools can block one provider at a time:

- block `/api/aircraft/*` and confirm marine traffic remains usable;
- block `meri.digitraffic.fi` REST/MQTT access and confirm aircraft remains
  usable;
- block OpenFreeMap and confirm controls/status remain available with a compact
  map error.
- block `/ports/*` and confirm only the optional port status fails; the map,
  both traffic providers, vessel filters, and traffic selection remain usable.
- block `/airports/*` and confirm only the optional airport status fails; the
  map, traffic providers, aircraft search, ports, and traffic selection remain
  usable.

When changing map initialization, also exercise a deliberately throwing map
constructor. Confirm that `Map unavailable` is visible, sibling controls remain
usable, and no map listener, animation loop, retry, or cleanup method runs
without an instance.

Restore access and confirm the provider returns to current state without a page
reload. While the Network panel is open, hide the page or make the viewport
ineligible long enough to confirm aircraft polling and the marine connection
stop, then restore an eligible visible state and confirm recovery at the next
permitted provider boundary. Combine both pause reasons in both orders. Do not
describe provider-safe cadence, `Retry-After`, MQTT reconnect spacing, or
five-minute REST/metadata gates as immediate.

## Provider contract probes

Provider behavior changes over time. When modifying an adapter, recheck the
official documentation in `docs/data-sources-and-licensing.md` and use small,
rate-conscious live probes. Do not put captured live payloads containing
unnecessary data into the repository; reduce fixtures to only fields required
by the test.

For Photon, use one real browser-origin search per acceptance run rather than a
live loop. Confirm HTTP/JSON success, current CORS behavior, no credentials or
custom browser `User-Agent`, the configured five-result bound, visible
Photon/OpenStreetMap attribution, and that a repeated normalized query is
served from memory. Simulate timeout, `429`, invalid GeoJSON, oversized bodies,
and outage locally. A synthetic `Origin` request can inspect headers but does
not replace a real browser CORS check.

Aircraft-photo changes use synthetic Planespotters responses for every repeated
case. Run an evaluated build only when a new bounded live check is explicitly
authorized:

```bash
VITE_AIRCRAFT_PHOTO_ENABLED=true npm run dev -- --host 127.0.0.1 --port 5174
```

The Node/Vitest suite does not mount MapLibre or prove pointer timing and popup
reachability. Before any live aircraft-photo request, use the milestone CDP
browser fixture to prove that aircraft selection, HISTORY, and sub-dwell
aircraft hover make zero aircraft-photo requests; explicit action or one
stable 500 ms aircraft hover makes one; selecting first and then resolving the
same exact aircraft through hover publishes the successful/no-photo cache entry
into the already-open details panel without another request, including after
Strict Mode cleanup/re-subscribe; A to B to A cannot publish a stale result;
the popup remains reachable for its exact thumbnail link; direct thumbnail/
link/credit semantics pass; errors remain local; and no provider content
reaches Web Storage, IndexedDB, Cache API, or service-worker caches.

One bounded browser-origin request is the ordinary acceptance budget unless a
later Issue explicitly authorizes another. Record the application origin,
ICAO24, request count, CORS result, response shape, exact returned origins,
image load, credit, and source-page link without committing the provider
payload or image. The earlier 2026-09-21 local-origin failure was superseded by
the 2026-09-23 production-origin acceptance for `4CADF9`: readable HTTP 200
JSON, one unchanged `t.plnspttrs.net` thumbnail rendered at 200 by 137 pixels,
and exact credit/source navigation. Do not substitute a Worker proxy because
the selected provider terms prohibit proxying and re-exposure.

Vessel-photo acceptance requires no live image-provider request. Run
`npm run check:vessel-photos`, build the exact application, and use
deterministic live-vessel fixtures for all eight reviewed IMOs plus one valid
unmatched and one invalid IMO. Confirm exact image bytes, immutable headers,
source/license navigation, explicit invalid/unmatched unavailable wording, no
horizontal overflow, and no stale hull across A to B to A selection at desktop
1280x900 and mobile 390x844 and 390x568. At desktop width, prove a sub-500 ms
hover adds no image request, a stable matched hover loads only its same-origin
`/vessel-photos/` asset and presents the fixed-source/rights context, and
unmatched or stale identity hover stays photo-free. HISTORY, search, and
unmatched selections must add no image request, and no scenario may contact
Wikimedia, Wikidata, or a tracker.

Use local fixtures, fake clocks, fake maps, mocked fetch, and mocked MQTT for
repeated lifecycle checks. A milestone needs one bounded real-provider browser
smoke, not repeated live loops for scenarios that deterministic tests can
prove.

For a bounded Digitraffic stream measurement in development, use one ordinary
application tab:

```text
http://127.0.0.1:5173/?marineDiagnostics=1
```

The opt-in collector observes the existing provider instance. It creates no
client, subscription, request, timer, payload archive, identifier inventory, or
telemetry upload. Once per minute and on final provider shutdown it writes one
aggregate JSON snapshot to the console and page title. Use a fixed eligible
view and record the source SHA, UTC interval, browser/platform, and limitations.

Message and payload-byte totals describe the full Digitraffic wildcard stream,
not the current viewport. Payload bytes exclude MQTT/WebSocket/TLS framing and
compression. Provider-emitted vessel counts are query-circle values before
exact viewport and user filtering. Never present one trace as a load test,
coverage census, SLA, or cross-provider benchmark.

## Dense vessel-filter measurement

On 2026-09-19, a deterministic fixture measured one full local search,
category, navigation, reported-speed, minimum-length, maximum-length, and
result-ordering pass after 20 warmups over 200 iterations:

| Fixture | Matches | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| 2,000 vessels | 45 | 0.396 ms | 0.430 ms | 0.529 ms |
| 5,000 vessels | 118 | 1.004 ms | 2.471 ms | 2.822 ms |
| 10,000 vessels | 232 | 2.077 ms | 2.402 ms | 5.266 ms |

This Node 24 / Vitest 5 measurement proves the deterministic filter path is
small on the test machine. It is not browser input-to-paint evidence, a provider
load test, or a device-wide performance guarantee. Browser acceptance still
records input timing, paint, and long tasks with the actual MapLibre view.

The production-preview browser fixture then rendered 2,000 current vessels
(1,513 passing the default filter). Four local search updates settled React and
MapLibre within three animation frames, measured at 33.3-49.6 ms, with no
reported long task. Search/filter/reset/hide operations left one aircraft
request, one marine location request, one metadata request, and one MQTT
connection unchanged. This is representative acceptance evidence on the test
machine, not a universal frame-time guarantee.

The same browser pass proved zero port requests while disabled, one request on
first enable, fulfilled-cache reuse after hide/show and Light/Dark style
rehydration, traffic-first picking at an overlapping Tallinn point, ports-only
picking with traffic hidden, selection clearing, 503 isolation and retry, and
disabled-error cleanup, plus source/detail visibility at 390x844 and 390x568.
A Natural Earth asset failure left one MapLibre canvas and all 2,000 marine
fixture records active.

Against exact base `e36eee06144d737998e1d95d8a659deec8e3a927`, the production
build added 19,970 raw / 5,659 gzip-9 bytes of main JavaScript and 2,330 raw /
348 gzip-9 bytes of CSS. The optional port asset is not fetched at startup; it
adds 154,218 raw, 22,482 gzip-9, or 18,429 Brotli-quality-11 bytes only after
PORTS is enabled. The MapLibre worker and MQTT chunk were unchanged.

Production builds must remove the diagnostics query flag, collector, counters,
timing calls, logging, and title changes. Verify this alongside the normal
production build when editing the instrumentation.

## Aircraft and airport discovery measurement

Against exact base `ff592bbef008e0fcc01895ace0e53b5b4050b51e`, the final
production build adds 20,008 raw / 3,670 gzip-9 bytes of main JavaScript and
12 raw / 1 gzip-9 byte of CSS. The MapLibre worker and MQTT chunk are
byte-identical to the base build. The optional airport asset adds 1,329,838
raw or 225,625 deterministic gzip-9 bytes only after AIRPORTS is enabled.

The production-preview browser fixture proved:

- one MapLibre canvas and the emitted MapLibre worker;
- zero airport requests at startup, exactly one request on first enable, and
  fulfilled-session reuse across hide/show and Light/Dark style rehydration;
- a local registration search returning one of three current aircraft without
  changing aircraft, marine, metadata, Photon, or airport request counters;
- selection through the existing aircraft details path;
- Tallinn EETN/TLL details, persistent OurAirports ID, static provenance,
  no-inference wording, keyboard button selection, and focus restoration;
- airport listing and selection remaining usable after zooming out far enough
  to pause bounded live traffic;
- airport failure isolation and successful retry without changing live
  aircraft or map availability;
- no arrival, departure, or board request;
- full-size MapLibre canvases and scrollable/reachable controls at 390x844 and
  390x568; each collapsed panel is at most 112 CSS pixels and the combined
  expanded stack is capped at 58 viewport-height units, leaving a touchable map
  strip while keeping MapLibre attribution reachable.

Local `workerd` returned the airport asset with
`Cache-Control: public, max-age=31536000, immutable` and
`X-Content-Type-Options: nosniff`; a missing airport version returned a true
404 rather than the application shell. The only browser diagnostic was an
external OpenFreeMap font-range 404 already outside this feature boundary.

## Dependency and bundle discipline

Runtime dependencies are intentionally limited to React, MapLibre GL JS, and
MQTT.js. MQTT is dynamically imported because it is needed only after the
marine provider starts. The main MapLibre application bundle is expected to be
large; changes should avoid adding another framework or duplicating mapping,
state, networking, or formatting functionality without a demonstrated need.
