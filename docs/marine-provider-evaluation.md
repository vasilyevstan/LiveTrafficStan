# Marine Provider Evaluation

## Current decision: complementary free sources

Reviewed **2026-10-04**, workstream #296. Retain useful Digitraffic reception
and add **AISStream plus Open Waters AIS** behind the default-off
`VITE_MARINE_SUPPLEMENT_ENABLED` build flag and matching Worker flag.
Digitraffic is a regional contribution, not a benchmark that other sources
must reproduce worldwide. Preserve application functionality, not a claim
that one receiver network is complete.

The browser retains its existing Digitraffic REST/MQTT controller. One
same-origin `/api/marine/stream` WebSocket supplies normalized supplemental
observations from a demand-driven shared Durable Object. The relay owns one
connection to each additional source, with geographic subscriptions, private
server-side credentials, compression, bounded memory and backoff. There is no
provider-picker UI, whole-world subscription, raw-data service, backend
vessel archive, or use of the low-memory aircraft relay.

| Source | Contribution | Access and limits | Important limitations |
| --- | --- | --- | --- |
| Digitraffic | Useful Finnish/Baltic Class A positions and rich static fields | Existing keyless browser REST/MQTT; five-minute REST gates and at least 15 seconds between reconnect attempts | Regional reception; documented fishing exclusions; not a global/Class B reference |
| AISStream | Class A and standard/extended Class B positions; type 5 and split type 24 static reports | Free private API key; fixed server-side WSS; three subscribed connections/account, initial subscription within three seconds, replacements no more than once/second | No SLA or durable replay; reception and arrival of type/dimensions vary; direct browser connections prohibited |
| Open Waters AIS | Additional aggregated reception, native position snapshot replay and useful static enrichment | Fixed native v1 WSS and metadata REST; verified free personal tier: two streams, 50 messages/second, 400 square degrees | Sources overlap other feeds; rate-limited delivery is thinned; per-source terms still apply; REST `seen` is not a position clock |

Open Waters' anonymous tier allows two streams per address, 20
messages/second and 100 square degrees. Local acceptance can use that tier;
production uses the protected personal token. The documented Ed25519 key
registration API established that token without a paid plan, contributed
receiver, public station, or IP binding. The identity private key is protected
separately and is not deployed to the Worker. Neither API credential belongs
in browser assets, URLs, issues or logs.

### Identity, freshness and existing behavior

Deduplicate by exact `vessel:<MMSI>`, choosing the newer observed position.
Equal-time preference is Digitraffic, then Open Waters, then AISStream.
Compatible missing static fields can be filled from another source without
changing position provenance. Conflicting identities are not spliced
together. Missing speed, heading, course or navigation state is never borrowed
from an older source or inferred from vessel names.

Open Waters' native snapshot replays the actual position event clock
(`PosAt`). Its REST `seen` can advance on static messages, and stationary
snapshot entries can be days old. REST is therefore **metadata-only**:
neither its coordinates nor `seen` can create or refresh a position. Invalid,
future and expired reports are rejected. The deployed REST sample did not
expose a class field; an absent class means unknown, not no Class B.

The existing two-minute stale / ten-minute expiry policy, exact sailing or
pleasure type plus known length at least 8 m, stopped/unknown-speed handling,
ordinary non-yacht filters, flags, photos, selection, themes and one-map
lifecycle remain. Global means eligible local views anywhere with reception;
the full-canvas 100 km enclosing-query limit is unchanged.

One failed source leaves the others usable and is disclosed as partial
operation. A successful empty view does not establish absence of vessels.
There is no promise to receive a particular yacht, including ANTARES.

### Published terms and the service-use decision

