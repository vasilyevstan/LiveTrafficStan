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
| `npm run check:deploy` | Bundle the Worker and Static Assets without credentials or deployment |
| `npm run preview:worker` | Build and run the actual local Cloudflare `workerd` boundary |

Before publishing a change, run:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run check:deploy
```

The same commands run in `.github/workflows/validate.yml` for pull requests and
pushes targeting `dev` or `main`. The Wrangler dry run is credential-free and
does not call a live provider.

## Branch and pull request flow

1. Fetch `origin` and align local `dev` to `origin/dev`.
2. Create a focused feature, fix, or documentation branch from `dev`.
3. Open a detailed pull request back to `dev`.
4. Merge only after the `validate` check succeeds.
5. Release accumulated checked work with a `dev` to `main` pull request.

Do not merge an older local `dev` history back into the remote branch after a
squash release. If the trees are equivalent but commit histories differ, update
the local branch reference to `origin/dev` before creating work.

Repository rulesets require pull requests and prevent branch deletion and force
pushes on both protected branches. An administrator bypass exists only for a
declared emergency. Normal CLI-owned changes still use the pull request path.
Do not configure a mandatory self-review that prevents the repository owner
from merging automated work after checks.

Keep GitHub's automatic merged-branch deletion disabled: a release pull request
uses persistent `dev` as its head and the global setting can delete it. Delete
merged feature branches explicitly after verifying the merge; never delete
`dev`.

Keep one primary workstream per Issue. Use another focused pull request under
the same Issue only for an independent acceptance group or a prerequisite that
was unblocked later. Partial pull requests use non-closing references, and an
evidence-backed external blocker remains visibly linked until its criteria are
complete.

## Automated test coverage

The V1 suite uses sanitized, local values and does not call live providers. It
covers:

- configuration defaults and invalid overrides;
- ADSB.lol request construction, abort forwarding, response/error validation,
  retry guidance, enclosing-circle transport, and metric conversion;
- Digitraffic REST/MQTT normalization, capabilities, provenance, dimensions,
  ETA, missing metadata, one-connection batching, and bounded diagnostics;
- vessel minimum-length filtering;
- current, stale, and expired transitions;
- trail time pruning and point caps;
- interpolation bounds and no extrapolation.

Live provider availability, WebSocket behavior, WebGL rendering, and CORS/proxy
configuration require browser smoke testing because unit fixtures cannot prove
those external contracts.

Map-experience tests also cover:

- synchronous MapLibre construction failure without map-resource cleanup or
  application teardown;
- latest-query coalescing and a minimum 20-second aircraft request-start gap;
- obsolete request cancellation/result rejection and rate-limit backoff;
- antimeridian, rotated, tilted, invalid, exact-100-km, and
  outside-polygon/inside-circle viewport geometry;
- marine viewport changes without MQTT reconnect or REST bursts;
- session-lived aircraft and marine pause/resume without cadence, backoff,
  reconnect, REST, metadata, or cache resets;
- Home/camera/viewport eligibility state transitions;
- exact-first touch picking, CSS-pixel threshold, duplicate world copies,
  ambiguity, hidden/expired IDs, drag, pinch, cancellation, unknown modality,
  and touch-followed-by-mouse behavior;
- granted, prompt, denied, unsupported, timeout, and explicit geolocation
  outcomes without coordinate persistence;
- theme storage validation and unavailable-storage behavior;
- idempotent MapLibre style installation and restoration of custom state;
- theme-keyed traffic image replacement, including identical style URLs and
  stale/live opacity updates;
- all ten bounded silhouette IDs, ADS-B/AIS category boundaries, generic
  fallbacks, and stable identity when provider metadata changes an icon.

Geolocation tests must distinguish permission from acquisition. A granted
permission can still produce delayed success, timeout, unavailable, or obsolete
late callbacks. Repeated tests use deterministic browser abstractions and fake
time rather than relying on the current machine's location service.
Include a successful result beyond the former eight-second window, timeout then
retry, duplicate permission/click suppression, and unmount invalidation.

## Browser smoke test

Use `npm run dev` and verify:

1. OpenFreeMap labels and land/water geometry render, not only the overlays.
2. The status reaches `LIVE` or a truthful provider-specific `PARTIAL` state.
3. Aircraft and vessels appear when current provider coverage contains them.
4. Pan, zoom, rotate, pitch, Home, and resize update the visible traffic area
   after settling.
5. Aircraft and ship layer toggles work independently.
6. Selecting an object opens the correct detail card and a trail appears only
   after multiple observations are available.
7. Closing the card, hiding a selected layer, or allowing the object to expire
   clears selection safely.
8. A narrow mobile viewport keeps controls readable and the map usable.
9. Map and provider attribution remains visible.

For the viewport-driven map experience, additionally verify:

1. Settled pan, wheel/button/pinch zoom, rotation, pitch, and real resize update
   the desired traffic viewport without snapping the camera back.
2. Rapid camera changes resolve to the latest area without increasing aircraft
   request cadence or reconnecting marine MQTT.
3. A view at or below the 100 km enclosing limit shows exact polygon-filtered
   traffic; an object inside the query circle but outside the visible footprint
   stays hidden.
4. Wider or unsafe views hide traffic and trails, clear selection, pause both
   providers, and show the zoom or tilt prompt. Zooming back in resumes at the
   preserved provider boundaries.
5. Center returns to session Home using the initial local framing.
6. Already-granted location starts near the rounded browser location without a
   prompt; other permission states retain Tallinn until explicit action.
7. Dateline, rotated, pitched, and desktop/mobile resized views remain bounded
   and do not become a falsely small query.
8. Repeated Light/Dark changes preserve camera, live traffic, selected object,
   trail, controls, and provider connections.
9. Both themes remain readable on desktop and a narrow mobile viewport.
10. Aircraft, helicopter, and vessel artwork retains its identity over land,
   water, and busy detail at actual marker scale; stale markers remain
   recognizable and distinct from live markers.
11. Light/small, generic, heavy, rotorcraft, cargo, tanker, passenger, fishing,
    tug, and generic-vessel shapes remain distinguishable in Light and Dark
    themes without changing cyan/amber traffic-kind identity.
12. Rapid theme changes restore all ten image IDs once per style generation,
    preserve one map, and do not reconnect or query either provider.
13. A direct touch hit selects normally, an isolated near miss inside the
    8 CSS-pixel box selects the sole eligible ID, and an outside or ambiguous
    tap clears/retains selection according to the normal empty-hit path.
14. Mouse, touch-followed-by-mouse, drag, and pinch interactions do not receive
    the touch fallback, and device pixel ratio does not change the threshold.

Repeat the core check with `npm run build && npm run preview`. Confirm that
`dist/assets/` contains a `maplibre-gl-worker-*.js` file and that the preview
page renders vector tiles. This catches an easy-to-miss MapLibre/Vite worker
regression.

For the production edge boundary, run `npm run preview:worker`. Confirm:

1. `/` returns the built client.
2. The emitted MapLibre worker uses immutable caching and `nosniff`.
3. A missing hashed asset returns 404 rather than HTML.
4. Invalid aircraft coordinates return 400 and unsupported API paths return
   404 without an upstream request.
5. One valid fixed-route aircraft request succeeds with the public project
   User-Agent.
6. Worker responses use no-store and expose no CORS wildcard.

Do not repeatedly use the local edge check as a provider load loop. All path,
timeout, body-size, redirect, status, `Retry-After`, and cancellation cases use
mocked deterministic tests.

## Production deployment validation

The production workflow is manual, exact-SHA, and restricted to the GitHub
`production` environment on `main`. It reruns the full suite and Wrangler dry
run before deploying, then rechecks that the requested SHA is still the current
`origin/main`.

The post-deploy script compares public `index.html` and the dynamically named
MapLibre worker with the validated local bytes. It then checks one ADSB request,
proxy rejection paths, Digitraffic REST/preflight, and one bounded MQTT
subscription. The MQTT client disables reconnect and is force-closed.

This automated check does not replace a real browser acceptance pass for vector
tile rendering, Web Worker execution, browser WSS, themes, attribution,
provider isolation, and mobile layout. Public deployment remains blocked on
Issue #39 until permanent Cloudflare credentials exist.

## Failure and lifecycle checks

Browser developer tools can block one provider at a time:

- block `/api/aircraft/*` and confirm marine traffic remains usable;
- block `meri.digitraffic.fi` REST/MQTT access and confirm aircraft remains
  usable;
- block OpenFreeMap and confirm controls/status remain available with a compact
  map error.

When changing map initialization, also exercise a deliberately throwing map
constructor. Confirm that `Map unavailable` is visible, sibling controls remain
usable, and no map listener, animation loop, retry, or cleanup method runs
without an instance.

Restore access and confirm the provider returns to current state without a page
reload. While the Network panel is open, hide the page or make the viewport
ineligible long enough to confirm aircraft polling and the marine connection
stop, then restore an eligible visible state and confirm recovery at the next
permitted provider boundary. Combine both pause reasons in both orders. Do not
describe provider-safe cadence, `Retry-After`, MQTT reconnect spacing, or
five-minute REST/metadata gates as immediate.

## Provider contract probes

Provider behavior changes over time. When modifying an adapter, recheck the
official documentation in `docs/data-sources-and-licensing.md` and use small,
rate-conscious live probes. Do not put captured live payloads containing
unnecessary data into the repository; reduce fixtures to only fields required
by the test.

Use local fixtures, fake clocks, fake maps, mocked fetch, and mocked MQTT for
repeated lifecycle checks. A milestone needs one bounded real-provider browser
smoke, not repeated live loops for scenarios that deterministic tests can
prove.

For a bounded Digitraffic stream measurement in development, use one ordinary
application tab:

```text
http://127.0.0.1:5173/?marineDiagnostics=1
```

The opt-in collector observes the existing provider instance. It creates no
client, subscription, request, timer, payload archive, identifier inventory, or
telemetry upload. Once per minute and on final provider shutdown it writes one
aggregate JSON snapshot to the console and page title. Use a fixed eligible
view and record the source SHA, UTC interval, browser/platform, and limitations.

Message and payload-byte totals describe the full Digitraffic wildcard stream,
not the current viewport. Payload bytes exclude MQTT/WebSocket/TLS framing and
compression. Provider-emitted vessel counts are query-circle values before
exact viewport and user filtering. Never present one trace as a load test,
coverage census, SLA, or cross-provider benchmark.

Production builds must remove the diagnostics query flag, collector, counters,
timing calls, logging, and title changes. Verify this alongside the normal
production build when editing the instrumentation.

## Dependency and bundle discipline

Runtime dependencies are intentionally limited to React, MapLibre GL JS, and
MQTT.js. MQTT is dynamically imported because it is needed only after the
marine provider starts. The main MapLibre application bundle is expected to be
large; changes should avoid adding another framework or duplicating mapping,
state, networking, or formatting functionality without a demonstrated need.
