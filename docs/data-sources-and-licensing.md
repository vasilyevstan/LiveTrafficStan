# Data Sources and Licensing

This document records the data-provider checks made for LiveTrafficStan V1. Provider behavior and terms can change, so the linked official documentation must be rechecked before any public deployment.

## Map: OpenFreeMap

- Style service: <https://tiles.openfreemap.org/styles/positron>
- Documentation: <https://openfreemap.org/quick_start/>
- Terms: <https://openfreemap.org/tos/>
- Authentication: none
- Browser access: supported; the style endpoint returned `Access-Control-Allow-Origin: *` during V1 verification.
- Data: OpenStreetMap-derived vector tiles using the OpenMapTiles schema.
- Attribution: preserve the attribution supplied through the OpenFreeMap tile metadata, including OpenMapTiles and OpenStreetMap contributors.

OpenFreeMap is free and open, requires no application key, and is directly compatible with MapLibre GL JS. Its public service is provided as-is without an uptime guarantee. The style URL is therefore configuration rather than an application-wide assumption.

## Aircraft: ADSB.lol

- API: <https://api.adsb.lol>
- Documentation: <https://api.adsb.lol/docs>
- Open-data documentation: <https://www.adsb.lol/docs/open-data/api/>
- Source and rate-limit notes: <https://github.com/adsblol/api>
- License: Open Data Commons Open Database License 1.0 (ODbL 1.0)
- Authentication: none for the current public API
- Geographic query: `/v2/point/{latitude}/{longitude}/{radius}`
- Radius unit: nautical miles, maximum 250
- Rate limits: dynamic according to service load
- Browser access: the live endpoint did not return CORS headers during V1 verification

The API documentation says the API is free to use and that public ADSB.lol data is licensed under ODbL 1.0. It also warns that API keys may be required in the future and asks production users to make contact so integrations are not broken accidentally.

LiveTrafficStan V1 runs locally and polls one small geographic query approximately every 20 seconds. Because direct browser requests are blocked by CORS, Vite proxies the same-origin development and preview path to ADSB.lol. A future static deployment will need an equivalent small serverless/edge proxy or a replacement provider.

Visible attribution must identify ADSB.lol and ODbL 1.0. The application's Apache License 2.0 covers source code only; it does not relicense provider data.

### Why Airplanes.live was not selected

- Official API description: <https://airplanes.live/api-docs/>
- OpenAPI document: <https://airplanes.live/openapi.yaml>
- Candidate endpoint: `/v2/point/{latitude}/{longitude}/{radius}`

Airplanes.live was evaluated first as requested. Its current live endpoint returned `403` with an instruction to contact the provider and did not return browser CORS headers. That made it unavailable for a self-contained V1 without an external access-grant wait. The approved fallback policy therefore selected ADSB.lol as the smallest verified alternative.

### Why OpenSky was not selected

OpenSky remains a worthwhile future option, but its anonymous daily credit allowance is not suitable for a page that can poll every 20 seconds for an extended active session. Authenticated access also introduces protected OAuth credentials and a server-side component. ADSB.lol is materially simpler for the local V1.

## Marine traffic: Fintraffic Digitraffic

- Marine documentation: <https://www.digitraffic.fi/en/marine-traffic/>
- API instructions: <https://www.digitraffic.fi/en/support/instructions/>
- Terms: <https://www.digitraffic.fi/en/terms-of-service/>
- OpenAPI: <https://meri.digitraffic.fi/swagger/openapi.json>
- MQTT over WebSocket: `wss://meri.digitraffic.fi:443/mqtt`
- REST locations: `https://meri.digitraffic.fi/api/ais/v1/locations`
- REST vessel metadata: `https://meri.digitraffic.fi/api/ais/v1/vessels`
- Authentication: none
- License: Creative Commons Attribution 4.0 (CC BY 4.0)
- Required attribution: `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY`

Digitraffic is suitable for V1:

- its AIS coverage returned current Tallinn-area vessel positions during verification;
- its REST location endpoint supports latitude, longitude, and radius filters;
- its REST API supports browser CORS, including the recommended `Digitraffic-User` header;
- its official browser example supports MQTT over secure WebSockets;
- its terms permit commercial and non-commercial reuse with attribution.

Digitraffic recommends a five-minute REST fetch interval for both AIS locations and vessel metadata. V1 therefore uses MQTT for live position updates rather than over-polling the REST endpoint. REST supplies an initial radius-limited location snapshot and a compact metadata snapshot, then MQTT updates positions and metadata in real time.

The live MQTT connection is reused when the user changes center or radius, and
the global message cache is refiltered immediately. Query movement can request
a new radius REST snapshot no more than once every five minutes. Reconnect
attempts are spaced at least 15 seconds apart, keeping automatic retry below
Digitraffic's documented limit of five connection requests per minute per IP.

Browser requests identify the application as `LiveTrafficStan/1.0`; no personal information is included in the header or MQTT client identifier.

Vessel length and width are derived from the AIS reference-point dimensions:

- length = reference point A + reference point B
- width = reference point C + reference point D

Invalid or missing dimensions remain unavailable and are never guessed.

## Source-code license versus data licenses

LiveTrafficStan source code is licensed under Apache License 2.0 and includes a
`NOTICE` file identifying the original project and author. Under section 4 of
the license, distributed derivative works must retain applicable notices and a
readable copy of the `NOTICE` attribution. This is a permissive source-code
license: compliant derivative products may use different terms for their own
additions.

Runtime map, aircraft, and marine data retain their providers' separate
licenses and attribution requirements:

- map data: OpenStreetMap/OpenMapTiles/OpenFreeMap attribution
- aircraft data: ADSB.lol, ODbL 1.0
- marine data: Fintraffic Digitraffic, CC BY 4.0

The application does not persist or redistribute a derived traffic database in V1.
