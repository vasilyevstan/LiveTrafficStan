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

## Aircraft shows unavailable

The default browser endpoint is `/api/aircraft`, which Vite proxies to
ADSB.lol. Common causes are:

- opening `dist/index.html` directly rather than using `npm run preview`;
- deploying only static files without the checked same-origin Worker;
- a temporary ADSB.lol rate limit or service failure;
- replacing the endpoint with a server that does not allow browser CORS;
- network filtering of `api.adsb.lol`.

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
the same bounded request succeeds from a normal residential connection. This
is provider throttling, not an empty traffic snapshot or a reason to spoof
client IP headers. The deployment smoke accepts only this explicit `429` as a
degraded provider state; other unexpected upstream statuses still fail.

ADSB.lol rejects generic Worker identification. The proxy must send the stable
public LiveTrafficStan User-Agent. Do not work around a `403` by forwarding
browser headers, cookies, authorization, or a client-controlled destination.

Run `npm run build && npm run check:deploy`, then
`npm run preview:worker` to distinguish a Worker contract problem from Vite's
broader convenience proxy. A missing asset must remain a real 404. On a public
deployment, compare the `X-LiveTrafficStan-Release` header with the exact
deployed SHA.

Production deployment credentials exist only in the protected GitHub
`production` environment. Do not duplicate them in repository secrets, place
them in `.env.local`, or expose them through any `VITE_*` variable.

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
