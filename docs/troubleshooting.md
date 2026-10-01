# Troubleshooting

## The page loads but the map is blank

Check the browser console and Network panel for the style, worker, vector tile,
sprite, and glyph requests.

If the interface shows **Map unavailable**, MapLibre failed before an instance
could be created. The rest of the application remains mounted intentionally.
Reload once and check browser graphics/WebGL support or graphics acceleration.
This state is separate from aircraft and marine provider health, and the
application does not automatically retry an unknown constructor failure.

MapLibre 6 uses a separate module worker to fetch and parse vector tiles. Vite
cannot rely on MapLibre's inferred adjacent worker URL after dependency
prebundling, so `TrafficMap.tsx` explicitly imports
`maplibre-gl-worker.mjs?worker&url` and calls `setWorkerUrl`.

- In development, confirm both `?worker&url` and `?worker_file&type=module`
  requests succeed.
- After `npm run build`, confirm
  `dist/assets/maplibre-gl-worker-*.js` exists.
- On a deployed site, confirm that asset is uploaded and served as JavaScript.

If the worker loads, verify that the configured style and its tiles allow CORS,
and that the browser supports WebGL2. A style JSON response by itself does not
prove that vector tiles rendered.

**Basemap unavailable** with a visible plain background is the deliberate
fallback, not a second map. OpenFreeMap resources are external and are not
service-worker-cached. Retained local traffic/history can still render over the
background. Reconnecting retries the configured style in the same canvas.

When a theme switch leaves the map blank, inspect `style.load` handling.
`map.setStyle` removes repository-owned images, sources, and layers; the
application reinstalls them after every style load. Duplicate-source errors
indicate that the installer is not idempotent. A base map with no
traffic after a theme change indicates that rehydration did not restore current
source data.

If the application theme changes but the base map does not, verify both
`VITE_MAP_STYLE_URL` and `VITE_MAP_DARK_STYLE_URL`, then restart Vite after
editing `.env.local`. Invalid saved values fall back to Light. Auto follows
`prefers-color-scheme`; verify the operating-system/browser scheme and that the
stored value is `auto`, not an explicit Light/Dark override. To reset a valid
choice and the other remembered controls, use **RESET PREFERENCES**. The
authoritative key is `livetrafficstan.preferences.v1`; the legacy
`livetrafficstan.theme` key is only a rollback mirror. Reset does not clear
private local history.

If a shared link is ignored, confirm it uses a `#v=1&...` fragment and contains
no duplicate, unknown, partial-camera, non-finite, or out-of-range fields.
Opening a valid link does not save its overrides. Shared coordinates are
rounded, but the link can still remain in browser history or the clipboard.

Changing Metric versus Aviation / Nautical affects formatting only. If provider
requests, viewport eligibility, vessel filter membership, selection, or
history changes at the same time, treat that as a regression rather than an
expected unit conversion.

## Operations More stops before all orbital results

Operations More is the only vertical scroll owner. On mobile, touch-drag,
wheel, Page Down, or Tab through the focusable region to reach the final
orbital result.

If results appear clipped behind a second scroll area, inspect computed styles:

- `.app-shell` must expose `--app-visual-viewport-height` equal to
  `window.visualViewport.height` when that API is available, and
  `--app-visual-viewport-58` must be 58% of the same value;
- `.control-panel__more-body` must fill the space below the fixed disclosure
  summary, use `overflow-y: auto`, and keep `touch-action: pan-y`;
- `.orbital-results` must use `max-height: none` and `overflow: visible`;
- `.control-panel__tasks` must scroll with the More body rather than remain
  sticky over a short result viewport.

A private orbital-list height cap is a regression. A bounds-only check is also
insufficient: after scrolling to the end, hit-test the center of the final
result with `document.elementFromPoint()` and confirm the result itself is
topmost and actionable. After an update, use **Refresh app** if an older
application shell still serves the previous CSS.

## Aircraft shows unavailable

The default browser endpoint is `/api/aircraft`, which Vite proxies to
ADSB.lol. Common causes are:

- opening `dist/index.html` directly rather than using `npm run preview`;
- deploying only static files without the checked same-origin Worker;
- a temporary ADSB.lol rate limit or service failure;
- replacing the endpoint with a server that does not allow browser CORS;
- network filtering of `api.adsb.lol`.

Production records one protected `aircraft_delivery` value:

- `worker-proxy` uses `/api/aircraft` and the Cloudflare Worker;
- `oci-private-relay` uses the same browser route, then the fixed Workers VPC
  Service, private Tunnel, and loopback OCI relay;
- `adsb-lol-direct` uses `https://api.adsb.lol` from the browser.

For direct mode, inspect the provider response rather than the Worker route.
The response must be `200` or an explicit throttling response and must allow
the deployed origin through `Access-Control-Allow-Origin`. A JavaScript
`TypeError: Failed to fetch` with an HTTP response visible only in DevTools
usually means CORS is absent. Do not replace it with `mode: no-cors`: that
produces an unreadable opaque response and cannot supply aircraft JSON or
`Retry-After`.