Use actual published/account terms and documented technical limits. An
individual written permission reply is **not** a prerequisite unless an
applicable term requires one. The earlier request in
[aisstream/issues#290](https://github.com/aisstream/issues/issues/290) is
context, not an invented approval gate.

AISStream documents server-side proxying of information clients need and
application message persistence. This is a documented-service-use decision,
not a claim that the feed has a blanket open-data licence. The message-model
code licence does not license AIS data.

Open Waters documents public display/screenshots, normalized relaying,
bounded caches/playback and device-local history while retaining each
original source's terms and attribution. It does not relicense every source
as CC0. Its public policy records AISHub's redistribution/commercial-use
confirmation dated 2026-08-22. See
[Data Sources and Licensing](data-sources-and-licensing.md#marine-traffic-aisstream-and-open-waters-ais)
for the exact source distinctions. No private correspondence is needed as a
public documentation artifact.

Our server keeps live positions and metadata only in bounded memory.
SQLite persists operational quota reservations and retry deadlines, not
vessels, view geometry or credentials. Existing user-enabled origin-local
history remains available under explicit source decisions and unchanged
retention/deletion controls. This makes no claim that upstream providers
retain no data.

### Bounded observations, not a coverage census

| Observation | Result | Meaning |
| --- | --- | --- |
| AISStream / actual Digitraffic controller, 2026-10-04 19:09:09-19:16:09 UTC, Tallinn | 52 Digitraffic vessels; 18 AISStream; 15 exact-MMSI overlaps | Replacing Digitraffic would have lost 37 received vessels; supplementation added three in that window |
| Same seven-minute AISStream sample | 404 standard and one extended Class B position messages; reported sailing/pleasure craft at least 8 m in Helsinki 1, Rotterdam 2, Fort Lauderdale 7, Sydney 3 | Real Class B and useful metadata exist outside the narrow initial view; not complete regional coverage |
| Same Tallinn sample | Two Class B positions without usable type/length metadata; ANTARES absent | The original local-yacht criterion was not proved |
| Open Waters snapshot, Tallinn, 19:28:02 UTC | 93 entries within 35 km; latest sources 51 Digitraffic and 42 AISHub | Potential complementary reception; REST `seen` alone is not live-position evidence |
| Open Waters snapshot, Gedser-Rugen, 19:40:24 UTC | 48 entries within 75 km; ten reported sailing/pleasure craft at least 8 m | Motivated broader-region acceptance, not a rendered/live coverage claim |
| Implemented native Worker, Gedser-Rugen, 23:44:14-23:44:59 UTC | First useful snapshot 1.026 s; peak 81 vessels; final 80, with 15 AISStream and 65 Open Waters position owners; both transports live | Real normalized supplemental delivery; oldest retained position 592.425 s, below the ten-minute expiry; no qualifying yacht was established in this later window |

The first five-region AISStream stream delivered 4,236 binary messages /
2,397,642 decoded bytes. Only aggregate receipts were retained; raw messages
were discarded. Prior observations and screenshots do not promise that the
same vessel remains fresh during a later check.

### Free hosting and bounded load

Cloudflare documents 100,000 Durable Object requests/day and 13,000 GB-s/day
on Free. Incoming WebSocket messages count at 20:1; an always-active 128 MB
object calculates to 11,059.2 GB-s/day before other workloads. Outgoing provider
WebSockets cannot hibernate. These are nominal feasibility calculations, not
proof of unlimited account headroom.

The relay reserves an 80,000 request-equivalent daily ceiling, leaving 20,000
of that nominal request allowance for existing work. Reservations and retry
deadlines survive object restarts. Capacity/budget exhaustion is explicit;
the relay stops rather than reconnecting in a tight loop or silently dropping
an existing viewer's geographic interest.

Limits are centralized in `src/config/marineStreamConfig.ts`, re-exported by
`appConfig.ts`: 128 viewers, 20,000 records, 16 MiB estimated cache per source,
16 MiB aggregate pending client snapshots, ten-second acknowledgement
deadlines, one pending snapshot per viewer, one-second publication and
subscription batching, 15-120 second reconnect backoff, and bounded provider
frames/HTTP bodies. Metadata view changes are gated at five seconds;
unchanged views refresh at five minutes and preserve `Retry-After`.

Production activation still requires a checked release, real Cloudflare
egress, the shared free allowance and rendered-browser evidence. Deploy
updated code with the supplement disabled first so rollback retains the
new history reader; then enable the same checked source. An older binary is
not the primary rollback for an upgraded history database.

### Additional primary sources

- [Open Waters AIS service and source terms](https://openwaters.io/ais/)
- [Open Waters native API](https://openwaters.io/api/ais/)
- [Public implementation and policy](https://github.com/openwatersio/aiscast):
  `docs/policy.md`, `docs/limits.md`, and `server/vessels.go`
- [AISStream API](https://aisstream.io/documentation)
- [Cloudflare Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare outgoing WebSocket lifecycle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## Historical single-source evaluation (superseded)

The remainder records the **2026-09-19** baseline and measurements. Its
single-provider recommendation and speculative written-permission gate were
superseded by the 2026-10-04 decision above; they are not current instructions.

Evaluation date: **2026-09-19**

At that point LiveTrafficStan retained **Fintraffic Digitraffic as its only
active marine provider**.

Digitraffic remains the smallest authorized option for the current
browser-first application:

- REST and MQTT-over-WebSocket access are keyless and work directly in the
  browser;
- the radius REST endpoint and live MQTT messages already match the normalized
  marine contract;
- Fintraffic licenses its open data under CC BY 4.0;
- the application can publicly display, filter, normalize, and retain bounded
  in-memory history with the required attribution and change notice;
- the existing provider lifecycle preserves one stream, 15-second reconnect
  spacing, five-minute REST/metadata gates, and independent aircraft behavior.

Digitraffic is a regional source, not a global AIS service. Its official
material says marine data comes from Finnish Transport Infrastructure Agency
sources, the AIS service provides Class A position and metadata messages, and
fishing vessels are filtered upstream. No authoritative exact coverage polygon
or completeness guarantee was found, so LiveTrafficStan does not infer
coverage from coordinates or from an empty result.

The application may display exact AIS sailing and pleasure types with known
length from 8 m, subject to the same reported-speed filters and marine freshness
as other ships. Any reported speed includes stopped and unknown-speed yachts;
finite non-future positions become stale after two minutes and expire after
ten. Invalid reports remain excluded. This is a visibility rule, not a coverage
expansion: recognized yachts do not fall through to the ordinary 50 m non-yacht
length filter. Because Digitraffic publishes Class A AIS only, Class B yachts
are not covered and the eligible population may be small or empty.
Names, dimensions, speed, or broad `other` classification never
create a yacht identity.

Release #316 deployed this visibility correction at application
`e2b2afaa04466116719310d6286441f8e6ba60ca`.
[The bounded actual production check](https://github.com/vasilyevstan/LiveTrafficStan/pull/316#issuecomment-5980143455)
selected SINILIND (`276014100`), a 16 m exact pleasure craft reporting 0 kn,
with its MMSI-derived Estonian flag. The final position was live; an earlier
retained receipt observed the same stopped craft stale at 175.962 seconds.
This demonstrates a supplied yacht, not complete pleasure-boat coverage.
The user's ANTARES (`276015010`) was absent from the earlier bounded
Digitraffic sample; #296 remains the separate Class B source-capability issue.
The aircraft-only #174 outage leaves the overall deployment smoke failed,
without invalidating the independent marine result.

AISstream.io offers genuine server-side geographic streaming, but direct
browser connections are prohibited, an API key and relay are required, and no
public data-use license establishing display, screenshots, caching, history,
or redistribution rights was found. Datalastic and Kpler/MarineTraffic are
commercial services with protected credentials and terms that do not establish
permission for this public browser map without a separate agreement.

No provider selector, relay, alternate adapter, automatic provider selection,
aggregation, failover, or MMSI source-precedence policy is justified by this
evaluation.

This is an engineering record, not legal advice. Provider terms, products, and
technical behavior can change and must be rechecked before a provider change.

## Evidence method

The matrix uses these labels:

- **Documented**: stated by an official provider specification, repository, or
  terms page.
- **Observed**: measured in one bounded LiveTrafficStan browser session; it is
  not a service guarantee, load test, or coverage census.
- **Calculated**: derived from checked-in application limits or documented
  provider quotas.
- **Unknown**: not established by the reviewed official material. Unknown does
  not mean permitted.

No provider operator was contacted, no paid plan or trial was activated, no
credential was issued, and no alternative provider received a live request.

## Application requirements

The current marine integration requires:

- one browser-safe live path with no embedded secret;
- an initial geographic query for a rounded center and conservative radius no
  greater than 100 km;
- current MMSI identity, coordinates, observation time, speed, course, heading,
  and navigation status where available;
- metadata including name, callsign, IMO, type, dimensions, draught,
  destination, and ETA where available;
- one-second publication batching without claiming one-second source freshness;
- independent REST, metadata, MQTT, aircraft, and map errors;
- public-display, screenshot, attribution, filtering, and bounded in-memory
  history rights;
- truthful empty, filtered, disconnected, paused, stale, and unknown-coverage
  states.

## Technical and operational matrix

| Criterion | Fintraffic Digitraffic | AISstream.io | Datalastic | Kpler / MarineTraffic |
| --- | --- | --- | --- | --- |
| Access and browser path | **Documented:** keyless REST and MQTT over secure WebSockets. Fintraffic publishes a browser JavaScript example. `Digitraffic-User` is an application identifier, not a credential. | **Documented:** an account API key is required and direct browser connections are prohibited. Clients must connect from their own server and proxy only required data. | **Documented:** a paid subscription issues an API key. The recommended `x-api-key` header keeps it out of browser history and proxy logs. It must not be embedded in this client. Browser CORS is **unknown**. | **Documented:** API access uses an API key and commercial service access. A key cannot be embedded in this public client. Exact browser/relay terms are **unknown** until contracted. |
| Geographic request or subscription | **Documented:** REST locations accept latitude, longitude, radius, and time. MQTT topics select all published vessels or individual MMSIs; no geographic topic is documented. | **Documented:** every subscription requires one or more bounding boxes. Optional MMSI and message-type filters reduce provider-to-subscriber ingress. | **Documented:** `/vessel_inradius` accepts a center and radius up to 50 NM, or 92.6 km. It cannot cover the application's full 100 km eligible envelope in one request. | **Documented:** global AIS data is available through APIs or live NMEA delivery. Exact area products and entitlements are contract-specific. |
| Coverage | **Documented:** Finnish-source regional data, Class A AIS only, with fishing vessels filtered. An exact boundary and completeness guarantee are **unknown**. | **Documented:** a global station network and geographic subscriptions. Complete coverage or a Tallinn advantage is **unknown**; delivery depends on upstream activity and interruptions. | **Documented:** marketed global AIS access. Per-location freshness and completeness are **unknown**. | **Documented:** coastal, ocean, and satellite AIS from more than 13,000 receivers. Completeness for a selected contract remains **unknown**. |
| Fields and timestamps | **Documented:** separate live position and metadata messages. Location time is seconds; metadata time is milliseconds. The current normalizer covers all application fields listed above. | **Documented:** binary WebSocket frames contain UTF-8 JSON and multiple AIS message types, including position and static data. A new normalizer would be required. | **Documented:** live records include identity, position, motion, navigation status, destination, and position timestamps. Callsign and dimensions are available through vessel information data. | Position, identity, historical, and enriched products are offered, but exact fields and timestamps for an authorized plan are **unknown**. |
| Cadence and outage behavior | **Documented:** MQTT is event-driven; REST data is cached and Fintraffic recommends respecting update intervals. LiveTrafficStan batches publication and reconnects no more often than every 15 seconds. | **Documented:** event-driven, no SLA, no durable replay, and messages can be dropped for slow consumers. Reconnect with backoff and replace the full subscription within three seconds. | **Documented:** REST responses, no minimum uptime unless separately agreed, `429` plus `Retry-After`, and credit exhaustion can stop successful requests. | **Documented:** data is provided as-is/as-available under general terms. Contract-specific delivery, replay, and recovery behavior are **unknown**. |
| Limits | **Documented:** five MQTT connection requests/minute/IP and 60 general REST requests/minute/IP without the identifying header. The app's 15-second MQTT floor is at most four attempts/minute; its five-minute REST gates are well below the general limit. | **Documented:** three subscribed connections/account, three open connections/IP, subscription within three seconds, at most one subscription update/second, and 200 MMSIs/filter. September 2026 documentation announces uncompressed bandwidth limits without a numeric allowance. | **Documented:** 600 requests/minute. Area scans cost one credit per vessel found, capped at 500 credits/request. Public plans provide 20,000, 80,000, or unlimited monthly credits. | Public limits suitable for this application were not established. Quota and price are contractual **unknowns**. |
| Cost | **Documented:** no application fee; browser and network costs remain with the user. | No current usage price was established in the reviewed official documentation. Relay hosting and egress would still be project costs. | **Documented:** paid monthly credit plans; current prices can change and are published on the provider pricing page. | **Documented:** commercial product with quote-based access; a suitable public-display price is **unknown**. |
| Production implication | No new backend or secret. Preserve direct browser REST/MQTT, attribution, provider gates, and truthful regional/unknown coverage. | Requires a server-held key, WebSocket relay, egress control, reconnect ownership, and written data-use terms before implementation. | Requires a server-held key, recurring budget, polling and credit policy, a plan for the 92.6 km limit, and written confirmation that browser-displayed coordinates and screenshots are permitted. | Requires a commercial agreement covering fields, delivery, public display, caching/history, redistribution, attribution, quota, cost, and server-side credential handling. |

Official sources:

- Fintraffic Digitraffic:
  [marine traffic](https://www.digitraffic.fi/en/marine-traffic/),
  [AIS filtering and fields](https://www.digitraffic.fi/en/marine-traffic/ais/),
  [usage instructions and limits](https://www.digitraffic.fi/en/support/instructions/),
  and [terms/attribution](https://www.digitraffic.fi/en/terms-of-service/).
- AISstream.io:
  [documentation](https://aisstream.io/documentation),
  [service site](https://aisstream.io/), and
  [privacy policy](https://aisstream.io/privacypolicy).
- Datalastic:
  [official OpenAPI](https://github.com/datalastic/datalastic-openapi),
  [pricing](https://datalastic.com/pricing/), and
  [terms](https://datalastic.com/terms-of-services/).
- Kpler / MarineTraffic:
  [marine data services](https://www.kpler.com/product/maritime/data-services),
  [API documentation](https://servicedocs.marinetraffic.com/), and
  [general terms](https://www.kpler.com/company/terms-of-use).

## Data rights, retention, and public display

| Criterion | Fintraffic Digitraffic | AISstream.io | Datalastic | Kpler / MarineTraffic |
| --- | --- | --- | --- | --- |
| Data license | **Documented:** Fintraffic open data is CC BY 4.0. | No public license for returned AIS data was found. Source-code or example licenses do not establish data rights. | **Documented:** a limited commercial subscription license under the provider terms. | **Documented:** Kpler and its licensors retain data rights; customer contracts may add specific grants. |
| Public map and screenshots | **Documented:** sharing and adapting are permitted with credit, license link, and a change notice. The map now states that data is filtered and normalized. | Display, screenshots, and browser redistribution are **unknown**. A relay protects the key but does not grant rights. | Terms permit value-added products only when they do not expose raw responses or substantial original data. Permission for this public coordinate map and screenshots is **unknown** and requires confirmation. | General terms prohibit publishing, transferring, mirroring, or externally disseminating data without express written permission. A suitable contract is required. |
| Caching, trails, and history | CC BY 4.0 permits reuse with attribution. LiveTrafficStan currently keeps locations, metadata, and bounded trails in memory only. | Cache, retention, and history rights are **unknown**. | Terms restrict extraction and redistribution and require stored data deletion after termination, except where law requires retention. The current session cache and trails require provider confirmation. | General terms require unauthorized/end-of-agreement data to be purged and restrict derived data. Contract-specific cache/history rights are required. |
| Relay and redistribution | A relay is not needed. CC BY permits redistribution with its conditions, but the application does not create a shared marine database today. | Direct browser use is prohibited, so a relay is technically required; permission to redistribute relay output is still **unknown**. | A server is needed to protect the key, but the general terms prohibit exposing raw/substantial data and third-party API access. | A server is needed for credentials/delivery, while general terms prohibit making data available to unauthorized parties. |
| Attribution | `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY`, with source/license links and a notice when data is changed. | Exact credit wording is **unknown**. Informal requests for credit are not a data-use grant. | Exact public-product attribution requirements are **unknown**. | Data must be attributed to Kpler where permitted; an operational agreement may add detailed wording. |

## Request and credit implications

Digitraffic uses one long-lived MQTT subscription. With a continuously active,
rapidly changing eligible viewport, the current five-minute gates allow at
most:

```text
12 metadata REST starts/hour
12 query-location REST starts/hour
24 combined REST starts/hour
576 combined REST starts/day
```

A fixed viewport normally starts one location snapshot and then receives live
positions through MQTT; the 576/day figure is an upper envelope, not normal
steady-state behavior.

For Datalastic, copying the aircraft 20-second cadence would create 4,320 area
requests/day. Because `/vessel_inradius` charges one credit per returned vessel,
even 20 vessels per request would be a calculated 86,400 credits/day. The
50-NM/92.6-km limit also fails the current full 100-km viewport contract.
LiveTrafficStan does not adopt this polling design.

AISstream's bounding boxes would reduce provider-to-relay ingress, unlike
Digitraffic's all-published-vessels MQTT topics. That technical advantage does
not resolve the required relay, secret, data-rights, or operating-cost
questions.

## Single-stream Digitraffic measurement

The bounded measurement reuses one ordinary LiveTrafficStan provider instance
and its existing MQTT callback. It does not create another MQTT client,
subscription, poller, raw-payload archive, MMSI inventory, or telemetry upload.
Diagnostics exist only in Vite development when the page explicitly includes
`?marineDiagnostics=1`; the production build removes the collector and hooks.

Observed setup:

- source commit:
  `ef73a8fcb832d2d53d8adc4c34654f017e44cc46`;
- UTC interval: 2026-09-19 02:11:46 through 02:17:46;
- elapsed time: 360.262 seconds;
- one visible headless Chrome 153.0.8010.52 tab on macOS 26.4.1;
- default eligible Tallinn Home view;
- one `DigitrafficMarineProvider` and its normal three-topic subscription;
- the original interactive app tab remained backgrounded and provider-paused.

Observed cumulative results:

| Metric | Result |
| --- | ---: |
| MQTT messages | 13,285 |
| Average message rate | 36.88/second |
| Location / metadata / status | 12,494 / 719 / 72 |
| Invalid or unsupported messages | 0 |
| MQTT application payload | 2,499,434 bytes |
| Average payload rate | 6.78 KiB/second |
| Payload-rate projection | 23.82 MiB/hour |
| Scheduled / immediate provider flushes | 348 / 1 |
| Messages processed by flushes | 13,207 |
| Mean / maximum messages per scheduled flush | 37.95 / 55 |
| Mean / maximum query-circle vessels per flush | 67.52 / 68 |
| Current / high-water location records | 592 / 593 |
| Current / high-water metadata records | 875 / 875 |
| Expired location records removed | 2 |
| Total / mean / maximum MQTT handler time | 128.70 ms / 0.0097 ms / 1.60 ms |
| Total / mean / maximum flush time | 49.60 ms / 0.1421 ms / 1.60 ms |

This trace demonstrates that browser-local filtering did not reduce wildcard
stream ingress. The one-second publication timer coalesced roughly 38 accepted
location/metadata messages into each scheduled provider snapshot, reducing
13,285 message callbacks to 348 scheduled flushes during the trace.

The location cache reached 593 records and ended at 592 after two expirations.
The metadata cache reached and retained 875 records for the session. These
counts describe this six-minute trace, not a proven long-term bound or heap
size. The low synchronous timing values apply only to this machine, browser,
development build, and data interval.

Interpretation rules:

- message and payload-byte totals describe the full Fintraffic wildcard
  subscription, independent of the Tallinn viewport;
- payload bytes are MQTT application payload bytes before WebSocket/MQTT/TLS
  framing and compression, not total on-wire traffic;
- provider-emitted vessel counts are limited to the current enclosing query
  circle and precede the application's exact viewport and minimum-length
  filters;
- processing timings cover the synchronous MQTT handler and provider snapshot
  flush in this development browser, not all React, MapLibre, network, or
  provider-side work;
- one short trace cannot establish an SLA, annual average, complete geographic
  coverage, or a cross-provider performance comparison.

## Capability and status semantics

The normalized marine boundary now exposes one immutable descriptor:

- provider: Fintraffic Digitraffic;
- browser access: direct and keyless;
- REST geography: radius;
- stream geography: all provider-published vessels;
- coverage: regional, with exact boundary unknown;
- known exclusions: Class A AIS only and fishing vessels filtered upstream;
- license and required modification notice.

The descriptor is not a provider registry or selection framework. Per-vessel
provenance remains `Fintraffic Digitraffic`.

The status UI keeps independent concepts separate:

- `Marine stream connected` describes transport state only;
- `ships shown` describes the post-filter display count and does not claim no
  vessels exist;
- `regional source; exact coverage unknown` describes source capability;
- paused, connecting, unavailable, stale, empty, filtered, and wide-viewport
  states retain their existing meanings.

The application does not infer a no-coverage state from a coordinate or an
empty snapshot and does not pause either provider based on an unverified
coverage boundary.

## Compatibility and risk conclusions

### Fintraffic Digitraffic

- Retain the existing REST/MQTT provider and normalizer.
- Keep one wildcard stream and explicitly state that browser filtering does
  not reduce incoming MQTT bandwidth.
- Link CC BY 4.0 and disclose filtering/normalization in visible attribution.
- Keep exact coverage unknown rather than drawing an unsupported Finland or
  Baltic polygon.

### AISstream.io

- Geographic subscriptions are technically attractive.
- Do not add an adapter until a server relay is an approved requirement and
  written public-display, screenshot, caching, history, redistribution,
  attribution, and capacity terms are available.
- A free account or working key would not by itself authorize this product.

### Datalastic

- Do not add a credentialed REST polling adapter.
- A future evaluation would need an authorized public-display design, budget,
  retention policy, proxy, freshness evidence, and a truthful solution for the
  92.6-km radius limit.

### Kpler / MarineTraffic

- Treat it as a credible commercial benchmark, not an available default.
- A future evaluation starts with a written agreement covering this public
  application's exact fields, delivery, users, caching/history, screenshots,
  redistribution, attribution, quota, price, and rollback.

## Acceptance evidence

- This dated matrix records official facts, bounded observations,
  calculations, and unknowns separately.
- Current Digitraffic browser access, stream geography, limits, source scope,
  Class A behavior, fishing-vessel exclusion, license, and attribution are
  recorded.
- The application exposes provider capabilities without a selector or second
  provider.
- Tests preserve provider provenance, the one-connection lifecycle,
  one-second batching, latest-MMSI merging, cache expiry, diagnostics byte
  accounting, pause/resume gates, aircraft independence, and honest status
  wording.
- Production output contains no development diagnostics collector, query flag,
  counters, or logging.
- No alternative-provider placeholder, secret, relay, failover, aggregation,
  or live CI request is introduced.

## Re-evaluation conditions

Reopen the provider decision only with concrete new evidence:

- Digitraffic changes access, source scope, license, fields, limits, or
  reliability;
- a product requirement needs vessel coverage outside the demonstrated
  regional source;
- AISstream publishes suitable data-use terms and the project approves a
  credentialed relay;
- Datalastic or Kpler grants written public-display, screenshot,
  caching/history, redistribution, and quota terms at an accepted cost;
- an authorized trial demonstrates a measurable freshness, completeness,
  coverage, or bandwidth improvement.

No external blocker Issue is required now. Create one only if a later approved
feature selects a concrete provider and cannot proceed without a specific
authorization, budget, credential, relay owner, or data-rights grant.
