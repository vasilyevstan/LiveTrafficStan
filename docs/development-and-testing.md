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
not emulate the feature-gated orbital KV/Durable Object route or the
supplementary marine WebSocket; use the actual local Worker for those paths.

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
| `npm run check:country-allocations` | Network-free validation of bundled MID/ICAO24 allocations and vessel flag pixels, coverage, license and size bounds |
| `npm run update:country-allocations` | Explicit maintainer regeneration from pinned open-licensed sources and canonical cross-checks |
| `npm run check:orbital-catalog` | Network-free schema-2/canonical-digest validation of the curated bootstrap, pinned probe bytes/hashes/counts, immutable checksum/history guard, and both retained schema-1 rollback contracts |
| `npm run update:orbital-catalog -- --source-dir <probe-dir> --summary <summary.json> --published-at <iso> --output public/orbital-data/<new-version>/catalog.json` | Explicit maintainer normalization of the already-downloaded fixed five-group evidence after exact URL/order/row/byte/SHA-256 checks; never fetches the provider and never reuses a published immutable version |
| `npm run check:starlink-catalog` | Network-free validation of the published shell-balanced Starlink contract, exact retained source evidence, four fixed shell quotas, canonical digest/notice, immutable history, and byte-for-byte schema-1 predecessor |
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

### Multi-source marine acceptance

Build the browser with `VITE_MARINE_SUPPLEMENT_ENABLED=true` and use
`prepare-wrangler-config.mjs --marine-enabled true` for the local Worker
binding. The runtime also requires `MARINE_SUPPLEMENT_ENABLED=true`.
Provider credentials stay in private server-side bindings, never `VITE_*`,
URLs or committed files. Anonymous Open Waters is suitable for a bounded
local check; its lower personal/address limits do not prove production
token behavior.

The deterministic marine tests cover Class A/B and split type 24 messages,
sentinels/full UTC clocks, conservative wrapped boxes, exact identity,
compatible static enrichment, no borrowed movement, metadata-only REST,
per-source failures, pause/retry fencing, multi-view admission, byte/cache
limits, acknowledgements and persisted operational budget deadlines.
History tests cover new licence decisions, old records, the database-version
fence, source-specific trails and no duplicate historical hulls. Cold relay
reconnect tests retain unexpired raw observations and compatible metadata,
do not reset their expiry through repeated disconnects, and verify the
20,000-record output ceiling. Ordinary same-source unknown fields remain
unavailable rather than being revived outside that recovery context.

The 2026-10-04 native-runtime check loaded the unchanged compiled Worker
through Miniflare's v4-to-v5 compatibility converter. Its `scriptPath` option
produced an internal startup error; passing the bundle as `script` succeeded.
The converted Static Assets router then lacked its user-worker binding, so
the local harness served the built files through an `ASSETS` service binding.
This is a local harness distinction, not an application workaround or proof
of production asset routing.

At 23:44:14-23:44:59 UTC, the actual relay delivered a first useful
Gedser-Rugen snapshot after 1.026 seconds, peaked at 81 vessels, and ended with
80 distinct vessels: 15 AISStream and 65 Open Waters position owners. Both
sources were live and the oldest retained position was 592.425 seconds.
Only aggregates were saved. This later window did not establish a qualifying
yacht; do not substitute an older metadata snapshot for current reception.

The first live Chrome/MapLibre pass at 23:47-23:50 UTC rendered 30 Tallinn
vessels (25 Digitraffic, two AISStream, three Open Waters), 12 southern-Baltic
vessels and 785 Rotterdam-area vessels (72 AISStream, 713 Open Waters).
Rotterdam included 141 reported sailing/pleasure craft with known length at
least 8 m. It physically selected stopped 10 m pleasure craft TALISMAN with
Open Waters/AISHub attribution, retained selection/camera through light/dark
rehydration, and preserved vessels during an induced supplemental-transport
outage. It also exposed a cold-reconnect selection loss: the empty new relay
cache was being interpreted as deletion. That finding required the bounded
browser retention fix above; the first pass alone was not complete acceptance.

Real-browser acceptance must use vector tiles and `queryRenderedFeatures`,
physical selection/touch input and measured responsive layout. Preserve
existing screenshots/aggregate evidence when source is unchanged and rerun
only the invalidated recovery/interaction claims after a fix. Production
activation additionally checks actual Cloudflare egress and the protected
Open Waters token; local anonymous success cannot replace that evidence.

The recovery follow-up at 2026-10-04 23:59:51 through 2026-10-05 00:01:11 UTC
rendered 753 real vessels, including 108 eligible yachts, and kept the selected
26 m pleasure craft NEELTJE through the cold reconnect with compatible
attributed metadata. The remaining filter/layout pass at 00:07:16-00:07:35 UTC
used the rebuilt `index-0vgHsY2i.js`, rendered 721 vessels, exercised native
search/Clear, and measured 163 rendered vessels at 390x568 and 161 at 315x517.
Both layouts had no horizontal overflow, one unchanged canvas and no uncaught
exceptions; a physical touch pan changed the camera. The Clear test targets
`#vessel-search + button`, because aircraft and vessel controls intentionally
share presentation classes. This was a harness selector correction, not a
filter behavior change.

Final local gates passed: lint, typecheck, 141 test files / 1,077 tests, aircraft
metadata, country allocations, vessel photos, orbital catalog, normal and
enabled builds, and default/enabled Worker dry runs. Existing source,
dependency and catalog checks are reused; no new framework or dependency was
added.

