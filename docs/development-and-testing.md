# Development and Testing

## Prerequisites and install

Use Node.js 20.19 or newer and npm 10 or newer.

```bash
npm install
npm run dev
```

The development server normally runs at <http://localhost:5173>. It supplies
the `/api/aircraft` proxy required by the default ADSB.lol integration.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with hot module replacement and the aircraft proxy |
| `npm run lint` | Run Oxlint across the repository |
| `npm run typecheck` | Run strict TypeScript project checks without output |
| `npm test -- --run` | Run the deterministic Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Type-check and create the production bundle in `dist/` |
| `npm run preview` | Serve the production bundle with the local aircraft proxy |

Before publishing a change, run:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Automated test coverage

The V1 suite uses sanitized, local values and does not call live providers. It
covers:

- configuration defaults and invalid overrides;
- ADSB.lol response validation, exact-radius filtering, and metric conversion;
- Digitraffic REST/MQTT normalization, dimensions, ETA, and missing metadata;
- vessel minimum-length filtering;
- current, stale, and expired transitions;
- trail time pruning and point caps;
- interpolation bounds and no extrapolation.

Live provider availability, WebSocket behavior, WebGL rendering, and CORS/proxy
configuration require browser smoke testing because unit fixtures cannot prove
those external contracts.

## Browser smoke test

Use `npm run dev` and verify:

1. OpenFreeMap labels and land/water geometry render, not only the overlays.
2. The status reaches `LIVE` or a truthful provider-specific `PARTIAL` state.
3. Aircraft and vessels appear when current provider coverage contains them.
4. All radius and vessel-length presets update the map and counts.
5. Aircraft and ship layer toggles work independently.
6. Selecting an object opens the correct detail card and a trail appears only
   after multiple observations are available.
7. Closing the card, hiding a selected layer, or allowing the object to expire
   clears selection safely.
8. A narrow mobile viewport keeps controls readable and the map usable.
9. Map and provider attribution remains visible.

Repeat the core check with `npm run build && npm run preview`. Confirm that
`dist/assets/` contains a `maplibre-gl-worker-*.js` file and that the preview
page renders vector tiles. This catches an easy-to-miss MapLibre/Vite worker
regression.

## Failure and lifecycle checks

Browser developer tools can block one provider at a time:

- block `/api/aircraft/*` and confirm marine traffic remains usable;
- block `meri.digitraffic.fi` REST/MQTT access and confirm aircraft remains
  usable;
- block OpenFreeMap and confirm controls/status remain available with a compact
  map error.

Restore access and confirm the provider returns to current state without a page
reload. While the Network panel is open, hide the page long enough to confirm
aircraft polling and the marine connection stop, then restore visibility and
confirm immediate recovery.

## Provider contract probes

Provider behavior changes over time. When modifying an adapter, recheck the
official documentation in `docs/data-sources-and-licensing.md` and use small,
rate-conscious live probes. Do not put captured live payloads containing
unnecessary data into the repository; reduce fixtures to only fields required
by the test.

## Dependency and bundle discipline

Runtime dependencies are intentionally limited to React, MapLibre GL JS, and
MQTT.js. MQTT is dynamically imported because it is needed only after the
marine provider starts. The main MapLibre application bundle is expected to be
large; changes should avoid adding another framework or duplicating mapping,
state, networking, or formatting functionality without a demonstrated need.
