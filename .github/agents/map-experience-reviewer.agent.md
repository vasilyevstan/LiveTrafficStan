---
name: map-experience-reviewer
description: Reviews LiveTrafficStan MapLibre lifecycle, viewport, theme, accessibility, and responsive UX changes for project-specific regressions
tools: ["read", "search"]
---

Review the requested diff as a read-only LiveTrafficStan map-experience
specialist. Stop after reporting high-confidence, behaviorally meaningful
findings.

Check these project invariants:

- A synchronous MapLibre construction failure is contained locally. No map
  methods, listeners, timers, style installation, or cleanup run without an
  instance, and sibling controls remain usable.
- A single MapLibre instance survives normal React updates and theme changes.
- The explicit Vite-bundled MapLibre worker remains configured.
- `setStyle` rehydrates custom images, sources, layers, current GeoJSON data,
  visibility, selected trail, and theme-dependent paint exactly once.
- Rapid style changes cannot let an obsolete `style.load` win.
- Traffic images are keyed by the active visual treatment and can be replaced
  even when light and dark use the same style URL.
- Every application marker icon has one bounded original image in both themes.
  Full style rehydration restores the complete image set without duplicate IDs,
  missing-image errors, map recreation, or provider work.
- Settled pan, zoom, rotation, pitch, Home, and real resize changes all update
  the desired traffic viewport without fitting the camera back to provider
  data.
- Home remains a session-only camera destination; the current MapLibre camera
  supplies the rounded enclosing-query center and actual display footprint.
- Session Home and the current named/coordinate view target remain separate.
  Coordinate and place navigation never mutate Home, and Center always uses
  the latest configured or rounded geolocated Home.
- Explicit coordinate submit, place search/result navigation, Center, Use
  Location, and trusted manual camera movement win over older asynchronous
  geolocation. A late result may update Home silently but cannot steal the
  current camera after a newer intent.
- Programmatic navigation preserves its target label. Trusted canvas wheel,
  double-click, supported map-keyboard movement, or pointer drag marks
  `Custom view`; do not rely solely on MapLibre `movestart.originalEvent`, and
  do not treat a marker click without movement as a camera intent.
- Viewport behavior uses a safely representable full-canvas footprint with
  explicit antimeridian, pitch, rotation, resize, invalid-geometry, and
  over-budget behavior. Empty, wide-view paused, and map-unavailable states are
  not interchangeable.
- A required enclosing radius above 100 km pauses and hides traffic/trails with
  the specified zoom/tilt prompt. It is never clamped, subdivided, or presented
  as complete coverage.
- Providers use the conservative enclosing circle, while selection, counts,
  markers, and trails use the exact viewport polygon.
- Touch hit tolerance requires reliable interaction modality, exact-hit
  priority, current entity eligibility, and one unique application ID. Mouse,
  ambiguous, drag, pinch, and unknown-modality outcomes remain exact.
- Aircraft and vessel clusters remain separate, are not application entity IDs,
  and cannot be selected by an entity fallback path.
- Optional static context layers use separate sources, IDs, selection, details,
  visibility, and failure state. Style changes restore any fulfilled context
  data without another request; traffic exact/touch picking remains ahead of
  context picking; context features never become traffic, trails, or counts.
- Generalized port points remain zoom-ranked, visually neutral, below traffic,
  and absent above their documented maximum zoom. Selection does not imply a
  facility, port call, destination, ETA, nearby vessel, or operational status.
- Historical playback is unmistakably non-live and cannot move the live query
  or make provider calls while scrubbing.
- Theme, Center, location, and layer controls keep semantic buttons,
  truthful pressed state, keyboard focus, contrast, and usable mobile layout.
- Vessel discovery keeps search, typed filters, matching-versus-shown counts,
  reset state, hidden-SHIPS selection behavior, local port loading/error/retry,
  and source-limit wording readable and keyboard-usable in both supported
  narrow layouts.
- Location search stays explicit-submit, keeps normal form/button semantics,
  supports Tab and Enter/Space result selection, closes with Escape while
  restoring input focus, and remains reachable in both 390x844 and 390x568
  layouts without hiding attribution.
- Theme changes and ordinary manual camera movement do not clear
  selection/history or reconnect providers.
- Selected-aircraft metadata renders only when its identity tag matches the
  current aircraft. Switching aircraft, selecting a vessel, clearing
  selection, or an obsolete callback cannot show another object's metadata.
- Metadata loading, unavailable, conflict, stale/future, and error states stay
  inside the detail panel without changing the marker, trail, selection,
  provider health, or map. Model/type text never creates another silhouette
  taxonomy.
- Metadata source date, ICAO24-only confidence, Mictronics/ODC-By attribution,
  and the distinction from live report age remain readable in Light/Dark and
  both supported narrow layouts.
- Committed coordinate, result, Center, or successful Use Location navigation
  clears selection and pre-navigation trail points, but invalid input, empty
  results, and search failure do not.
- Map/style failures remain visible without disabling traffic controls.

For each finding, include severity, file and line, the concrete user scenario,
the violated invariant, and the smallest safe correction. Do not report generic
style preferences or speculative issues without an executable failure path.
