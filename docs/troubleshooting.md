# Troubleshooting

## The page loads but the map is blank

Check the browser console and Network panel for the style, worker, vector tile,
sprite, and glyph requests.

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

During V1.1 theme work, also inspect `style.load` handling. `map.setStyle`
removes repository-owned images, sources, and layers; the application must
reinstall them after every style load. Duplicate-source errors indicate that
the installer is not idempotent. A base map with no traffic/radius after a
theme change indicates that rehydration did not restore current source data.

## Aircraft shows unavailable

The default browser endpoint is `/api/aircraft`, which Vite proxies to
ADSB.lol. Common causes are:

- opening `dist/index.html` directly rather than using `npm run preview`;
- deploying only static files without an equivalent same-origin proxy;
- a temporary ADSB.lol rate limit or service failure;
- replacing the endpoint with a server that does not allow browser CORS;
- network filtering of `api.adsb.lol`.

The provider retries on its normal polling cadence. A temporary failure can
therefore show `PARTIAL` before recovering. Inspect the warning in the browser
console and the HTTP response rather than treating zero aircraft as an error:
zero is valid when no aircraft are inside the exact radius.

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

## Traffic counts are lower than expected

- Increase the radius.
- Lower the minimum ship length.
- Confirm the relevant layer is enabled.
- Remember that V1 applies exact geographic filtering after provider
  normalization.
- Provider coverage depends on nearby receivers and current traffic.
- Objects with invalid coordinates are rejected; stale objects are marked and
  expired objects are removed.

Digitraffic vessels without valid AIS reference-point dimensions are retained
by the provider but cannot pass a positive minimum-length filter. Their length
is not guessed.

V1.1 keeps the selected radius as the provider boundary. Zooming out can expose
map area outside the radius circle, but it intentionally does not fetch traffic
there. A settled pan moves the query area automatically; aircraft may wait
until the next allowed 20-second poll, while marine traffic is refiltered from
the live MQTT cache.

If camera movement causes repeated requests, verify that pure zoom and
programmatic fits are suppressed and that rapid pan centers are coalesced.
Marine query changes must not create a new MQTT client.

## Browser location is not used

V1.1 automatically reads location only when permission is already granted.
Prompt, denied, unsupported, insecure, timeout, and unavailable states keep the
configured Tallinn fallback until an explicit attempt succeeds.

- Use HTTPS or localhost.
- Check the browser's site permission and operating-system location setting.
- Retry the explicit location action after changing permission.
- Treat an approximate result as expected: the app rounds coordinates before
  provider use and never persists them.

A location failure must not disable the map or either traffic provider.

## A selected object or trail disappears

Selection is cleared when its layer is hidden, when filtering removes the
object, or when the object expires. Trails exist only in memory, contain only
provider observations, and are limited to 15 minutes and 180 points. Refreshing
the page clears them.

## Configuration fails at startup

Review `.env.local` for:

- non-numeric or out-of-range latitude/longitude;
- malformed endpoint URLs;
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
- ADSB.lol and ODbL;
- Fintraffic Digitraffic and CC BY 4.0.

The Apache License 2.0 source license and project `NOTICE` do not replace these
runtime data obligations.