Production source `65eb71bad7b873c7980096f6e92a477e76fd6102` passed exact-main
Validation `37247107520` and all four protected rollout stages. The actual
Cloudflare source check at 2026-10-05 `00:27:34.685Z-00:28:19.696Z` received an
exact-release `101`, 45 acknowledged snapshots and 1,989,085 decoded bytes.
Both protected providers delivered observed data without source errors.
The final snapshot contained 63 distinct vessels (seven AISStream, 56 Open
Waters), including one reported yacht at least 8 m; first useful data arrived
in 1.504 seconds and the oldest retained position was 594.695 seconds.
Only aggregate receipts were retained. The actual same-source disabled
rollback and final enabled restoration both passed exact-build smoke; see
the [rollout record](hosting-and-deployment.md).

The final actual production-browser pass at `00:33:02.003Z-00:35:12.028Z`
used Chrome 154, native provider traffic and clock, and enabled asset
`index-BzgPcwIW.js`:

| View | Actually rendered vessels | Position owners | Eligible reported yachts in view |
| --- | ---: | --- | ---: |
| Tallinn | 30 | 27 Digitraffic, 3 Open Waters | 2 |
| Southern Baltic | 13 | 13 Open Waters | 0 in this later view/window |
| Rotterdam | 792 | 63 AISStream, 729 Open Waters | 143 |

Both supplementary sources reported live observed data without errors in all
three snapshots, including where fusion selected another source's position.
Actual vector-tile feature counts were 178, 27 and 716; exact-ID uniqueness
and one persistent canvas were checked. The selected real TALISMAN was a
reported stopped 10 m pleasure craft with Netherlands allocation and
Open Waters/AISHub attribution. Its absent valid IMO correctly left the photo
unavailable; no yacht/IMO/class inference was introduced.

