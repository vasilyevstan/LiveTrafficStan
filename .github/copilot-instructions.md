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
  `npm test -- --run`, and `npm run build`.
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
  visibility, radius, trail, selection, and camera without reconnecting
  providers.
- Treat session home center, active provider query center, MapLibre camera, and
  selected radius as separate state. Pure zoom is visual. Radius remains the
  explicit data boundary.
- Settled user pans may replace the latest desired query, but must not add
  ADSB.lol requests beyond the configured aircraft polling cadence. Cancel or
  ignore obsolete revisions and handle `429`/`Retry-After` explicitly.
- Center/radius changes must reuse the Digitraffic MQTT connection and refilter
  cached global messages. Do not reconnect MQTT or issue a new radius REST
  request for every camera event. Reconnect attempts stay at least 15 seconds
  apart.
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
- Motion interpolates only between observed positions. Trails contain observed
  points and remain bounded by both time and count.

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
- Preserve visible OpenFreeMap/OpenStreetMap, ADSB.lol, and Digitraffic
  attribution and the provider licensing records.
- Do not expand a focused change into reverse geocoding, continuous location,
  arbitrary search, persistent tracking, PWA, weather, clustering, or backend
  work unless the request explicitly includes it.
