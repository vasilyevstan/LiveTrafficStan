# Engineering Decisions

## Static-first V1

LiveTrafficStan is a local-first browser application with no server database,
accounts, authentication, or persistent backend. This keeps the V1 deployable
as static assets except for the aircraft CORS proxy described below. V1.4 adds
an opt-in browser IndexedDB for private, origin-local traffic history. It is
not a server, account, shared database, or backend.

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
aircraft point route, uses a total deadline and body cap, preserves provider
status/body/`Retry-After`, disables invocation URL logs, and does not cache live
responses.

No provider selector, automatic failover, aggregation, or alternative adapter
is added. Those mechanisms would introduce provenance, duplicate-resolution,
licensing, credential, and operational complexity without a demonstrated
requirement. The existing application-owned provider interface is sufficient
for a future deliberate replacement.

## Private OCI aircraft relay without moving the application

Cloudflare's shared Worker egress can receive an immediate ADSB.lol `429`,
while four bounded requests from one stable OCI IPv6 identity succeeded at the
application's exact 20-second cadence. Successful ADSB.lol responses still do
not provide browser-readable production CORS. The selected recovery therefore
keeps Cloudflare as the public host and adds one private
Worker -> Workers VPC Service -> Cloudflare Tunnel -> OCI relay transport.

The relay is isolated in a sibling OCI compartment on one Always Free E2
Micro, has no public IPv4 or inbound route, binds to loopback, and can reach
only the fixed ADSB.lol point path through its application logic. It enforces
one global in-flight request, one start per 20 seconds, persisted provider
backoff, no response cache, and no coordinate/payload logging.

The public Worker exposes one protected `oci-private-relay` mode. It uses an
exact VPC Service binding and a Worker secret that is added only to the
newly-constructed relay request. Missing binding/authentication or VPC failure
is explicit unavailability; the Worker never falls back to shared Cloudflare
egress. The browser provider already preserves relay-local `503 Retry-After`,
so the existing aircraft scheduler pauses without creating another lifecycle.