Both themes retained selection and exact camera without reconnecting.
An induced supplementary-channel outage kept 792 rendered vessels, and cold
relay reconnect preserved the unexpired selected craft and compatible static
context. Native search/Clear restored the same feed. At 390x568 and 315x517,
175 and 161 vessels rendered respectively without horizontal overflow; native
touch pan changed the camera on the same map. All eight checks passed with no
uncaught browser exceptions. These are Chrome-emulated mobile layouts, not
physical Safari/iOS/Android certification. Overall `PARTIAL` remains distinct
from the two observed live supplemental-source states.
[Screenshots and complete release receipts](https://github.com/vasilyevstan/LiveTrafficStan/pull/326#issuecomment-5986155527)
are public; raw AIS records were not archived.

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
then proves canonical serialization, source-clock order, all four
128-record shell quotas, manifest/notice hashes, the never-reused
`starlink-shell-balanced-2026-10-02-v1` path, and the unchanged
`starlink-2026-10-02-v1` predecessor.

The first published generation validates 11,125 GP and 11,125 SATCAT rows,
8,383,437 decoded source bytes, and zero extra SATCAT rows. The schema-2
bootstrap has 512 records / 254,275 bytes / digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`;
the preserved schema-1 predecessor remains 150 records / 74,982 bytes /
digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.
`scripts/starlink-density-replay.test.mjs` replays both immutable snapshots at
145 ten-minute instants and fixes the Baltic and northern-European
mean/median/p90/maximum/empty measurements.

Starlink deterministic acceptance covers zero request while either parent or
child is off; one same-origin request when effective; no request from camera,
theme, filters, list paging, selection, or style changes; one physical worker
with isolated channel disposal; owner-correct selection/details/tooltips;
Light -> Dark -> Light image replacement; exact type silhouettes; exact
192/384/512 display tiers; all 26 20-row pages and final-page reachability under
the single Operations More scroll owner; desktop/mobile/touch layouts; and
truthful partial operation when either curated or Starlink fails. Route tests
also cover schema-1 default/rollout compatibility, schema-2 negotiation,
representation-specific ETags/`304`, cross-representation `200`, and stale-v2
fallback to fresh schema 1 in one request.

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

## Overall UI redesign (#276)

The first released presentation pass (#280–#282) retained the two-corner
silhouette. The structural correction (#286–#288) replaced that structure on the default,
collapsed screen: a unified full-width masthead, a left desktop layer rail,
and a bottom mobile command dock. More and Settings open adjacent panels or
upward mobile sheets, while search and Center stay in the masthead. The
historical release identities and their evidence below remain unchanged.

### Floating status card (#295, local evidence)

The later explicit request was to remove the full-width upper bar, not merely
make it shorter again. The candidate replaces it with a 280x88 px floating
title/status card and moves the existing location input, Center, results, and
privacy/attribution copy together into Settings. The right desktop buttons and
70 px mobile dock are unchanged.

Chrome 154 measured the card at x/y=16 on desktop and x/y=12 on phones in both
themes at 1280x900, 1024x768, 900x700, 761x650, 390x844, 390x568 and 315x517.
There was no horizontal overflow. The longest status label, CONNECTING,
retained a 25.5 px gap from the title in both themes. The desktop rail began
at y=16. Location inputs remained 44 px tall and unobscured at desktop,
intermediate and short-mobile sizes.

The existing fixture browser harness verified native Enter submission,
coordinate navigation with zero Photon requests, rejected exponent-format
coordinates with zero requests, one explicit named-search request with visible
empty feedback, and Center restoring session Home. It also passed 26-page
Starlink discovery (512 distinct records), selected last-row focus at 315 px,
touch/wheel/keyboard scrolling, visual-viewport mismatch, provider
disclosure/Escape, theme rehydration, attribution, PARTIAL/offline recovery,
HISTORY selection and Return to Live. At 315x517, the selected final row was
61.16 px tall within a 143 px body and remained topmost and focused. HISTORY's
Return button ended at y=486.31 within a notice ending at y=487. There were
124 rendered vector-source features and no recorded runtime or console errors.

Accepted layout observations are retained in
`.ui-redesign-evidence/floating-header/initial/report.json`; the completed
interaction receipt is `floating-header/interaction-v2/report.json` with
`passed: true`. The latter verifies identical CSS/component hashes before
reusing the initial layout observations. Initial navigation automation needed
the native Enter carriage-return event and an assertion against the existing
padded map framing rather than raw camera-center equality. Its Photon fixture
also needed the required `FeatureCollection` type. No application change was
made to bypass those checks.

The malformed numeric-token case `59..450, 24.760` exposed a pre-existing
parser gap, recorded separately as #297 rather than folded into this layout
change. The native navigation receipt uses the already-supported exponent
rejection case; it does not claim that #297 is fixed. The separate live yacht
check and Class B coverage dependency are recorded in #296.

All 973 tests, required integrity checks, lint, typecheck and production build
passed. The installed Impeccable detector reported no findings in the changed
CSS/component. These are local fixture/Chrome-emulation results, not new
production measurements or physical Safari/iOS/Android evidence.

### Floating status card predecessor (#300, production evidence)

Feature #298 and tree-neutral #299 promoted through #300 to application
`8117859518155f77e9413fa0d86902a3b371da9e`. Exact-main Validation
`37163497963` and canonical deployment `37163611027` attempt 2 passed 973
tests in 129 files. Full smoke passed at `2026-10-04T00:13:26.611Z` as
Worker `79f74a36-f1a6-4e1b-b41a-1314a3e92a76`.

Actual Chrome `154.0.8037.95` acceptance ran from `00:15:09.566Z` to
`00:15:49.187Z`, without response fixtures:

- Both themes at 1280x900, 390x844, 390x568 and 315x517 measured a 280x88 px
  card, inset 16 px on desktop and 12 px on mobile. No horizontal overflow
  occurred. The visible desktop rail remained 76x335 px at y=16, its panel
  opened inward at x=824-1176, and the mobile dock remained 70 px.
- Settings contained exactly one 44 px input. Center, native disclosure
  switching, Provider details/Escape, attribution, theme restoration and
  live/historical selection remained usable.
- Complete 26-page Starlink discovery retained one request per channel,
  zero browser CelesTrak work and one active orbital worker across ordinary
  presentation changes. HISTORY intentionally terminated and recreated it;
  Return to Live retained the same canvas and cached catalogs.
- The selected last row was 61.16 px, fully visible/topmost/focused inside a
  145 px body / 265 px control area at 315x517. Under the 844-layout/
  517-visual-height mismatch it remained usable in a 121 px body / 241 px
  control area. The 3 px focus ring and absence of nested scrolling held.
- At 315x517, HISTORY controls ended at y=347 and playback began at y=359.
  Native focus scrolled two pixels, keeping Return to Live at y=486.31 inside
  the y=487 notice boundary; every speed label fit.
- The map rendered 49 vector-source features, two real aircraft and regional
  marine traffic. One later aircraft `503` was recorded; there were no
  recorded browser runtime/console errors.

The same profile had accepted the actual `cd05a38f...` predecessor before
deployment. Normal navigation loaded `index-KqCAW4Ds.js` and
`index-B5IN6iN9.css` while retaining service-worker control, the old cache and
the normal app-update notice. The new shell was `84e5a30fc6fce373d145`.
Neither storage clearing nor cache disabling was used. The terminal
`ui-floating-production/final/report.json` has `passed: true`; the earlier
local fixture evidence was not rerun for branch synchronization.

The before-deployment baseline already showed aircraft-only `502`. The
independent #174 recovery and unchanged deployment rerun are recorded
separately from UI acceptance. The immediate rollback predecessor remains
`cd05a38f...` / `89313ed1...`, not a later docs-only main commit.
[Actual production screenshots and complete evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/300#issuecomment-5974937301)
do not claim physical Safari/iOS/Android testing or a new provider experiment.

### Minimal right controls (#291, historical local evidence)

After #288, the user liked the buttons but requested a more minimal layout,
right-side controls, and a smaller or absent top bar. This refinement keeps
the existing buttons and all search/status actions, moves only the desktop
rail to the right with inward-opening panels, and puts the desktop inspector
opposite it. Phones keep the bottom dock. The redundant brand subtitle is
hidden instead of hiding provider state or introducing another disclosure.

| Surface | #288 | Minimal refinement |
| --- | --- | --- |
| Wide masthead | 80 px | 56 px |
| Intermediate masthead | 116 px | 104 px |
| Mobile masthead | 140 px | 120 px |
| 1280 px desktop rail | x=16 | x=1188; unchanged 76x335 px |
| Mobile command dock | 70 px | Unchanged 70 px |

The existing fixture-backed Chrome harness exercised both themes, the four
desktop/mobile sizes, all 512 Starlink records, selected final-row focus,
the shortened visual viewport, touch/wheel/keyboard scrolling, provider
disclosures, paused/partial/offline states, attribution, HISTORY selection,
and Return to Live. A separate 761/900/1024 px pass checked header containment,
44 px primary targets, and explicit coordinate/named-search behavior without
remounting the input, map, or marine connection. Real MapLibre tiles were
rendered; traffic and catalog responses were fixtures, not production proof.

Impeccable's installed distill/craft guidance was used for the refinement,
followed by its bundled detector on App, TrafficControls, and App.css. Its
one warning identified the pre-existing thick accent border on the viewport
notice; that decoration was removed while preserving the standard panel
border, text, and recovery action. No automatic hook, new dependency, design
framework, provider, scheduler, or application state was introduced.

Lint, typecheck, 973 tests in 129 files, all four required integrity checks,
and the production build passed. The unchanged Vite chunk-size advisory is
not a new regression. Browser artifacts are retained in
`.ui-redesign-evidence/minimal-right/{final,navigation}/` in the existing
evidence worktree. Native scrolling is part of playback reachability; an
at-rest footer edge is not a substitute for checking keyboard/touch access.
Chrome emulation is not physical Safari/iOS/Android evidence.

### Minimal right controls (production evidence)

#289 and tree-neutral #290 promoted through #291 to application
`cd05a38f7c2f130629e961cb4a56fc67d9c42a44`. Exact-main Validation
`37152118432` and deployment `37152238178` attempt 2 passed 973 tests in
129 files. Full smoke passed at `2026-10-03T20:55:36.196Z` as Worker
`89313ed1-b31a-467d-86b5-4cf8d558af9c`.

Actual Chrome 154 observations began at `20:57Z`, without response fixtures.
Both themes measured 56 px desktop and 120 px mobile mastheads, a 76x335 px
desktop rail at x=1188, inward panels at x=824-1176, and a selected real vessel
inspector at x=16. The 70 px dock remained unchanged at 390x844, 390x568 and
315x517. Ordinary navigation in the retained profile loaded
`index-C6kNCOeT.js` / `index-BQDHeey3.css` without disabling cache or clearing
storage. The new shell cache was `a50f129130253277bbf1`; remembered orbital
visibility and the pending app-update notice remained. These are not
clean-profile, layers-off startup screenshots.

All 26 pages remained reachable. Selected NORAD 100775 was 61.16 px tall
inside a 125 px body at 315x517; the 844-layout/517-visual case retained a
101 px body and 221 px control area in both themes. Provider details/Escape,
live/historical selection, attribution and Return to Live passed. At 315 px,
native focus scrolled playback by 2 px to reveal the action fully; no app
change was made to satisfy an artificial at-rest requirement. The map and
catalogs survived HISTORY; the orbital worker intentionally stopped/restarted.
LIVE and aircraft-503 PARTIAL captures remained truthful.

The map reported **49 rendered features from vector sources**. A main-target
`.pbf` response count includes font glyphs and is not proof of worker-fetched
vector tiles. The raw report preserves a stale terminal assertion referencing
the removed counter; a separate terminal receipt verified the actual vector
metric, exact release, all eight layouts, cache transition and zero browser
errors at `21:00:21.143Z`, without replaying accepted interactions. Artifacts:
`ui-minimal-production/final/report.json` and `final-verification.json`.

[Actual production screenshots and complete evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/291#issuecomment-5973461428)
remain separate from local fixtures. Physical mobile/Safari is not claimed.
The independent relay recovery is recorded in #174 and the hosting/relay docs.

### Distinct workspace correction (local evidence)

This correction shipped as #288, application
`2d11e3e649fc55f8be0965d9b0cce41a42545ad0` / Worker
`ce0dffd2-a22a-48d9-95a8-695e814c4c5e`. Deployment `37144136921` attempt 2
passed at `2026-10-03T19:54:45.336Z`; retained-cache and HISTORY production
acceptance is [preserved on #288](https://github.com/vasilyevstan/LiveTrafficStan/pull/288#issuecomment-5973032236).
It is the real predecessor for the subsequent minimal refinement.

The follow-up baseline is `a11efce3ae53f953af937d18de617c0097e37a86`,
after the #280–#282 release, not the earlier interface. Matching collapsed
More/Settings screenshots use identical aircraft fixtures, camera sequence,
and a frozen display clock, in both Light and Dark. The same attribution
disclosure state is retained across desktop-to-mobile resizing.

| Default screen | Released baseline | Follow-up source |
| --- | --- | --- |
| 1280x900 | 420x118.25 top-left header; two 320 px top-right cards | Full-width 80 px masthead; 76x335 px left rail |
| 390x844 | Tools at y=102–265.38 | 140 px masthead; 70 px dock at y=743.98 |
| 390x568 | Tools at y=102–265.38 | 140 px masthead; 70 px dock at y=467.98 |
| 315x517 | Tools at y=102–265.38 | 140 px masthead; 70 px dock at y=416.98 |

Chrome 154.0.8037.95 rendered real MapLibre vector tiles with local traffic,
MQTT, Photon, and validated curated/512-record Starlink fixtures. All 26
Starlink pages and 512 unique entries were traversed. With selected details
and the visible zoom prompt at 315x517, the final 61.16 px row fit inside a
103 px sole scroll owner. With an 844 px layout and 517 px visual viewport,
the selected row fit inside a 79 px body in **both** themes. Every measured
row was topmost, fully visible, and free of nested or horizontal scrolling;
the existing 58% maximum was retained. The reserved prompt stayed readable.

Touch, wheel, and PageDown moved the More body by 136, 250, and 217 px;
18 sequential Tabs reached the last row with a three-pixel focus ring.
Trusted touch in the uncovered map strip moved the camera. Selection close,
disclosure Escape, provider details, and attribution touch checks passed.
The same map/canvas, one physical orbital worker, and one request per orbital
catalog survived presentation/theme changes; 44 successful glyph-PBF
responses and no runtime or console errors were recorded. LIVE, PARTIAL,
PAUSED, OFFLINE, and HISTORY remained distinct. Mobile playback starts 12 px
below the tools; Return to Live and all four speed labels remain reachable.
Closing historical selection restores the dock.

Separate 761/900/1024 px Light/Dark checks measured no masthead/rail overlap
and at least 44x44 px primary actions. Trusted coordinate submission used the
existing fit-padding/navigation path with zero Photon requests. Typing did
not fetch; explicit named submission made one mocked request and exposed the
empty result in Settings at 315x517. Escape restored the input; switching
disclosures retained its identity/value, map, and marine connection.

All required checks passed: lint, typecheck, **972 tests in 129 files**, the
four required metadata/allocation/photo/orbital checks, and build. The existing
Vite large-chunk advisory is unchanged. No package, font fetch, provider,
worker, data model, dataset, viewport/framing policy, or cadence changed.

Evidence is retained in the candidate worktree's
`.ui-redesign-evidence/distinct-followup/`: matching `before/` and `final/`
screens (`desktop-{light,dark}.png` and
`mobile-{390x844,390x568,315x517}-{light,dark}.png`), `final/report.json`,
`navigation-final/report.json`, the reused `navigation/breakpoint-*.png`,
and `required-checks.log`. The reused harness is
`.ui-redesign-evidence/distinct-followup/browser.mjs`. This is local development-server
acceptance plus a separate production build, not deployment or physical
iOS/Android/Safari evidence.

### Initial presentation pass (local evidence)

Local candidate verification on October 3, 2026 used Chrome
154.0.8037.95 on macOS, real MapLibre rendering, mocked aircraft/MQTT/search
responses, and the current validated curated/512-record Starlink fixture
contracts. This is not production-release evidence. The existing deployment
identities elsewhere in this document are unchanged.

Matching Light/Dark baseline and candidate captures used the same local
traffic fixture and camera. Update age advances normally:

| Default layout, CSS px | Before | Candidate |
| --- | --- | --- |
| Desktop header width, 1280x900 | 620 | 420 |
| Desktop header height | 123.61 | 118.25 |
| Mobile header height, 390x844 | 107 | 92 |
| Bottom of collapsed tools, 390x844 | 337 | 265.38 |
| Bottom of collapsed tools, 390x568 | 319 | 265.38 |
| Bottom of collapsed tools, 315x517 | 295 | 265.38 |

The narrow rail deliberately grows from 203 to 235 px at 315x517 to fit
readable labels and 44 px primary actions, leaving a 74 px map strip. The
combined default overlay area is about 28% smaller at 390x844 and 17% smaller
on desktop; the narrowest layout trades approximately unchanged area for
better touch/readability and less vertical coverage.

Rendered acceptance traversed all 26 Starlink pages and all 512 unique
entries. The last row was topmost and fully inside its sole scroll owner at
1280x900, 390x844, 390x568, and 315x517, including a selected orbital card.
At 315x517 the selected result was 74.45 px high inside a 91.63 px body.
An 844 px layout with a forced 517 px `visualViewport.height` retained the
299.86 px / 58% control cap and reachable final row. Geometric comparisons
allow one CSS pixel for fractional layout/scroll rounding.

Touch, wheel, and PageDown moved the outer Operations body; 18 sequential
Tabs reached the last result. Escape and detail close restored focus.
Trusted touch on the uncovered strip moved the map. Opening settings and
switching themes retained the same canvas, one physical orbital worker, and
one request per orbital catalog. The 44 main-target PBF responses were font
glyphs, not a vector-tile count; the basemap was visually rendered.
Offline/HISTORY transitions were checked separately, including
truthful PARTIAL, PAUSED, OFFLINE, and HISTORY presentation, independent
provider messages, playback controls, historical details, and Return to Live.
At 390x568 and 315x517, playback starts 14 px below the reserved tool area.
The run reported no runtime exception or console error.

Opaque surface contrast ratios are 11.07:1 / 12.27:1 for main text and
5.63:1 / 7.51:1 for secondary text in Light / Dark. Three-pixel focus rings
contrast 6.46:1 / 10.69:1 against panels and 5.63:1 / 6.49:1 against active
controls. `src/app/interfaceStyles.test.ts` checks small-text and focus
contrast plus visual-viewport and single-scroll-owner contracts.
The required repository checks passed, including 968 tests in 129 files.
No framework, font, icon package, provider, worker, or scheduler was added.

The broader copy pass in #195 already shortened route, selected-object,
metadata/photo, weather, history, and Photon text beyond Operations. This
candidate preserves those reductions and necessary caveats. A follow-up
regression removes the remaining repeated pending-history deletion message:
it appears once in the existing status, while distinct supplementary history
notices remain visible.

Screenshots, detailed geometry, CDP actions, and validation output remain
uncommitted in the isolated candidate worktree's `.ui-redesign-evidence/`
directory (`before/`, `final/`, `browser.mjs`, and `required-checks.log`).
Mobile/touch and visual-viewport evidence is browser emulation, not physical
iOS/Android or Safari testing.

### Historical first-refresh production acceptance (#282)

Feature #280 and ancestry #281 promoted through #282 to exact application
`9f5ee37d9ad2bbeedb20a89ea08e7cd5629e36e8`. Exact-main Validation
`37134495129` and canonical deployment `37134585858` attempt 2 passed all
970 tests in 129 files; full smoke passed at `2026-10-03T15:59:57.387Z`.
Its accepted Worker was `85d1418b-3316-4299-9758-20810aa58898`.

Actual Chrome 154.0.8037.95 acceptance completed at `16:07:15.828Z` with no
response fixtures. Light/Dark 1280x900, 390x844, 390x568, and 315x517 layouts
retained the same canvas with no horizontal overflow. Visible collapsed
panels ended at 232 px on desktop and 265.375 px on mobile, matching the
candidate. Do not substitute the transparent control-stack maximum height
for the measured visible panels.

All 26 current Starlink pages were traversed. Keyboard Tab reached the
topmost final row; trusted touch selected it. At 315x517 the selected row
was 74.453 px tall inside a 91.625 px body. With an 844 px layout and
517 px visual height, the selected row remained reachable inside the 239 px
tool stack. Provider details/Escape and touch-opened attribution passed.
There was one request per curated/Starlink catalog, no CelesTrak request,
one physical orbital worker, seven successful glyph-PBF responses, and no
observed runtime or console error. A transient aircraft `503` remained
truthfully PARTIAL with marine independent; later captures showed LIVE
aircraft. This is not an uninterrupted-provider-availability claim.

Two CDP harness assumptions, not application bugs, were corrected: bare
Enter without native text did not activate a button, and tapping an
already-open attribution closed it. Pointer/touch selection worked; the
final attribution assertion resumed on the same owned page without replaying
accepted work. Reports and screenshots are retained under
`ui-redesign-production/` and `ui-redesign-production-attempt1/` in the session
artifacts, with [public production media on #282](https://github.com/vasilyevstan/LiveTrafficStan/pull/282).
Physical mobile/Safari testing is not claimed.

## Atlas basemap acceptance (#304)

The first atlas pass changes existing default-map paint, not the floating
interface or traffic artwork. Eighteen deterministic tests cover both palettes,
Light -> Dark -> Light restoration, exact-default URL gating, foreign-source
and fallback preservation, unchanged geometry/label/road/boundary properties,
opaque label/halo paint-pair contrast of at least 4.5:1, and actual blue vessel
fill against water at at least 3:1. Existing label opacity and zoom transitions
remain provider-owned; these paint-pair checks are not a claim that every
transitional glyph has full opacity.

Chrome `154.0.8037.95` paired the previous application
`8117859518155f77e9413fa0d86902a3b371da9e` with the candidate using controlled
traffic responses and real OpenFreeMap vector tiles. Ten views cover Light and
Dark at regional, close-up harbour/city, and world scales at 1280x900, plus
390x844 and 315x517 mobile layouts. The palette confirmation ran
`2026-10-04T07:24:49Z` to `07:25:09Z`; every view rendered vector-source
features (83-1,346), retained one canvas and the 280x88 floating card, and had
no document overflow or recorded runtime/console error.

Actual marker selection and Light -> Dark -> Light kept the selected ship,
longitude/latitude, zoom, bearing, pitch, and canvas. The theme-only interval
created no marine connection. The complete matrix also crosses the intentional
wide-view pause and resume, so its two total marine socket constructions are
not described as an uninterrupted connection. Trusted mobile touch moved the
same map. All protected provider traffic was fixture-routed; zero real
ADSB.lol, Digitraffic, CelesTrak, Photon, or photo-provider requests were made
by these paired checks. Synthetic vessel counts are not live coverage evidence.

The retained artifact receipts are `atlas-basemap-visuals/before-v2/` and
`atlas-basemap-visuals/candidate-v2/`. The final palette tightened light label
ink, subdued dark boundary lines, and corrected the first water color's
2.933:1 vessel contrast instead of weakening the 3:1 test. A separate earlier
`before/` receipt records a CDP-only attempt to serialize MapLibre's circular
return value; it is not accepted evidence. Physical Safari/iOS/Android, new
terrain imagery, 3D building geometry, and globe mode are not claimed.

Final source review found one tightly coupled shared-style edge: choosing
Positron for both Light and Dark could carry the Light atlas paint into the
custom Dark override. The fix uses the existing loader to reset the same URL
with `diff: false`, ensuring `style.load` runs and restores current overlays.
The focused `atlas-basemap-visuals/shared-v1/` receipt proves the atlas Light
colors and zoom-5 forest return after the custom Dark view restores original
Positron colors and zoom-10 forest. Repeated transitions retain the selected
ship, full camera, canvas, and theme-only marine connection. It adds no paint
snapshot cache or parallel style loader. The unchanged default-palette evidence
above is reused rather than repeated.

All required final local gates passed: 991 tests in 130 files, lint, typecheck,
aircraft metadata, country allocations, vessel photos, orbital catalog
integrity, and the production build.

### Accepted atlas production (#307)

Exact application `0972ba8d24ba96e18627b13b252e6ac7c5473f10` passed
exact-main Validation `37187440710` and canonical deployment `37187599808`
attempt 2, with full smoke at `2026-10-04T08:43:41.594Z` as Worker
`a22bfa09-03fa-40cd-ac76-3915e0e52eea`.
[The actual production receipt and screenshots](https://github.com/vasilyevstan/LiveTrafficStan/pull/307#issuecomment-5978336335)
ran from `08:49:10.049Z` to `08:49:48.904Z`, without response fixtures:

- Both themes passed 1280x900, 390x844, 390x568 and 315x517, with the same
  280x88 card, right rail/mobile dock and one canvas. Actual water/land paint
  matched the atlas palette after each style installation.
- The initial map rendered 87 vector-source features and real aircraft/ships.
  Selection, provider disclosure, Settings navigation, orbital results/focus,
  shortened visual viewport, touch, HISTORY and Return to Live passed.
- Startup made zero catalog requests. Enabling each channel made one
  same-origin request, with no browser CelesTrak work. A later aircraft `503`
  was recorded without runtime/console errors; availability was not claimed
  uninterrupted.
- Ordinary navigation from the actual predecessor profile changed
  `index-KqCAW4Ds.js` to `index-BRvLbc4q.js`. The interface stylesheet remained
  exactly `index-B5IN6iN9.css`, as intended for this map-only change.
  Old shell `84e5a30fc6fce373d145` remained alongside
  `068c4381a2493276f835`; service-worker control and the normal update notice
  remained, without clearing storage or disabling cache.

The private-relay recovery is independently recorded on
[#174](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5978306226),
not presented as a map-code fix. No physical Safari/iOS/Android claim is made.
The prior #300 application/Worker remain the accepted rollback predecessor;
later documentation-only main commits are not redeployed runtimes.

### Yacht filters and vessel flags (#313-#316)

All required local gates passed 1,011 tests in 131 files, lint, typecheck,
aircraft metadata, country allocations, vessel photos, orbital catalog and
build. Exact-main Validation `37202642661` passed for application
`e2b2afaa04466116719310d6286441f8e6ba60ca`.

The deterministic Chrome receipts are separate from real source coverage:

- `yacht-filter-browser/before` and `candidate-v4` reproduce two old versus
  four corrected rendered vessels, stopped/unknown speed, stale selection,
  normal expiry, history/filter compatibility, native wheel note reachability,
  the actual 58vh panel body, 390x568/315x517 layouts and touch.
- `vessel-flags-browser/candidate-v3` uses the built candidate. Nine synthetic
  ships retain nine hulls and six correct country badges; excluded, special
  and unassigned MMSIs remain unflagged. Native selection/country text,
  Light -> Dark -> Light, bearing 45/pitch 40, hide/show, clustering without a
  flag, uncluster restoration, expiry, narrow DPR 1/2 and touch pass. One
  canvas, three existing traffic sources and one metadata/location/MQTT
  lifecycle remain, with zero missing images or extra flag/provider requests.
  [Native-scale screenshots](https://github.com/vasilyevstan/LiveTrafficStan/pull/314#issuecomment-5979883735)
  prove the actual small badges rather than only registered image IDs.

[Production receipt `vessel-release-production/production-v2`](https://github.com/vasilyevstan/LiveTrafficStan/pull/316#issuecomment-5980143455)
ran at `2026-10-04T12:51:36.993Z-12:51:41.713Z`, in a fresh Chrome 154
context with native fetch, WebSocket and clock, not response fixtures. It
observed 35 supplied vessels and 33 rendered flags, checked every rendered
flag against the bundled MID projection, and selected SINILIND (`276014100`):
exact Pleasure craft, 16 m, 0 kn, Estonia (EE), live age 31.913 seconds. It
retained one canvas, 226 images, zero supplemental flag requests, zero runtime
exceptions and zero console errors. The earlier `production-v1` receipt saw
the same stopped craft stale at 175.962 seconds but failed its selection wait.
It used stored observation coordinates without checking the current rendered
hit target; the accepted helper waits for that target and clicks the actual
hull. The failed receipt is preserved, not relabeled as accepted.

Canonical deployment `37203064394` installed Worker
`816506f7-2cb1-4e6c-8626-ae990eb62b8a`, then failed private-aircraft smoke
with `502`. The browser recorded the exact release on the same aircraft-only
failure while marine traffic and tiles worked. This was independent marine
acceptance, not a green overall activation, and that receipt did not include
a backend change, VM reboot, second dispatch, extra provider probe or rollback
drill. Physical Safari/iOS/Android and Class B/ANTARES coverage are not claimed.

The later #174 memory investigation disabled only optional DNF metadata
prefetch. A controlled relay-service restart preserved the persisted admission
deadline, and canonical deployment `37214110439` passed full smoke for
`1afa175d8bb6b3f0636c2a02576cc82a35ced373` at `15:45:14.901Z`. The application,
Worker, relay, asset and workflow paths are unchanged from the accepted marine
source, so the real-browser ship evidence is reused, not needlessly repeated.
See [OCI Aircraft Relay](oci-aircraft-relay.md) for the guest evidence,
completed recurrence-window observation and diagnostic-output limitations.
Eleven consecutive five-minute memory samples from `15:30Z` through `16:20Z`
were available at the `16:21Z` observation end. The final guest check at
`16:24:56Z` retained the same boot, active services, disabled timer and zero
OOM kills. One post-window production request returned two aircraft in
716 bytes, HTTP 200 in 732 ms, with exact-release/no-store/no-CORS checks.
These are bounded recovery results, not a guarantee of future availability.

## Browser smoke test

Use `npm run dev` and verify:

1. OpenFreeMap labels and land/water geometry render, not only the overlays.
   With the default style URLs, verify the atlas water/forest/road/building
   palette at regional and close-up city scale in both themes. Compare actual
   before/after screenshots, not only stored paint values. Confirm the same
   map/canvas, current selection, camera, and readable traffic after
   Light -> Dark -> Light. Custom style overrides and the offline fallback
   must not receive the default-map treatment. No new imagery or 3D geometry
   is implied by the stronger cartographic detail.
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
8. The floating status card, right desktop rail, and bottom mobile command dock
   require no scroll. Center and the one mounted location input are grouped
   with results and privacy text at the start of Settings; Aircraft, Ships,
   ORBITS, More, and Settings stay in the dock.
   Auto/Light/Dark and Trails live under Appearance in **Settings**. Other
   operational layers, discovery, context, and source detail live behind
   **More** (Explore map); the duplicate traffic legend is absent. Location feedback,
   browser location, history setup, preferences, sharing, reset, and app detail
   live in Settings. Verify each panel promotes recovery
   only from its own domain with no duplicated action or alert. Verify the
   floating card, navigation panel, and rail do not overlap at 1024, 900, or
   761 CSS pixels. Do not replace the compact card with an edge-to-edge bar.
   Measure the visible collapsed dock and the expanded stack separately
   at desktop, 390x844, and 390x568. With 20 orbital results, verify the outer
   Operations body is the only scroll owner, the final result is reachable by
   touch, wheel, Tab, and keyboard scrolling, search state and disclosure
   identity survive rerenders, focus returns to a visible owner, task labels
   remain unclipped, and a real touch drag works on an unobscured map region.
   Include a 315x517-class view and a case where the layout viewport remains
   tall while `window.visualViewport.height` is forced to 517 px. At the final
   scroll position, verify the last result is topmost with
   `document.elementFromPoint()` rather than relying only on bounding boxes.
   Repeat with a selected orbital detail card open. In HISTORY, verify the
   playback cursor, speed controls, and Return to Live remain separate from
   expanded settings; mobile historical details temporarily replace the tool
   rail and closing the detail restores it without losing disclosure state.
   The mobile zoom/tilt prompt must remain readable above both selected
   details and the open sheet, including the visual-viewport mismatch case.
   In both themes, open Provider details with touch and keyboard and verify
   that counts/age remain visible when closed, provider errors and regional
   limitations remain readable when open, and Escape restores summary focus.
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
    pleasure types render only with known length at least 8 m and finite age
    from 0 through the normal ten-minute marine expiry at the live clock or
    historical cursor. Any reported speed includes stopped and unknown-speed
    yachts; explicit below-one-knot, moving and unknown choices select their
    exact populations. Reports older than two minutes remain visibly stale
    until expiry. Cover the 16 m / 0 kn / 123.591-second regression, exact
    8 m and 600/600.001-second boundaries, and invalid/future/unknown-length
    rejection. Non-yachts preserve the 50 m reset state. Selection survives a
    stale or stopped transition under Any, but clears when an explicit filter
    or expiry makes the yacht ineligible.
    Available ordinary-MMSI countries also show recognizable, upright 14x11
    CSS-pixel flags beside their ships. Cover Estonia/Finland and an unavailable
    or excluded MID, with moving/stopped/stale/selected vessels in both themes,
    at DPR 1/2 and narrow layouts. Bearing, pitch, ship heading, clustering,
    filtering and SHIPS visibility must not rotate the flags, obscure the
    silhouettes or stopped dots, duplicate counts, change hull picking, create
    a map/source, reconnect providers or request flag images. Rehydration must
    restore actual rendered badges, not merely their image IDs.
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

The traffic-recovery release used rollback target source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` and Cloudflare version
`d83f68ae-907e-4b2d-a086-00b4fde00372`. Traffic-recovery Wiki commit
`bac76a2994a09e85e1162c5724a6071f0fc35540` synchronizes that predecessor release
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

The October 3 compact-design follow-up repeats the rendered contract in Chrome
154 while replacing browser-default task tabs with application-styled active
states and putting Starlink modeled, in-map/shown, and next-90-minute metrics
before provenance prose. At 1280x900, 390x844, 390x568, and 315x517, all five
task labels fit without clipping, there is no horizontal overflow or
brand/control overlap, and one MapLibre canvas remains. The control stacks
measure 489.515625 px, 329.4375 px, and 299.859375 px at the three mobile
heights, each within the exact 58vh budget. On the final 10-row Starlink page,
the last result is fully inside and topmost in the sole Operations scroll owner
at every mobile size; the task strip scrolls away and `.orbital-results`
remains unbounded with visible overflow. The local acceptance reuses the
current production representations through same-origin interception and adds
no browser request to CelesTrak.

The combined shell-balanced candidate passed 128 test files / 962 tests,
Oxlint, strict TypeScript, every required static-data check, build, deployment
dry-run, provider-contract review, and map-experience review. The final 4x-CPU
ten-minute benchmark accepted 462 curated plus 512 Starlink records in one
physical worker: load `29.7 ms`, current-position p95 `8.2 ms`, prediction p95
`501.2 ms`, latest-request acknowledgement `8.5 ms`, and only `6,696` bytes
of post-warmup post-GC growth across 586 iterations / 600,012 ms.

Chrome 154 candidate acceptance exercised exact 192/384/512 tiers, all 26
pages, rows 501-512, a 193-ID selected world-tier exception, one canvas, one
physical orbital worker, Light -> Dark -> Light restoration, parent-off
shutdown/re-enable without refetch, and desktop plus 390x844/390x568 DPR 2
reachability. The final result remained topmost in the sole Operations scroll
owner, attribution remained reachable, the exact 58vh budget held, trusted
touch moved the same map, and no runtime, log, or HTTP error occurred.

The same acceptance then passed on exact production `d565b562...` in Chrome
`154.0.8037.95` at `2026-10-03T14:21Z`, with response interception disabled
and startup request/error evidence retained. The sole Starlink response was
actual schema 2 from KV, digest
`cebc2fd1dfe8b58e6dce30ca15dfa1ec0e327d7e1272d2f79690116a6a41356b`.
Zero startup Starlink requests, 192/384/512 tiers, a 193-ID selected exception,
26 pages, final 12 rows, one map/physical worker, theme restoration, and
parent off/on without refetch all passed. The mobile stacks measured
489.515625 px and 329.4375 px, and the final result was fully inside and
topmost in the outer scroll owner with working trusted map touch.

After protected rollback `37129586003` and restoration `37129687283`, both
representations retained byte-identical bodies and the fresh
`14:17:23.055Z` publication. Settled views covering Estonia and Finland at
`14:30:15.777Z` / `14:30:18.928Z` measured six/two Starlinks shown and 86/63
next-90-minute map passes. The narrower southern views earlier contained zero
sample points; independent SGP4 propagation of the exact production records
confirmed that result. Do not replace time-dependent counts with a guaranteed
positive count, or read a prior viewport's still-settling prediction as new
evidence. [Production
screenshots](https://github.com/vasilyevstan/LiveTrafficStan/pull/275#issuecomment-5970127249)
are Chrome emulation, not physical iOS/Android acceptance.

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
