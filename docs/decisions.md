# Engineering Decisions

## Static-first V1

LiveTrafficStan is a local-first browser application with no database, accounts, authentication, or persistent backend. This keeps the V1 deployable as static assets except for the aircraft CORS proxy described below.

## React, TypeScript, Vite, and MapLibre

React and TypeScript provide a small typed component model. Vite supplies the development server, production build, and the smallest local proxy needed for aircraft data. MapLibre GL JS provides an open map renderer and efficient GeoJSON sources and layers.

## OpenFreeMap map style

OpenFreeMap's Positron style is the V1 base map because it is OSM-based, MapLibre-compatible, key-free, muted, and replaceable through one configuration value. The application adds stronger blue traffic and control styling rather than maintaining a large custom map style.

## ADSB.lol through the Vite proxy

Airplanes.live was checked first but currently requires provider contact before live API access. ADSB.lol is the selected fallback because its point/radius API is open, key-free, ODbL-licensed, and returned Tallinn aircraft during verification.

ADSB.lol does not currently provide browser CORS headers. V1 uses Vite's development and preview proxy so the browser calls a same-origin path. No secret is involved. A public static deployment will require an equivalent serverless proxy or a provider change; that work remains outside V1.

## Digitraffic MQTT plus REST metadata

Digitraffic explicitly recommends five-minute REST polling, which is too infrequent for smoothly updated live vessel positions. V1 uses the provider's MQTT-over-WebSocket feed for live location and metadata messages.

REST remains useful for an initial radius-limited position snapshot and an initial vessel metadata snapshot. The metadata response observed during planning contained fewer than one thousand records and was under 300 KB uncompressed, so one startup fetch is simpler and lighter than dozens of per-vessel requests.

Radius changes reuse the MQTT connection and restart only the radius-limited REST location request. Automatic reconnect attempts are spaced 15 seconds apart to remain within Digitraffic's documented connection allowance.

## Application-owned traffic models

Provider payloads are decoded and normalized at the provider boundary. Map and UI code consume application-owned aircraft and vessel models and do not depend on raw ADSB.lol or Digitraffic response shapes.

## MapLibre sources and layers

Aircraft, vessels, and the selected trail are represented as GeoJSON sources. MapLibre symbol and line layers are updated in place, avoiding a React component or DOM marker for every traffic object.

## Explicit MapLibre worker bundling

MapLibre 6 loads vector tiles through a separate module worker. Vite prebundles the main dependency, which makes MapLibre's inferred adjacent worker URL point at a file Vite did not emit. The result is a loaded style with vector tiles stuck indefinitely in a loading state.

V1 imports `maplibre-gl-worker.mjs` through Vite's `?worker&url` handling and calls `setWorkerUrl` before constructing the map. This keeps the worker URL correct in both development and hashed production output without adding a plugin or custom build system.

## Observed-position interpolation

V1 animates briefly between two positions already supplied by a provider. It does not continue movement beyond the latest observed coordinate. This removes abrupt visual jumps without presenting predicted positions as live facts.

## In-memory bounded history

Recent provider-observed positions are kept only in browser memory, pruned by time and a point cap, and shown only for the selected object. Refreshing the page clears history by design.

## Repository documentation and Wiki

Version-controlled documents under `docs/` are the canonical technical record. The GitHub Wiki provides a comprehensive project-oriented view and links back to canonical files where appropriate. GitHub requires the user to initialize the first empty Wiki page; all subsequent Wiki content is managed through Git.
