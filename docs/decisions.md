# Engineering Decisions

## Static-first V1

LiveTrafficStan is a local-first browser application with no database, accounts, authentication, or persistent backend. This keeps the V1 deployable as static assets except for the aircraft CORS proxy described below.

## React, TypeScript, Vite, and MapLibre

React and TypeScript provide a small typed component model. Vite supplies the development server, production build, and the smallest local proxy needed for aircraft data. MapLibre GL JS provides an open map renderer and efficient GeoJSON sources and layers.

## OpenFreeMap map style

OpenFreeMap's Positron style is the V1 base map because it is OSM-based, MapLibre-compatible, key-free, muted, and replaceable through one configuration value. The application adds stronger blue traffic and control styling rather than maintaining a large custom map style.

## ADSB.lol remains the sole aircraft provider

The dated
[aircraft-provider evaluation](aircraft-provider-evaluation.md) retains
ADSB.lol because its point/radius API remains the smallest compatible,
currently keyless, ODbL-licensed option.

Airplanes.live now publishes a closely compatible v2 contract, but its current
endpoint is contact-gated and its API-specific data rights, rate, caching,
attribution, and public-display terms are unresolved. OpenSky's current terms
require a written license for operational REST use in a live product, and its
bounding-box state-vector contract, OAuth credentials, and daily credits add
material complexity.

ADSB.lol does not currently provide general browser CORS headers. Vite handles
development and preview; production uses a strict same-origin Cloudflare
Worker. No provider secret is involved. The Worker validates only the current
point route, uses a total deadline and body cap, preserves provider
status/body/`Retry-After`, disables invocation URL logs, and does not cache live
responses.

No provider selector, automatic failover, aggregation, or alternative adapter
is added. Those mechanisms would introduce provenance, duplicate-resolution,
licensing, credential, and operational complexity without a demonstrated
requirement. The existing application-owned provider interface is sufficient
for a future deliberate replacement.

## Cloudflare Worker plus Static Assets

Cloudflare Workers with Static Assets is the smallest production boundary for
the Vite client and required ADSB.lol proxy. Static files bypass Worker
execution; only `/api` and `/api/*` invoke code. The fixed point route
constructs one hard-coded upstream destination and cannot act as a general
forwarder.

The free plan's 100,000 dynamic requests/day covers about 23 continuously
active browser sessions at the application's nominal 4,320 request/day upper
envelope, while static asset requests are documented as free and unlimited.
This is a budget estimate, not ADSB.lol capacity permission or an SLA.

Netlify is technically viable but places production deploys, bandwidth,
requests, and function compute in one 300-credit monthly budget without
providing a capability this one-route application needs. GitHub Pages plus a
separate Worker would add a second deployment unit or split-origin CORS.

Fingerprint-named assets use immutable browser caching. Aircraft responses use
upstream and downstream `no-store`; no shared response cache or rate-control
service is added without measurements and provider-policy evidence. Worker
observability is disabled because the route contains rounded camera
coordinates.

Deployments require an exact current `main` SHA, rerun the complete validation
suite, serialize production operations, deploy code and assets atomically, and
verify matching client/MapLibre-worker bytes plus bounded provider smoke.
Account selection and credentials remain the explicit external blocker in
Issue #39 rather than a client-side secret or temporary-account workaround.

## Digitraffic MQTT plus REST metadata

Digitraffic explicitly recommends five-minute REST polling, which is too infrequent for smoothly updated live vessel positions. V1 uses the provider's MQTT-over-WebSocket feed for live location and metadata messages.

REST remains useful for an initial bounded position snapshot and an initial vessel metadata snapshot. The metadata response observed during planning contained fewer than one thousand records and was under 300 KB uncompressed, so one startup fetch is simpler and lighter than dozens of per-vessel requests.

Eligible viewport changes reuse the MQTT connection and immediately refilter
the global in-memory message cache. A new location REST snapshot for the
viewport's enclosing circle is allowed only after the five-minute query refresh
gate. Automatic reconnect
attempts are spaced 15 seconds apart to remain within Digitraffic's documented
connection allowance.

## Digitraffic remains the sole marine provider

The dated
[marine-provider evaluation](marine-provider-evaluation.md) retains
Fintraffic Digitraffic because it remains the only reviewed provider that is
keyless, browser-native, and licensed under clear CC BY 4.0 terms for this
public map.

Digitraffic is represented as a regional source with an unknown exact coverage
boundary. The UI describes transport as connected separately from coverage and
says how many ships are shown rather than treating zero as proof that no
vessels exist. Officially documented Class A scope and upstream fishing-vessel
filtering remain explicit.

