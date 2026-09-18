# LiveTrafficStan repository instructions

LiveTrafficStan is a static-first React, TypeScript, Vite, and MapLibre browser
application. It displays normalized live aircraft from ADSB.lol and marine
traffic from Digitraffic. Keep provider protocols outside React components and
preserve truthful partial operation when one provider fails.

## Workflow

- Branch from the latest `dev`.
- Merge feature and documentation branches into `dev` through pull requests.
- Release only through a checked `dev` to `main` pull request.
- Do not commit directly to `main` except for a declared emergency using the
  repository-admin bypass.
- Keep pull request descriptions explicit about motivation, scope, exact source
  SHA, validation, provider/privacy/release impact, and rollback.
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
- Geolocation is one-shot and permission-aware. Never use continuous tracking,
  persist coordinates, expose unnecessary precision, or send personal
  information in provider headers. Round provider/query coordinates before use.
- Motion interpolates only between observed positions. Trails contain observed
  points and remain bounded by both time and count.

## Change discipline

- Keep configuration and behavioral timing in `src/config/appConfig.ts`.
- Reuse helpers and provider update paths before adding parallel mechanisms.
- Add deterministic tests for scheduling, filtering, freshness, style
  rehydration, storage, and state transitions. Use live probes only for external
  contracts and keep them rate-conscious.
- Keep `docs/` canonical and update the README and Wiki when released behavior
  changes.
- Preserve visible OpenFreeMap/OpenStreetMap, ADSB.lol, and Digitraffic
  attribution and the provider licensing records.
- Do not expand a focused change into reverse geocoding, continuous location,
  arbitrary search, persistent tracking, PWA, weather, clustering, or backend
  work unless the request explicitly includes it.
