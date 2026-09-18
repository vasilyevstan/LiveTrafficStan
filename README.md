# LiveTrafficStan

LiveTrafficStan is a lightweight live map of aircraft and significant vessels
around Tallinn, Estonia. It combines open traffic data with MapLibre GL JS in a
single React application, without accounts, a database, or persistent tracking.

![LiveTrafficStan showing live aircraft and vessels around Tallinn](docs/images/live-traffic-map.png)

## Current features

- Live aircraft from [ADSB.lol](https://www.adsb.lol/) with approximately
  20-second refreshes.
- Live marine traffic from
  [Fintraffic Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) using
  REST initialization and MQTT over secure WebSockets.
- OpenStreetMap-derived vector maps from
  [OpenFreeMap](https://openfreemap.org/), rendered with MapLibre GL JS.
- Explicit Light and Dark themes that persist locally and switch the base map
  without recreating MapLibre or resetting live traffic state.
- Configurable 10, 20, 50, and 100 km Tallinn-centered radii.
- Automatic traffic-area changes after a settled pan, while zoom remains
  visual and the selected radius remains the explicit coverage boundary.
- A session Home/Center action plus privacy-safe one-shot browser location:
  already-granted permission and grants made while the page is open are used
  automatically; otherwise location is an explicit action with Tallinn
  fallback.
- Independent aircraft and ship layers plus 25, 50, 100, and 150 metre minimum
  vessel-length filters.
- Honest detail cards, provider-specific health, stale/expired handling, and
  partial operation when one provider fails.
- Short interpolation only between observed positions and a bounded 15-minute
  in-memory trail for the selected object.
- Responsive floating controls, keyboard focus states, non-color status labels,
  and original programmatically drawn marker silhouettes.

## Quick start

Use Node.js 20.19 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The checked-in defaults work without API keys.
To change the center or provider endpoints, copy `.env.example` to `.env.local`
and edit only the values you need.

Run all local quality checks with:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Test the production output and its local aircraft proxy with:

```bash
npm run preview
```

## Architecture

Provider-specific code validates and normalizes external payloads before React
or MapLibre sees them:

```text
ADSB.lol polling ───────┐
                       ├─> normalized traffic -> freshness/history -> map + UI
Digitraffic REST/MQTT ──┘
```

The application keeps one MapLibre instance and updates persistent GeoJSON
sources and layers. Marine MQTT messages are merged and emitted at most once
per second. Aircraft polling and marine connections pause while the document is
hidden and resume immediately when it becomes visible.

Session home center, active provider query center, camera, and radius are
separate state. Settled pans replace the latest desired provider center without
adding aircraft requests beyond the 20-second cadence. Marine center changes
reuse and refilter the global MQTT cache rather than reconnecting.

Light/Dark changes use `map.setStyle` on that same MapLibre instance. An
idempotent installer restores traffic images, sources, layers, current data,
visibility, radius, and trail after each style load while preserving camera,
selection, provider state, and connections.

See [Architecture](docs/architecture.md) for component boundaries, data flow,
failure isolation, rendering, and deployment details.

## Configuration

The defaults are centralized and validated in
[`src/config/appConfig.ts`](src/config/appConfig.ts). Browser-safe overrides are
available for:

| Variable | Default |
| --- | --- |
| `VITE_CENTER_LATITUDE` | `59.437` |
| `VITE_CENTER_LONGITUDE` | `24.7536` |
| `VITE_CENTER_LABEL` | `Tallinn, Estonia` |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` |
| `VITE_MAP_DARK_STYLE_URL` | `https://tiles.openfreemap.org/styles/dark` |
| `VITE_AIRCRAFT_ENDPOINT` | `/api/aircraft` |
| `VITE_MARINE_REST_ENDPOINT` | `https://meri.digitraffic.fi` |
| `VITE_MARINE_MQTT_ENDPOINT` | `wss://meri.digitraffic.fi:443/mqtt` |

These variables are embedded in the client bundle and must never contain
secrets. See [Configuration](docs/configuration.md) for validation rules,
operational thresholds, and examples.

## Data providers and licensing

| Purpose | Provider | Runtime data license | V1 access |
| --- | --- | --- | --- |
| Map | OpenFreeMap / OpenMapTiles / OpenStreetMap | Provider and OSM attribution applies | Direct browser access |
| Aircraft | ADSB.lol | ODbL 1.0 | Same-origin Vite proxy |
| Marine | Fintraffic Digitraffic | CC BY 4.0 | Direct REST and MQTT |

The repository's Apache License 2.0 applies to source code only. Distributed
derivative works must preserve the attribution in [`NOTICE`](NOTICE) as
described by the license. The source license does not relicense map, aircraft,
or marine data, whose required attribution remains visible on the map. See
[Data Sources and Licensing](docs/data-sources-and-licensing.md) for the
verified contracts, official links, and the reasons Airplanes.live and OpenSky
were not selected for V1.

## Deployment

`npm run build` creates static assets in `dist/`, but a fully static host is not
enough for the default aircraft integration. ADSB.lol does not currently send
browser CORS headers, so production hosting needs a small same-origin
serverless/edge proxy equivalent to the rule in [`vite.config.ts`](vite.config.ts),
or a compatible replacement aircraft provider.

No proxy secret is required. Do not remove exact-radius client filtering or
provider attribution when implementing a deployment adapter.

## Known limitations

- Public providers offer no application SLA, and live traffic coverage varies
  by receiver availability and time.
- The default aircraft endpoint works through Vite development and preview;
  arbitrary static hosting needs the proxy described above.
- Digitraffic's global MQTT stream is filtered to the selected radius in the
  browser. V1 does not persist received traffic.
- Trails disappear on refresh and are intentionally limited to the selected
  object.
- Browser location is one-shot, rounded, and session-only; it is not continuous
  tracking and exact coordinates are not persisted.
- Theme preference is limited to explicit Light/Dark selection; there is no
  automatic system-theme mode.
- V1.1 has no location search, route enrichment, playback, weather overlays,
  accounts, saved center preferences, or offline mode.

Planned work is tracked in
[GitHub Issues](https://github.com/vasilyevstan/LiveTrafficStan/issues), not
silently expanded into V1.

## Project documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Data Sources and Licensing](docs/data-sources-and-licensing.md)
- [Development and Testing](docs/development-and-testing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Engineering Decisions](docs/decisions.md)
- [GitHub Wiki](https://github.com/vasilyevstan/LiveTrafficStan/wiki)

## License

LiveTrafficStan source code is available under the
[Apache License 2.0](LICENSE). Redistributions and derivative works must retain
the applicable license, copyright, and [`NOTICE`](NOTICE) attribution. This
keeps the project open for permissive personal and commercial use while
preserving credit to the original project and author.
