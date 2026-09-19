# Configuration

## Environment overrides

LiveTrafficStan works with checked-in defaults. Optional Vite environment
variables can be placed in `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Default | Validation and meaning |
| --- | --- | --- |
| `VITE_CENTER_LATITUDE` | `59.437` | Finite number from -90 through 90 |
| `VITE_CENTER_LONGITUDE` | `24.7536` | Finite number from -180 through 180 |
| `VITE_CENTER_LABEL` | `Tallinn, Estonia` | Non-empty display label; blank uses the default |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` | HTTPS URL or root-relative path |
| `VITE_MAP_DARK_STYLE_URL` | `https://tiles.openfreemap.org/styles/dark` | HTTPS URL or root-relative path |
| `VITE_GEOCODER_ENDPOINT` | `https://photon.komoot.io/api` | HTTPS Photon-compatible forward-search endpoint or root-relative deployment path; protocol-relative and credential-bearing URLs are rejected |
| `VITE_AIRCRAFT_ENDPOINT` | `/api/aircraft` | HTTPS URL or root-relative path |
| `VITE_MARINE_REST_ENDPOINT` | `https://meri.digitraffic.fi` | HTTPS URL or root-relative path |
| `VITE_MARINE_MQTT_ENDPOINT` | `wss://meri.digitraffic.fi:443/mqtt` | Secure WebSocket URL or root-relative path |

Invalid numeric ranges, malformed URLs, or disallowed URL protocols fail
explicitly during application startup. Trailing slashes are removed so provider
paths can be appended consistently.

Every `VITE_*` value is embedded in browser JavaScript. These variables are
configuration, not a secret store. Never place API tokens, private endpoints,
credentials, or personal information in them.

## Operational defaults

The following behavior is centralized in `src/config/appConfig.ts` rather than
spread through components:

| Setting | Current value |
| --- | --- |
| Initial Home framing | Comparable to a 20 km local view |
| Maximum eligible enclosing radius | 100 km |
| Touch marker hit extension | 8 CSS pixels per axis after an exact miss |
| Vessel-length presets | 25, 50, 100, 150 m |
| Default minimum vessel length | 50 m |
| Aircraft refresh | 20 seconds |
| Aircraft maximum rate-limit backoff | 5 minutes |
| Aircraft stale / expiry | 45 seconds / 120 seconds |
| Marine metadata refresh | 5 minutes |
| Marine query REST refresh gate | 5 minutes |
| Marine MQTT connect timeout / reconnect | 10 seconds / 15 seconds |
| Marine REST lookback | 15 minutes |
| Marine snapshot flush | 1 second |
| Marine stale / expiry | 2 minutes / 10 minutes |
| Trail duration / cap | 15 minutes / 180 points per object |
| Maximum interpolation duration | 1.5 seconds |
| Query/geolocation coordinate precision | 3 decimal places |
| Settled-viewport delay | 350 ms |
| Geolocation timeout / cached-position age | 20 seconds / 5 minutes |
| Place-search result/query limit | 5 results / 100 characters |
| Place-search cooldown / timeout | 1 second / 8 seconds |
| Place-search `429` fallback | 60 seconds when no readable `Retry-After` is exposed |
| Place-search session cache | 20 successful or empty queries / 15 minutes |

Changing these constants changes application behavior and should include
targeted tests where the value affects filtering, freshness, history, or motion.

## Changing the center

For example, a local Tallinn-area variant can use:

```dotenv
VITE_CENTER_LATITUDE=59.45
VITE_CENTER_LONGITUDE=24.70
VITE_CENTER_LABEL=Tallinn Bay
```

The configured center is the immediate fallback and session home. If browser
location permission is already granted, the app resolves a rounded one-shot
position before starting provider queries. If permission changes to granted
while the page remains open, one lookup updates the session home automatically.
Otherwise it starts at the configured center and offers an explicit
`Use location` action. The lookup remains bounded but allows up to 20 seconds
for a cold operating-system position; a timeout keeps the current Home and
leaves the action available for an explicit retry.

A settled pan, zoom, rotation, pitch, Home, or real resize changes the traffic
viewport. The full map canvas is included even where floating controls cover
it. Center returns to the session Home using a fixed local camera framing;
there is no selectable traffic radius. Neither Home nor viewport coordinates
are persisted. A named-place or coordinate navigation changes only the current
view; it never changes session Home, so Center still returns to the latest
configured or rounded geolocated Home.

## Coordinate entry and named-place search

The Location control submits only when the user activates **Go** or presses
Enter. Two strict decimal numbers separated by one comma are validated and
rounded locally, then used directly as the next camera target. Valid coordinate
input never calls a geocoder. Exponent notation, non-finite values, incomplete
pairs, extra numeric segments, and out-of-range coordinates are rejected.
Ordinary names containing commas remain named queries.