The provider retries on its normal polling cadence. A temporary failure can
therefore show `PARTIAL` before recovering. Inspect the warning in the browser
console and the HTTP response rather than treating zero aircraft as an error:
zero is valid when no aircraft are inside the current visible viewport.

For the Cloudflare boundary:

- `404` on `/api/aircraft/v2/point/...` means the production route shape is
  wrong;
- `400` means coordinates, radius, or a query string failed strict validation;
- `405` means a non-GET request;
- `502` means a network/read failure, redirect, or response-size rejection;
- `504` means the ten-second total upstream deadline expired;
- upstream `403`, `429`, and `5xx` remain their original status and body.

Workers Free uses shared outbound network identity. The 2026-09-23 production
check confirmed that ADSB.lol can return `429` to that shared egress even when
the same bounded request succeeds from another stable identity. This remains
relevant to `worker-proxy` rollback/diagnostic mode only. Current production
uses `oci-private-relay`; its deployment smoke may wait through bounded local
`503 Retry-After` guidance for at most twelve attempts and 330 seconds of
admission sleep inside one nine-minute end-to-end deadline, but requires an
eventual valid `200` aircraft payload. Only the relay's explicit local
admission marker is retryable; an upstream/provider `503` fails immediately.
Provider `429`, authentication failure, VPC failure, and other unexpected
statuses fail activation. This larger bounded window prevents an ordinary
polling client from repeatedly winning the relay's shared 20-second slot;
rejected admission attempts still create no provider request.

The private OCI path is documented in
[OCI Aircraft Relay](oci-aircraft-relay.md). In `oci-private-relay` mode,
interpret a relay-local `503` with `Retry-After` as aggregate admission or
persisted provider backoff: that request did not reach ADSB.lol. The existing
aircraft scheduler waits for that guidance without adding another scheduler or
resetting its normal cadence. A VPC
`fetch()` exception indicates VPC Service, Tunnel, connector, or loopback
origin failure; `401` indicates a Worker/relay secret mismatch. Do not respond
by rotating the OCI address, falling back to shared Cloudflare egress, exposing
a public relay, or accelerating browser polling.

An OCI instance lifecycle of `RUNNING` is not sufficient guest-health
evidence. During the 2026-09-29 recurrence, VPC fetches threw while a bounded
Run Command remained unacknowledged. Ordinary soft reset did not provide
durable recovery, and `REBOOTMIGRATE` was unavailable because no maintenance
event was pending. A supported `DIAGNOSTICREBOOT` restored the path through
explicit `STOPPING -> STARTING -> RUNNING`, followed by truthful connector
startup `502`, bounded relay `503 Retry-After`, and real `200` JSON. After
recovery, use a noninteractive `sudo -n systemctl restart` canary, loopback
`/healthz`, one cadence-cleared production response, and exact production
smoke. Do not infer recovery from stale plugin timestamps alone.

The later orbital-enrichment deployment recurrence is recorded in #174:
exact source `96d67b6da3e395be79acff27b47ad6dee34de309` deployed healthy
application/orbital/enrichment assets in run `36627068064`, while only the
aircraft route returned `502`. Diagnostic reboot entered `STOPPING` at
`20:35:14Z`, `STARTING` at `20:35:57Z`, and `RUNNING` at `20:36:28Z`;
bounded probes recovered to real ADSB JSON at `20:38:04Z`. Canonical
same-source run `36627748051` then passed full smoke. Do not roll back a
healthy independent application release for this isolated relay failure.

The 2026-10-01 map follow-up repeated the same isolated recovery. Deployment
run `36887715303`, attempt 1, published exact source
`560a9bb409a92036996e391500ec36b1d7b0e728` as version
`45cccadf-0456-4812-aed3-54286886a3c0`; the release header, Static Assets, and
orbital surface were healthy while only aircraft returned `502`. The supported
diagnostic reboot produced `STOPPING -> STARTING -> RUNNING`; four bounded
probes remained `502`, then real aircraft JSON returned. The same workflow
inputs passed on attempt 2 as version
`6b6043b8-3a14-49c0-8af3-b5843f8eb09f`. Treat this as an independent
aircraft-only infrastructure recurrence, not permission to roll back a healthy
application, rotate identity, or fall back to shared egress.

ADSB.lol rejects generic Worker identification. The proxy must send the stable
public LiveTrafficStan User-Agent. Do not work around a `403` by forwarding
browser headers, cookies, authorization, or a client-controlled destination.

Run `npm run build && npm run check:deploy`, then
`npm run preview:worker` to distinguish a Worker contract problem from Vite's
broader convenience proxy. A missing asset must remain a real 404. On a public
deployment, compare the `X-LiveTrafficStan-Release` header with the exact
deployed SHA.

