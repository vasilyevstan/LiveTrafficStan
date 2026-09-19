# LiveTrafficStan repository instructions

LiveTrafficStan is a static-first React, TypeScript, Vite, and MapLibre browser
application. It displays normalized live aircraft from ADSB.lol and marine
traffic from Digitraffic. Keep provider protocols outside React components and
preserve truthful partial operation when one provider fails.

## Workflow

- Fetch `origin` and align the local `dev` branch to `origin/dev` before
  branching. A squash release can leave an older local history with an
  equivalent tree; do not merge that stale history back into `dev`.
- Branch from the latest `dev`.
- Merge feature and documentation branches into `dev` through pull requests.
- Release only through a checked `dev` to `main` pull request.
- Keep GitHub's automatic merged-branch deletion disabled because release pull
  requests use persistent `dev` as their head. Delete merged feature branches
  explicitly, never `dev`.
- Do not commit directly to `main` except for a declared emergency using the
  repository-admin bypass.
- Keep pull request descriptions explicit about motivation, scope, exact source
  SHA, validation, provider/privacy/release impact, and rollback.
- Keep one primary workstream per GitHub Issue. Broad Issues may use additional
  focused pull requests when acceptance groups are independent or a documented
  external prerequisite is later resolved. Use non-closing Issue references
  until every non-blocked criterion is complete.
- When a legal, provider, account, credential, or licensing dependency is
  demonstrated, record the evidence in the parent Issue and create a detailed
  blocker Issue. Do not add placeholder code, claim blocked criteria complete,
  or hold unrelated ready work behind the blocker.
- Before merge, run `npm run lint`, `npm run typecheck`,
  `npm test -- --run`, `npm run check:aircraft-metadata`, and
  `npm run build`.
- Use existing npm scripts and dependencies. Add a framework or dependency only
  when a demonstrated requirement cannot be met with current mechanisms.

## Architecture invariants

- UI and map code consume application-owned traffic models, never raw provider
  payloads.
- Aircraft and marine lifecycle, status, cancellation, and errors stay
  independent.
- Keep one MapLibre instance. Update persistent GeoJSON sources and layers
  rather than creating DOM markers or rebuilding the map.
- Preserve the explicit
  `maplibre-gl-worker.mjs?worker&url` import and `setWorkerUrl` call. A loaded
  style JSON is not proof that vector tiles work.
- `map.setStyle` removes custom images, sources, and layers. Theme changes must
  reinstall them idempotently after `style.load` and restore current data,
  visibility, trail, selection, and camera without reconnecting
  providers.
- Derive traffic from a safely representable full-canvas viewport after settled
  pan, zoom, rotation, pitch, Home, and real resize changes. Floating controls
  do not shrink that footprint.
- Normalize wrapped longitudes around the rounded camera center, reject invalid
  or world-spanning geometry, and apply the 100 km eligibility limit before
  ADSB.lol's whole-nautical-mile outward transport rounding. Query the
  conservative enclosing circle, then filter display to the actual viewport.
- An ineligible viewport hides traffic and trails, clears invalid selection,
  pauses providers, and shows a truthful zoom/tilt prompt. Never clamp,
  subdivide, or present partial coverage as complete.
- Settled camera changes may replace the latest desired query, but must not add
  ADSB.lol requests beyond the configured aircraft polling cadence. Cancel or
  ignore obsolete revisions and handle `429`/`Retry-After` explicitly.
- Viewport query changes must reuse the Digitraffic MQTT connection and refilter
  cached global messages. Do not reconnect MQTT or issue a new REST request for
  every camera event. Reconnect attempts stay at least 15 seconds apart.
- Layer visibility is a display preference and does not create a separate
  network lifecycle.
- Any new intentional pause reason must compose with page visibility and
  unmounting without recreating schedulers or resetting aircraft cadence,
  `Retry-After`, MQTT reconnect, marine REST, or metadata deadlines. Late
  fetch, MQTT, timer, and dynamic-import callbacks cannot revive an obsolete or
  paused generation.
- Geolocation is one-shot and permission-aware. Never use continuous tracking,
  persist coordinates, expose unnecessary precision, or send personal
  information in provider headers. Round provider/query coordinates before use.
- A granted geolocation permission authorizes a lookup but does not guarantee
  that the operating system will produce a position before the configured
  timeout. Keep the current home usable, report acquisition and permission
  failures distinctly, and guard retries from obsolete late callbacks.
- Keep session Home separate from the current view target. Coordinates and
  place results never mutate Home. Coordinate submission, named search, Center,
  Use Location, and trusted manual camera movement must prevent an older
  geolocation callback from stealing the camera while still permitting it to
  update Home silently.