Production activated this decision at source
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` in deployment run
`36268576908`. Exact-release browser acceptance observed relay admission
recovering to real aircraft JSON, while a 70-second host canary measured
0.2374% combined relay/cloudflared CPU with zero restarts, swap, or OOM
evidence.

Moving the full application to OCI was rejected because it would make a
reclaimable no-SLA VM responsible for static assets, maps, vessels, weather,
search, and PWA behavior. A public relay was rejected because it would enlarge
the attack and abuse surface. Provider/IP/region rotation and direct
Cloudflare fallback were rejected because they evade rather than respect the
provider boundary. The detailed operating contract and activation status are
in [OCI Aircraft Relay](oci-aircraft-relay.md).

## Direct ADSB.lol plausible routes

The owner chose a truthfully labeled callsign-based plausible route instead of
adding a second aviation provider. The client requests one static ADSB.lol
standing-route record when a new eligible live aircraft is deliberately
selected, validates the exact normalized callsign, and checks the current
position against every consecutive airport segment before displaying origin
and destination.

The UI never calls the result scheduled, filed, active, or date-specific.
Hover, HISTORY, same-flight position updates, camera movement, trails, metadata
refreshes, and automatic retries make no route request. Route failure cannot
alter live markers, freshness, cadence/backoff, trails, selection, history, or
provider health.

The request is a direct credential-free GET with redirect rejection, a
ten-second deadline, and a 32 KiB response ceiling. Successful exact-identity
routes may remain in a 32-entry six-hour current-tab LRU. Readable
`Retry-After` guidance is honored up to five minutes; otherwise a failed
lookup applies a 60-second local cooldown. Manual retry or refresh remains
disabled until that boundary, and no automatic retry is scheduled. Failures
and unavailable results are never cached, and no route enters Web Storage,
IndexedDB, traffic history, service-worker cache, Worker cache, KV, R2, or a
Durable Object.

The dormant aviationstack client, Worker route, secret dependency, rolling
quota, and SQLite-backed Durable Object were removed. The detailed decision is
recorded in
[Aircraft Plausible Route Enrichment](aircraft-route-enrichment-evaluation.md).

## Direct Planespotters aircraft photos

The only reviewed dynamic photo path with an explicit public display contract
is the Planespotters Photo API. The accepted slice is intentionally narrower
than general aircraft imagery: exact live ICAO24 only, one explicit **Load
aircraft photo** action or one 500 ms fine-pointer dwell, one cancellable direct
browser request, the unchanged regular thumbnail, visible photographer credit,
and the unchanged photo page as the image link.

Selection, map movement outside a stable hover, provider refreshes, HISTORY,
vessels, callsign, registration, airline, model, and fuzzy text never start or
broaden a lookup. Requests are revision-guarded across A to B to A selection or
hover changes. Only successful and no-photo JSON results may use one shared
32-entry, one-hour current-tab LRU. A cacheable hover result publishes only to
already-open selected details with the same exact ICAO24 and does not make a
second request. The photo follows the prominent route section before telemetry
so the resolved result is visible. Hover errors do not automatically retry,
and no photo state uses persistent storage. The image and API response never
pass through the Worker, service worker, Cache API, IndexedDB, Web Storage, KV,
or R2.

This direct boundary is required by the provider's API-specific terms: image
bytes must load from the returned URL, returned URLs must remain unchanged,
proxying and re-exposure are prohibited, and visible credit plus a followable
source-page link are mandatory. A Worker proxy is therefore not an acceptable
CORS workaround.

Production is enabled. The published API-specific terms permit this low-volume,
keyless browser path without prior email or provider approval. The exact
production origin passed a bounded 2026-09-23 browser check with readable JSON,
an unchanged direct thumbnail from `t.plnspttrs.net`, visible credit, and exact
source-page navigation. The photo surface remains public and free.

## Bundled exact-IMO vessel reference photos

The accepted vessel-image path is a manually reviewed bundled manifest rather
than an automatic provider or runtime search. The first version contains five
ferries observed through Digitraffic in the Tallinn-Helsinki area. Every entry
binds one valid exact IMO to one Wikidata item, one fixed Commons file-page
revision, the reviewed source bytes, author, selected license and URL, exact
credit, bounded derivative dimensions, and SHA-256.

Only a selected live vessel or a vessel held under a fine pointer for the
existing 500 ms dwell with that exact AIS-reported IMO renders the versioned
same-origin image. Missing, invalid, unmatched, or sub-dwell hover states
render no photo. MMSI/name/callsign/fuzzy matching, arbitrary runtime Wikidata
P18, generic/class/sister-ship substitutes, and runtime Commons/tracker
requests remain rejected.

The bundled image is labeled historical reference context rather than a live
view or independent confirmation of the current AIS transmitter. It appears
in selected details and, after the existing 500 ms fine-pointer dwell, the
map's compact hover card. It never appears in search results, markers, or
HISTORY. Selected details retain fixed-revision and license links plus the
modification notice; hover retains the fixed-revision link and visible author,
source, license, exact-IMO, and historical-reference context.

Versioned photo assets receive immutable browser caching but are excluded from
the service-worker shell. A changed source, rights record, transformation, or
byte set requires a new manifest version. A rights or identity dispute removes
that exact entry and asset; it never authorizes a substitute. See
[Vessel Reference Photo Evaluation](vessel-photo-evaluation.md).

## Airport boards use a bounded, on-demand source (#46)

The 2026-10-07 free-plan reassessment and 2026-10-08 protected-key/Tallinn proof
supersede the earlier blanket commercial-authorization blocker. AeroDataBox
RapidAPI Basic supports the small noncommercial board: 400 units/month,
two per combined request, with no automatic paid overage. Actual headers and
the source's billing countdown drive fail-closed admission.

Choose one demand-driven coordinator in the existing Worker, a fixed
same-origin route, an explicit six-hour combined load, short complete-only
memory caching and operational-only SQL quota/retry state. Keep the browser
credential-free and board data out of traffic, relationships and history.
Expose original request, retrieval and unknown source-update semantics,
reported quality/codeshare/status and local clocks with UTC offsets. Do not
add polling, another host, a provider marketplace or a flight-data archive.
The existing inspector receives a scoped compact layout; no other inspector,
map lifecycle, right-side control or design system is replaced.

### Historical September assessment (superseded)

Airport/time-window boards are independent of selected-aircraft plausible-route
lookup.
The dated
[airport board evaluation](airport-board-evaluation.md)
found no currently configured and authorized source with the complete
account/plan, rights, retention, source-age, Tallinn-sample, quota, cost, and
server-held credential contract required by Issue #46.

OpenSky's airport flights are previous-day-or-earlier overnight
reconstructions with estimated airports/times, not current operational rows.
FlightAware AeroAPI and AeroDataBox are technically credible but require
project-specific commercial authorization and unresolved combination,
retention, source-age, and plan evidence. aviationstack is likewise
unconfigured. Human-facing airport, airline, and tracker pages will not be
scraped.

Issue #46 is therefore the explicit board authorization blocker. No board
component, domain record, Worker route, credential name, cache, placeholder,
or mock production response is added. A future board failure must remain
independent of ADS-B, marine traffic, static airport context, and the map.

## Cloudflare Worker plus Static Assets

Cloudflare Workers with Static Assets is the smallest production boundary for
the Vite client and required ADSB.lol/AWC proxies. Static files bypass Worker
execution; only `/api` and `/api/*` invoke code. Both Worker routes construct
hard-coded upstream destinations and cannot act as general forwarders.
Plausible routes use a direct credential-free static-data request.

The free plan's 100,000 dynamic requests/day covers about 23 continuously
active browser sessions at the application's nominal 4,320 request/day upper
envelope, while static asset requests are documented as free and unlimited.
This is a budget estimate, not ADSB.lol capacity permission or an SLA.

Netlify is technically viable but places production deploys, bandwidth,
requests, and function compute in one 300-credit monthly budget without
providing a capability this small fixed-route application needs. GitHub Pages plus a
separate Worker would add a second deployment unit or split-origin CORS.

Fingerprint-named assets use immutable browser caching. Aircraft responses use
`no-store`; successful METAR responses use the source-aligned 60-second
guidance. A validated plausible route may be eligible for reuse only through
the bounded in-memory tab cache described above. No server-side route state is
created. Worker observability is disabled because request paths can otherwise
retain rounded camera coordinates or visible station IDs.

Deployments require an exact current `main` SHA, rerun the complete validation
suite, serialize production operations, deploy code and assets atomically, and
verify matching client/MapLibre-worker bytes plus bounded provider smoke.
Account selection and protected credentials are configured. Client-side
secrets and temporary-account workarounds remain prohibited.

## Scheduled curated CelesTrak snapshot, not direct browser orbital fetches

Issue #162 established the protected scheduled snapshot with CelesTrak's
bounded `visual` GP/OMM and SATCAT pair. Issue #211 retains that boundary and
expands only the reviewed source contract to the ordered set `visual`,
`stations`, `weather`, `gnss`, and `science`. The final coordinated
2026-09-30 probe produced 462 unique objects: 369 `PAY`, 91 `R/B`, and 2
`DEB`, with six non-conflicting overlaps, no missing GP-to-SATCAT join, and
353,281 aggregate decoded bytes.

The browser does not call CelesTrak. One protected Cloudflare Cron invokes the
same named SQLite Durable Object, which atomically admits at most one start per
two hours before ten strictly sequential requests: GP then SATCAT for each
group. Each group validates independently. The union deduplicates only by
canonical decimal NORAD ID, requires normalized name/designator and exact type
agreement, chooses the newest valid OMM epoch, and rejects equal-epoch
propagation differences. The already-fetched validated `visual` pair also
produces the exact predecessor schema-1 representation before cross-group
winner substitution. One final Workers KV write publishes a non-public
internal-version-1 bundle containing both complete public bodies, or publishes
neither; the retained v1 key is never rewritten. The literal
`GET /api/orbits/catalog` reads only compatible KV and exact-release bootstraps
and cannot perform upstream work. To preserve predecessor rollback during the
schema-2 browser rollout, absent or non-matching `Accept` receives the newest
valid schema 1 from the bundle, retained v1 KV, or immutable v1/v2 bootstrap,
while only the fixed
`application/vnd.livetrafficstan.orbital-catalog+json;version=2` request
receives schema 2. The two representations use distinct digest ETags and
`Vary: Accept`; no versioned route, query parameter, endpoint override, or new
provider input is introduced. Default schema 1 remains for at least one full
checked production release after the schema-2 browser release and can be
removed only by a separate reviewed compatibility change.

Schema 2 identifies catalog `celestrak-curated-v1`, records the ordered source
URLs and row counts, retrieval/publication times, exact OMM and SATCAT fields,
ordered `sourceGroups`, numeric-NORAD canonical ordering, and a canonical
digest. `displayOrder` is derived only from reviewed group order plus numeric
NORAD ID; it is future clutter control, not importance or mission inference.
The new key is `orbital:catalog:v2:curated-v1`; its internal envelope version is
independent from both public catalog schemas and coordinator state. Schema-1
KV and immutable `v1`/`v2` assets remain certifiable for rollback. Equal newest
schema-1 timestamps with different digests fail closed.

The catalog contract changes without resetting provider admission. The Durable
Object class, namespace, binding, object name, table, and schema-1 state keep
`lastStartedAt`, an in-progress fence, `Retry-After`/`nextAllowedAt`, terminal
block, and the two-hour cadence. A pass-through Worker, KV lock, edge-cache
miss fetch, full `active` catalog, direct browser mode, provider fallback,
parallel source burst, truncation, partial publication, and viewport-driven
acquisition remain rejected.

The schema-2 bootstrap is the never-reused
`/orbital-data/curated-2026-09-30-v1/catalog.json`: 239,460 bytes, 462
records, canonical digest
`5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`.
Checksum and repository-history guards require a new path for any byte change.
Current code validates both compatible v2 KV and bootstrap, serves the newer
`retrievedAt`, and fails closed when equal timestamps have different digests.

This infrastructure does not make propagated coordinates live observations.
The source-contract commit was intentionally not independently released; the
coordinated browser consumer now validates schema 2 and adds local zoom tiers
and complete catalog discovery without changing provider acquisition. Orbital
models remain outside aircraft/marine traffic, freshness, trails, and history.
The provider contract and alternatives are recorded in
[Orbital Data Source Evaluation](orbital-data-source-evaluation.md).

Production activation at source
`538edd25afa49f62c13e93745b322099f662791d` retained this design unchanged:
the layer remains default-off, the Worker scheduler is enabled only by the
protected exact-SHA deployment, and browsers receive only complete same-origin
representations. Run `36788698617` deployed initial Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8`; the first ordinary admitted schema-2
KV bundle was retrieved at `2026-10-01T02:17:32.034Z` and later survived the
recorded schema-1 rollback/restoration rehearsal without a provider refresh.

## Separate bounded Starlink sample, not the full constellation

Issue #257 keeps Starlink outside the curated catalog rather than raising the
512-record curated cap or silently truncating the official group. The observed
official GP and SATCAT feeds exceed 11,000 rows and several megabytes each, so
shipping the complete constellation would increase browser parse, SGP4,
prediction, GeoJSON, picking, and mobile costs while still not proving
operational status. A separate default-off child layer makes that limitation
visible and independently disposable.

One paired source acquisition validates every GP and SATCAT row, requires a
one-to-one NORAD join for every GP record, and rejects duplicate IDs,
identity/type conflicts, malformed/oversized input, partial bodies, redirects,
or clock order other than GP retrieval <= SATCAT retrieval <= publication.
Only after complete validation does
`inclination-raan-systematic-v1` sort by inclination, normalized RAAN, and
numeric NORAD ID and choose index
`floor((i + 0.5) * populationCount / sampleCount)` for at most 150 records.
This is a deterministic systematic sample for bounded display, not a
representative or complete constellation claim.

The existing CelesTrak coordinator, Cron, KV namespace, terminal block, and
global provider backoff remain authoritative. A second SQLite table reserves
Starlink immediately before the actual GP request and permits at most one
start per 12 hours; failed work waits for the next normal window. Curated work
always runs first. The initial empty row is seeded from the pinned immutable
bootstrap GP retrieval time and returns `not-due` before that source's
12-hour boundary. This permits immediate product activation without treating
deployment time as permission for another provider read; the first admitted
request and every later request retain actual-start anchoring. The route is
storage-only
`GET /api/orbits/starlink`, with no query, endpoint override, browser
coordinates, credentials, or direct CelesTrak access.

The browser reuses one physical orbital worker through two isolated logical
channels and one MapLibre map through separate persistent Starlink sources and
layers. Owner-qualified IDs prevent curated purpose/image inference. A
keyboard-paged 20-row list shares the existing Operations More scroll owner.
Counts name source population, published sample, accepted/modeled positions,
map/shown points, and crossings separately. The child preference remains
remembered while its parent is off, but it cannot fetch or model until ORBITS
is effective.

Production release #267 validated this smaller contract rather than expanding
scope. The immutable 150-record bootstrap was available immediately at source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`; exact Chrome acceptance made
one same-origin request, zero browser CelesTrak requests, reached all eight
pages, retained one active physical orbital worker, and restored theme/mobile
state without diagnostics. Protected rollback to the pre-Starlink target and
exact-current restoration both passed without deleting KV/Durable Object
state, resetting cadence, or performing a manual provider refresh.
The first eligible ordinary `22:17Z` Cron then advanced the public route to
`source=kv` with GP retrieval `22:18:01.730Z`, a newer complete 11,125-record
generation, the same 150-record bound, and no manual acquisition.

Issue #271 retains that released representation and adds a bounded,
shell-balanced schema 2 because the population-proportional sample frequently
contained no object over Estonia, Finland, or the wider Baltic. From the
retained complete source, 8,727 of 11,125 records cannot reach Tallinn's
latitude and schema 1 contains only 32 northern-capable records. The selected
schema-2 contract allocates exactly 128 records to each fixed inclination band
`<48`, `48-<60`, `60-<85`, and `>=85` degrees. Within each band it fills
16 RAAN by 8 orbital-phase targets, advances every record's phase to the GP
retrieval time, resolves equal target distance by numeric NORAD ID, and
canonically sorts the final 512 records. This intentionally improves geographic
density without claiming whole-constellation, operational, or optical
coverage.

The upgrade does not add a scheduler, provider request, browser endpoint, map,
or physical worker. One complete GP/SATCAT normalization now produces the exact
schema-1 member and the schema-2 member in one private envelope and one final
KV write. Same-route media negotiation, representation-specific ETags/`304`,
and `Vary: Accept` preserve predecessor tabs. During activation, a combined
schema-2/schema-1 browser request may receive a fresher schema 1 when the
immutable schema-2 bootstrap is already beyond the 24-hour hard expiry; the
next ordinary admitted refresh aligns both fresh members without a manual
provider read.

The immutable schema-2 snapshot contains 512 records, 128 per band, occupies
254,275 bytes, and has digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
Across 145 ten-minute samples, the Baltic box mean rises from 0.269 to 2.110
and empty time falls from 75.9% to 7.6%; northern Europe rises from 0.655 to
5.614 and falls from 50.3% empty to 0.7%. The released schema-1 immutable bytes
and key remain untouched rollback evidence.

Release #275 deploys this contract at exact application source
`d565b56278e81ff2478ab1e476c269084f2297d4`. Immediate negotiation evidence
confirms the intended rollout: default, wildcard, and combined clients receive
the fresher schema-1 KV member while the immutable schema-2 bootstrap is
beyond the browser expiry; exact schema-2 clients can still inspect that
bootstrap. Independent ETags/`304`, cross-representation `200`, `Vary:
Accept`, and explicit `q=0` exclusion prevent cache or preference ambiguity.
Only an ordinary admitted Cron may replace both members with one aligned fresh
bundle. The ordinary `2026-10-03T14:17Z` event did so at `14:17:23.055Z`;
full production record/digest and negotiation checks passed, and protected
rollback/restoration retained both representations byte-identically.

## Reviewed exact-NORAD manifest, not inferred orbital missions

Issue #193 uses a tiny bundled manifest for purpose and image context rather
than adding a metadata service, startup request, per-hover request, or
name/orbit inference. The first version contains only Hubble (`20580`) and ISS
(`25544`), whose current CelesTrak names, international designators, and exact
SATCAT payload type match official NASA mission pages and exact NASA image IDs.

The manifest is compiled into the client. Purpose therefore appears with zero
network work. Photographs are immutable same-origin Static Assets and start
only after exact selection; a later hover can reuse one only after successful
validation in the current tab. The loader enforces one bounded request, exact
status/media type/byte count/SHA-256, aborts obsolete work, caches only a
fulfilled Blob URL, retains a terminal session failure rather than retrying,
and revokes URLs on teardown. The tooltip receives only path-to-Blob-URL
entries, while the enrichment identity includes feature ID, current catalog
identity, complete snapshot digest, and manifest version.

Rocket bodies, debris, and every unreviewed payload remain explicitly
unavailable. Transferring the payload mission to a discarded stage, using a
generic stock image, scraping search results, or introducing a credentialed
DISCOS/Space-Track boundary was rejected as less truthful and more complex.
The source and rights evidence is recorded in
[Orbital Purpose and Image Source Evaluation](orbital-enrichment-source-evaluation.md).

## Mercator-first local orbital modeling

Issue #162 first added orbital context to the existing single Mercator map before
globe projection work. The flat map already supported whole-world and
street-level zooms, while the separate aircraft/marine 100 km contract remains
well understood. A globe would also change horizon geometry, off-Earth canvas
samples, poles, style projection restoration, front/back picking, camera/share
state, and the zoom 11-12 projection transition. Those risks belonged to
dependent Issue #163 and did not block useful modeled objects.

That sequencing decision is historical. #163 now supplies native automatic
globe interpolation and a separate Flat preference on the same map, with
projection-aware surface guards, initial-camera fencing and real rendering/
picking evidence. See [smooth globe and safe footprints](architecture.md#smooth-globe-and-safe-footprints).
No provider, clock, catalog or worker lifecycle is added by that follow-up.

The browser uses the complete same-origin snapshot and propagates OMM locally
with pinned `satellite.js` 7.1.0 in a dedicated worker. Sending viewport,
selection, or browser clock state to another position service was rejected:
it would add user-derived network disclosure, another provider lifecycle, and
per-view request load without improving the authoritative element source.

Current points, 90-minute crossings, and the selected 15-minute ground track
are separate application-owned models, not traffic observations. Safe Flat
whole-world views list current modeled points without inventing a crossing
rank. Partial world-spanning or invalid footprints retain current points but suppress
crossing results. Aircraft and ships independently pause whenever the unchanged
traffic viewport is ineligible.

Every safe current position stays in one persistent GeoJSON source. Clutter
control is a layer/selectability policy, not source truncation: stable schema-2
`displayOrder` admits 192 matches below zoom 2, 384 below zoom 4, and all safe
matches through 512 at zoom 4 or above. A safe selected object is the only
exception to zoom or exact type/source-group filtering and is labeled as such.
This keeps style restoration and one-second source updates independent from
search, paging, and the displayed rank subset.

The compact ORBITS line reports the current `shownInFootprintCount` and the
compatible next-90-minute crossing count rather than repeating the broader
modeled population. A missing settled map reports map counts unavailable; a
compatible map with a pending prediction reports passes updating rather than
zero. Exact enrichment matches for Hubble and ISS add a larger icon-size
expression and `HUBBLE`/`ISS` text in the existing point layer. This reuses the
reviewed NORAD/name/designator/type boundary and active style font stack;
unreviewed objects receive no fame, mission, or label inference.

Catalog discovery operates only on the accepted snapshot. Text matches name,
canonical NORAD ID, or international designator and ranks exact, prefix, then
substring before `displayOrder`, normalized name, and numeric NORAD ID. Type
and reviewed source-group filters are exact. Text changes only the 20-row
paged list; exact filters also update local map eligibility and one coalesced
prediction. Fuzzy matching, punctuation removal, mission inference, URL state,
persistence, and network search were rejected.

The worker is execution-lazy: it is not constructed until ORBITS is enabled
and a catalog is accepted. The generated PWA shell already contains all hashed
build assets, so it may prefetch the small worker chunk during installation.
Changing that global shell contract for one optional feature was rejected
because it would add new cache machinery while provider requests, CPU work,
and worker execution remain absent before enable.

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

## Local vessel discovery after provider normalization

Vessel search and filters run only on normalized, fresh, exact-viewport
entities in React. This keeps one Digitraffic MQTT subscription, preserves the
five-minute REST/metadata gates and provider-owned caches, and avoids adding a
server search endpoint or a second scheduler.

The released 50 metre minimum remains the default. Search covers only current
name, callsign, MMSI, and IMO fields. Category, navigation, reported-speed, and
inclusive length filters combine with AND. Unknown values are explicit:
`all` includes them, specific known choices exclude them, and missing length is
included only when the user opts in. One knot is exactly 1.852 km/h and zero is
a known speed. The accessible result list is deterministically ordered and
bounded to 20 while every match remains on the map.

AIS reserved subcodes are not treated as defined categories. Passenger is
60-64 or 69, cargo is 70-74 or 79, tanker is 80-84 or 89, and the reserved
subcodes between those values remain unknown. Search/filter state never mutates
the provider snapshot, and hiding SHIPS keeps matching counts truthful while
disabling result selection.

## Local aircraft discovery after viewport and freshness filtering

Aircraft search runs over current `DisplayAircraft[]` after provider
normalization, exact viewport filtering, freshness calculation, and expiry.
It performs case-insensitive literal matching over callsign, registration,
ICAO24, and provider-reported type, ordered by exact, prefix, then substring
match with stable display-order ties.

The input is bounded to 64 characters and the accessible result list to 20.
Search does not hide nonmatching markers, move the camera, change Home, query a
provider or geocoder, load metadata while typing, or create another scheduler.
Selecting a result reuses the existing traffic details, trail, and
selected-aircraft metadata path.

## Pinned Natural Earth ports as optional context

Natural Earth Ports `v5.1.2` at commit
`f1890d9f152c896d250a77557a5751a93d494776` is selected as a compact
public-domain geographic context layer. The deterministic projection retains
only Natural Earth ID, name, scalerank, and coordinates: 1,081 points,
154,218 raw bytes, and 22,482 deterministic gzip-9 bytes.

The source is not a comprehensive or operational port database. It omits
relevant regional terminals, and Natural Earth warns that some points may be
approximate by up to 20 miles. The UI and details therefore say generalized
and incomplete and do not show or infer country, facilities, berths, capacity,
operational status, port calls, nearby-vessel relationships, destination, or
ETA.

The layer is off by default and makes no startup request. One immutable
same-origin asset is loaded lazily with a deadline, byte cap, SHA-256, strict
grammar/count/rank validation, and fulfilled-only session caching. Failure is
local to the PORTS control. Ports use separate IDs, selection, styling, and
details; traffic picking retains priority, and ports never enter traffic
counts, trails, provider health, or provider queries.

NGA World Port Index was not selected for this slice because its official CSV
export returned HTTP 403 during review, so a stable current export and
dataset-specific rights/update contract could not be inspected reproducibly.
That does not make Natural Earth equivalent in completeness; it supports only
the narrower generalized-context feature.

## Pinned OurAirports points as optional context

OurAirports at commit
`5ed85eed28722bea80ebdde9e255e09b1e7317a8` is selected for the
static airport layer. Its Public Domain terms permit the projection, request
credit, and disclaim accuracy and fitness. The source's persistent numeric ID
is retained; `ident`, explicit ICAO, and explicit IATA values remain separate.

The deterministic projection includes all 5,280 current large and medium
airport records rather than treating `scheduled_service` as a live operational
guarantee. It is one 1,329,838-byte immutable GeoJSON asset, compressed to
225,625 deterministic gzip-9 bytes.

The layer is off by default and makes no startup request. One same-origin load
is guarded by a deadline, body cap, exact bytes, SHA-256, full grammar/count
validation, and fulfilled-only session caching. Large and medium points use
separate zoom thresholds, render above generalized ports and below traffic,
and remain available at high zoom. Valid wide-view geometry can continue to
filter and select this static context even while the 100 km live-traffic gate
is paused.

A bounded "Airports in this view" list gives keyboard users the same static
selection path as map users. Airport, port, weather, and traffic selections are
mutually exclusive. Exact traffic and traffic touch fallback retain priority;
weather, airport, and port use that order within exact and validated-touch
context hits. Static details never claim navigation authority, operating
status, current service, route, arrival, departure, or a relationship to a
visible aircraft.

## Application-owned traffic models

Provider payloads are decoded and normalized at the provider boundary. Map and UI code consume application-owned aircraft and vessel models and do not depend on raw ADSB.lol or Digitraffic response shapes.

## MapLibre sources and layers

Aircraft, vessels, and the selected trail are represented as GeoJSON sources. MapLibre symbol and line layers are updated in place, avoiding a React component or DOM marker for every traffic object.

## Persisted provider silhouettes and render-only traffic semantics

The map persists ten original canvas icon keys: light/small fixed-wing, generic
fixed-wing, heavy fixed-wing, helicopter, cargo, tanker, passenger, fishing,
tug, and generic vessel. Marine traffic uses a maritime-blue palette with
theme-specific high-contrast detail. Aircraft category stays shape-based while
the aircraft silhouette color carries the bounded altitude band.

Normalization maps only trusted provider fields to application-owned icon keys.
ADS-B A1/A2 use light fixed-wing, A5 heavy fixed-wing, and A7 helicopter.
A3/A4/A6 retain their existing labels and scales but use generic fixed-wing
art. AIS type 30 uses fishing, type 52 tug, 60-64/69 passenger, 70-74/79 cargo, and
80-84/89 tanker. Reserved subcodes and every unsupported or missing category
use the corresponding generic fallback.

No model/type string, speed, name, route, operator, position, or movement is
used to infer a category. This keeps the vocabulary truthful and avoids a
classification service or dataset. The 10 persisted images, 3 exact
render-only vessel shapes, and 20 aircraft altitude-color variants are
generated once per theme and reinstalled through the existing single-map style
lifecycle.

All nine vessel display classes use bold top-down outer silhouettes:
generic, cargo, tanker, passenger, fishing, exact AIS-52 tug, sailing,
pleasure craft, and high-speed craft. Installed image IDs or a small raster
pixel difference are not accepted as proof that people can distinguish them.
The original contour gates required pairwise IoU below 0.78, at least
22 percent symmetric difference and large width-band/notch differences.
The user's subsequent "tombstones" report showed that those proxies encouraged
distorted silhouettes and did not prove recognizable boats. Issue #331
replaces them with pointed hulls and nautical deck/superstructure motifs,
retaining physical-length normalization and color/state behavior.
Geometry tests protect those invariants, but acceptance depends on inspecting
actual-scale rendered ships in both themes, headings and responsive layouts.
No classification boundary changes.

The user-visible #250 follow-up showed that a shared MapLibre multiplier did
not preserve physical-size ordering across silhouettes with different
longitudinal contour spans. The current contract keeps the 22 CSS-pixel
small-hull reference floor, widens valid AIS length scaling toward a 44
CSS-pixel reference ceiling for large hulls, and normalizes every silhouette
to one longitudinal source span before applying that scale. Size still comes
only from valid AIS
reference-point dimensions; category, name, route, width, and artwork area
never upgrade it.

Provider-owned icon keys stay in normalized entities and bounded historical
records. Visual-only state is derived later by one pure presentation module and
projected into MapLibre properties. This avoids a history migration and keeps
rollback compatible with observations written by the previous release.

The render vocabulary adds exact sailing, pleasure-craft, and high-speed-craft
shapes without changing persisted marker keys. Speed-over-ground produces
moving, slow/stopped, or unknown render state. Exactly one knot is moving;
missing, invalid, or negative speed is unknown. Only slow/stopped traffic
receives a small red screen-upright dot; moving and unknown traffic do not add
a circle over the silhouette. Vessel rotation is directional only while
moving. Aircraft use the same red slow/stopped treatment but retain reported
heading when speed is unknown. Navigation status remains separate and
conflicting reports are disclosed.

Sailing and pleasure craft form a strict branch rather than a generic length
exception. They display only with exact normalized type, known length at least
8 m and a finite position age between zero and the configured marine expiry.
The existing speed filter applies equally to yachts: Any includes stopped and
unknown-speed reports, while explicit speed choices remain restrictive.
Ordinary marine freshness marks them stale after two minutes and removes them
after ten. Invalid/future values remain excluded. The live clock or historical
cursor supplies display time. They never fall through to the ordinary length
rule; non-yachts retain the 50 m default and unknown-length preference.
Digitraffic's Class A-only scope means small-yacht coverage is expected to be
incomplete.

Issue #311 supersedes only the mandatory moving-only and fresh-only yacht
visibility introduced by #77. A supplied 16 m pleasure craft reporting 0 kn at
age 123.591 seconds demonstrated that both gates hid usable observations even
when Any reported speed was selected. The user approved reusing the existing
controls and freshness pipeline rather than adding another preference,
scheduler or source. This does not resolve the separate Class B coverage gap
tracked by #296.

Aircraft use the silhouette fill itself for sequential altitude colors, with
boundaries below 1,000 m, 1,000-3,000 m, 3,000-10,000 m, and 10,000 m or
higher plus neutral unknown. Ordinary per-aircraft altitude rings and
vertical-trend badges are removed so the category shape remains visible.
Vertical trend at the exact +/-200 ft/min boundary remains in selected details,
and selected details plus filter/status labels expose altitude and movement in
text, so neither relies on color alone. The duplicate control legend is omitted
to preserve the bounded mobile disclosure.

Mouse hover is a map-local presentation path over normalized entities already
in memory. Aircraft show flight/callsign, reported type, reported altitude in
the active unit system, and identity fallback; vessels show name/MMSI, locally
derived flag state, speed over ground in both km/h and knots, and explicitly
labeled AIS destination. DOM text is assigned through `textContent`. When the
aircraft-photo path is enabled, one stable fine-pointer aircraft hover may use
the reviewed direct provider boundary after
500 ms; the resulting image remains a credited exact source-page link. The
same dwell may resolve a vessel's already-bundled exact-IMO image and display
it with fixed Commons revision and rights context, without contacting an image
provider. Metadata, route, traffic-provider, reconnect, and polling work remain
unaffected, and AIS destination is not presented as a complete route.

## Pinned static selected-aircraft metadata

The dated
[aircraft metadata evaluation](aircraft-metadata-evaluation.md) selects the
Mictronics aircraft-database at commit
`1724959f854f540c95f11872bcd377ecfeb698a2`. Its exports are explicitly offered
under ODC-By 1.0, allowing a compact derivative database with visible
attribution and the full license conveyed alongside the data.

The projection retains only ICAO24, registration, type, model description,
configuration, wake category, and explicit duplicate-registration ambiguity.
Owner, operator, photos, notes, and the unlinked operator directory are
excluded. Registered owner or a callsign prefix is not the current operating
airline, so the feature deliberately adds no airline claim.

Static same-origin assets are smaller and more reliable than adding a runtime
metadata API, credential, quota, or server cache. Nothing loads at startup.
Selecting an aircraft loads one index/type asset and one two-hex-prefix shard
under a five-second total deadline and byte caps. A fulfilled index plus eight
fulfilled shards are the only caches; partial, malformed, rejected, or aborted
work is not cached.

Exact ICAO24 is primary. Present live registration and type must agree, and
duplicated source registrations are unavailable. An exact ICAO24 lookup without
live registration is labeled ICAO24-only and keeps the source registration
distinct. There is no registration fallback, punctuation stripping, fuzzy
match, owner/operator lookup, or callsign inference.

The source publication instant is dataset-wide age, not per-aircraft
verification. The snapshot is valid through 45 days, rejects dates more than
24 hours ahead of the client clock, and reevaluates while open without another
request. Updating any pin, schema, generator, or generated bytes requires a new
immutable output URL.

This metadata never changes the provider-reported marker vocabulary. Model,
configuration, and wake category are selected-object context only.

## Bundled identifier-allocation country context

Selected details derive optional country context locally rather than adding an
enrichment provider. Aircraft use only exact six-character ICAO24 addresses
against validated inclusive state-allocation ranges. Vessels use only valid
nine-digit ordinary ship-station MMSIs beginning with 2 through 7 and an
unambiguous assigned MID.

The result is display-only `Country name (ISO)` text labelled **Registration
allocation** for aircraft or **Flag state** for vessels. It is not operator,
owner, crew, citizenship, route, location, operating area, current
jurisdiction, or live-registry evidence. Unknown, special-purpose, unassigned,
conflicting, malformed, and excluded values omit the row.

The projection uses pinned open-licensed third-party source data plus a
canonical hash-pinned CC0 Wikidata cross-check. It copies no ITU/ICAO
publication layout or text, excludes every known ambiguous or invalid source
row, and is checked offline in CI. Registration-prefix fallback remains
deferred.

Keeping this as a pure domain lookup avoids changes to provider normalization,
history records, persistence, loading, cache, or networking. Live and
historical details therefore use the same deterministic derivation.

Issue #312 adds the requested small vessel-country flag as a render-only
decoration beside the existing ship silhouette. It reuses the exact MMSI
lookup rather than adding a registry provider or inferring a flag from name,
position, owner, route or appearance. A bundled, licensed pixel set avoids
platform-dependent flag emoji and runtime image requests. The fixed-size,
upright badge shares the vessel source, visibility and stale opacity; it does
not replace the AIS category, stopped indicator, selected halo, text country
context or hull hit target. Unknown and excluded MMSIs stay unflagged.
This is an allocation-country badge, not live registry or ensign evidence.

## Explicit MapLibre worker bundling

MapLibre 6 loads vector tiles through a separate module worker. Vite prebundles the main dependency, which makes MapLibre's inferred adjacent worker URL point at a file Vite did not emit. The result is a loaded style with vector tiles stuck indefinitely in a loading state.

V1 imports `maplibre-gl-worker.mjs` through Vite's `?worker&url` handling and calls `setWorkerUrl` before constructing the map. This keeps the worker URL correct in both development and hashed production output without adding a plugin or custom build system.

## Observed-position interpolation

V1 animates briefly between two positions already supplied by a provider. It does not continue movement beyond the latest observed coordinate. This removes abrupt visual jumps without presenting predicted positions as live facts.

## Bounded session history and selected trails

Recent provider-observed positions are always kept in a bounded volatile
session store. Only the selected object's configured trail is rendered.
Refreshing clears that session store; the separate explicit opt-in durable
boundary is described below.

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
Center restores a session Home framing comparable to a 30 km local view. This
keeps fast aircraft on-screen about 50% longer than the earlier 20 km framing
without changing provider or display geometry: the safely representable full
canvas still determines the enclosing query circle and exact display polygon.
The Home value is camera framing, not a selectable traffic radius.

The coordinated presentation follow-up was released through #242-#246 at exact
source `560a9bb409a92036996e391500ec36b1d7b0e728`. Production Chrome
`154.0.8037.59` retained one map while proving the maritime-blue vessel
silhouettes, compact rendered/pass counts with exact Hubble/ISS labels, and the
30 km camera fit. Public Wiki commit
`618943bb23fd6745783dade155e4d9fbf93634cb` records the measured evidence and
rollback target without changing these architecture decisions.

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

## Explicit coordinates and Photon forward search

One compact Location form handles both direct coordinates and named places.
Strict decimal `latitude, longitude` input is recognized before any provider
path, validated against coordinate ranges, rounded with the existing
three-decimal privacy precision, and navigated locally. Named text is sent only
after explicit submit; typing never schedules network work.

Photon's public endpoint was selected after a dated comparison with the public
Nominatim instance. Photon's current terms permit project use subject to fair
use, throttling, service changes, and no availability guarantee. Public
Nominatim's official one-request-per-second maximum applies to the sum of all
users of an application, which a static browser-local limiter cannot enforce.
Adding a proxy solely to approximate that aggregate policy would be larger than
the required feature.

The Photon adapter is replaceable through one validated HTTPS or root-relative
configuration value, but the checked deployment adds no geocoder proxy or
credential. Requests omit browser credentials and custom `User-Agent` headers,
carry no geolocation bias, and return at most five normalized Point results.
One active request, revision cancellation, a one-second local submit cooldown,
an eight-second total timeout, bounded session caching, and explicit `429`
deadlines contain load without claiming a provider quota. Search failure leaves
coordinates and the map usable.

Search result labels and submitted text are not persisted. The UI discloses
that submitted text appears in the Photon URL and that the provider receives
ordinary network metadata. Visible Photon and OpenStreetMap attribution remains
next to the control.

## Separate Home and explicit-view intent

Session Home is a Center destination, not the current search target. Coordinate
navigation and Photon results change the view without changing Home. A later
Center action therefore returns to the most recent configured or rounded
geolocated Home.

A small revision-based intent boundary prevents asynchronous geolocation from
overriding newer explicit work. Search submission, coordinate navigation,
Center, Use Location, and trusted manual camera movement win over an older
automatic location callback. That older callback may still update Home
silently, so a later Center can use it. Programmatic navigation retains its
label, while trusted canvas movement changes the label to `Custom view`.

Committed navigation clears selection and resets old retained trail points,
then uses the existing settled full-canvas viewport pipeline. It does not
recreate MapLibre, change filters/layers/themes, add a provider scheduler, or
reconnect marine MQTT.

## Configurable trails and private local playback

Selected-object trail observations stay session-only. Their
visibility/duration preference is remembered, retains the released visible
15-minute default, offers 5/15/30/60-minute choices, and remains bounded by both
per-object and 50,000-point aggregate caps. Hiding a trail is a display choice,
not a provider or recording policy.

The dated 2026-09-19 rights review authorizes the shipped persistence boundary
only for explicit opt-in, personal, origin-local playback:

- ADSB.lol labels the live API ODbL 1.0. ODbL grants extraction, derivative
  databases, and permanent reproduction, while public use of a derivative
  database or its produced work can add share-alike and machine-readable-access
  obligations.
- Fintraffic licenses Digitraffic open data under CC BY 4.0 with linked source
  and license credit plus a notice that LiveTrafficStan filters and normalizes
  the data.
- No user history is uploaded, exported, shared, synchronized, served from a
  backend, or placed in a service-worker response cache.
- Public retained-history output, export, shared/cross-device history, or a
  backend requires a fresh provider-rights decision before implementation.

The store remains off by default and records only an allowlisted versioned
observation schema. Session history is separately bounded and volatile.
Durable history uses 1/6/24-hour retention plus 100,000-record and 32 MiB
logical limits; the first reached limit prunes oldest receipt-time records.
Clear and Disable atomically increment a recording epoch and delete rows, and
every queued write rechecks both authorization and epoch inside its
transaction. Pending batches retain their enqueue epoch. Typed cross-tab Clear
invalidations also clear volatile history and pending work, while Disable
clears pending work. Failed batches remain queued behind a visible suspension.

Stored-row validation reconstructs the exact allowlisted schema, requires the
approved provider/kind/license tuple, drops additional properties, and
recomputes logical bytes. Validation, malformed-row deletion, metadata recount,
and pruning occur in one readwrite transaction so repair cannot overwrite a
newer authorization epoch. Successfully committed rows are retained as bounded
in-memory deltas until session pruning needs them, avoiding periodic full-store
rescans during ordinary recording.

Playback changes display time only. It freezes its range on entry, supports
scrub, play/pause, and 0.5×/1×/2×/4× speeds, and stops at the endpoint until
the user explicitly returns live. Current provider controllers remain mounted
and continue ordinary eligible acquisition. Offline, hidden, unmounted, and
ineligible-view reasons compose through the existing pause boundary without
resetting aircraft cadence, `Retry-After`, MQTT reconnect, REST, or metadata
gates.

Current-only METAR, third-party aircraft metadata, and plausible-route lookup
are absent in history. Vessel destination/ETA, interpolation frames,
browser location, export, sharing, synchronization, service-worker live
caching, and backend history remain outside the decision.

## Explicit Auto, Light, and Dark theme preference

The Positron presentation remains the default Light theme. V1.1 provides an
explicit Dark choice backed by the OpenFreeMap dark style and CSS custom
properties. Issue #10 adds explicit Auto without changing the default: missing,
invalid, or inaccessible storage still resolves to Light. Auto follows
`prefers-color-scheme`, including later system changes, while explicit Light
and Dark remain overrides. Pre-paint and React resolution use the same
contract to avoid an initial wrong-theme flash.

Issue #12 moves theme into the complete
`livetrafficstan.preferences.v1` schema. The legacy theme key is imported only
when that schema is absent and is mirrored for rollback compatibility; it is no
longer an independent authority.

MapLibre remains a single instance. Because `map.setStyle` removes custom
style-owned state, the map layer installer restores traffic images,
sources, layers, data, visibility, and trail after every `style.load`
without changing camera, selection, provider state, or connections.

Traffic artwork uses maritime-blue vessels and a bounded altitude palette on
each aircraft silhouette in both themes. Cargo/container, passenger, tanker,
and tug use coarse interior line art that remains legible at the 22 CSS-pixel
floor without changing exact AIS-derived classification. The theme-specific
canvas treatment changes fill luminance, detail color, shadow, and two-tone
edge contrast while retaining silhouettes and heading/course rotation. Image
IDs are replaced through MapLibre when the theme changes, including when both
theme options reference the same style URL. The image cache contains only the
bounded light and dark sets.

## Versioned preferences, fragment sharing, and presentation units

The unified preference schema stores only non-sensitive controls: theme,
presentation units, six layer flags, structured vessel filters without query
text, and selected-trail visibility/duration. Camera, browser Home/location,
searches, selections, provider state, observations, playback, and the separate
private-history authorization/storage contract are excluded.

Explicit sharing creates a readable versioned URL fragment only on user action.
The camera is complete, bounded, and rounded to the existing three-decimal
privacy precision. Valid fragment fields override saved preferences and
defaults for that page, but opening the link does not save them. A shared
camera initializes the one MapLibre instance and wins over asynchronous
automatic geolocation; the location result may still update Home for a later
Center action.

Metric values remain canonical. Aviation/nautical presentation converts metres
to feet, km/h to knots, and m/s to ft/min. Vessel dimensions and filter
thresholds remain metres. Selected vessel speed over ground always shows both
km/h and knots so marine users do not need to switch the global presentation
preference for that value. AWC wind and visibility are normalized to metric at
the provider boundary while retaining bounded visibility relation/source tokens
for truthful aviation formatting. Unit changes never alter provider queries,
viewport eligibility, filter membership, history, selection, or map lifecycle.

Reset restores preference defaults and removes the share fragment without
moving the camera/Home or touching private-history settings, consent, epochs,
or IndexedDB.

## Dependency-free generated application shell

The installable shell uses a small generated native service worker rather than
adding a PWA framework. Vite already emits every required hashed application
chunk, including the MapLibre worker and lazy MQTT bundle, so a post-build Node
step can enumerate and version the exact shell with less policy surface.

Only root/index, hashed assets, manifest, favicon, and versioned icons are
preloaded. APIs, MQTT, external map resources, Photon, AWC, static context
datasets, and private history are excluded. Root navigation is network-first;
shell assets are cache-first; all other requests bypass the worker. This keeps
offline state truthful and prevents stale live/provider output from becoming a
success-shaped response.

Updates keep at most current and predecessor shell caches. This is the smallest
handover that protects old controlled tabs and deferred hashed imports while
bounding cleanup. The candidate records which cache is truly active during
install rather than inferring lineage from CacheStorage insertion order, so a
superseded waiting generation cannot evict the real predecessor. First install
never prompts. Worker policy source participates in the cache identity, while a
same-identity defensive path leaves active metadata untouched. A waiting update
activates only after **REFRESH APP**, then reloads controlled tabs once.
Rollback uses the same path in reverse and searches the active generation
before its predecessor.

The offline map is not a basemap cache. A source-free theme background lets the
existing MapLibre instance calculate viewport geometry and render retained
historical overlays. It states that basemap tiles are not cached and retries
the external style on reconnect.

Rollback to a non-PWA release uses a special retirement build. Its stable
worker activates immediately, deletes only LiveTrafficStan shell caches,
unregisters, and navigates clients once without touching local preferences,
unrelated caches, history settings, or IndexedDB.

## Separate optional traffic clustering

Clustering is a remembered display preference and starts off. Aircraft and
vessels keep separate MapLibre GeoJSON sources, cluster circles, and `AIR`/`SEA`
count labels so unlike traffic kinds are never combined. Filtering, viewport
eligibility, freshness, and expiry run before source data reaches clustering.

Cluster IDs are transient MapLibre implementation details, not application
entity IDs. A click expands the exact cluster under generation guards; touch
entity fallback ignores clusters. Fixed source creation uses a 42 CSS-pixel
radius, minimum count 3, and maximum cluster zoom 10. Runtime toggles change
only the supported `cluster` source option.

MapLibre rebuilds the Supercluster index on every full GeoJSON `setData()` even
above the visible cluster zoom. Per-frame interpolation is therefore
suspended whenever clustering is enabled. Ordinary stable-ID traffic movement
uses `updateData` diffs, while style/source installation and forced recovery
retain complete snapshots. This avoids repeated full index rebuilds without
changing provider acquisition, source observations, selection, or trails.

## Bounded AWC METAR/SPECI observation overlay

NOAA/NWS Aviation Weather Center is selected for one optional
observation-based context layer. Its official API supplies worldwide METAR
terminal observations and SPECI updates, publishes a 100 request/minute limit,
requests a public User-Agent, and explicitly does not permit browser CORS.
The existing Cloudflare boundary therefore adds one strict credential-free
same-origin route rather than a client-side workaround or general proxy.

The station set comes only from explicit four-letter ICAO codes in the pinned
large/medium OurAirports projection inside the eligible viewport. At most 50
sorted unique IDs are sent; an over-limit view asks the user to zoom in rather
than silently truncating coverage. No station, weather, route, or airport
operation is inferred from traffic, movement, proximity, `ident`, or IATA.

There is no startup request and no periodic poller. First enable, station-set
changes, refresh, and retry share a session-lived 60-second start gate and
longer provider `Retry-After` deadlines. Reports become stale after 75 minutes
and expire after 120 minutes. Hidden, disabled, superseded, and unmounted work
aborts; fulfilled same-view data survives hide/show and style changes in memory
only.

AWC reports are generally U.S. public-domain information unless marked
otherwise. The app shows source and retrieval times, visible attribution,
terms, and modified-presentation wording. METAR/SPECI is observed weather, not
a forecast, operational status, route, board, or coverage guarantee. Radar,
forecast processing, paid services, persistent weather storage, provider
selection, and shared application caching remain out of scope.

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

An unrelated defect discovered during implementation, review, or release
acceptance receives its own Issue. It joins the active work only when it is
tightly coupled to the change or blocks a documented acceptance criterion;
otherwise it remains separately prioritized instead of broadening the current
delivery.

Provider access, credentials, account roles, data rights, or licensing become a
separate blocker only after concrete evidence identifies the missing
prerequisite. The blocker records affected criteria and measurable completion
evidence while unrelated ready work continues. Placeholder adapters, inferred
data, client-side secrets, and success-shaped fallbacks are not acceptable
substitutes.

## Compact controls and rendered interaction evidence

The user explicitly rejected retaining a full-width bar after #291. The
current source therefore restores a 280x88 px floating brand/status card
instead of treating another small height reduction as completion. Counts,
freshness, regional coverage, and Provider details remain immediately visible.
The single location input, Center, results, and privacy/attribution text are
grouped at the start of Settings. Desktop has a 76 px right-hand rail with the
existing Aircraft, Ships, ORBITS, More and Settings buttons; panels open inward
and the inspector sits opposite them. Phones retain the 70 px bottom dock.
The card is inset 16 px on desktop and 12 px on phones, while the right desktop
rail begins at 16 px. Do not reintroduce an edge-to-edge header.

The first presentation pass was not visually distinct enough; #288 supplied
the structural correction. Subsequent feedback explicitly favored its buttons
but requested minimalism, right-side controls and a smaller bar. #291 used
the installed Impeccable distill/craft guidance and detector for that focused
CSS change, not a new design system or a claim that Impeccable created the
earlier implementation. Its one decorative notice-border finding was removed
without removing status text or recovery. Preserve accepted work and validate
the changed surface rather than repeating unrelated reviews.

#295 applies the installed Impeccable context, distill and craft guidance to
the incumbent design, then runs its detector over the changed CSS/component.
It changes composition, not provider or map behavior. The removed persistent
search row remains available in the existing Settings disclosure; no new
search model, menu state, framework, or application dependency is introduced.

More contains session-only Layers, Find, Context, Orbits and Sources views.
Inactive views stay mounted so controlled search/filter state survives task
changes. **VIEW** selects Orbits and focuses its first result without another
catalog request or camera movement. Settings groups Auto/Light/Dark and Trails
under Appearance after location search and its feedback, plus browser location,
local history, units, sharing, reset and application detail. The disclosures share one native
`name`, so at most one is open.

The task strip uses the application's ordinary button, focus, and active-state
tokens. It must not fall back to browser-default controls, but it also remains
non-sticky so short-view scrolling can move it away from the final result.
Starlink summary content is metric-first: modeled, in-map/shown, and next-pass
values precede the compact source population, retrieval time, sample, SGP4,
not-live, and not-optical caveats. This is presentation only and adds no
provider request, worker, map source, layer, or scheduler.

The location input and its feedback stay mounted while Settings is collapsed,
preserving entered text and in-flight state. Active historical controls remain outside
both disclosures. Each panel may promote one action from its own recovery
domain without duplicating that action inside More: operational recovery
belongs above Operations More, while application, storage, update, and history
recovery belongs above Location & Settings More. Mandatory map or selected-item
attribution is never hidden. The combined expanded stack, rather than each
panel independently, owns 58% of the current visual viewport. CSS `dvh`/`vh`
values provide fallbacks, while `window.visualViewport.height` handles mobile
browser chrome and keyboard changes that do not match the layout viewport.

Each disclosure body is its single vertical scroll owner. Result lists do not
create nested scroll regions; in particular, the bounded orbital result list
uses the Operations body for touch, wheel, Tab, and keyboard scrolling. Thin
visible scrollbar styling, stable gutter allocation, and a focusable labelled
region preserve reachability without increasing the visual-viewport budget.
The task selector is deliberately not sticky: on a short viewport it scrolls
away so the final result cannot be geometrically present but visually covered.

The duplicate traffic legend is intentionally removed. Application-owned
labels remain in filters, status summaries, tooltips, and selected details;
provider-reported silhouettes and non-color text continue to convey the
relevant altitude, movement, and vessel-type semantics.

Selection updates must retain the complete MapLibre feature-property contract.
In particular, `removeAllProperties` is terminal in the installed source-diff
implementation and cannot be combined with properties expected to survive or be
re-added.

Pure tests, server-rendered markup, and HTTP smoke cannot establish that a
marker remains painted, focus returns to a visible control, or a mobile map
strip is touchable. Those claims require a real-browser check with measured
camera, source properties, visual and layout viewport sizes, overlay bounds,
topmost-element hit testing, attribution, and an actual input gesture.

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