Cloudflare can briefly serve the predecessor Worker from one edge after
Wrangler reports a successful upload. The Worker probe uses the same bounded
60-second propagation window as Static Assets only when the response already
has the required `400`, `no-store`, and no-CORS policy plus a different valid
lowercase 40-hex `X-LiveTrafficStan-Release`. Missing or malformed release
headers, unexpected status, cache-policy failure, and CORS regression fail
immediately rather than being retried. A persistent canonical mismatch still
fails the release; do not change the source or bypass the exact-current-`main`
guard.

Production deployment credentials exist only in the protected GitHub
`production` environment. This includes `AIRCRAFT_RELAY_AUTH_TOKEN` when
private mode is used. Do not duplicate them in repository secrets, place them
in `.env.local`, or expose them through any `VITE_*` variable.

The deployment workflow supplies the relay token atomically with the exact
Worker deployment through a mode-600 temporary `--secrets-file`, then removes
that file in an `always()` cleanup. A separate `wrangler secret put` is not
safe after a version rollback because Wrangler refuses to mutate a secret when
the latest uploaded version is not the active deployment. If deployment fails
at a standalone secret-configuration step after rollback, update or restore
the canonical workflow rather than changing the active version manually.

## METAR shows unavailable, waiting, or empty

METAR is optional and independent of live traffic. It makes no startup request
and has no periodic poller. First enable may need to load the pinned airport
asset before it can derive explicit ICAO station IDs.

- **Paused until the map shows an eligible view** means the live-traffic
  viewport is still updating or exceeds the 100 km safety boundary. Zoom in or
  reduce tilt.
- **Too many qualifying stations** means more than 50 explicit four-letter
  ICAO codes are visible. The app refuses to truncate the station set; zoom in.
- **No qualifying stations** means the reduced large/medium OurAirports
  projection has no explicit ICAO code in the view. It is not a global
  no-weather statement.
- **No current observations returned** is a valid empty AWC result. It does not
  prove station coverage, clear weather, or an airport outage.
- **Waiting** preserves the one-minute session request-start boundary or a
  longer provider `Retry-After`. Theme changes, clustering, and layer
  hide/show do not bypass it.

For a local proxy failure, inspect
`/api/weather/metar?ids=EETN` and confirm Vite or `preview:worker` is serving the
application rather than opening built files directly. The official AWC API does
not permit browser CORS, so pointing `VITE_WEATHER_ENDPOINT` directly at
`aviationweather.gov` is not a supported workaround.

For the Cloudflare boundary:

- `400` means the query was missing, repeated, noncanonical, unsorted,
  duplicated, lowercase, malformed, over 50 stations, or contained another
  parameter;
- `405` means a non-GET request;
- `502` means a network/read failure, redirect, unsafe content type, or
  response-size rejection;
- `504` means the eight-second upstream deadline expired;
- upstream `429` preserves `Retry-After`.

Use **Retry METAR** after the displayed boundary, or **Refresh METAR** when
enabled. A weather failure must not change aircraft/marine status, map health,
camera, search, ports, airports, clustering, or traffic selection. Reports
older than 75 minutes are labeled stale and reports older than 120 minutes are
removed.

METAR/SPECI is observed weather, not a forecast, route, airport board, or
operational status. Enabling it sends visible qualifying ICAO station IDs
through the application host to AWC. Do not infer missing weather from absent
static airport points or an empty response.

## Aircraft metadata shows unavailable

Aircraft metadata is optional selected-object context. It never controls the
live ADS-B marker, trail, selection, or provider status.

- **No current database record** means the selected ICAO24 address is absent
  from the pinned projection.
- **Registration or type does not match** means live identity evidence conflicts
  with the static record. The app rejects the record rather than guessing that
  an address was not reassigned.
- **Registration is duplicated** means the source contains the same normalized
  registration for multiple aircraft, so the projection marks it ambiguous.
- **Snapshot exceeded its 45-day limit** means the immutable source version
  needs a reviewed refresh. The current version becomes stale only after
  `2026-10-28T07:35:29Z`.
- A timeout, HTTP error, malformed asset, checksum error, or blocked static path
  remains local to the metadata section. Check `index.json` and the selected
  two-hex-prefix shard under `/aircraft-metadata/2026-09-13-v1/`.

Run `npm run check:aircraft-metadata` to validate the committed data without a
network request. Do not edit a deployed immutable version in place or bypass
identity/staleness checks. A refreshed source, schema, generator, or byte set
requires a new output version followed by
`npm run update:aircraft-metadata`.

## Aircraft photo appears in hover but not selected details

For the same exact selected ICAO24, a successful 500 ms hover lookup should
populate the already-open selected-details photo without a second
Planespotters request. The photo appears after the prominent plausible-route
section and before telemetry. Different aircraft identities must remain
isolated.

If the tooltip has the photo but matching details still show **Load aircraft
photo**, confirm the application includes the shared-cache subscription fix,
then record the selected ICAO24, tooltip ICAO24, request count, and whether the
page is a development Strict Mode build. Do not click repeatedly or add a
second request path as a workaround.

## Marine shows unavailable or reconnecting

Digitraffic requires both HTTPS REST and secure WebSocket access. Check:

