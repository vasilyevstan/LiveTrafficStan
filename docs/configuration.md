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

| Setting | V1 value |
| --- | --- |
| Radius presets | 10, 20, 50, 100 km |
| Default radius | 20 km |
| Vessel-length presets | 25, 50, 100, 150 m |
| Default minimum vessel length | 50 m |
| Aircraft refresh | 20 seconds |
| Aircraft stale / expiry | 45 seconds / 120 seconds |
| Marine metadata refresh | 5 minutes |
| Marine MQTT connect timeout / reconnect | 10 seconds / 15 seconds |
| Marine REST lookback | 15 minutes |
| Marine snapshot flush | 1 second |
| Marine stale / expiry | 2 minutes / 10 minutes |
| Trail duration / cap | 15 minutes / 180 points per object |
| Maximum interpolation duration | 1.5 seconds |

Changing these constants changes application behavior and should include
targeted tests where the value affects filtering, freshness, history, or motion.

## Changing the center

For example, a local Tallinn-area variant can use:

```dotenv
VITE_CENTER_LATITUDE=59.45
VITE_CENTER_LONGITUDE=24.70
VITE_CENTER_LABEL=Tallinn Bay
```

The current UI keeps the center fixed for the session. Search, browser
geolocation, arbitrary centers, and remembered preferences are roadmap items.

## Aircraft endpoint and proxy

The default browser request is root-relative:

```text
/api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}
```

Vite development and preview rewrite `/api/aircraft` to
`https://api.adsb.lol`. A production platform must provide the equivalent
same-origin rule. Setting `VITE_AIRCRAFT_ENDPOINT` to an absolute URL bypasses
that rule, but it works only if the target explicitly allows browser CORS.

The selected radius is rounded up for ADSB.lol's integer nautical-mile request.
The client then applies the exact configured kilometre radius, so deployment
proxies must not alter response coordinates or units.

## Map style

The style must be readable by MapLibre and all referenced tiles, glyphs, and
sprites must allow browser access. Provider attribution from the source
metadata must remain visible.

MapLibre's module worker is explicitly bundled through Vite in
`TrafficMap.tsx`. If the bundler or MapLibre integration changes, verify both
`npm run dev` and `npm run preview`; loading the style JSON alone is not proof
that vector tiles are being parsed.

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