AISstream.io requires a server-side key and relay while its returned-data
rights remain unresolved. Datalastic requires a paid server-held key, has a
50-NM/92.6-km radius limit, and does not establish permission to expose raw
coordinates in this public client. Kpler/MarineTraffic requires a commercial
agreement for public display and redistribution.

No relay, provider selector, automatic geographic selection, alternate
adapter, failover, aggregation, or MMSI source-precedence framework is added.
Browser-local filtering of Digitraffic's all-published-vessels MQTT stream
reduces display work, not incoming network bandwidth.

## Application-owned traffic models

Provider payloads are decoded and normalized at the provider boundary. Map and UI code consume application-owned aircraft and vessel models and do not depend on raw ADSB.lol or Digitraffic response shapes.

## MapLibre sources and layers

Aircraft, vessels, and the selected trail are represented as GeoJSON sources. MapLibre symbol and line layers are updated in place, avoiding a React component or DOM marker for every traffic object.

## Bounded provider-reported silhouette vocabulary

The map uses ten original canvas images: light/small fixed-wing, generic
fixed-wing, heavy fixed-wing, helicopter, cargo, tanker, passenger, fishing,
tug, and generic vessel. Cyan still means aircraft and amber still means marine
traffic; category is conveyed by shape rather than a new color system.

Normalization maps only trusted provider fields to application-owned icon keys.
ADS-B A1/A2 use light fixed-wing, A5 heavy fixed-wing, and A7 helicopter.
A3/A4/A6 retain their existing labels and scales but use generic fixed-wing
art. AIS type 30 uses fishing, type 52 tug, 60-69 passenger, 70-79 cargo, and
80-89 tanker. Every unsupported or missing category uses the corresponding
generic fallback.

No model/type string, speed, name, route, operator, position, or movement is
used to infer a category. This keeps the vocabulary truthful and avoids a
classification service or dataset. The ten images are generated once per theme
and reinstalled through the existing single-map style lifecycle.

## Explicit MapLibre worker bundling

MapLibre 6 loads vector tiles through a separate module worker. Vite prebundles the main dependency, which makes MapLibre's inferred adjacent worker URL point at a file Vite did not emit. The result is a loaded style with vector tiles stuck indefinitely in a loading state.

V1 imports `maplibre-gl-worker.mjs` through Vite's `?worker&url` handling and calls `setWorkerUrl` before constructing the map. This keeps the worker URL correct in both development and hashed production output without adding a plugin or custom build system.

## Observed-position interpolation

V1 animates briefly between two positions already supplied by a provider. It does not continue movement beyond the latest observed coordinate. This removes abrupt visual jumps without presenting predicted positions as live facts.

## In-memory bounded history

Recent provider-observed positions are kept only in browser memory, pruned by time and a point cap, and shown only for the selected object. Refreshing the page clears history by design.

## Repository documentation and Wiki

Version-controlled documents under `docs/` are the canonical technical record. The GitHub Wiki provides a comprehensive project-oriented view and links back to canonical files where appropriate. GitHub requires the user to initialize the first empty Wiki page; all subsequent Wiki content is managed through Git.

## Bounded viewport-driven traffic

The visible MapLibre canvas is the traffic display boundary. After settled pan,
zoom, rotation, pitch, Home, or real resize changes, the map reports its
sampled full-canvas perimeter and camera center. Floating controls remain
overlays and do not reduce the geographic area that must be covered.

Domain code canonicalizes and unwraps longitudes around a center rounded to
three decimal places. It rejects non-finite, degenerate, unsafe, or
world-spanning geometry. The farthest footprint point defines a conservative
enclosing circle. Views requiring more than 100 km are ineligible: traffic and
trails are hidden, provider work pauses, invalid selection clears, and the UI
asks the user to zoom in or reduce tilt. The app does not clamp, subdivide, or
claim partial results are complete.

For eligible views, providers receive the enclosing circle while display
filtering uses the actual unwrapped polygon. The 100 km decision occurs before
ADSB.lol's required whole-nautical-mile rounding, so the boundary request uses
54 NM (100.008 km transport coverage) but display eligibility remains 100 km.
Center restores a session Home framing comparable to the earlier 20 km view;
that value is camera framing, not a selectable traffic radius.

## Provider-safe viewport updates

ADSB.lol publishes dynamic rather than fixed rate limits. Settled camera
changes replace the latest desired query in the existing 20-second polling
schedule instead of starting extra requests. Obsolete work is canceled or
ignored, and rate-limit responses remain visible and back off explicitly.

Digitraffic sends global vessel updates over the existing MQTT subscription.
Eligible viewport changes refilter that cache immediately without reconnecting.
Location REST initialization is throttled rather than repeated for every camera
movement. Aircraft and marine instances remain session-lived across hidden and
ineligible-view pauses, preserving aircraft cadence and `Retry-After`, MQTT's
15-second connection spacing, five-minute REST/metadata gates, and marine
caches.