- `https://meri.digitraffic.fi/api/ais/v1/locations`;
- `https://meri.digitraffic.fi/api/ais/v1/vessels`;
- `wss://meri.digitraffic.fi:443/mqtt`;
- corporate VPN, firewall, privacy extension, or proxy rules that block MQTT
  over WebSockets.

The MQTT client reconnects no more often than every 15 seconds. REST
initialization may still provide a recent snapshot when streaming is
temporarily unavailable, but the status remains honest about a disconnected
live stream.

## A ship has no reference photo

This is normally expected. The first bundled manifest contains only five
reviewed ferries and requires the selected or stably hovered live vessel to
report a valid exact IMO:

- Finlandia `9214379`;
- Victoria I `9281281`;
- Viking XPRS `9375654`;
- Megastar `9773064`;
- MyStar `9892690`.

Missing, malformed, or unmatched IMO intentionally produces no image. The
application never falls back to MMSI, name, call sign, vessel type, class,
sister ship, or a generic real photograph. HISTORY always omits vessel photos.
On a fine-pointer desktop, only a listed vessel held under the pointer for at
least 500 ms adds the compact tooltip photo; sub-dwell, invalid, and unmatched
hover remains photo-free. Touch users open selected details instead.

For a listed vessel, inspect the exact
`/vessel-photos/2026-09-26-v1/imo-{IMO}.jpg` or `.png` request. A missing or
damaged file is a deployment defect, not permission to substitute another
image. Run `npm run check:vessel-photos` to verify the committed directory,
license record, dimensions, byte counts, and SHA-256 without any upstream
request.

The browser should make no request to Wikimedia, Wikidata, or a ship-tracking
site. Versioned vessel-photo files use immutable browser caching but are
excluded from the service-worker shell. If identity or rights evidence is
disputed, remove that exact manifest entry and asset in a new version and
deploy or roll back; do not replace bytes under the existing immutable path.

## Ports show unavailable

The optional Natural Earth layer is independent of live traffic. No port
request occurs until PORTS is enabled. If the control reports an error:

- inspect
  `/ports/natural-earth-v5.1.2-v1/ports.geojson` for HTTP, timeout, body-size,
  UTF-8, JSON, schema, record-count, rank-distribution, or SHA-256 failure;
- run `npm run check:ports` to validate the committed asset without a network
  request;
- confirm deployment preserved the exact versioned path and immutable cache
  header;
- use **Retry ports** after restoring the asset.

A port failure must not change aircraft or marine status, hide traffic, alter
vessel filters, or make the map unavailable. Do not replace a failed asset with
an empty success. Never edit bytes under an existing immutable version path;
update the manifest and choose a new output version.

Natural Earth is generalized and incomplete even when loading succeeds. Missing
Muuga, Paldiski, Porvoo, or another terminal is not a runtime error. The source
warns that some points may be approximate by up to 20 miles, so it is not
appropriate for harbour operations, navigation, port-call inference, or ETA
interpretation.

## Traffic counts are lower than expected

- Pan or zoom out within the supported viewport limit.
- Reset vessel filters or adjust category, navigation, reported-speed, minimum,
  maximum, and unknown-length choices.
- Confirm the relevant layer is enabled.
- Remember that the app filters normalized provider data to the actual visible
  polygon, not only its larger enclosing query circle.
- Provider coverage depends on nearby receivers and current traffic.
- Objects with invalid coordinates are rejected; stale objects are marked and
  expired objects are removed.

Digitraffic vessels without valid AIS reference-point dimensions are retained
by the provider but cannot pass a positive minimum-length filter. Their length
is not guessed. The default remains 50 m with unknown length excluded. A zero
speed is known; the below/at-least-one-knot boundary is exactly 1.852 km/h.
Reserved AIS ship-type subcodes remain unknown rather than being grouped with
defined passenger, cargo, or tanker codes.

Settled pan, zoom, rotation, pitch, Home, and resize changes all update the
traffic viewport. If its conservative enclosing radius exceeds 100 km, the app
hides traffic and trails, pauses both providers, and shows **Zoom in to see live
traffic** or **Zoom in or reduce tilt to see live traffic**. This is not an
empty provider response. Zoom in or reduce tilt; the existing provider
instances resume at their next allowed cadence, reconnect, REST, or metadata
boundary.

If camera movement causes repeated requests, verify that settled updates are
coalesced and that unchanged enclosing queries do not restart provider work.
Theme changes, layer toggles, and selection must not change the query. Marine
viewport changes must not create a new provider instance or bypass the
five-minute REST gate.

## Browser location is not used

The app automatically reads location when permission is already granted or
changes to granted while the page is open. Prompt, denied, unsupported,
insecure, timeout, and unavailable states keep the configured Tallinn fallback
until permission is granted or an explicit attempt succeeds.

- Use HTTPS or localhost.
- Check the browser's site permission and operating-system location setting.
- Permission being allowed only authorizes the request. A cold or delayed
  operating-system position can still exceed the application's bounded lookup
  window. The app allows up to 20 seconds while keeping the current Home usable.