Named text uses the configured Photon-compatible endpoint with `q` and a
bounded `limit=5`. The browser sends `Accept: application/json`, omits
credentials, and adds no custom `User-Agent`, geolocation bias, or automatic
retry. Only one request remains active. New input, Escape, result selection,
Center, Use Location, coordinate navigation, or manual camera movement cancels
obsolete work.

Search starts only on explicit submit, with a one-second per-tab cooldown.
Successful and empty results are cached in session memory for 15 minutes, up to
20 entries. A `429` honors a readable `Retry-After`; otherwise the app requires
one minute before another network search. This is a local fair-use safeguard,
not a claim about an aggregate provider quota.

The default endpoint is called directly from the browser. Submitted place text
therefore appears in the Photon request URL, and Photon receives ordinary
network metadata such as the client IP address. Browser-derived Home
coordinates are not sent to Photon. A root-relative
`VITE_GEOCODER_ENDPOINT` is only a deployment substitution point; the checked
Cloudflare Worker does not add a geocoder proxy.

## Aircraft endpoint and proxy

The default browser request is root-relative:

```text
/api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}
```

Vite development and preview rewrite `/api/aircraft` to
`https://api.adsb.lol`. Production uses the checked Cloudflare Worker.
Setting `VITE_AIRCRAFT_ENDPOINT` to an absolute URL bypasses those same-origin
routes, but it works only if the target explicitly allows browser CORS.

For an eligible viewport, the rounded camera center and conservative enclosing
radius are sent to ADSB.lol. The application decides eligibility against the
100 km limit before rounding outward to the provider's integer nautical miles.
An exact 100 km viewport therefore requests 54 NM, or 100.008 km of transport
coverage, while the client still displays only objects inside the actual
viewport polygon. Deployment proxies must not alter coordinates, units, or
this boundary behavior.

The production Worker enforces the exact `/v2/point` path, canonical coordinate
ranges, and integer 1-54 NM radius. It rejects query strings and every other
method/path, never follows upstream redirects, keeps a ten-second total
deadline, rejects responses over 4 MiB, and preserves upstream status, body,
`Content-Type`, and `Retry-After`. It sends a stable public project User-Agent
because ADSB.lol rejects generic Worker identification; no browser cookie,
authorization, or arbitrary header is forwarded.

Live aircraft responses are never placed in a shared deployment cache.
Fingerprint-named application assets are cached immutably instead. See
[Hosting and Deployment](hosting-and-deployment.md).

## Map style

The style must be readable by MapLibre and all referenced tiles, glyphs, and
sprites must allow browser access. Provider attribution from the source
metadata must remain visible.

MapLibre's module worker is explicitly bundled through Vite in
`TrafficMap.tsx`. If the bundler or MapLibre integration changes, verify both
`npm run dev` and `npm run preview`; loading the style JSON alone is not proof
that vector tiles are being parsed.

`VITE_MAP_STYLE_URL` configures the Light style and
`VITE_MAP_DARK_STYLE_URL` configures the Dark style. A missing preference,
invalid stored value, or unavailable storage selects Light. Theme storage uses
the `livetrafficstan.theme` key and contains only `light` or `dark`; map center
coordinates are never stored.

The current behavioral configuration keeps:

| Setting | Decision |
| --- | --- |
| Light map style | OpenFreeMap Positron |
| Dark map style | OpenFreeMap Dark |
| Theme default | Light |
| Aircraft query cadence during camera movement | No faster than 20 seconds |
| Marine query-triggered REST refresh | No more than once per 5 minutes |
| Ineligible viewport behavior | Hide traffic/trails and pause providers |
| Geolocation precision | Rounded to approximately 3 decimal places |
| Geolocation mode | One-shot, permission-aware, session-only |

Navigation timing and privacy values are centralized in
`src/config/appConfig.ts`.

## Marine endpoints

The REST endpoint must expose Digitraffic-compatible AIS location and vessel
metadata responses. The MQTT endpoint must expose the `vessels-v2` topics over
secure WebSockets:

```text
vessels-v2/+/location
vessels-v2/+/metadata
vessels-v2/status
```

The app sends `Digitraffic-User: LiveTrafficStan/1.0` on REST requests and uses
an ephemeral random MQTT client identifier. Neither value contains user data.

Map movement must not place browser location or other personal information in
that header. Eligible viewport updates reuse the MQTT connection and should
rely on the provider-wide message cache before considering another bounded REST
request. Hidden and ineligible-view pauses retain MQTT, REST, and metadata
deadlines rather than reconstructing the provider.