Layer toggles are display preferences. They do not stop or reconstruct provider
lifecycles.

## Touch-only isolated marker tolerance

Every traffic selection keeps the exact rendered-point query first. A completed
single-touch tap may use an 8 CSS-pixel extension in each axis only when that
exact query is empty. The fallback deduplicates world copies by application ID
and selects only one unique currently eligible entity.

Mouse and unknown-modality clicks remain exact, including mouse input on hybrid
devices. A later mouse pointer-down clears prior touch evidence. Drag, pinch,
cancel, stale/hidden entities, clusters without application IDs, and multiple
nearby IDs do not activate a guessed selection. The tolerance is expressed in
CSS pixels and is not multiplied by device pixel ratio.

## Privacy-safe browser location

Location is one-shot and session-only. The app automatically reads it when
permission is already granted or changes to granted while the page is open;
otherwise it starts at Tallinn and offers an explicit action. Coordinates are
rounded before provider use, never persisted, not reverse-geocoded, and not
displayed with unnecessary precision. Continuous tracking is outside scope.

Browser permission and position acquisition are separate states. A granted
permission means that the application may request location; it does not promise
that the operating system can return a cold or delayed fix before the configured
timeout. A timeout therefore keeps the current home usable and must remain
retryable without weakening the one-shot, rounded, session-only privacy
contract.

## Explicit persisted light and dark themes

The Positron presentation remains the default Light theme. V1.1 provides an
explicit Dark choice backed by the OpenFreeMap dark style and CSS custom
properties. Only the selected theme is persisted.

MapLibre remains a single instance. Because `map.setStyle` removes custom
style-owned state, the map layer installer restores traffic images,
sources, layers, data, visibility, and trail after every `style.load`
without changing camera, selection, provider state, or connections.

Traffic artwork keeps cyan aircraft and amber vessels in both themes. The
theme-specific canvas treatment changes fill luminance, detail color, shadow,
and two-tone edge contrast while retaining silhouettes and heading/course
rotation. Image IDs are replaced through MapLibre when the theme changes,
including when both theme options reference the same style URL. The image cache
contains only the bounded light and dark sets.

## `dev`-based pull request delivery

Feature and documentation branches start from `dev` and merge into `dev`
through checked pull requests. Releases enter `main` only through a checked
`dev` to `main` pull request. Repository rulesets require pull requests and
block force pushes/deletion while retaining an explicit administrator emergency
bypass. Required human self-review is intentionally not configured because it
would deadlock CLI-owned changes; automated validation is the technical gate.

Project-specific Copilot instructions and focused read-only reviewers preserve
the MapLibre, provider-rate, privacy, and delivery lessons from V1. They support
implementation and review but do not introduce another approval layer.

GitHub's repository-wide automatic merged-branch deletion remains disabled.
Release pull requests use persistent `dev` as their head, so global automatic
deletion can remove the branch even when branch rules otherwise describe it as
persistent. Merged feature branches are deleted explicitly; `dev` is never
treated as disposable.

## Issue-scoped delivery and external blockers

One GitHub Issue owns one primary delivery workstream. Broad Issues may use
additional focused pull requests when their acceptance groups are independent
or when an external prerequisite is resolved later. Partial work uses
non-closing references and does not close the parent until all non-blocked
criteria are complete.

Provider access, credentials, account roles, data rights, or licensing become a
separate blocker only after concrete evidence identifies the missing
prerequisite. The blocker records affected criteria and measurable completion
evidence while unrelated ready work continues. Placeholder adapters, inferred
data, client-side secrets, and success-shaped fallbacks are not acceptable
substitutes.

## Deterministic checks before live probes

Repeated lifecycle and rate-limit verification uses local fixtures, fake clocks,
fake maps, mocked fetch, and mocked MQTT. A release milestone then performs one
bounded real-provider smoke. This preserves evidence for cancellation, retries,
pause/resume, style rehydration, and error isolation without turning test loops
into provider load.

## Apache-2.0 with preserved project attribution

The source-code license changes from MIT to Apache License 2.0 and adds a
`NOTICE` file identifying LiveTrafficStan and its original author. Apache-2.0
remains a standard permissive open-source license, permits commercial and
proprietary derivative products, includes an explicit patent grant, and
requires distributed derivative works to preserve applicable notices and a
readable copy of the project's attribution.

This meets the goal of keeping the repository public and broadly reusable while
retaining credit if the software becomes part of another product. A custom
advertising clause was rejected because it would reduce compatibility with
standard open-source licensing. Provider data remains under its own licenses
and attribution requirements.