- After changing permission, return to the page; if the browser does not emit a
  permission-change event, use the explicit location action or reload once.
- If the application reports a timeout, dismiss any remaining permission UI,
  keep the current map open, and use the explicit location action to retry.
  Restarting a browser with a pending update can also restore its connection to
  the operating-system location service.
- Treat an approximate result as expected: the app rounds coordinates before
  provider use and never persists them.

A location failure must not disable the map or either traffic provider.

## Place search fails or coordinates are rejected

The Location form distinguishes strict decimal coordinates from named text:

- use `latitude, longitude`, for example `59.437, 24.754`;
- latitude must be from -90 through 90 and longitude from -180 through 180;
- exponent notation, `NaN`, `Infinity`, incomplete pairs, and extra numeric
  segments are rejected;
- ordinary names with commas, such as `Tallinn, Estonia`, remain place queries.

A valid coordinate pair is rounded locally and never calls Photon. If
coordinates fail while Photon is blocked, correct the local format rather than
waiting for the provider.

Named search occurs only after explicit submit. **No matching places found** is
a successful empty response, not an outage. A temporary-limit message means a
local cooldown or Photon `429` deadline is active; wait for the displayed
deadline and submit manually again. The app never retries search automatically.

For **Place search is unavailable** or a timeout:

- confirm `https://photon.komoot.io/api?q=Tallinn&limit=5` is reachable;
- inspect the browser console and Network panel for CORS, JSON, body-size, or
  provider errors;
- disable a privacy extension, VPN, or corporate filter only if local policy
  permits and it is demonstrably blocking Photon;
- use direct coordinates, Center, or the current map while the service is
  unavailable.

The default endpoint is a direct browser connection. A root-relative
`VITE_GEOCODER_ENDPOINT` requires a separately compatible deployment route;
the checked Cloudflare Worker only proxies aircraft and will return 404 for an
unimplemented geocoder path. Do not add credentials to a `VITE_*` value or
work around CORS by disabling browser security.

Submitted place text appears in the Photon request URL. The app sends it only
on submit, does not send browser Home coordinates for search bias, and does not
persist results. Escape closes current results and returns focus to the input.

## A selected object or trail disappears

Traffic selection is cleared when its layer is hidden, when filtering removes
the object, when the object expires, or when a committed
coordinate/place/Home navigation changes area. That navigation also resets
retained trail points so the app cannot draw a line across unrelated views.
Invalid input and failed search leave the current traffic selection and
history unchanged. Selected trails exist only in memory, contain only provider
observations, and default to 15 minutes and 180 points. Use the Trail controls
to show/hide the selected line or choose 5, 15, 30, or 60 minutes. Each setting
keeps at most 12 points per minute per object, and all trails share a
50,000-point aggregate cap. Increasing the duration cannot restore points that
were already pruned; it collects future observations. Refreshing the page
clears volatile session history, but explicitly enabled private local history
may remain available for playback within its configured bounds.

## Local history is unavailable, full, or not deleting

Private local history is off by default. **ENABLE LOCAL** authorizes only this
browser origin. The status distinguishes initializing, writing, blocked,
stale-tab, quota, deletion, and generic failure states.

- If the database is blocked or this tab is stale, close other LiveTrafficStan
  tabs and use **RETRY LOCAL HISTORY** or reload.
- If quota is full, durable writes stop visibly. Session history and live
  traffic continue. Clear history to delete rows and retry.
- **CLEAR HISTORY** removes volatile and durable observations but keeps the
  opt-in setting. **DISABLE & DELETE** also turns recording off.
- Clear and Disable reject stale queued writes with a recording epoch. If
  deletion fails, the app reports failure rather than claiming success.
- Same-origin tabs receive typed invalidations. Clear removes their volatile
  session history and pending writes before reload; Disable removes pending
  writes. A transient failed batch stays queued and is not silently discarded.
- Quota/write suspension survives passive reloads. Clear is the recovery path
  for quota exhaustion; **RETRY LOCAL HISTORY** retries other visible storage
  failures.
- Browser storage eviction can remove local history. The configured 1/6/24
  hours is a maximum, not a guarantee.

Historical mode is labeled **HISTORY PAUSED** or **HISTORY PLAYING**. Scrubbing
does not query providers or move the live viewport query. Center, coordinate
navigation, a place result, or successful Use Location returns to live before
committing the new view. Manual pan/zoom may stay historical while the separate
live query follows the viewport. Current METAR and third-party aircraft
metadata are intentionally unavailable in history.

After one successful production installation and controlled reload, the
application shell can start cold offline. Live aircraft and marine acquisition
pause through their existing controllers and resume at preserved cadence/
reconnect boundaries when online. IndexedDB playback remains explicitly
historical. External basemap tiles are not cached; the plain local fallback is
not an offline-basemap guarantee.

## The application shell does not install or update

The worker registers only in a production build, secure context, and browser
with Service Worker support. `npm run dev` intentionally has no registration.
Check:

- `/manifest.webmanifest` is JSON with root `id`, `start_url`, and `scope`;
- both versioned PNG icons return successfully;
- `/sw.js` returns JavaScript, `Cache-Control: ... must-revalidate`, and
  `Service-Worker-Allowed: /`;
- the generated shell remains below 4 MiB and every precache response returns
  successfully.

First install does not show **REFRESH APP** and does not claim the already-open
page; reload once after the shell reports ready. A later waiting generation
shows **REFRESH APP**. If activation fails, do not delete caches or unregister
manually until the failed precache request is identified—the active generation
remains usable by design.

At most two `livetrafficstan-shell-*` caches are expected after an update or
rollback. Other origin caches must survive. Provider, map, search, weather,
metadata, port, airport, and history responses must never appear in a shell
cache.

For rollback to a pre-PWA release, deploy `npm run build:pwa-retire` and keep
its `/sw.js` response available. Removing that endpoint immediately strands
dormant registrations. Retirement is complete when the registration and only
the `livetrafficstan-shell-*` caches are gone; preferences and IndexedDB history
must remain.

Port selection is separate. Selecting traffic clears a selected port, selecting
a port clears traffic selection, hiding PORTS or committed navigation clears
the selected port, and an empty map click clears both. Port selection never
creates a traffic trail or a nearby-vessel relationship.

Airport and weather selection use the same mutual-exclusion rule. Hiding their
layer, leaving the eligible station/view set, or committed navigation clears
the corresponding details. Closing a weather detail restores focus to its
bounded list result when present or to the METAR toggle.

## Orbital catalog is unavailable or stale

The scheduled orbital source is controlled by the protected deployment flag.
Current production enables it. A request to:

```text
GET /api/orbits/catalog
```

has these expected states:

- `404` — the deployed orbital catalog flag is off;
- `200` with `X-LiveTrafficStan-Orbital-Source: bootstrap` — no compatible KV
  snapshot exists yet, so the exact-release normalized bootstrap is serving;
- `200` with `X-LiveTrafficStan-Orbital-Source: kv` — a complete scheduled
  snapshot is serving;
- `503` — neither compatible candidate passed validation, or candidates had
  equal retrieval timestamps with different canonical digests.

Check the release SHA, schema, digest, retrieval time, serve time, ETag, and
source headers. Do not diagnose freshness from HTTP `Date` alone: each orbital
record also has its own element epoch.

The expected validator is `W/"<snapshot-sha256>"`. Cloudflare may transform
content encoding at the edge, so a strong origin validator is not stable
across browser encodings. A missing validator or a weak validator whose digest
does not exactly match the payload and digest header is still invalid.

If the first production Cron does not publish:

1. inspect Cloudflare Cron Events for the expected `17 */2 * * *` trigger;
2. compare the last admitted `retrievedAt` second/millisecond with the strict
   two-hour gate. Cron is scheduled by minute, so an event at `00:17:00` can
   truthfully return `not-due` when the prior start was `22:17:35.578`; it
   performs no provider request, and the next `02:17` event is the first
   guaranteed admitted run. Do not manually invoke acquisition to bridge this
   ordinary cadence alignment;
3. verify the deployment summary recorded one exact
   `livetrafficstan-orbital-catalog` namespace ID;
4. inspect the deployed version and require both `ORBITAL_CATALOG` and
   `ORBITAL_CATALOG_COORDINATOR` bindings;
5. verify the protected API token has the required Worker and KV permissions;
6. reproduce with the checked Workers runtime rather than plain Node: Workers
   host functions such as `fetch` are receiver-sensitive and must be called
   through `globalThis`, not as a property of a copied options object;
7. inspect only aggregate status/byte/record/digest evidence; never print raw
   provider bodies;
8. retain the previous snapshot or bootstrap while investigating.

If the active immutable bootstrap will cross the 24-hour browser hard age
before an ordinary repaired Cron can be proven, generate one fresh bounded
snapshot offline into a new never-reused `/orbital-data/<new-version>/`
directory, update the pinned manifest, Worker fallback, and production smoke,
and release normally. Never overwrite a published version, seed KV by hand,
reset the coordinator, or expose an on-demand provider trigger.

Current schema 2 expects catalog ID `celestrak-curated-v1`, key
`orbital:catalog:v2:curated-v1`, immutable path
`/orbital-data/curated-2026-09-30-v1/catalog.json`, and source order
`visual`, `stations`, `weather`, `gnss`, `science`. Run
`npm run check:orbital-catalog` to validate that contract, the
462-record/239,460-byte bootstrap, and the retained schema-1 rollback assets.
A schema mismatch, incomplete per-group join, cross-group conflict,
equal-epoch propagation conflict, timeout, or bound violation is an atomic
refresh failure. A successful refresh must make exactly one v2-key write whose
internal bundle contains current schema 2 and the same-refresh pre-substitution
schema-1 visual body; it must not write the v1 key or perform an eleventh
provider request. A failed final write leaves both prior public
representations. Do not accept a partial union or publish either member alone.