- Location input is explicit-submit only. Strict valid decimal coordinates are
  rounded and navigated locally without a geocoder request; malformed
  numeric-looking pairs are errors rather than place queries. Do not add
  typeahead, reverse geocoding, location bias, or another camera/provider
  scheduler.
- Photon search allows one active request, bounded results/body/text, revision
  cancellation, a local repeat-submit cooldown, total timeout, explicit
  `429`/`Retry-After` handling, and bounded session-only success/empty caching.
  Browser requests omit credentials and a custom `User-Agent`. Search outage
  must leave coordinate navigation and traffic usable.
- Place-search UI must disclose that submitted text appears in the Photon URL,
  preserve visible Photon/OpenStreetMap attribution, and make no unsupported
  provider-retention claim. Never send browser-derived Home coordinates for
  search bias or persist search results.
- Committed navigation clears selection and pre-navigation trail points but
  preserves the single map instance, themes, layers, filters, provider
  controllers, cadence, connections, and session Home.
- Motion interpolates only between observed positions. Trails contain observed
  points and remain bounded by both time and count.
- Static aircraft metadata is selected-object context only. It must not mutate
  live traffic entities, provider health/freshness, trails, selection, camera,
  or the provider-reported aircraft marker taxonomy.
- Keep the Mictronics metadata source pinned by commit, publication instant,
  internal version, archive/license checksums, schema, and immutable output
  version. Source code remains Apache-2.0; the derivative database is conveyed
  under ODC-By with a co-located full license, visible attribution, and the
  database-rights/contents-rights distinction.
- Aircraft metadata makes zero startup requests. Selection may load one
  validated index/type asset and one validated ICAO24-prefix shard under one
  five-second deadline and streamed byte caps. Cache only fulfilled complete
  assets: one index and the bounded shard LRU. Aborted, rejected, partial,
  malformed, oversized, or checksum-failing work never enters cache.
- Match metadata by exact six-character ICAO24. Present live registration and
  type must match after case and outer-whitespace normalization only; duplicated
  registrations are unavailable. Missing live registration may yield only an
  explicit ICAO24-only result. Do not add registration-only, punctuation
  removal, fuzzy, callsign, owner, operator, or airline inference.
- Tag metadata state with the complete selected identity and revision. Aircraft
  changes, vessel/empty selection, and unmount abort old work; stale callbacks
  cannot display A after A to B to A. Reevaluate publication-age and future
  clock rules while details remain open without refetching.
- Production aircraft proxy changes must keep the fixed ADSB.lol origin, exact
  `/api/aircraft/v2/point/{lat}/{lon}/{radiusNm}` allowlist, canonical
  coordinate validation, 1-54 NM bound, total deadline, response-size cap,
  redirect rejection, no-store policy, and upstream status/body/`Retry-After`.
  Never forward browser credentials or arbitrary headers, add wildcard CORS,
  log coordinate-bearing URLs, or introduce a shared live cache without
  provider-rights and measured-value evidence.
- Production deployment uses one serialized exact-current-`main` workflow.
  Cloudflare credentials remain only in the `production` environment, which is
  restricted to `main`; checked pull requests and dry runs receive no secret.
  A first deployment records `previous: none - bootstrap`, and real rollback
  evidence requires a later prior version.

## Change discipline

- Keep configuration and behavioral timing in `src/config/appConfig.ts`.
- Reuse helpers and provider update paths before adding parallel mechanisms.
- Add deterministic tests for scheduling, filtering, freshness, style
  rehydration, storage, and state transitions. Use live probes only for external
  contracts and keep them rate-conscious. Prefer local fixtures, fake clocks,
  fake maps, mocked fetch, and mocked MQTT for repeated lifecycle checks, then
  run one bounded real-provider smoke for a release milestone.
- Keep successful empty results, unknown coverage, updating, paused,
  unavailable, stale, historical, and offline states truthful and distinct.
- Keep `docs/` canonical and update the README and Wiki when released behavior
  changes.
- Preserve visible OpenFreeMap/OpenStreetMap, ADSB.lol, Digitraffic,
  OurAirports, Natural Earth, and NOAA/NWS AWC attribution and provider
  licensing records. Weather presentation must retain source/retrieval time,
  public-domain caveat, and observation-not-forecast wording. When static
  aircraft metadata is displayed, also preserve Mictronics and ODC-By
  attribution plus the snapshot publication date.
- Do not expand a focused change into reverse geocoding, search autocomplete,
  continuous location, persistent tracking, PWA, weather, clustering, or
  backend work unless the request explicitly includes it.