A persisted `301`, other redirect, `403`, or `404` is an intentional blocked
state. Recheck CelesTrak's current endpoint and usage policy before clearing the
coordinator through a reviewed source-contract deployment; do not repeatedly
invoke the object, delete its storage ad hoc, rotate Cloudflare identity, change
group, or add a proxy/fallback. `429` and readable `5xx Retry-After` guidance
must retain the later next-allowed time. Guidance longer than seven days, or an
outcome-storage failure, intentionally leaves acquisition fail-closed until a
reviewed coordinator reset. Catalog schema 2 does not itself reset admission:
the schema-1 coordinator row retains `lastStartedAt`, in-progress state,
attempt sequence, `Retry-After`/`nextAllowedAt`, terminal block, and cadence.

Rollback to a target with the orbital flag off must also remove the Cron
through the checked rollback workflow. Do not delete the KV namespace to fix a
trigger mismatch; compatible versions may still need its last complete
snapshot. Do not delete the Durable Object namespace; rollback derives the
target orbital state from Cloudflare version metadata and applies the matching
checked trigger configuration.

The browser feature is implemented separately from this storage boundary.
Aircraft, vessels, weather, search, map, and PWA behavior must remain usable
when the orbital catalog is unavailable.

## ORBITS is empty, paused, or clock invalid

ORBITS starts off and should make no catalog request before explicit enable.
After enable, inspect only the same-origin `/api/orbits/catalog` request; a
browser request to `celestrak.org` is a defect.

An enabled view can truthfully have no shown orbital marker. Check the
collapsed Operations summary and the Orbits counts before diagnosing a
failure:

- **ORBITS · 192 SHOWN · 0 PASSES ≤90M** means schema validation and current
  propagation succeeded, the current zoom tier renders 192 safe exact-filter
  matches inside the map, and the compatible prediction has no future crossing;
- **ORBITS · 75 SHOWN · PASSES UPDATING** means map counts are current while
  the prediction for the latest viewport/filter revision is still pending;
- **ORBITS · MAP COUNTS UNAVAILABLE** means no settled raw map zoom/footprint
  is available; the app does not substitute rounded shared zoom or world tier,
  and selected details must say map display is unavailable rather than claim a
  subset or selected exception;
- **0 SHOWN · 0 IN MAP · 1 PASS ≤90M** means one modeled ground track is
  predicted to cross the safe local footprint even though none is currently
  inside it;
- **VIEW** opens the existing disclosure and focuses the first result without
  another request, automatic selection, or camera movement;
- use the **Nearby** view for in-map objects and crossings, or **Catalog** for
  the complete validated snapshot, including searchable rows labeled
  **Position unavailable**.

Interpret the control state before retrying:

- **Loading** — the first strict same-origin read is unfinished.
- **Refreshing** — a complete current snapshot is still displayed while an
  ETag revalidation runs.
- **Stale** — the complete snapshot is older than six hours but below its
  24-hour hard age.
- **Offline** — a fulfilled current-tab snapshot may remain modeled; a cold
  tab has nothing safe to use.
- **Clock unavailable** — the device wall clock differs from the same-origin
  response clock by more than two minutes or later jumped more than 30 seconds.
  Correct the operating-system time and use Retry to obtain a new response
  clock. Do not bypass this guard with the device time.
- **No modeled positions** — the catalog succeeded, but every record was
  outside element-age or physical propagation bounds at the anchored time.
  This is distinct from a network failure.
- **Hidden by this zoom tier** — safe current positions exist but are outside
  the deterministic 192/384/current-all display subset. Zoom or select through
  Catalog; rank-hidden objects must not be map-pickable.
- **Selected exception** — the exact safe selected object remains shown outside
  the current zoom or exact type/source-group subset. A matching zoom exception
  remains inside SHOWN and reduces the hidden count. A filter-excluded
  exception is shown as `+1 SELECTED EXCEPTION` outside matching SHOWN,
  MODELED, and IN MAP totals. This is the sole intentional display exception.
- **No catalog matches** and **matching objects have no safe current
  position** are successful filtered outcomes, not provider failures.
- **Crossing estimate unavailable for this view** — the current footprint is
  partial world-spanning or otherwise unsafe. Current points can remain; use a
  local view for the 90-minute crossing list.
- **Whole world is visible** — all valid current subpoints are already in
  view, so no future crossing rank is claimed.
- **Paused while page hidden** or **Paused during HISTORY** — the dedicated
  propagation worker is intentionally absent. Returning to the visible Live
  view reuses a still-valid tab snapshot without another request before its
  revalidation boundary.

If the catalog returns `200` but no worker starts, verify that the response
uses the exact schema-2 vendor `Accept`, includes `Vary: Accept`, and has
matching schema, digest, ETag, source URLs, and canonical record order. A
default request intentionally returns predecessor schema 1. When negotiated
schema 2 is sourced from KV, default schema 1 must also be a KV candidate with
an equal-or-newer retrieval time; an older static default indicates a broken
publication bundle or candidate selector. A partial `206`, HTML response,
missing header, digest mismatch, oversize body, redirect, or invalid UTF-8 is
rejected rather than rendered.

For rollback smoke, inspect the checked-out target before treating a missing
current export as a deployment failure. A schema-1-only or pre-negotiation
schema-2-only target intentionally has no fixed vendor `Accept`, legacy
validator, or `Vary: Accept`; current smoke must validate its single default
representation with that target's own exports. Only a dual-representation
target receives negotiation and cross-representation checks. Disabled targets
must remain a single `404` check. Do not work around a contract mismatch by
retrying smoke, invoking the provider, changing Cron state, or weakening
rollback protections.

If an installed app reports a missing `orbital.worker-*.js`, use the existing
**Refresh app** flow and verify that `/sw.js`, `index.html`, and the current
hashed assets were deployed atomically. Do not cache `/api/orbits/catalog` or
`/orbital-data/*` in the application shell. The worker asset may be present in
the shell before ORBITS enable, but it must not execute or make a catalog
request until enable.

Hiding ORBITS, committed navigation, or HISTORY clears selection and the
predicted track. Ordinary pan, rotate, pitch, resize, theme, and style changes
should retain selection and make no catalog request. If they do not, record the
same-canvas, source, request, and console evidence before changing provider
configuration.

## Orbital purpose or image is unavailable

Only exact current `HST` / NORAD `20580` and `ISS (ZARYA)` / NORAD `25544`
identities are reviewed in manifest `2026-09-29-v1`. Every other object,
including rocket bodies and debris, intentionally reports purpose/image
unavailable. Do not add a generic satellite/rocket picture or infer a mission
from the object name, owner, orbit, launch family, or payload.

For a reviewed object, confirm current NORAD ID, name, international
designator, and exact SATCAT type still match the manifest. A mismatch fails
closed. Then run:

```bash
npm run check:orbital-enrichment
```

This checks immutable paths, NASA provenance, rights notice, file inventory,
dimensions, limits, and SHA-256 without a network request.

Purpose is bundled and should appear offline. The photograph is deliberately
not in the PWA shell and starts only after exact selection. If it fails while
offline, details say so and modeled orbital data remains available. If it
fails online, inspect the same-origin
`/orbital-enrichment/2026-09-29-v1/norad-*.jpg` response for exact `200`,
declared JPEG media type, manifest byte count, and unchanged bytes. The
application verifies SHA-256 before creating a Blob URL and treats a failure
as terminal for the running tab rather than retrying on reselection. A hover
must never contact NASA or request the same-origin asset; a tooltip can reuse
only a validated Blob URL created by selected details earlier in the tab.

Current application source `560a9bb409a92036996e391500ec36b1d7b0e728`
retains the same previously proven uncached `200 image/jpeg` Static Assets with
exact 46,716-byte and 48,741-byte lengths plus one-year immutable caching. Any
different bytes, media type, redirect, repeated request, NASA runtime request,
or Service Worker response is a release defect.

## Configuration fails at startup

Review `.env.local` for:

- non-numeric or out-of-range latitude/longitude;
- malformed endpoint URLs;
- protocol-relative or credential-bearing geocoder URLs;
- `http:` map or REST endpoints where HTTPS is required;
- `ws:` marine endpoints where secure `wss:` is required.

Delete an override to return to the checked-in default. All Vite environment
changes require restarting the development server.

## npm reports cache ownership or EEXIST errors

This is an npm cache problem rather than an application requirement. Use a
writable cache for the install, for example:

```bash
npm install --cache /tmp/livetrafficstan-npm-cache
```

Do not commit the temporary cache or weaken repository permissions to work
around a shared machine cache.

## The built bundle warns about a large chunk

MapLibre is the primary rendering engine and accounts for most of the main
bundle. MQTT is already split into a separate dynamic chunk. The Vite warning
does not make the build invalid; investigate regressions when a change adds
substantial new weight, but do not add a framework or complicated chunking
scheme solely to silence the threshold.

## Attribution is missing

Do not hide MapLibre attribution controls. The application must visibly credit:

- OpenFreeMap, OpenMapTiles, and OpenStreetMap contributors;
- Photon and OpenStreetMap contributors beside the Location control;
- ADSB.lol and ODbL;
- Mictronics aircraft-database and ODC-By 1.0 whenever static aircraft metadata
  is displayed;
- Fintraffic Digitraffic and CC BY 4.0, including the filtering/normalization
  change notice.
- Natural Earth and its public-domain terms, with generalized/incomplete
  wording for the optional port layer.
- OurAirports and its public-domain terms, with static/non-operational wording.
- NOAA/NWS Aviation Weather Center, source/retrieval time, public-domain caveat,
  and modified observation-not-forecast wording for METAR/SPECI.

Digitraffic is a regional source with an unknown exact coverage boundary. A
connected stream and zero ships shown do not prove that a location is covered
or vessel-free.

The Apache License 2.0 source license and project `NOTICE` do not replace these
runtime data obligations.
