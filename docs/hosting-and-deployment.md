# Hosting and Deployment

## Decision and current status

Decision date: **2026-09-19**

TrackStan selects **Cloudflare Workers with Static Assets** as its
production platform:

- Vite's `dist/` output is served as immutable static assets;
- one Worker handles the same-origin ADSB.lol point and AWC METAR paths plus a
  protected storage-only orbital catalog route and scheduler, with an
  optional isolated same-origin marine relay and a fixed Open Waters
  vessel-photo metadata route;
- plausible route lookup calls ADSB.lol standing data directly from the
  browser once for a newly selected eligible live aircraft;
- explicit captured ship journeys use anonymous bounded Open Waters history
  and Digitraffic Portnet GETs, plus a pinned same-origin shipping graph.
  Their scoped CSP/source rules require no new secret, Worker route, binding,
  migration or production flag. Aircraft Show path reuses its accepted route.
  The graph is immutable static context, not part of the shell startup cache;
- default-on modeled depths use fixed anonymous EMODnet/GEBCO browser
  tile/value routes, bounded tab caches and an origin-specific static CSP.
  They add no backend, credential, deployment flag or history persistence;
- eight reviewed exact-IMO vessel photographs remain versioned same-origin
  Static Assets. Other reported IMO/MMSI identities can use
  `/api/vessel-photos/{number}` with no secret or new binding; validated
  Commons thumbnails load directly, anonymously and without referrer;
- OpenFreeMap, Photon, and Digitraffic REST/MQTT remain direct browser
  connections;
- no plausible-route secret, quota store, result database, queue, or general
  backend is added. Private aircraft delivery uses one protected
  Worker-to-relay bearer secret and one fixed VPC Service binding. Orbital
  activation adds one dedicated bounded KV namespace, one SQLite-backed
  Durable Object coordinator, and one existing Cron. Native mode checks
  eligibility at minutes 17/47 while preserving two-hour parent admission.
- marine supplementation adds one demand-driven SQLite Durable Object with
  one private AISStream connection and one Open Waters connection. Only
  operational quota/retry state is persisted; live vessel records remain
  bounded in memory. It does not use the OCI aircraft host.
- airport boards add one independent, demand-driven SQLite coordinator for
  fixed AeroDataBox requests. Only quota/reset/retry reservations persist;
  short-lived complete boards remain in memory, with no Cron or flight archive.
- explicit object sharing adds one bounded D1 database for 24-hour minimal
  public identity snapshots and 30-day aggregate counters, not user accounts,
  private history or a provider-payload archive.

The accepted recovery design keeps that public Cloudflare boundary and routes
only aircraft through a private Workers VPC Service and Tunnel to an isolated
OCI E2 Micro relay. The relay is running and provider/cadence behavior is
proven. The Tunnel, VPC Service, and QUIC connector are active; the checked
Worker binding is used only by a protected `oci-private-relay` deployment.
See [OCI Aircraft Relay](oci-aircraft-relay.md).

`wrangler.jsonc` temporarily retains a declarative deleted-state tombstone for
the former `FlightRouteQuota` class so Cloudflare can retire the already
provisioned namespace and its obsolete attempt-counter data. It is not a
runtime export or binding and can be removed only after Cloudflare reports the
tombstone as stale.

Public production is live at <https://trackstan.xyz>, with
<https://livetrafficstan.syntal.workers.dev> retained, on Cloudflare Workers
Free with Static Assets. The protected `production` environment contains the deployment
credentials and the private-relay secret. Observability remains disabled and
no paid fallback is enabled. Orbital activation uses the included free KV and
SQLite Durable Object allocations; R2 is not used.

### Necessary menu copy (#594)

The menu-only correction preserves the enabled production inputs, sharing/D1
identity, exact-main checks, atomic protected secrets and serialized workflow.
It adds no service, provider, dependency or saved-data migration. Its
[#594 delivery record](https://github.com/vasilyevstan/LiveTrafficStan/issues/594)
tracks the exact source, running application/Worker, actual public acceptance
and corresponding Wiki publication. The #585/#587 receipt below remains
historical/rollback evidence, not proof that unnecessary copy was removed.

### Default Relief and direct satellite-view links

The combined #585/#587 release published application
**`05599569de5280082798835370fa66fe5489fc05`**, Worker
**`67209a87-2271-49e1-a444-d8b05fe76fa9`**, published on **2026-10-25 at
21:29:55 UTC** by successful serialized
[deployment 40235668700](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/40235668700).
Checked #586/#588, the sole necessary zero-tree ancestry #590 and promotion
#589 preserve complete accepted tree
`b7163b015d865c8a254848a01229b879ff926bd1`. Exact-main
[Validation 40235575056](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/40235575056)
and the unchanged strict backup-origin smoke pass. The actual promotion
gate was BEHIND, not a content conflict; the guarded ancestry merge immediately
restored and deep-verified complete original dev/main rules and repository
settings. Persistent dev and disabled automatic branch deletion remain.

Relief starts on, including reload/Reset, without a saved field or geometric
terrain. Menus remove redundant prose while retaining short instructions,
errors, actual object facts and required source/privacy credits. Captured
Share reuses version-1 storage with an optional orbital-only `from-here`
intent. It adds no endpoint, D1 migration, TTL/cap/statistics dimension,
deployment flag, provider, scheduler, dependency or saved camera. All current
production inputs, enabled sharing/D1 identity, native Space-Track,
main-only atomic secrets, serialization and operational/source/physical/retry
fences remain. No OCI operation, forced GP acquisition or airport-board Load
is performed for this release.

Actual unmocked public Chrome 156 acceptance completes at **21:30:55 UTC**.
**STARLINK-1500 /45744** creates one native POST **201** in **265.2ms**;
cached Copy creates no second link. Actual short-root GET **302** and one
native resolve POST **200** in **179.7ms** automatically enter the exact
current Starlink-owned view. The recipient's pre-Pause modeled time is
3.644 seconds newer than the sender's pre-Pause sample. Saved ORBITS-off
preferences stay byte-equal; incoming activation is session-only. Native
Return retains the exact satellite, and the sender restores its prior camera.
Light 1280x900 and Dark 315x517 retain one map/canvas/scroller; captured phone
actions are nonoverlapping/hit-tested 44px, with **59.35%** combined overlays,
**160px** useful body and a hit-tested **120x120px** map region.

Native vector/DEM rendering confirms released default Relief and concise
Layers. Four ordinary cache-only catalog GETs serve sender/recipient; these
are not GP acquisition. There are zero observed runtime exceptions.
Initial selection/camera are App-callback staged; subsequent controls,
transport, clocks and worker are native. Desktop/emulated touch/focus is not
physical-device/GPU, OS clipboard or native-hidden proof. The ordinary
wide-view **selected satellite plus Layers** observation is **69.75%** and
does not retain a 120x120 region; it does not qualify the separate #540/#554
wide-notice/workspace composition. Reuse accepted curated, complete-menu,
provider, camera and PWA evidence rather than claim another whole-app matrix.
[Detailed acceptance](development-and-testing.md#direct-view-from-here-links-587)
keeps local fixtures and public D1 transport distinct.

The compatible prior application is
`cc3a4380c7f90ca8de4891bc4bd26e3674affcd1`, Worker
`8f35ac8c-4430-45da-862c-7692c68d3645`; its receipts below remain historical
and rollback evidence. Use the existing checked revert/rollback path, retaining
the D1 identity and all production inputs. Older strict clients may reject a
marked view link; ordinary REFRESH APP is sufficient without clearing data.
Later receipt-only commits and Wiki publication do not redeploy or replace
the running application identified above.

### Explicit outside-view ship Locate (#574)

Locate extends the existing fixed browser POST `/api/find/ships`; the Worker
alone calls the fixed anonymous exact-MMSI newest-point track route.
It adds no endpoint override, account, dependency, binding, secret,
production flag, backend cache, migration or polling scheduler. Browser
query/identity remains in the bounded POST body, not resource URLs or
application logs. Original position/retrieval clocks and complete credits
remain separate from ordinary live traffic and provider health.

Use the existing checked dev-to-main path and serialized exact-current-main
application deployment. Preserve `oci-private-relay`, aircraft photos,
routes, native Space-Track, curated/Starlink, marine supplement, airport
boards and the enabled sharing/D1 variables. Atomic protected secrets,
all operational/physical/source/retry fences, exact-SHA CI and persistent
dev remain unchanged. The all-feature dry run is configuration/bundle
evidence, not a production deployment or provider qualification.

Existing tabs use ordinary Settings / REFRESH APP or a normal reload;
never clear preferences/private history to obtain the feature. Reuse
unchanged accepted installed-update evidence because no PWA/state contract
changes. The compatible predecessor is application
`c5bfdac6098e15161e5e2b71eb06ef9c30b269e2`, Worker
`3141d3b2-a150-4984-bd58-734c30533097`. A checked small-slice revert or
existing previous-version rollback removes Locate without a data migration,
new rollback drill, D1 cleanup or source-state reset.

The [#574 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/574)
records resulting exact source/Worker identities, bounded actual public
acceptance and canonical/Wiki publication separately from local fixtures
and later documentation-only commits. Preserve earlier receipts below as
historical qualification and rollback evidence.

### Orbital framing and previous-area release boundary (#529)

This extends the existing moving viewer with aspect-aware high-Earth framing,
mouse-only inverted look through nadir, native-limit Pause and exact FOV/sky
restoration. Low views can reuse bounded read-only ground reports for the
exact eligible area active before entry. Existing aircraft cadence and marine
connections continue only for that area; no new/global query or provider path
is added. Elevated peers failed the lightweight proof and are omitted, and
building heights are not exaggerated.

There is no dependency, renderer, worker, endpoint, binding, secret, production
flag or saved-data migration. Preserve the existing serialized exact-current
`main` workflow, `application`, `oci-private-relay`, photos, routes, both orbital
catalogs, `orbital_source=space-track`, marine supplement and airport boards,
with exact-SHA CI, atomic secrets and every source/physical/retry fence.
Existing tabs use ordinary Settings / REFRESH APP without clearing preferences
or private history.

The compatible predecessor is application
`849a10b43286b581c70108fb3471d3679795e36f`, Worker
`f99e96e6-7e07-4908-943a-25f914444cd2`. A checked revert or the existing
previous-version rollback removes this optional refinement; no migration or
new rollback drill is needed. The [#529 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/529)
records actual application/Worker identities, public native acceptance and
Wiki publication separately from local fixtures and later docs-only commits.

That orbital refinement deployed application
**`18c76cf8cb0889e78c5a6352a935c4ad4c7cd5f6`**,
Worker **`5e417c69-a8cb-43e4-be9f-594b6b9e8254`**, published on
**2026-10-21 at 03:25:34 UTC** by successful deployment
[39538387248](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/39538387248).
Checked #530, necessary tree-neutral #531 and promotion #532 retain accepted
application tree `f7f12bba19f4562a68ddf293719eb9fd9f49dad3`; exact-main
Validation39538234869 and unchanged strict smokes on both origins pass.
The sole real ancestry conflict preserved accepted bytes, with complete
original rules/settings immediately restored and deep-verified.

Actual public Chrome 156 acceptance at03:26:44-03:32:03 UTC performs ordinary
REFRESH APP from `index-Bfz6FefH.js` to `index-TlqYvlfC.js`, changing document
time origin while retaining byte-equal preferences, root SW scope and history
database identity. BEIDOU 5 /36828 and STARLINK-34695 /64916 pass native
mouse/touch/arrows, aspect/theme, modeled Pause/Play and zero-error raw Return
with original FOV/limits/handlers. Eye error stays below0.081m horizontally
and1m vertically. One canvas and the two observed traffic-controller identities
remain; unchanged four-controller/local lifecycle evidence is reused.
The immediate after-Pause observer failure remains archived; the same held
pose is confirmed after native readiness/two frames, without a product change
or repeated normal update. These are public native-source/emulated-phone
receipts, not physical-device/GPU, optical or historical-row-content proof.
Later receipt-only documentation and Wiki commits do not redeploy this runtime.
Earlier receipts remain historical and rollback evidence.

The [#549 travel-aligned orbital-view receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/549)
records the focused forward-reference correction: Earth-facing framing now
uses Earth-relative modeled travel, retaining manual look offsets. It reuses
the existing SGP4 velocity without an extra propagation or acquisition.
There is no dependency, renderer, provider, endpoint, binding, credential,
production-input or saved-data change. Preserve every input and safeguard
listed above, including `orbital_source=space-track`. The compatible
predecessor is application `4c470cf717fa4c838071e9b823bb742297aa52f2`,
Worker `1516e9d6-90f3-4df6-9377-f1a8fe4199ac`; a checked small-slice revert
or existing previous-version rollback needs no migration. The Issue receipt
distinguishes actual deployment/public acceptance from local fixtures and
later documentation/Wiki commits.

The subsequent browser-only loaded-board search release is recorded in the
[#535 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/535),
including its actual application/Worker, normal update and public acceptance.
It preserves all production inputs and the existing board protocol, quota,
credentials and coordinator; rollback requires no saved-data migration.

The [#539 satellite-search access receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/539)
records the later presentation-only correction: the existing desktop catalog
entry is promoted/named explicitly, and a local catalog query can be entered
before explicit Load/Enable. It adds no acquisition path, source, provider
probe, secret, binding, timing or persistence change. The compatible predecessor
is application `85f1966cfd01a8fca84d6b6e4c8018fab6d98bc8`, Worker
`e43955f2-54cd-4332-817e-12dd59f16ed8`. Reuse the same checked release and
existing rollback/update paths; actual runtime and publication evidence remain
distinct from documentation commits.

The [#544 focused-Find receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/544)
records the subsequent class/scope cleanup and exact-owner satellite
navigate-and-details action. It preserves existing sources, controllers,
clocks, deadlines, inputs and serialized delivery. Missing fresh COSMOS2619
elements remain the independent [#545 source dependency](https://github.com/vasilyevstan/LiveTrafficStan/issues/545),
not a release permission gate or a reason to weaken modeling. Revert only this
small UI/navigation slice for rollback; no saved-data migration is required.

### Ordinary top-down detail release boundary (#522)

This focused refinement makes existing vector city detail visible without
RELIEF or a tilted camera: land use, rail corridors, earlier Light street
names, retained urban shading and ranked named station/ferry/civic context.
It keeps the same source/renderer, native label collisions, controls and
attribution. Additional existing-font glyph ranges are possible; it is not
a zero-network claim. No new provider, endpoint, dependency, binding, flag,
credential, producer, persistence or camera mechanism is added.

Use the serialized exact-current-main workflow with `application`,
`oci-private-relay`, aircraft photos, routes, both orbital catalogs,
`orbital_source=space-track`, marine supplement and airport boards preserved.
Exact-SHA checks, atomic secrets, physical/source/retry fences and current
provider deadlines remain authoritative. Existing tabs use ordinary
Settings / REFRESH APP; no reset or migration is needed.

The compatible predecessor is application
`f1a8722547a95bcb3423519a357cd8209ec7140e`, Worker
`8ae97c38-905a-4d0f-a711-ca7ee17ac954`. Revert the refinement or use the
existing previous-version rollback without deleting preferences/history.
The [#522 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/522)
records actual resulting application/Worker identities and public acceptance;
later documentation/Wiki commits do not replace the running application.
The #518 receipt below remains historical evidence, not normal-view proof.

### Lightweight map-detail release boundary (#518)

The automatic land-cover fills and close-zoom building extrusions reuse
OpenFreeMap's existing vectors. At the initial #518 release, the only added
external contact was the explicit, off-on-reload RELIEF layer. #585 changes
that session default to on, including reload/Reset preferences; supported
views may now contact the same source at startup. It uses a fixed public Mapzen/AWS Terrarium path
already allowed narrowly by the browser CSP. No account, paid tier, new
dependency, renderer, backend endpoint, binding, secret or producer is added.
Source errors stay local to relief; aircraft, marine and orbital admission,
source/retry fences, catalogs, cadence and captured Return remain unchanged.

Deploy with the existing serialized exact-current-main application workflow.
Preserve `oci-private-relay`, aircraft photos, flight routes, both orbital
catalogs, `orbital_source=space-track`, marine supplement and airport boards,
with atomic protected secrets. No new production flag or saved-data migration
is required. Existing tabs use ordinary Settings / REFRESH APP.

The compatible predecessor is application
`d5d38b3a4a696f87cc2ef5c4c1c1a1f56d8d8325`, Worker
`9808dd9b-4d78-4a72-aa60-c34ff757f059`. The existing previous-version rollback
removes the additional source/layers/control without changing saved preferences
or private history. No new rollback exercise is necessary for these display
changes. The [#518 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/518)
records the actual resulting source, Worker, required gates and public
acceptance; this boundary does not invent an unobserved deployment identity.
The preceding release receipts below remain historical evidence.

### Moving 3D orbital release boundary (#514)

The moving refinement upgrades the existing View from here action with
normal-speed selected-only modeling, a curved-horizon view and compact
Pause/Play. Use **ORBITS -> select a modeled object -> Details -> View from
here** in Auto. Existing tabs can use Settings / **REFRESH APP** without
clearing preferences or private history. Reduced motion starts paused.

There is no provider, endpoint, production flag, binding, credential, dataset
or storage migration. Preserve `application`, `oci-private-relay`, photos,
routes, both orbital catalogs, `orbital_source=space-track`, marine supplement
and airport boards, exact-current-main CI, serialization and atomic secrets.
Keep coordinator identities, physical/source/retry fences and producer floors.
The compatible predecessor is the captured-only application/Worker below;
use the existing previous-version rollback, without a new rollback drill.

The [#514 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/514)
records exact checked source/application/Worker identities, actual deployment,
public native motion/Return and ordinary installed-update acceptance, plus
canonical/Wiki publication. A development merge or local fixture is not that
public outcome. Runtime identity is distinct from documentation-only commits;
the dated captured-only receipt below remains historical/rollback evidence.

### Captured orbital view production receipt (2026-10-19)

The captured-only application **`c4fb12b84cdc63091343ff936aaf5262ece8fc8c`**, Worker
**`103ccb4a-2354-4c8c-8b03-9536c2db9fca`**, was published at
**16:44:47 UTC** by
[deployment 39287736584](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/39287736584).
Checked #509, required zero-tree ancestry #511 and promotion #510 deliver
the accepted captured orbital view. Exact feature/dev Validation
39180602115 /39180770637, ancestry 39281034476, new-dev/promotion
39284375400 /39284383432 and main **39286722145** pass.
GitHub's published Actions incident delayed runner/check availability; it
was not a personal-approval gate. The sole temporary dev merge-method
addition was immediately restored/deep-verified. Main protections, repository
settings and persistent dev were preserved.

The deployment keeps `application`, `oci-private-relay`, photos, routes,
both orbital catalogs, `orbital_source=space-track`, marine supplementation
and airport boards enabled. It preserves atomic protected secrets,
coordinator/KV identities, source locks, physical/retry fences and acquisition
floors. Temporary secrets cleanup and the unchanged strict backup-origin
smoke pass; the same strict primary-origin smoke also passes. These are
bounded release observations, not an uptime guarantee or diagnosis of the
historical independent aircraft failures in #500.

Real production Chrome 155 selected ATLAS CENTAUR 2 R/B /694 on Light
1280x900 and STARLINK-1274 /45387 on Dark 315x517. Both native owners show
**View from here**, accept mouse/touch/arrow look input at a fixed captured
eye, retain one canvas and a 120x120 hit-tested map region, and restore the
raw camera/eight prior handler states through a reachable 44px Return.
No fixture transport, fabricated model time or forced GP acquisition was used.
The same original profile retained raw saved preferences, history database
identity and root SW scope; trusted REFRESH APP activated its waiting shell
and genuinely reloaded. Its original tab had disappeared during the platform
wait, so uninterrupted-original-tab and historical-content proof are not
claimed. Physical-device/OS-keyboard and SGP4/optical accuracy remain outside
this evidence. [Local proof and observer limits](development-and-testing.md#captured-orbital-view-508-development-acceptance)
remain separate.

Assets are `index-CoXsQ8Mp.js` / `index-EDYXpE4j.css`, shell
`66cd2391583bbffad6b3`, matching the accepted production-input build.
Use **ORBITS -> select a modeled object -> Details -> View from here** in
Auto; old tabs can use Settings / REFRESH APP without deleting site data.
Looking is a captured approximate Earth-facing map, not live follow or
spacecraft imagery. The previous accepted #507 application is
`e61968999d8021ee1790700d32f68bcda17e12b9`, Worker
`5bfa1ae5-6e09-4272-8ac1-3025e924a0df`; use the existing protected
previous-version rollback if a regression requires it. No new rollback drill,
data migration, provider reset or relay change occurred.
Later documentation-only commits do not replace the running application SHA;
earlier dated receipts below remain historical/rollback evidence.

### TrackStan public identity (#354)

TrackStan is the user-facing application name, including the compact
desktop/mobile wordmark, browser/page metadata and manifest name/short name.
The existing radar artwork, immutable `/icons/livetrafficstan-*-v1.png`
assets, manifest `id`, `start_url` and `scope` (`/`) are unchanged.
The repository/Worker names, `X-LiveTrafficStan-*` response headers, upstream
provider identification, localStorage/IndexedDB and shell-cache namespaces
remain compatibility identifiers. A global text replacement would be a
breaking migration, not part of this rename.

Normal shell versioning detects the changed entry points and offers
**Refresh app** to existing tabs. It does not clear preferences or private
history, force a redirect, change the origin or create a new installed-app
identity. Launcher labels on an already installed application depend on the
browser/operating-system update schedule; the page and new install metadata
use TrackStan immediately after the normal application update.

Companion #355 exposes the existing Center callback in the primary dock,
with no new mobile toolbar height. Browser location permission, one-shot
rounding, session Home, explicit retry and navigation-intent fencing remain
the existing mechanisms; no new provider/camera scheduler or tracking loop
is introduced.

The [#354 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/354)
records the exact deployed source/Worker, desktop/narrow Light/Dark browser
evidence, existing-shell update and preserved-state result. This change needs
no new provider, credential, DNS record, binding or data migration. Its
compatible application fallback is the accepted domain activation below,
`2fffb5a1556f883a014ce88ec8f721e76424671e` /
`d4800a30-8303-4180-b591-c744aef9668b`, retaining the Custom Domain and all
enabled inputs. Historical receipts below are not relabeled as current
application deployments.

### TrackStan domain activation (#334)

The domain-activation application source was
`2fffb5a1556f883a014ce88ec8f721e76424671e`, promoted through #348.
Exact-main Validation `37392198111` passed. Protected deployment
[37417266192](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37417266192)
installed Worker `d4800a30-8303-4180-b591-c744aef9668b` and published the
apex Custom Domain at `2026-10-06T05:11:53Z`. Its workers.dev smoke passed
at `05:11:57.988Z`; the separate complete smoke against `https://trackstan.xyz`
passed at `05:12Z`. Later documentation-only commits are not another
application deployment.

The owner removed both imported parking A records. At `05:10:08Z`, both
`ben.ns.cloudflare.com` and `nora.ns.cloudflare.com` returned authoritative
NOERROR with no apex A/AAAA/CNAME. After deployment, both authoritative
servers, Cloudflare DNS and Google DNS resolved the managed apex. HTTPS
returned `200` with successful certificate verification. Normal Chrome
154.0.8037.98 independently accepted the `trackstan.xyz` certificate
(issuer WE1) and negotiated QUIC.

New-origin browser acceptance at `05:12:51Z-05:14:45Z` used native fetch,
WebSocket and clock, without response fixtures or security/header overrides:

- one MapLibre canvas with real vector tiles; 30 initial Tallinn vessels,
  then 56 vessels and three aircraft in the photo view;
- native `/api/marine/stream` and Digitraffic `/mqtt` upgrades returned `101`,
  both with `Origin: https://trackstan.xyz`;
- current BALTIC WHALE / reported IMO `9354454` fetched same-origin photo
  metadata with `200` and decoded its attributed 960x640 Commons photograph;
- current PH-BHH / ICAO24 `485342` / KLM192 loaded its actual 200x133
  Planespotters image; selected details retained Netherlands country context,
  exact-identity aircraft metadata and plausible route context;
- curated and Starlink catalog routes both returned `200` with the exact
  application release header. Terra purpose/no-image, Hubble purpose/image,
  the unreviewed-object fallback and separate Starlink service context rendered;
- one canvas remained and no runtime exception was observed. The initial
  aircraft `503` recovered through the unchanged lifecycle; later aircraft
  `200` and real aircraft were observed. This is not an uninterrupted
  provider-availability or complete-coverage claim.

No aircraft photo binary or selected-aircraft photo screenshot was saved.
Application assets, providers, history schema, KV, Cron, Durable Object
identities, VPC binding and atomic secrets-file delivery are unchanged.
Private aircraft, photos, routes, curated orbital, Starlink and marine
supplementation remain enabled.

The earlier `37390093186` deployment really updated workers.dev/Cron to
`9de023048387c411ae9dc54f4ba9b4f8d2bc9066`, then failed binding with 100117;
its separate existing-origin smoke passed, but its Worker UUID was not
printed. Protected cleanup `37392303605` then failed DNS GET 403 before any
DELETE. The successful manual removal resolved #350; it did not repair the
token's DNS permissions, and that denied cleanup was not rerun.

The accepted history-compatible fallback remains flag source
`99baed2dece100f9066f31fecb215df26e781911` /
`aa62b10d-03d6-40d4-bdd2-2cdd2dacaeff`. No duplicate application rollback
drill was needed for this origin-only activation. A Worker version rollback
does not remove the Custom Domain; preserve it and all enabled inputs.
Registration stays at GoDaddy, workers.dev stays usable, and origin-local
preferences, permissions, installed apps and private history do not migrate.
No `www`, forced redirect, paid product, new Worker or visible branding change
was included in that domain activation. The separate TrackStan public-name
change is recorded under #354 above.

### Aircraft registration-country flags predecessor (#341/#342)

The accepted aircraft-flag application source was
`99baed2dece100f9066f31fecb215df26e781911`. Implementation #341 and promotion
#342 passed exact-source checks; exact-main Validation `37385967766` passed.
Protected deployment `37386217568` installed Worker
`aa62b10d-03d6-40d4-bdd2-2cdd2dacaeff` and passed full exact-release smoke at
`2026-10-05T23:03:57.186Z`.

This render-only change reuses the existing ICAO24 country lookup and 226
reviewed flag rasters. It adds no image asset, provider request, dependency,
credential, binding, scheduler or history/schema change. Private aircraft
delivery, aircraft photos, flight routes, curated orbital, Starlink and marine
supplementation all remain enabled, with the same KV namespace, coordinator
identities, `17 */2 * * *` Cron, VPC binding and atomic secrets-file delivery.

Normal Chrome production acceptance at `23:05:21Z-23:06:05Z` used native
fetch, WebSocket and clock in a fresh context: 11 visible aircraft and 11
matching Netherlands/UK badges around Amsterdam. Native selection of
G-JZBE / ICAO24 `407181` / EXS75NE showed United Kingdom (GB) with a live
position age of 1.806 seconds. One canvas and 226 shared images remained,
without extra flag requests, runtime exceptions or console errors. An
intermediate aircraft `503` was followed by `200` through the unchanged
lifecycle; uninterrupted provider availability is not claimed. No aircraft
photo binary or selected-aircraft photo screenshot was saved.

[Actual production receipt and screenshot](https://github.com/vasilyevstan/LiveTrafficStan/pull/342#issuecomment-6005079795)
are distinct from the [local native-scale fixtures](https://github.com/vasilyevstan/LiveTrafficStan/pull/341#issuecomment-6004900618).
Compatible rollback is the previously verified imagery source
`de9d8603bebe1797a1b57cd0b9f99fe343858f8b` /
`90338910-c837-46a5-9f55-c4eb513dd885`. No optional duplicate rollback drill
was added for unchanged provider/state contracts. Earlier rollback outcomes
remain historical below. Wiki `784938953937982381a4f39b5310f372927a8b1d`
publishes that release's receipt; later docs-only commits did not redeploy it.
The subsequent domain activation and public-name change are recorded above.

### Identity photos and orbital context (#332/#333)

The preceding application source was
`de9d8603bebe1797a1b57cd0b9f99fe343858f8b`, from checked implementation
#332 and promotion #333. Exact-main Validation `37351007615` passed.

| Stage | Application source | Cloudflare version | Workflow |
| --- | --- | --- | --- |
| Initial deployment | `de9d8603...` | `86ac6bf7-fabc-45dd-98fb-7799454563c3` | [37351156520](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37351156520) |
| Compatible rollback and verification | `65eb71ba...` | `5c6538ce-7fde-44ac-b288-e005f8d3d67b` | [37354059156](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37354059156), attempt 2 |
| Final restoration | `de9d8603...` | `90338910-c837-46a5-9f55-c4eb513dd885` | [37355581014](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37355581014) |

Final smoke passed at `2026-10-05T18:24:26.553Z`. Every stage preserved
`oci-private-relay`, aircraft photos, flight routes, curated orbital,
Starlink and marine supplementation enabled. KV, Cron, secrets, history schema
and provider protocols are unchanged. The photo route adds no credential,
binding, database or paid service.

Rollback attempt 1 really switched 100% of traffic from `86ac6bf7...` to
`5c6538ce...` at `18:11:55.872Z`, but its immediate Starlink smoke reported a
release-SHA mismatch. That failure is not relabeled. Later read-only responses
from curated and both Starlink representations returned the target SHA;
unchanged attempt 2 passed the complete smoke, reselecting the already-active
target. No exact-SHA assertion, protection or source contract was weakened.
The original mismatching response's precise cause was not established.

Native production acceptance used actual BALTIC WHALE / reported IMO
`9354454` and its 960x640 Commons image, plus normal Chrome's real 200x134
Planespotters image for CS-TJN / ICAO24 `49514E`. A preceding automated
browser CORS failure remains recorded, not proof of a provider-wide outage.
The final restored application also rendered Terra purpose, the verified
Hubble image, truthful unreviewed ATLAS CENTAUR 2 and separate Starlink context.
390x844/568 touch checks exposed the complete vessel image and source/license,
retained one canvas, and kept one marine socket plus one Digitraffic connection
through those map/context interactions. Full-source credits remain reachable;
both orbital channels share one corner credit. See the
[browser receipt](development-and-testing.md#identity-photos-recognizable-ships-and-orbital-context-331-193).

That release's compatible rollback target was the enabled-marine `65eb71ba...`
version above. The earlier same-source disabled marine baseline remains
historical recovery evidence, not a pre-marine binary to substitute or a
reason to delete history. Subsequent documentation-only main commits are
separate from that deployed application SHA.

Wiki revision `a903ef941bbd43492d682b5a49e6766b51be3980` published fifteen
curated pages covering the actual photo contracts, nine-purpose manifest,
ship artwork, complete source credits, production/rollback evidence and
troubleshooting. At that publication, `trackstan.xyz` setup and the separate
TrackStan branding plan (#334/#335) were pending, not deployed; the later
domain activation above supersedes only that setup status.
[Production screenshots and complete receipt](https://github.com/vasilyevstan/LiveTrafficStan/pull/333#issuecomment-6001037124)
remain attached to the owning release.

### Complementary marine predecessor (#325/#326)

The preceding accepted application source was
`65eb71bad7b873c7980096f6e92a477e76fd6102`, promoted by #326 from the
accepted #325 implementation. Exact-main Validation `37247107520` passed.
The final enabled deployment `37247800498` installed
`5c6538ce-7fde-44ac-b288-e005f8d3d67b` and passed full production smoke at
`2026-10-05T00:31:43.586Z`.

All four stages used that same checked source and preserved `application`,
`oci-private-relay`, aircraft photos, plausible routes, curated orbital and
Starlink flags, KV namespace `59178d55418247c4bab473b52a5dc07d` and Cron
`17 */2 * * *`:

| Stage | Marine supplement | Cloudflare version | Successful workflow |
| --- | --- | --- | --- |
| Compatible baseline | Disabled | `9091ba27-073f-4bb5-acbb-f2ebe395525d` | [37247238771](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37247238771) |
| Initial activation | Enabled | `c50727bb-a105-400e-8a79-9904f5a311fc` | [37247433054](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37247433054) |
| Actual prior-version rollback | Disabled | `9091ba27-073f-4bb5-acbb-f2ebe395525d` | [37247681663](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37247681663) |
| Final restoration | Enabled | `5c6538ce-7fde-44ac-b288-e005f8d3d67b` | [37247800498](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37247800498) |

The rollback deployed the recorded version to 100% of traffic, preserved
target orbital/Cron state and passed exact-build smoke at `00:29:31.645Z`.
The disabled marine route was independently confirmed as `404`, `no-store`
and the exact release SHA both before activation and after rollback. Its
updated history reader remains compatible with database version 2.

At `00:27:34.685Z-00:28:19.696Z`, the actual Cloudflare WebSocket returned
`101` with the exact release header and 45 acknowledged normalized snapshots,
1,989,085 decoded bytes. Both protected upstream sources were live with
observed data and no source error. The first useful result arrived in
1.504 seconds; the last snapshot contained 63 distinct vessels, seven
AISStream and 56 Open Waters position owners, including one reported yacht at
least 8 m. The oldest retained position was 594.695 seconds. Only aggregate
receipts were retained; the client disconnected after the bounded check.

[Final actual production-browser acceptance](https://github.com/vasilyevstan/LiveTrafficStan/pull/326#issuecomment-5986155527)
ran at `00:33:02.003Z-00:35:12.028Z` with enabled asset
`index-BzgPcwIW.js`. It rendered 30 Tallinn, 13 southern-Baltic and 792
Rotterdam vessels, with both supplemental sources live in every regional
snapshot. It preserved one map, exact-MMSI deduplication, original-source
attribution, selection through both themes and cold reconnect, search/Clear,
and native touch at narrow Chrome-emulated sizes. The
[testing record](development-and-testing.md#multi-source-marine-acceptance)
separates the observed counts, missing metadata and platform limits.

That release's primary rollback target was the **same-source, marine-disabled**
version above, not an older database-version-1 application. Provider keys are
installed atomically with the Worker; the Open Waters identity private key is
not deployed. No paid capacity, extra aircraft host, new provider approval
gate or weakened CI/smoke safeguard was introduced. The finite free budget
remains an admission bound, not a promise of unlimited account headroom.
Later documentation-only main commits do not deploy another application.

Wiki revision `52b9b5b83fe5665514e521400350f8ad1014a68a` published the
fourteen-page curated marine, source/licensing, history, configuration,
acceptance, troubleshooting and release update. It records this running
application and the historical predecessors separately; see
[Release Operations](https://github.com/vasilyevstan/LiveTrafficStan/wiki/Release-Operations).

### Yacht/flags and aircraft-recovery predecessor (#316/#319)

The preceding accepted application source was
`1afa175d8bb6b3f0636c2a02576cc82a35ced373`, the checked #319 main with
content tree `4672081adaf8a6307ad196aa09c5ccc9db6a3699` and accepted exact-SHA
Validation `37204522573`. Application, Worker, relay, asset, dependency and
workflow code are unchanged from #316 source `e2b2afaa...`. Canonical deployment
`37214110439` installed Cloudflare version
`cb5b199b-5fc9-46f4-b7d8-f816928eae5f` and passed full smoke at
`2026-10-04T15:45:14.901Z`.

The original ship deployment `37203064394` installed
`816506f7-2cb1-4e6c-8626-ae990eb62b8a`, then failed aircraft smoke at
`12:44:18Z`. That workflow remains failed. The later checked-current-main
activation is a separate run, not an obsolete-SHA rerun or a weakened gate.

[Real production ship acceptance](https://github.com/vasilyevstan/LiveTrafficStan/pull/316#issuecomment-5980143455)
at `12:51:36.993Z-12:51:41.713Z` observed 35 supplied vessels and 33 actual
MMSI-country flags, then natively selected stopped 16 m pleasure craft SINILIND
(`276014100`) with its Estonian flag and matching country text. It retained
one canvas and 226 bundled flag images with no flag request, runtime exception
or console error. This fresh-context check used native networking and clock;
the separate local fixtures cover lifecycle, exclusions and narrow layouts.

[#174 records the diagnosis and recovery](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5980728396).
Automatic `dnf makecache --timer` started at 09:40, immediately before the
guest-telemetry gap and CPU plateau; retained logs also contain earlier DNF
OOM kills. The 1 GB shape has only 498 MiB usable guest memory after its
448 MiB crash reservation. One diagnostic SOFTRESET recovered the management
channel; eleven infrastructure inventory groups remained unchanged. The
targeted repair then disabled only the optional metadata timer at 15:32:35,
without changing security agents, kdump, swap, routes, credentials or cost.
A controlled relay-service restart at 15:40:57 retained the admission deadline
and exact relay source, before the successful canonical deployment.

That recovery's production inputs remained `application`, `oci-private-relay`,
aircraft photos,
plausible routes, orbital catalog and Starlink catalog enabled. The accepted
marine evidence is reused because those application sources are unchanged.
Final observation completed at `16:21Z`, beyond the former `16:15:33Z`
metadata-timer deadline: consecutive five-minute memory maxima ranged from
49.21% to 54.02%, without a telemetry gap. The `16:24:56Z` guest check retained
the same boot, active relay/Tunnel/kdump, disabled timer and zero OOM kills.
The post-window production request returned two aircraft and HTTP 200 in
732 ms with the exact release, no-store and no CORS allowance. This completes
the operational recovery evidence for #174 and the coordinated #311/#312
activation; publication details are retained in the issue checkpoint.
#296 remains the separate Class B/ANTARES coverage issue.

That recovery's immediately preceding installed version was #316 source
`e2b2afaa...` /
Worker `816506f7-2cb1-4e6c-8626-ae990eb62b8a`. The earlier accepted rollback
target is atlas source
`0972ba8d24ba96e18627b13b252e6ac7c5473f10` / Worker
`a22bfa09-03fa-40cd-ac76-3915e0e52eea`. No marine regression warrants rollback.
Later documentation-only commits do not deploy another Worker or replace the
running source identity.

### Atlas predecessor (#307)

The previously accepted application source was
`0972ba8d24ba96e18627b13b252e6ac7c5473f10`, deployed by protected run
`37187599808`, attempt 2, as Cloudflare version
`a22bfa09-03fa-40cd-ac76-3915e0e52eea`. Feature #305, tree-neutral ancestry
#306 and checked dev-to-main #307 preserve accepted tree
`0f21c1d35aef3bb2c35632dcc90b8c5dac2a112e`. Exact-main Validation
`37187440710` passed; final gates covered 991 tests in 130 files and complete
smoke passed at `2026-10-04T08:43:41.594Z`. Existing private-relay, photo,
route, orbital/Starlink, KV, coordinator, Cron and secret-delivery settings
remain unchanged.

[Actual production acceptance](https://github.com/vasilyevstan/LiveTrafficStan/pull/307#issuecomment-5978336335)
ran at `08:49:10.049Z-08:49:48.904Z`, without response fixtures. Both atlas
palettes, eight layouts, one canvas, 87 initial rendered vector-source
features, real traffic, selection, focus/touch, orbital discovery and HISTORY
passed. The 280x88 floating card, right rail/mobile dock and one Settings
input remain. Ordinary retained-cache navigation upgraded
`index-KqCAW4Ds.js` to `index-BRvLbc4q.js`, intentionally keeping
`index-B5IN6iN9.css`. Shell `068c4381a2493276f835` was added beside
`84e5a30fc6fce373d145` without clearing storage or disabling cache.
The normal app-update notice remained. Physical Safari/iOS/Android and
uninterrupted provider availability are not claimed.

Attempt 1 deployed Worker `55c50d94-364f-45a6-bfcc-5c05d7d0197a`, then
private-aircraft smoke returned `502`. The earlier `07:04Z` predecessor
baseline had been healthy. Direct ADSB.lol and the exact-release orbital route
were healthy; backend/relay/workflow configuration was unchanged. One
no-retry, fresh-ETag-fenced diagnostic reboot returned the recorded relay to
`RUNNING` at `08:35:53.431Z`; the first subsequent probe returned six
aircraft at `08:40:59.167Z`. Eleven before/after resource hashes matched.
The same failed job passed with unchanged inputs on attempt 2.
[Issue #174](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5978306226)
remained open at that point; this was recovery, not a durable diagnosis.

That release's accepted application rollback predecessor was
`8117859518155f77e9413fa0d86902a3b371da9e` /
`79f74a36-f1a6-4e1b-b41a-1314a3e92a76`, not the transient failed-attempt
Worker. Use the existing protected rollback workflow for an evidenced
regression; no new rollback drill is claimed. Later documentation-only main
commits do not redeploy or replace this running application.

### Floating-header predecessor (#300)

The previously accepted application source was
`8117859518155f77e9413fa0d86902a3b371da9e`. Protected deployment run
`37163611027`, attempt 2, passed as Cloudflare version
`79f74a36-f1a6-4e1b-b41a-1314a3e92a76` with aircraft delivery through
`oci-private-relay`, aircraft photos, plausible routes, eight exact-IMO vessel
photos, the curated orbital catalog, negotiated systematic/shell-balanced
Starlink catalogs, and exact-NORAD enrichment enabled. It preserves KV
namespace `59178d55418247c4bab473b52a5dc07d`, one SQLite coordinator, and Cron
`17 */2 * * *`. The matching relay runs
`18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8` and retains
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` as its prior release.

The floating-header release used feature #298, tree-neutral ancestry #299, and
checked dev-to-main #300. Exact-main Validation `37163497963` passed; the
deployment ran 973 tests in 129 files and complete smoke passed at
`2026-10-04T00:13:26.611Z`. Production Chrome accepted the 280x88 px floating
card, right desktop rail, inward panels, Settings navigation and unchanged
mobile dock through ordinary retained-cache navigation. Both themes, eight
layouts, 49 rendered vector-source features, selected final orbital rows,
keyboard/touch and playback were recorded from `00:15:09.566Z` to
`00:15:49.187Z`.
[Release evidence and screenshots](https://github.com/vasilyevstan/LiveTrafficStan/pull/300#issuecomment-5974937301)
separate local fixtures, actual production and browser emulation. The new
assets are `index-KqCAW4Ds.js` and `index-B5IN6iN9.css`; shell cache
`84e5a30fc6fce373d145` was installed without clearing the predecessor cache.

The actual `cd05a38f...` baseline already returned private-aircraft `502`
before deployment. Attempt 1 deployed version
`0213fe56-7f9d-42bf-ad09-bffb0d3a9514`, then encountered the same aircraft-only
failure while static/orbital and direct ADSB.lol remained healthy. One
fresh-ETag-fenced exact-instance diagnostic reboot reached `RUNNING` at
`00:11:22.149Z`; valid exact-release aircraft JSON returned at
`00:12:34.414Z`. All eleven before/after resource hashes and cost configuration
matched. The same deployment job passed with unchanged source and inputs.
[Issue #174](https://github.com/vasilyevstan/LiveTrafficStan/issues/174#issuecomment-5974933051)
remained open at that point; recovery alone did not establish a durable
root-cause fix.

That release's UI rollback predecessor was source
`cd05a38f7c2f130629e961cb4a56fc67d9c42a44` / Worker
`89313ed1-b31a-467d-86b5-4cf8d558af9c`. Restore it only through the existing
protected rollback workflow with the same deployment flags for an evidenced
release regression. No new rollback rehearsal was required for unchanged
backend/provider contracts; earlier drills below remain historical evidence.
Later documentation-only main commits do not replace the running application
identity.

That #291 predecessor used exact-main Validation `37152118432` and deployment
`37152238178` attempt 2, with smoke at `2026-10-03T20:55:36.196Z`. Its
56/104/120 px bar, actual browser evidence and earlier independent relay
recovery remain [historical evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/291#issuecomment-5973461428),
not the current floating layout.

The first refresh #282 remains historical application
`9f5ee37d9ad2bbeedb20a89ea08e7cd5629e36e8` / Worker
`85d1418b-3316-4299-9758-20810aa58898`, deployment `37134585858` attempt 2,
accepted at `15:59:57.387Z` after the earlier diagnostic recovery. Its modest
visual change did not satisfy the requested structural distinction.

#288 then delivered application `2d11e3e...` / Worker `ce0dffd2...`, with
an 80 px masthead, left desktop rail and mobile bottom dock. Exact-main
Validation `37144068057` and deployment `37144136921` attempt 2 passed; smoke
completed at `19:54:45.336Z`. That rerun followed reachable marked admission
backoff, without a VM reboot. Its [actual retained-cache and HISTORY evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/288#issuecomment-5973032236)
remains an older structural predecessor record. The subsequent #291 and #300
refinements follow the user's layout preferences, not another provider or
sampling release.

Historical Wiki commit `27a78348c9c79640a6f331cbd2c393fb4bdc4549` published
fourteen affected pages covering the yacht correction, country badges and
license, real production evidence, and the explicit unresolved aircraft smoke
gate as it stood then. It records application `e2b2afaa...`, not the later
recovery activation. Recovery Wiki publication is recorded in #174; later
documentation reconciliation does not trigger another application deployment.

Historical Wiki commit `5f9fbd82b77bdd6555379bef65431629f6abf80e` published the
thirteen-page atlas map, custom/shared-style, actual acceptance and release
update. It identifies that release's application `0972ba8d...`, independently of
later documentation-only main promotions.

Historical Wiki commit `3d89ccd30469960061838a6be33bc07a0aef2ae3` published the
matching thirteen-page floating-card, navigation, accessibility, acceptance
and release update. It records application `81178595...`;
subsequent Markdown-only main promotions do not deploy another Worker.

Historical Wiki commit `c5206cf8cc477a1a6266f7988b11da9e050116db` published the
#291 thirteen-page design, navigation, testing, release and recovery update,
including the actual production screenshots and the Impeccable refinement.
It identifies application `cd05a38f...`, not the later docs-only main.
Historical Wiki commit `61b8be294ea39aed57f98440856c1847719cda87` records the
first-refresh #282 interface/release evidence.

The initial curated-catalog release's immediate post-deploy proof returned:

- default schema/source contract 1 from KV, retrieved
  `2026-09-30T22:17:35.578Z`, 156 records, digest
  `98ca3ae36478113d53f0ecea99d6cd4773232aec8b7eef61bef2a9828f2ccce6`;
- negotiated schema/source contract 2 from immutable bootstrap, retrieved
  `2026-09-30T18:25:59.094Z`, 462 records, digest
  `5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`;
- distinct representation ETags and matching `304`s, `Vary: Accept`,
  cross-representation `200`, and no exposed internal publication envelope.

The first ordinary admitted schema-2 KV publication was retrieved at
`2026-10-01T02:17:32.034Z`: `462` records with digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`.
The same atomic write supplied a `156`-record schema-1 visual member with
digest
`018ee9ff6c9c161485f37f5a22cfaa5a6fdd2524a4ae7fc49a12947c4478e2e5`
at the same retrieval time. A Cron event that arrives seconds
before the strict two-hour gate can truthfully return `not-due` without a
provider request; the next later event remains eligible.

The current map follow-up deployment retained and served that complete KV
bundle for both public representations; it did not reset the named coordinator
or initiate another provider refresh.

Exact-merged-main validation run `36887570850` passed 119 files / 746 tests,
lint, typecheck, static-data checks, both builds, and deployment dry-run.
Production Chrome `154.0.8037.59` then retained one MapLibre canvas while:

- all nine maritime-blue vessel classes passed eight desktop/mobile
  theme/DPR scenarios, every fixture marker remained pickable, and exact
  Light -> Dark -> Light image restoration added no provider/search/catalog
  request;
- the measured world view reported
  `ORBITS · 192 SHOWN · 0 PASSES ≤90M`, retained 454 safe current positions,
  exposed exactly reviewed `HUBBLE`/NORAD `20580` and `ISS`/NORAD `25544`
  labels, made one catalog request only after enable, and created no long task
  over 50 ms;
- initial desktop, desktop Center, and mobile Center exactly matched the 30 km
  `cameraForBounds` result; six aircraft rendered from one deterministic
  outward-rounded `34 NM` request and no second request started inside cadence.

Attribution remained visible, responsive controls stayed within the existing
58vh budget, and no runtime, browser-log, or HTTP error occurred. Physical
iOS/Android evidence was unavailable and is not claimed. The full measured
record and screenshots are attached to
[#246](https://github.com/vasilyevstan/LiveTrafficStan/pull/246#issuecomment-5935337522).

The traffic-recovery public Wiki synchronization is commit
`bac76a2994a09e85e1162c5724a6071f0fc35540`. It records that predecessor
production identity, live-traffic recovery, physical vessel sizing, eight
exact-IMO photos, bounded Starlink lifecycle and scheduled publication,
browser acceptance, independent relay recovery, rollback/restoration,
provider/privacy boundaries, troubleshooting, and physical-device
limitations.

Deployment attempt 1 published version
`45cccadf-0456-4812-aed3-54286886a3c0`, but smoke failed only because the
unchanged private aircraft relay returned `502 Aircraft upstream unavailable`.
The dynamic aircraft response carried the exact new release header; Static
Assets, orbital behavior, and every non-aircraft surface were healthy, and the
release contained no Worker, relay, workflow, or infrastructure change. The
supported diagnostic reboot moved the instance through `STOPPING` at
`2026-10-01T15:55:29Z`, `STARTING` at `15:56:34Z`, and `RUNNING` at
`15:56:55Z`. Four bounded public probes remained `502`; the fifth returned real
`200 application/json` at `15:58:24Z`. The exact same authorized workflow
inputs then passed build, deployment, smoke, and recording on attempt 2. No
application rollback, shared-egress fallback, provider substitution, relay
source change, or credential rotation was used.

The smaller-marker release merged through #251, #252, and #253. Exact-main
validation run `36908354263` passed before protected deployment run
`36908605830` published source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63`. Attempt 1 again isolated the
known unchanged private-relay guest/network `502`; the exact release,
deployment checks, and Static Assets were healthy. The supported
diagnostic reboot moved through `STOPPING` at `18:45:05Z`, `STARTING` at
`18:45:57Z`, and `RUNNING` at `18:46:20Z`; bounded probes recovered real
exact-release aircraft JSON at `18:48:20Z`. Attempt 2 passed the same source
and inputs as Cloudflare version `d83f68ae-907e-4b2d-a086-00b4fde00372`.
Fresh public Chrome acceptance proved all nine vessel classes through the real
symbol layer at 22/24/30/37 CSS px, with one map lifecycle, exact theme
restoration, complete picking/state overlays, responsive attribution, and
zero fixture-added protected requests.

The coordinated traffic-recovery release merged #262-#265 through checked
release #267 at exact main
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`. Protected release validation
run `36996187462` passed 127 test files / 950 tests plus lint, typecheck,
aircraft metadata, country allocations, vessel photos, curated/Starlink
catalogs, orbital enrichment, ports, airports, both builds, and both deployment
dry runs.

Canonical deployment had two independent transient failures before the
unchanged third attempt passed:

- run `36996396517` deployed version
  `ebee76a9-0555-406f-95ba-285e2e548612`, then aircraft smoke returned `502`
  only on the private VPC/Tunnel/relay path. One exact-instance
  `DIAGNOSTICREBOOT` was requested at `2026-10-02T10:41:00Z`; lifecycle
  reached `STOPPING` at `10:41:02Z`, `STARTING` at `10:42:10Z`, and
  `RUNNING` at `10:42:50Z`. Four bounded 20-second probes remained `502`; the
  fifth returned real aircraft JSON at `10:44:21Z`;
- run `36997137283` passed aircraft but later met one AWC METAR `504`.
  Production METAR and direct AWC both returned valid `200` immediately
  afterward, so no application rollback or provider substitution was applied;
- run `36997443034` passed the complete canonical smoke as version
  `63e5a14d-7115-44aa-9386-36b13b5ff91d`.

Exact production Chrome acceptance proved **Resume live** returned a retained
paused view to the reviewed framing and rendered live aircraft/marine data;
27 current vessel features retained monotonic 60-213 m physical-size ordering
across normalized silhouettes; all eight exact-IMO assets plus both unavailable
states passed; and STARLINK made one same-origin request, zero browser
CelesTrak requests, exposed all eight pages, retained one canvas/one active
physical orbital worker, restored theme state, and passed mobile touch without
diagnostics.

Protected rollback run `36998162009` restored predecessor source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` and version
`d83f68ae-907e-4b2d-a086-00b4fde00372`; target-aware smoke passed. Protected
restoration run `36998245095` redeployed exact current main as version
`146e74df-c960-4a41-bc0c-6d5b9fa0d660`; full smoke passed with both orbital
routes enabled and the immutable Starlink bootstrap retained. The private
relay secret was supplied atomically through Wrangler's protected
`--secrets-file`; no standalone secret mutation or manual provider refresh was
used.

The ordinary `2026-10-02T12:17Z` scheduled event preceded the fresh Starlink
row's exact `20:40:03Z` not-before boundary. The public route observation at
`12:17:59.818Z` remained the same bootstrap generation: GP retrieval
`08:40:03Z`, SATCAT/publication `08:40:05Z`, population 11,125, sample 150,
digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`,
and its matching weak ETag. No replacement snapshot was presented before the
reviewed provider boundary.

The first eligible ordinary `22:17Z` Cron completed the fixed pair and one
final KV publication without manual acquisition. The first route request
strictly after `22:18Z`, at `22:19:00.327863Z`, returned exact release
`bba0bf4f...`, `source=kv`, GP retrieval `22:18:01.730Z`, SATCAT
retrieval/publication `22:18:02.211Z`, serve time `22:19:00.626Z`,
population 11,125, sample 150, and digest/weak ETag
`3cd7476fd7d42aed1772a85d4f81c27322c73b088bf58ff217e39454f425f0d7`.
The immediately preceding read-only attempt completed after `22:18Z` but had
begun 1.331 ms before the nominal observer target and truthfully returned the
old bootstrap. This timing nuance does not change cadence safety: both route
requests were storage-only and the provider pair came from the ordinary Cron.

Cache-disabled public-origin orbital-enrichment acceptance used real current
Hubble, ISS, and NORAD `733` map features. Before selection there were zero
image requests. Each reviewed immutable path was fetched exactly once as
uncached `200 image/jpeg`, outside the Service Worker, with one-year immutable
caching and exact manifest content length. Hubble decoded at 437x640 and ISS
at 640x425. Details and the later ISS tooltip used the same validated Blob
URL; hover, theme, re-selection, and the rocket-body fallback made no image
request. A forced terminal failure did not retry. The run recorded zero NASA
requests, same-origin failures, runtime exceptions, or console errors.

Responsive selected details reached their exact scroll limit without
horizontal overflow: 303.828125 px panel / 159.984375 px image / 931 px scroll
at 390x844, and 115 px / 87.984375 px / 1,048 px at 390x568. One canvas,
source/rights text, and map attribution remained visible.

Current rendered route acceptance selected live `BTI877`, made exactly one
route request, rendered TLL to BCN, and made no second route request after an
aircraft polling refresh. Selecting live `FIN7DE` rendered HEL to TLL. The
compact caveat and ADSB.lol/VRS attributions remained visible with one
MapLibre canvas and zero horizontal overflow at desktop and 390x844.

Earlier rendered production acceptance used deterministic marine fixtures
against the real deployed application and asset bytes. All five reviewed IMO matches
loaded their correct 640-pixel images; valid-unmatched IMO `8917601` and
invalid IMO `8917602` showed no photo; A-to-B-to-A selection never paired a
title with the wrong hull; all assets returned the declared image MIME and
`public, max-age=31536000, immutable`; no Wikimedia, Wikidata, tracker, or
image-provider request occurred; one MapLibre canvas and reachable
Close/source/license/map attribution were preserved at 1280x900, 390x844, and
390x568. The subsequent stable-hover acceptance verified zero image request
before 500 ms, the exact Finlandia 640x472 JPEG and fixed rights context,
preserved keyboard focus, popup pointer/focus traversal, Escape dismissal,
stale-marker cleanup, unmatched omission, one MapLibre canvas, and no external
photo-provider request or browser diagnostic. The public Wiki was synchronized
at `dad38eed654ce6e8cdc121a92deca28547fc531a`.

Current-release aircraft acceptance observed a relay-local
`503 Retry-After: 19` followed by exact-release `200 application/json`,
rendered four real aircraft, retained one MapLibre canvas, and had no
horizontal overflow at 1280x900 or 390x844. Aircraft-photo acceptance made
zero selection and sub-dwell requests, exactly one stable-hover request, and
published the same matching image/source into the already-open details panel
without another request. A 70-second host canary measured 0.2374% combined
relay/cloudflared CPU, approximately 65 MB combined service memory, zero
restarts, zero swap, no OOM evidence, and approximately 460 MB available
memory.

Fresh-profile orbital acceptance observed zero startup catalog requests, one
same-origin request after enable, no CelesTrak browser request, one unchanged
MapLibre canvas, exact A-to-B-to-A selection, selection-preserving theme
rehydration, 156 modeled objects at whole-world view while aircraft and ships
paused, real touch camera movement at 390x844, and no runtime exception or
main-thread task over 50 ms.

The earlier deployment attempt, run `36265893317`, uploaded Cloudflare version
`a17be7e0-9340-49eb-8689-e8db4b63565c` but its immediate smoke reached an edge
still serving the predecessor Worker release header. The expected release
header appeared shortly afterward, and the exact-source rerun
`36266052761` passed without changing application bytes. Current source
`18082a1e...` delivers the bounded Worker-header propagation retry and keeps
malformed or contradictory policy fail-closed.

Protected rollback run `36188474191` restored accepted V1.5.3 source
`6d132907525f4f1479ae2b4f94485d76c151b86a` and Cloudflare version
`5b17eeb9-e6ad-4720-8a8e-c52725b18aba` with matching exact-byte smoke.
Restoration run `36188545228` returned production to the V1.6.0 version and
again passed smoke. Those historical operations predated private-relay
activation and preserved the expected explicit ADSB.lol `429` degradation from
Cloudflare egress instead of treating unavailable aircraft data as release
success. Current private production instead requires eventual real aircraft
JSON. Repository documentation commits may advance after an application
release; the public `X-LiveTrafficStan-Release` header identifies the running
application source.

This is an engineering record, not legal advice. Provider and platform terms,
limits, and behavior can change and must be rechecked before a material
deployment or caching change.

## Evidence method

The platform comparison uses:

- **Documented** facts from official Cloudflare, Netlify, GitHub, ADSB.lol,
  Photon, and Digitraffic material;
- **Observed** bounded local or provider checks;
- **Calculated** request volume from the checked-in 20-second aircraft cadence;
- **Unknown** for future provider capacity and long-term rate behavior of
  Cloudflare's shared outbound identity.

Unknown does not mean permitted or unavailable.

## Application requirements

The smallest complete deployment must preserve:

- one checked Vite build and its hashed MapLibre module worker;
- same-origin browser aircraft requests under `/api/aircraft`;
- same-origin browser weather requests under `/api/weather/metar`;
- one direct plausible-route request for a newly selected eligible aircraft;
- the exact ADSB.lol `/v2/point/{latitude}/{longitude}/{radiusNm}` mapping;
- the 100 km client eligibility decision before outward rounding to 54 NM;
- upstream status, body, `Content-Type`, and `Retry-After`;
- canonical 1-50-station AWC JSON requests with no browser credentials;
- no overlapping or accelerated aircraft request schedule;
- direct browser Digitraffic REST and secure MQTT WebSockets;
- direct browser Photon forward search only after explicit submit;
- visible OpenFreeMap/OpenStreetMap, Photon/OpenStreetMap, ADSB.lol/ODbL,
  AWC/NWS, and Digitraffic/CC BY attribution;
- independent aircraft, marine, and map failure;
- rounded, session-only location behavior without application URL logging.

The hosting platform does not need to proxy WebSockets. The browser continues
to connect directly to `wss://meri.digitraffic.fi:443/mqtt`.

## Platform comparison

| Criterion | Cloudflare Workers + Static Assets | Netlify static site + Function |
| --- | --- | --- |
| Deployment unit | Worker code and static assets form one version and deployment | Site and Function deploy together |
| Same-origin proxy | Selective `/api` Worker boundary in the same unit | Validating Function required; a generic redirect proxy would be too permissive |
| Static asset cost | Documented free and unlimited Static Asset requests | Shared credit budget includes bandwidth and web requests |
| Free dynamic allowance | 100,000 Worker requests/day | 300 credits/month across production deploys, bandwidth, web requests, and compute |
| CPU and subrequests | 10 ms CPU and 50 subrequests/request on Workers Free; upstream wait is not CPU time | Function compute consumes the shared credit budget |
| HTTPS | Default `workers.dev` HTTPS; custom domain optional | Default `netlify.app` HTTPS; custom domain optional |
| Browser marine access | Direct provider HTTPS/WSS; no Worker relay | Direct provider HTTPS/WSS; no Function relay |
| Asset caching | Automatic edge caching plus `_headers` browser policy | CDN asset delivery and configurable headers |
| Rollback | Restore a recent Worker version containing code and assets | Republish a retained atomic deploy |
| GitHub deployment auth | Scoped Cloudflare API token and account ID | Netlify account/site authorization |
| Current operational surface | One platform and two fixed upstream request shapes | One platform, but a shared credit model with no compensating feature needed here |

Official pricing as reviewed:

- Workers Free: 100,000 dynamic requests/day, 10 ms CPU/request, 128 MB
  memory, and 50 subrequests/request.
- Static Asset requests are free and unlimited; the free plan allows 20,000
  files per Worker version and 25 MiB per asset.
- Workers Paid starts at USD 5/month and removes the daily request ceiling,
  with included request/CPU usage and no additional egress charge.
- Netlify Free supplies 300 monthly credits. Its official pricing assigns
  15 credits to a production deploy, 20 credits/GB bandwidth, 2 credits per
  10,000 web requests, and 10 credits/GB-hour compute.

Cloudflare is selected because it provides the required same-origin routes and
static client in one atomic unit while keeping static delivery outside Worker
invocation billing. Netlify remains technically viable but offers no required
advantage for these fixed routes.

GitHub Pages plus a separate Worker was rejected because it creates two
deployment units and either a split origin with CORS or extra domain/routing
configuration. Cloudflare Pages was not selected because Workers Static Assets
already provide the required current platform boundary directly.

## Capacity calculation

One continuously visible, eligible browser has a nominal upper envelope of:

```text
60 seconds / 20 seconds = 3 aircraft requests/minute
3 * 60 * 24 = 4,320 aircraft requests/day
```

At that envelope, the Workers Free allowance corresponds to about 23
continuously active browser sessions:

```text
100,000 / 4,320 = 23.15
```

Page hiding, ineligible views, request duration, cancellation, and provider
backoff reduce actual starts. Invalid public requests, production checks, and
other Workers on the account consume allowance too.

This calculation is a budget estimate, not a concurrency promise, ADSB.lol
capacity grant, service-level agreement, or reason to weaken provider pacing.
METAR has no periodic poller, so its optional enable/station-change/refresh
volume cannot be converted into the same continuous-session envelope without
real usage. Monitor combined route usage before considering the paid plan,
cache, or any rate-control change.

## Production boundary

```text
browser
  |
  +-- /, /assets/*, /aircraft-metadata/*,
  |   /vessel-photos/*, /orbital-data/*,
  |   /orbital-enrichment/* -------------> Cloudflare Static Assets
  |
  +-- /api/aircraft/v2/point/... --+
  |                                |
  +-- /api/weather/metar?ids=... --+--> Cloudflare Worker
  |                                |
  +-- /api/orbits/catalog ---------+       +--> Workers KV or
                                           |    exact-release bootstrap
                                           |             |
                                           |             +--> aviationweather.gov
                                           |
                                           +--> `worker-proxy`: api.adsb.lol
                                           |
                                           +--> `oci-private-relay`
                                                -> Workers VPC Service
                                                -> Cloudflare Tunnel
                                                -> OCI loopback relay
                                                -> api.adsb.lol

Cloudflare Cron, at most once per two hours
  -> one named SQLite Durable Object
  -> atomic cadence admission and fail-closed outcome state
  -> fixed CelesTrak visual GP JSON
  -> fixed CelesTrak visual SATCAT JSON
  -> validated single-write Workers KV snapshot

browser --------------------------------> OpenFreeMap HTTPS
browser --------------------------------> Photon HTTPS on explicit search
browser --------------------------------> Digitraffic HTTPS + WSS
browser --------------------------------> vrs-standing-data.adsb.lol
                                          on committed live-aircraft selection
browser --------------------------------> api.adsb.lol only in the protected,
                                          provider-approved direct mode
```

`wrangler.jsonc`:

- points Static Assets at `dist/`;
- invokes Worker code first only for `/api` and `/api/*`;
- enables the first hobby deployment on `workers.dev`;
- disables public version preview URLs;
- enables incoming `Request.signal` cancellation so deselection and identity
  changes can abort obsolete upstream work;
- explicitly disables Worker observability so invocation URLs containing
  rounded camera coordinates and weather station IDs are not retained in
  application logs.

There is no SPA fallback because the current application has no client-side
routes. Missing hashed JavaScript, CSS, MQTT, or MapLibre worker assets return
real 404 responses rather than `index.html`.

`public/_headers` applies to Static Asset responses:

- `/assets/*` uses one-year immutable browser caching because Vite fingerprints
  those filenames;
- `/aircraft-metadata/*` uses one-year immutable browser caching because every
  source, schema, generator, or byte change receives a new versioned path;
- `/vessel-photos/*` uses one-year immutable browser caching because every
  identity, source, rights, transformation, or byte change receives a new
  manifest/version path;
- `/orbital-data/*` uses one-year immutable browser caching because the
  normalized bootstrap path is schema/versioned and its digest is checked;
- `/orbital-enrichment/*` uses one-year immutable browser caching because each
  exact-NORAD identity, source, rights review, notice, and byte set receives a
  new manifest/version path. Correctness does not depend on that HTTP cache:
  the browser application performs one bounded selected-image fetch, validates
  exact media type, bytes, and SHA-256, and shares only the resulting
  session-only Blob URL with details and tooltips;
- `/` and `/index.html` revalidate;
- all asset paths use `nosniff`, clickjacking protection, and a conservative
  referrer policy.

Those rules do not apply to Worker responses. The aircraft proxy sets its own
`no-store` and `nosniff` headers; successful METAR responses use
`public, max-age=60`, JSON content type, and `nosniff`. A successful orbital
snapshot response uses `public, max-age=300, must-revalidate`, a stable weak
snapshot-digest ETag, JSON content type, and `nosniff`. The weak validator is
intentional because Cloudflare may change content encoding at the edge; the
digest header and canonical decoded payload still require exact agreement.

## Aircraft proxy contract

The only allowed aircraft route is:

```text
GET /api/aircraft/v2/point/{latitude}/{longitude}/{radiusNm}
```

| Input or behavior | Result |
| --- | --- |
| Wrong path or segment count | `404 Not Found` |
| Method other than GET | `405 Method Not Allowed`, `Allow: GET` |
| Query string | `400 Bad Request` |
| Noncanonical, malformed, non-finite, or out-of-range coordinate | `400 Bad Request` |
| Radius outside integer 1-54 NM | `400 Bad Request` |
| Valid request | Fixed `https://api.adsb.lol/v2/point/...` upstream |
| Upstream redirect | `502 Bad Gateway`; never followed or forwarded |
| Upstream network/read failure | `502 Bad Gateway` |
| Total upstream deadline exceeded | `504 Gateway Timeout` |
| Response over 4 MiB counted bytes | `502 Bad Gateway`; never truncated success |
| Browser cancellation | Upstream abort |
| Upstream 2xx/4xx/5xx | Original status and body |
| Upstream throttle | Original `Retry-After`, including HTTP-date or seconds |

The parser splits the encoded path before decoding only the three value
segments. It rejects malformed escapes, encoded separators, encoded dot
segments, signs, exponent or hexadecimal syntax, leading-zero variants, and
other noncanonical forms.

The proxy:

- constructs the destination from a hard-coded ADSB.lol origin;
- forwards no browser cookie, authorization, forwarding, range, or arbitrary
  header;
- sends only `Accept: application/json` and the stable public project
  `User-Agent`;
- sets upstream and downstream cache behavior to `no-store`;
- uses `redirect: manual`;
- keeps a ten-second deadline active while reading the body;
- buffers at most 4 MiB so a timeout or size error is reported before a partial
  response is committed;
- emits no request, coordinate, header, body, or exception log;
- adds `X-LiveTrafficStan-Release` only when deployment supplied a valid
  40-character source SHA.

The 54 NM maximum is intentionally tied to the current 100 km application
contract. A regression test compares the Worker maximum with
`aircraftQueryRadiusNauticalMiles(APP_CONFIG.map.maximumViewportRadiusKm)` so a
future viewport-limit change cannot silently work in Vite while production
rejects it.

## METAR proxy contract

The only weather route is:

```text
GET /api/weather/metar?ids=EETN%2CEFHK
```

| Input or behavior | Result |
| --- | --- |
| Wrong path | `404 Not Found` |
| Method other than GET | `405 Method Not Allowed`, `Allow: GET` |
| Missing, repeated, extra, raw-comma, unsorted, duplicate, lowercase, malformed, or over-50 `ids` | `400 Bad Request` |
| Valid request | Fixed `https://aviationweather.gov/api/data/metar?ids=...&format=json` upstream |
| Upstream redirect | `502 Bad Gateway`; never followed or forwarded |
| HTTP 200 with non-JSON content type | `502 Bad Gateway` |
| Upstream network/read failure | `502 Bad Gateway` |
| Eight-second upstream deadline exceeded | `504 Gateway Timeout` |
| Response over 256 KiB counted bytes | `502 Bad Gateway`; never truncated success |
| Browser cancellation | Upstream abort and `499` when a response is still possible |
| Upstream 200/204 or error | Original status, bounded body policy, and `Retry-After` |

The proxy accepts exactly one canonical `ids` query containing 1-50 sorted
unique uppercase four-letter values. It constructs the hard-coded AWC URL,
forces JSON, uses `redirect: manual`, sends only JSON accept and the public
project User-Agent, and forwards no cookie, authorization, origin, referrer,
forwarding, or arbitrary caller header. It does not log station IDs, raw
observations, URLs, headers, bodies, or exceptions.

Successful responses receive a 60-second public cache header aligned with the
observed AWC guidance. This is browser/edge response guidance, not an
application-owned shared stale-data system or proof of aggregate provider
capacity. Non-success responses are `no-store`; exposed error bodies are
bounded plain text with `nosniff`.

The browser provider adds its own eight-second deadline and 256 KiB cap,
accepts only requested METAR/SPECI stations, and observes one session request
start at least 60 seconds after the previous start. That local pacing cannot
prove public aggregate request/egress safety. Production exact-SHA smoke proves
the deployed boundary, while provider capacity remains an external operational
dependency rather than an application guarantee.

## Scheduled orbital catalog contract

The orbital infrastructure is disabled unless the protected deployment sets:

```text
ORBITAL_CATALOG_ENABLED=true
```

When enabled, the workflow:

1. finds exactly one Workers KV namespace titled
   `livetrafficstan-orbital-catalog`, or creates it once;
2. generates an exact temporary Wrangler configuration with only the
   `ORBITAL_CATALOG` KV binding, one
   `ORBITAL_CATALOG_COORDINATOR` SQLite Durable Object binding, and the offset
   `17 */2 * * *` UTC Cron;
3. dry-runs that exact configuration before deployment;
4. deploys the Worker, allowing Cloudflare to provision the named SQLite
   Durable Object class, and records the KV namespace ID;
5. smokes the catalog route and immutable bootstrap.

The namespace ID is a resource identifier, not a credential. Account ID and API
token remain protected environment secrets. The token must have only the
Worker/KV permissions required by this deployment. A permission failure stops
activation rather than falling back to a browser fetch or another store.

The Cron handler calls `controller.noRetry()` and invokes one named Durable
Object. A synchronous SQLite transaction admits at most one refresh, stores a
fail-closed in-progress gate before any provider request, and rejects duplicate
or early events. Workers KV is intentionally not used as a lock because it has
no compare-and-set contract and is eventually consistent. The coordinator
never accepts browser input. Its cadence-state schema is independent from the
published catalog schema so a catalog-shape revision cannot discard admission,
backoff, or terminal-block state. Catalog schema 2 does not reset or rename the
class, namespace, binding, fixed coordinator object, SQLite table, or schema-1
admission row. A reviewed recovery must use that same identity and preserve
the previous admission, physical fences and deadlines; never change the
object name or delete its state to escape a source stop.

### Native orbital primary production acceptance (2026-10-17)

#497, required tree-neutral ancestry #499, and checked promotion #498 deliver
running application **`1352c6e586366084b09bcb9cefa2a5cf5f9c8065`**, Worker
**`c207eeee-e817-4a9f-bbc7-49daaab85504`**, published by
[deployment 39041403972](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/39041403972)
at **14:36:50 UTC**. Exact-main Validation **39040992159** passed. The existing
private aircraft/photo/route/orbital/Starlink/marine/airport-board inputs and
atomic secrets were preserved; only orbital acquisition selected Space-Track.
The immutable OCI relay remains `b54962f3cce89ea4757e4b47c829b895ebadc863`.

The ordinary native producer published these complete generations. A single
bounded cache-only observer validated schema, complete source provenance,
canonical digest, response clock, ETag and matching digests on both public
origins at 16:48:30 UTC; it did not trigger acquisition.

| Topic | Retrieved/published UTC | Validated source / published records | Snapshot SHA-256 |
| --- | --- | --- | --- |
| Starlink | `2026-10-17T14:47:30.799Z` | 11,150 / 512 (128 per shell) | `25859060d65b1d5eca08d60132559e8dbabea6ccf97bd56c08d399cd1f2b8fd8` |
| Curated | `2026-10-17T16:47:29.803Z` | 461 / 461 | `20fb29c3839839f8dd894aba089c93c39f3484bfda0f5adf2c7acf5e8bc8c398` |

The Starlink source response was 5,693,286 decoded bytes, digest
`e8021613dd4451ca63b10daa034b00001be4e805a5b636770c8961116b667b94`;
curated was 234,466 bytes, digest
`45cd19a0194293fe6c6dc7821e93bcac50106e66d0fd0dbb3ff1d3ae309b43a3`.
The original two-hour parent and twelve-hour actual-Starlink floors remained
authoritative. The independent qualification workflow was disabled before
handoff; no forced GP read, SATCAT read, identity reset, expiry extension,
new resource or OCI change occurred.

Actual Chrome 155, without fixture interception, selected EGS (AJISAI) /16908
and STARLINK-5535 /56356 using mouse at 1280x900 and emulated touch at 320x568.
Both native snapshot identities, GP/type attribution, dated-curation limitation
and modeled/not-optical caveats were verified on one canvas, without document
horizontal overflow or runtime exceptions. Each browser context made one
initial same-origin request per topic; selection/resizing made no extra read.
This is not physical-phone or a new exhaustive whole-app/theme acceptance.
Existing tabs requesting legacy formats may need the ordinary **REFRESH APP**
action to load the new schema-3 client. Do not clear preferences or history;
refreshing the browser cache cannot force a producer acquisition.

The deployment Action **remains failed** because its later private-aircraft
smoke returned 504. Both unchanged full-origin follow-ups passed exact static
byte matching but encountered the same aircraft 504. Independent #500 records
the unknown failing hop; orbital acceptance does not relabel that outage as
healthy. The local pre-rebuild artifact mismatch and browser targeting failures
remain preserved, not counted as provider defects or silently removed.

Space-Track is now the deployment default; a later workflow/documentation-only
commit does not redeploy this running application. Rollback can revert that
default or explicitly select `celestrak` through the checked workflow, retaining
all production inputs and atomic credentials. It never clears persisted
source/physical/retry fences or promises fresh legacy data while CelesTrak is
unreachable. No additional rollback exercise is claimed.

### Native GP source selection without another acquisition authority (#488)

The checked deployment input `orbital_source` defaults to `space-track` and
retains explicit `celestrak`; selection is not an automatic provider failover.
Native mode keeps the exact original named DO, SQLite tables, state versions, global
two-hour admission, actual Starlink twelve-hour row, terminal stops,
`Retry-After`, and physical active-attempt fence. It does not apply a historical
CelesTrak-specific recovery authorization to a different provider.

The already-qualified one-point GP read completed at
`2026-10-17T12:02:12.070Z`; the new mode's initial not-before instant is
`13:02:12.070Z`, composed with, never substituted for, preserved operational
deadlines. Each admitted attempt does one bounded login before reserving any
actual Starlink GP start. A due Starlink topic takes priority; otherwise the
attempt requests curated reference IDs. Only **one GP batch/topic** is acquired
and published per attempt. A selected failed child cannot fall through to
another GP query. Starlink-only success explicitly records curated
`not-attempted`, not fulfillment.

The existing Cron uses `17,47 * * * *` eligibility ticks only in native mode;
legacy mode retains `17 */2 * * *`. Not-due ticks perform zero provider reads.
The unchanged native floors, not Cron frequency, admit acquisition. Under
timely scheduling/successful bounded work, this avoids a due Starlink slot
pushing the next curated snapshot beyond its six-hour stale boundary;
approximate 2.5-hour parent/five-hour curated/14.5-hour Starlink intervals are
nominal bounds, not a platform availability guarantee. Six/eighteen-hour stale
and twenty-four-hour hard-expiry behavior is unchanged.

The same root physical lock remains active through the final KV write;
obsolete work is checked before publication and completion follows the write.
Readable provider guidance survives body/validation errors. Unknown
authentication or retry guidance holds future admission for investigation
without inventing an upstream HTTP 403. The actual diagnostic remains one
bounded overwritten receipt, not another quota ledger.

`SPACE_TRACK_USERNAME` and `SPACE_TRACK_PASSWORD` are selected only for enabled
native orbital acquisition, in the same owner-only atomic `--secrets-file` as
the existing necessary relay/marine/board credentials. No standalone secret
mutation, browser secret, new service, paid resource, OCI/network change, or
manual personal approval is required. Retire the independent
`qualify-space-track.yml` workflow at production handoff so the DO is the sole
application GP acquisition owner; reuse its successful receipt rather than
probing again.

Native namespaces/schema 3 do not replace legacy keys/bootstrap bytes.
Configuration rollback selects the old source path but **never clears a
persisted terminal/held source fence**; a real stop needs a cause-specific
reviewed treatment, not a clock reset or another actor identity.

In the retained CelesTrak mode, one admitted event performs exactly this non-overlapping sequence:

| Order | Group | GP | SATCAT |
| --- | --- | --- | --- |
| 1 | `visual` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json` |
| 2 | `stations` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=stations&FORMAT=json` |
| 3 | `weather` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=weather&FORMAT=json` |
| 4 | `gnss` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=gnss&FORMAT=json` |
| 5 | `science` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=science&FORMAT=json` |

Every response must satisfy:

- only `Accept: application/json` and the stable public project `User-Agent`
  are sent;
- the default Workers host `fetch` is called through `globalThis`, preserving
  the receiver required by the Cloudflare runtime;
- exact HTTP `200`; other successful 2xx statuses, including `206`, are
  rejected;
- exact `application/json` media type with at most an optional UTF-8 charset;
- ten-second deadline per response;
- at most 512 records and 512 KiB decoded;
- valid UTF-8 and strict required fields;
- unique canonical NORAD IDs within that response.

The complete sequence has a 90-second deadline and 4 MiB aggregate decoded
limit. Each group independently requires unique GP and SATCAT IDs and exactly
one SATCAT row for every GP row; validated extra SATCAT rows are permitted but
not published. The union deduplicates only by canonical decimal NORAD ID.
Names, designators, and SATCAT type must agree after outer-whitespace
normalization only. The newest valid OMM epoch wins; equal-epoch differing
propagation fields reject the complete refresh. The result is never truncated
and must contain at most 512 records and at most 512 KiB in normalized form.
Before cross-group winner substitution, the already-fetched validated
`visual` pair is also serialized under the exact public schema-1 contract.

After all ten responses and one union validate, the Durable Object durably
records the next allowed start before one final KV write replaces
`orbital:catalog:v2:curated-v1` with an internal publication-version-1 bundle.
The non-public envelope contains the canonical public schema-2 union and exact
same-refresh public schema-1 visual snapshot. That one write is the sole
publication commit: a failure leaves both prior representations in place, and
the updater never writes or resets `orbital:catalog:v1`. The internal bundle
version is independent from public catalog and coordinator-state schemas. The
coordinator stores only its schema, attempt sequence, cadence, and blocked
status. It contains no coordinates, user data, raw payload, digest, or provider
body.

The same SQLite-backed Durable Object keeps one bounded last-admitted-outcome
value, separate from its admission/recovery rows. It is written after the
actual preparation/publication result and survives actor recreation, without
changing either cadence, blocked state, physical fence or rollback identity.
It records only fixed outcome/stage, bounded application reason, status and
start/completion times. Early duplicate events leave it untouched. Optional
diagnostic storage failure is explicitly warned and cannot revoke a published
snapshot or relax admission. The existing cache-only routes expose this
receipt in `X-LiveTrafficStan-Orbital-Refresh-Last-*` headers; no new public
endpoint, provider acquisition, credential, general request logging or
observability service is introduced.

`429` and readable `Retry-After` guidance on `5xx` extend the next-allowed
time. Guidance is bounded to seven days; a longer value enters an
operator-reviewed blocked state rather than creating an unsafe or
non-representable deadline. Redirects, `403`, and `404` also block subsequent
scheduled acquisition until explicit review. Timeout, `5xx` without readable
guidance, malformed data, oversize, invalid fields, incomplete joins, or
cross-group conflicts preserve the prior snapshot and wait for the next normal
event. If the
coordinator cannot persist any provider outcome, the initial fail-closed gate
remains at `Number.MAX_SAFE_INTEGER`; the event reports unavailable and no
later Cron can contact CelesTrak until a reviewed same-identity recovery. There is
no immediate retry, alternate group, provider fallback, or on-demand browser
fetch.

The October 14 amendment adds one small SQLite receipt table, not a new actor,
binding, provider or recovery endpoint. Its fixed exact-stop predicate and
atomic consumption/reservation permit one reviewed ordinary scheduled attempt.
The receipt retains the previous row; a second denial reblocks and an
inconclusive result keeps the main active-attempt fence, so a compatible old
reader also remains stopped. Redeploying does not replenish authorization.
Source validation is recorded before KV writes; only actual complete public
snapshots prove publication. See the
[reviewed recovery contract](orbital-data-source-evaluation.md#reviewed-recovery-of-the-october-12-stop).

The public route is exactly:

```text
GET /api/orbits/catalog
```

It rejects queries and other methods. Default and predecessor requests choose
the newest valid schema 1 among the current bundle member, retained
`orbital:catalog:v1`, `/orbital-data/v2/visual-catalog.json`, and
`/orbital-data/v1/visual-catalog.json`. Equal newest timestamps with different
digests fail closed. Only the exact fixed
`Accept: application/vnd.livetrafficstan.orbital-catalog+json;version=2`
request validates schema-2 catalog `celestrak-curated-v1` independently from
KV key `orbital:catalog:v2:curated-v1` and immutable bootstrap
`/orbital-data/curated-2026-09-30-v1/catalog.json`, then serves the newer
`retrievedAt`; pre-bundle raw schema-2 KV values remain readable during
rollout. The public route never exposes the internal envelope. The
representations use distinct weak digest ETags and
`Vary: Accept`; a validator for one representation cannot produce a `304` for
the other. Equal schema-2 timestamps with equal canonical digest select KV;
equal timestamps with different digests fail closed. If the selected
representation has no valid candidate, the route returns `503` with bounded
retry guidance. Every response identifies the release SHA, schema, digest,
retrieval time, serve time, and whether KV or bootstrap supplied the bytes.

The browser route and scheduled updater remain independent. Explicit ORBITS
enable makes one strict negotiated schema-2 same-origin read, then local SGP4
propagation runs in a dedicated worker. Camera, selection, theme, style, and
ordinary hide/show changes cannot invoke CelesTrak or reset the two-hour
schedule. Default schema 1 remains available through at least one complete
checked production release after the schema-2 browser release. Removing it
requires a separate reviewed change after predecessor rollback/support is no
longer required.

The curated bootstrap was generated from the final coordinated
`2026-09-30T18:25:59.094Z` evidence: 462 records (369 `PAY`, 91 `R/B`, 2
`DEB`), six non-conflicting overlaps, no missing joins, 353,281 aggregate decoded
bytes, 239,460 normalized bytes, and canonical digest
`5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`.
Its versioned path is never reused. Repository checksum/history checks require
a new immutable path for any source, schema, generator, or byte change.

The previous receiver-safe schema-1 assets remain byte-for-byte at
`/orbital-data/v1/visual-catalog.json` and
`/orbital-data/v2/visual-catalog.json`, and the v1 KV key remains untouched.
Current smoke resolves the target checkout's supported schema, bootstrap, and
validator so current dual-representation, pre-negotiation schema-2-only, and
retained schema-1-only rollback releases are all certifiable. Only a target
that exports the exact fixed schema-2 `Accept` value and legacy validator is
tested for both representations, `Vary: Accept`, distinct ETags, and
cross-representation behavior. A single-representation target is validated
through its own schema version, response limit, source-contract version,
bootstrap path, and validator without requiring current negotiation exports or
headers. Disabled targets require only the target `404` behavior and do not
import an orbital contract. When dual schema 2 is served from KV, smoke
requires default schema 1 to be served from KV with a retrieval time at least
as current and the same visual population. Do not seed KV manually, reset the
named coordinator, invoke the provider on demand, or overwrite an immutable
bootstrap URL. After a coordinated deployment, bootstrap is an acceptable
temporary source; the next ordinary admitted `17 */2 * * *` event must still
be observed serving `X-LiveTrafficStan-Orbital-Source: kv` for both
representations.

The coordinated curated-catalog application release is exact source
`538edd25afa49f62c13e93745b322099f662791d`. Protected deployment run
`36788698617` produced initial Cloudflare version
`83b98933-a609-405e-b07c-3e4f4ded46e8` with KV namespace
`59178d55418247c4bab473b52a5dc07d`. Immediate smoke proved fresh default
schema 1 from KV, negotiated schema 2 from the immutable 462-record bootstrap,
distinct representation ETags/304s, cross-representation `200`,
`Vary: Accept`, and no exposed internal bundle.

The first ordinary admitted schema-2 publication was retrieved at
`2026-10-01T02:17:32.034Z`. Schema 2 contained `462` records with canonical
digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`;
the same atomic write supplied the same-retrieval schema-1 visual member with
`156` records and digest
`018ee9ff6c9c161485f37f5a22cfaa5a6fdd2524a4ae7fc49a12947c4478e2e5`.
Both responses reported source `kv`. A schedule event
can arrive seconds before the exact two-hour admission boundary and return
`not-due`; this consumes no provider request and is not a failed refresh.

That curated release remains historical rollback evidence for the map
follow-up: source `538edd25afa49f62c13e93745b322099f662791d`, recorded
Cloudflare version `83b98933-a609-405e-b07c-3e4f4ded46e8`. The current
shell-balanced release uses the rollback target recorded below. The earlier
October 2 traffic-recovery release used predecessor source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63` and version
`d83f68ae-907e-4b2d-a086-00b4fde00372`, proven by run `36998162009`.

For local rendered acceptance without production credentials:

```bash
npm run build
npx wrangler dev --local --var ORBITAL_CATALOG_ENABLED:true
```

This serves the exact-release bootstrap through the real Worker route. It does
not create the production KV namespace, Durable Object, or Cron and must not be
used as a provider probe.

The current source and provider assessment is
[Orbital Data Source Evaluation](orbital-data-source-evaluation.md). Browser
modeling and acceptance are documented in
[Orbital Tracking](orbital-tracking.md).

### Starlink sample contract

`STARLINK_CATALOG_ENABLED=true` is a protected deployment value and is
effective only with `ORBITAL_CATALOG_ENABLED=true`. It reuses the same Cron,
named SQLite Durable Object, KV namespace, and Worker deployment. No second
trigger or provider-facing endpoint is created. A classified nonterminal
curated preparation failure (including timeout or validation failure) retains
the prior curated bundle but cannot starve due Starlink. Unexpected exceptions,
terminal source responses, shared backoff, and admission/persistence failures
do not gain this continuation. After the curated attempt, the coordinator
transactionally reserves a separate Starlink row at the actual GP
request start if at least 12 hours have elapsed and no global CelesTrak block
or later `Retry-After` applies. If that row does not yet exist, the coordinator
first seeds it from the pinned bootstrap GP retrieval at
`2026-10-02T08:40:03Z`. Calls before `2026-10-02T20:40:03Z` return `not-due`
without provider work, while the immutable bootstrap can already be served;
an admission at or after the boundary replaces the seed with the actual request
start and resumes ordinary 12-hour anchoring.

The parent attempt remains active until both eligible preparations settle.
It completes the same shared gate once before any final puts, and publishes
only a fully ready preparation; a late validation/deadline failure never
publishes constructed curated bytes. Curated failure with accepted Starlink
returns a failed curated outcome plus the actual child result and
`curated: not-attempted`, not a fictitious fulfilled curated put. Child
terminal/backoff results remain authoritative globally and are recorded with
their actual child clock. Reviewed recovery is verified only when both
preparations validate. This adds no retry, source, scheduler, timeout change,
or relaxation of the 24-hour hard expiry.

The admitted sequence is the fixed official Starlink GP JSON followed by
SATCAT JSON. Each response is exact `200` JSON, at most 6 MiB and 15,000 rows;
the pair is at most 12 MiB and 60 seconds. The complete join is normalized
once. That population produces the exact released 150-record schema-1
systematic representation and the 512-record schema-2 shell-balanced
representation. The two members must have identical source counts, hashes,
retrieval/publication metadata, and population. One final write publishes the
private envelope to
`orbital:catalog:v2:starlink-shell-balanced-v1`; the released v1 key is not
mutated. A Starlink failure is reported by the scheduled event but cannot undo
an accepted curated publication or remove the last complete Starlink snapshot.

The public storage route is literal `GET /api/orbits/starlink`. It validates
the bundled KV members and both immutable Starlink generations concurrently,
rejects future or impossible source clocks, ranks candidates by the later
source retrieval time, and fails closed on equal-generation digest conflict.
Missing or legacy `Accept` receives schema 1. The browser's fixed preference
list requests schema 2 and permits schema 1; if schema 2 is beyond the
24-hour hard expiry while schema 1 is fresher, the same request receives
schema 1. Exact schema-2 requests remain available for immutable-bootstrap
inspection. Each representation has its own digest, weak ETag, body cap, and
`304`; cross-representation ETags return `200`, and every response includes
`Vary: Accept`. Bootstrap fallback has a 1.5-second budget, below the browser's
five-second total request deadline.

Deploy and rollback resolve the target checkout's Starlink capability and
flag independently from curated schema negotiation. A target without Starlink
must not be forced to export current constants or answer the route; an enabled
target must validate its exact immutable bootstrap and same-origin route.
Rollback never deletes the shared KV namespace or Durable Object and never
resets either cadence row.

The first immutable bootstrap evidence is GP
`2026-10-02T08:40:03Z` (11,125 rows, 4,699,409 bytes), SATCAT
`2026-10-02T08:40:05Z` (11,125 rows, 3,684,028 bytes). Schema 2 contains
512 records, exactly 128 per fixed inclination band, 254,275 normalized bytes,
and digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
The predecessor remains 150 records / 74,982 bytes / digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.
Deployment smoke feature-detects predecessor and dual-representation targets
instead of imposing the current contract on an older rollback.

The ordinary `2026-10-03T14:17Z` event published one fresh 150/512-record
bundle at `14:17:23.055Z`. GP retrieval was `14:17:20.296Z`; SATCAT retrieval
was `14:17:23.055Z`. Both representations reported `source=kv`, exact release
`d565b562...`, and aligned source metadata. Full record/digest validation and
all ten negotiation/ETag cases passed. The source hashes and exact body
identities are recorded in
[Orbital Data Source Evaluation](orbital-data-source-evaluation.md).

Protected rollback
[37129586003](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37129586003)
restored predecessor application
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a` / recorded Worker version
`146e74df-c960-4a41-bc0c-6d5b9fa0d660` and passed target-aware smoke.
Protected restoration
[37129687283](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37129687283)
restored `d565b56278e81ff2478ab1e476c269084f2297d4` /
`e9e473d1-fac5-4594-b62b-7ba68573efeb` and passed full dual-representation
smoke at `14:28:39Z`. At `14:30:12.614Z`, both fresh KV bodies, canonical
digests, ETags, and publication clocks remained byte-identical to pre-rollback
evidence. The workflows preserved production serialization, the existing
namespaces, Cron, and both cadence rows; no manual provider acquisition or
secret mutation was needed.

Exact-production Chrome `154.0.8037.95` used no catalog response fixtures and
passed the 512-record lifecycle and responsive acceptance.
[Desktop/mobile screenshots and measured
evidence](https://github.com/vasilyevstan/LiveTrafficStan/pull/275#issuecomment-5970127249)
remain separate from the earlier candidate fixtures and physical-device
evidence remains unavailable. Later documentation-only commits do not change
the running application SHA.

Public Wiki commit `0d535744e4159cf5b12931db4bf14adf4d5521d9` records this
same release, publication, production acceptance, and rollback/restoration
across fourteen pages.

At twelve scheduled events per day, the coordinator uses approximately twelve
Durable Object requests and a few row reads/writes per day, while successful
refreshes add about twelve KV writes per day. Cloudflare currently includes
SQLite-backed Durable Objects on Workers Free with 100,000 requests, five
million rows read, and 100,000 rows written per day; Workers KV includes
100,000 key reads and 1,000 key writes per day. These are current limits, not a
permanent entitlement. Activation must confirm the account remains on the
free plan and that failed over-limit operations do not trigger paid fallback.

## Bounded implementation observations

On 2026-09-19:

- one direct maximum-radius Tallinn ADSB.lol request returned HTTP 200 and
  4,494 application bytes;
- the first local `workerd` request with its generic default User-Agent returned
  HTTP 403 with an instruction to include valid contact information;
- after the Worker sent
  `LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)`, the same
  local fixed-route path returned HTTP 200;
- a separate local 11 NM response was 978 application bytes;
- local Static Assets served the emitted MapLibre worker with immutable caching
  and `nosniff`;
- a missing hashed asset returned 404;
- malformed proxy coordinates returned 400.

These are bounded compatibility observations, not a body-size maximum,
availability promise, provider quota, coverage measurement, or load test. The
4 MiB limit is a defensive application ceiling.

## Cache and rate-protection decision

Cache fingerprinted application assets and immutable versioned metadata/port
assets, not live aircraft responses.

No Worker Cache API, shared response cache, `stale-while-revalidate`, or
`stale-if-error` is enabled because:

- aircraft data is refreshed on a 20-second live cadence;
- rounded centers still produce many distinct request keys;
- no measured shared hit rate establishes value;
- serving a stale shared success could misrepresent live traffic;
- repeated extraction, retention, and shared caching need a separate ODbL and
  provider-policy decision.

  METAR differs only in preserving the source's observed 60-second cache
  guidance. The application has no periodic weather poller, persistent weather
  cache, stale-if-error success, or cross-user request coordinator. Public
  aggregate station-query volume and cache behavior must be measured after
  authorized deployment rather than inferred from one browser's session gate.

  ## Plausible route contract

  The browser constructs exactly one validated static-data request:

  ```text
  GET https://vrs-standing-data.adsb.lol/routes/{prefix}/{callsign}.json
  Accept: application/json
  ```

  The callsign is normalized before URL construction, and only validated
  uppercase route characters can enter the path. The request omits
  credentials, rejects redirects, bypasses browser cache, has a ten-second
  deadline, and rejects responses above 32 KiB.

  | Input or behavior | Result |
  | --- | --- |
  | Missing or invalid ICAO callsign, ICAO24, or current position | Lookup unavailable in the UI |
  | Static route `404` | No standing route available |
  | Provider `429` | Typed temporary throttling error |
  | Redirect, non-JSON, malformed schema, mismatched callsign, invalid airport, or oversized body | Typed provider error |
  | Fewer than two airports | Incomplete route |
  | Current position outside every accepted segment corridor | Implausible route |
  | Valid exact route and plausible position | Origin and destination displayed as plausible |

  The route may contain multiple airports. The first and last are displayed,
  while every consecutive pair participates in the geographic check. A
  segment accepts the current position only within the larger of 50 NM or
  20 percent of that segment's great-circle distance.

  The client may reuse up to 32 successful validated exact-identity routes
  from memory for six hours. This cache disappears with the tab, never
  contains failures, and is not a Worker Cache API, Durable Object,
  service-worker, Web Storage, IndexedDB, or cross-user cache. Reselecting a
  cached flight makes no provider request; manual **Refresh** deliberately
  does.

The strict ADS-B route, 54 NM ceiling, ten-second deadline, 4 MiB body bound,
no proxy retry, existing client schedule, and Cloudflare daily allowance
reduce accidental load. They are not a global ADS-B abuse-control system.

Plausible routes add no Worker invocation, server-side secret, persistent
quota, shared cache, or cross-user state.

## Local commands

Normal Vite development remains:

```bash
npm run dev
npm run preview
```

Vite's aircraft convenience proxy is broader than the production allowlist.
Its METAR rewrite is fixed to the AWC JSON path, discards unsupported query
parameters, strips browser credentials/forwarding headers, and is still not a
substitute for Worker canonical-input validation. Validate the production
boundary with:

```bash
npm run build
npm run check:deploy
npm run preview:worker
```

- `check:deploy` performs a credential-free Wrangler bundle and Static Assets
  dry run.
- `check:aircraft-metadata` validates the committed version, license, inventory,
  hashes, grammar, counts, and publication-age policy without upstream network
  access before the build is eligible to deploy.
- `check:country-allocations` validates the bundled MID and ICAO24 projection,
  hashes, exclusions, ranges, counts, and representative fixtures without
  upstream network access.
- `check:vessel-photos` validates exact IMO identities, pinned source
  revisions, file-specific rights, the co-located license record, image
  dimensions, byte budgets, hashes, and directory inventory without upstream
  network access.
- `check:orbital-catalog` validates the complete normalized bootstrap,
  source/type identity, bounds, epochs, canonical order, and digest without
  contacting CelesTrak.
- `check:orbital-enrichment` validates exact current NORAD/name/designator/type
  identity, NASA/JAXA purpose and NASA image provenance, separately labeled
  Starlink service context, the co-located rights notice,
  immutable inventory, dimensions, bytes, and SHA-256 without contacting NASA.
- `preview:worker` builds the client and runs the actual local `workerd`
  runtime.

  The dynamic vessel-photo route is part of the same Worker/artifact as the
  frontend. `npm run preview:worker` exercises it; Vite's development server
  alone does not implement that API. It uses a fixed Open Waters endpoint,
  eight-second upstream deadline, 128 KiB response bound, no-store responses
  and no KV, Durable Object or credential. The browser API and Commons image
  hosts bypass the PWA shell. Rolling back the application version also removes
  the route/UI together while retaining the existing bundled fallback.

Plausible route lookup is enabled by default and uses the same direct static
data path in development and production. To exercise the disabled state:

```bash
VITE_FLIGHT_ROUTE_ENABLED=false npm run dev
```

The normal `validate` check runs lint, strict TypeScript, deterministic tests,
the Vite production build, and the Wrangler dry run. It makes no live provider
request and receives no deployment secret.

## Preparing trackstan.xyz

Issue #334 requested the new domain and a separately planned TrackStan
wordmark/name update, subsequently implemented under #354. The Worker has no
fixed origin IP to enter at GoDaddy.
The registrar can remain GoDaddy, but Workers Custom Domains need an active
Cloudflare full zone. Do not guess nameservers or point at arbitrary
Cloudflare/parking IPs.

The apex is now active and accepted; see the
[activation receipt](#trackstan-domain-activation-334). The procedure and
failed attempts below remain operational history, not outstanding setup.
Do not rerun parking cleanup against the existing denied DNS credential.

The owned Free full zone is active. Both authoritative `.xyz` servers
confirmed `ben.ns.cloudflare.com` / `nora.ns.cloudflare.com` at
`2026-10-05T23:16:45Z`. Protected read-first operation `37387870998` at main
`99baed2dece100f9066f31fecb215df26e781911` returned active status at
`2026-10-05T23:20:12Z`; Cloudflare and Google recursive resolvers also returned
the assigned pair. This resolves the earlier creation-POST `403` and subsequent
propagation wait without changing credentials. Active DNS is a prerequisite,
not proof that the application is already serving this hostname. #334 owns
binding and new-origin acceptance; #335 records the resolved prerequisite.

The observed account dashboard uses the left-sidebar **Domains -> Overview ->
Add domain -> Connect a domain** flow. This is not the Worker's separate
Domains tab or a registrar transfer; choose the Free plan and retain existing
DNS records. Use the actual assigned pair, not a documentation example.

The fixed `prepare-trackstan-domain.yml` workflow reads or creates only
`trackstan.xyz` using existing protected credentials. It requires exact current
main, successful exact-SHA validation, the production environment and the
production serialization group. It prints only the actual assigned
nameservers/status; by default it does not change DNS records. It never changes
registrar delegation, billing, Worker code/routes or credentials. A rerun reads
first and never automatically retries an unconfirmed create or deletion.

```bash
gh workflow run prepare-trackstan-domain.yml \
  --repo vasilyevstan/LiveTrafficStan --ref main \
  -f sha=<40-character-current-main-sha>
```

If access fails, report the actual HTTP failure rather than treating an
unauthenticated local CLI as proof that protected automation cannot work.
Cloudflare documents `Zone Zone Edit` or `Zone DNS Edit` for zone creation;
zone read access must also cover this account/domain. Keep credentials in the
protected environment, never in chat, source, artifacts or client variables.

The initial domain deployment `37390093186` uploaded application
`9de023048387c411ae9dc54f4ba9b4f8d2bc9066` and retained workers.dev/Cron, but
Cloudflare rejected the Custom Domain with **100117: externally managed DNS
records**. Successful trigger changes were not rolled back. The existing
origin passed the full exact-release smoke afterward; the new domain was not
declared live. Do not mistake this DNS conflict for a personal approval wait
or retry the same deployment without addressing its cause.

For this demonstrated conflict only, opt into `remove_parking_records=true`
on the same exact-main preparation workflow. It requires the existing active
owned zone, reads the complete apex record set, and removes only A records
whose contents exactly match `3.33.130.190` or `15.197.148.33`. Unknown A,
AAAA or CNAME records, malformed/incomplete discovery, or non-active state
abort before any deletion. The final read must confirm removal and unchanged
other apex records. No subdomain, MX, TXT, CAA, credential or account setting
is a deletion target. DNS Read/Edit access is necessary; an actual denial is
reported without extracting or broadening credentials. Then rerun the checked
deployment and new-origin acceptance.

The actual cleanup run `37392303605` failed DNS GET 403 before any deletion.
The owner instead removed the two exact parking records in Cloudflare DNS.
After authoritative confirmation, deployment `37417266192` succeeded without
rerunning the denied cleanup or changing token permissions. #350 is resolved.

The persistent binding in `wrangler.jsonc` targets only the apex and keeps
the existing Worker identity and workers.dev origin:

```json
{
  "workers_dev": true,
  "routes": [{ "pattern": "trackstan.xyz", "custom_domain": true }]
}
```

The production configuration generator preserves both settings in all six
valid orbital/Starlink/marine combinations. Cloudflare manages the apex DNS
record and certificate; no fixed IP, separate certificate subscription or
new Worker is required. The imported apex parking addresses were
`3.33.130.190` and `15.197.148.33`; after zone activation public DNS shows
Cloudflare proxy addresses instead. No apex MX, TXT, CAA or parent DS appeared
in the bounded checks. This is not a complete subdomain inventory: only the
requested apex is a binding target, and unrelated records remain untouched.
No `www` binding or redirect is included.

Deploy through the existing exact-current-main workflow with every currently
enabled application input preserved. Its existing workers.dev smoke remains
useful; separately run the same smoke against `https://trackstan.xyz` and
verify the actual new origin in normal Chrome, including marine WebSocket,
aircraft/vessel images, static assets and both orbital catalogs. Do not call
the new domain live until HTTPS and those new-origin checks succeed. A Worker
version rollback does not itself remove the Custom Domain; retain the domain
when restoring the compatible prior application.

Private history, permissions, preferences and installed apps are origin-local
and do not automatically migrate. Keep workers.dev available without a forced
redirect or history deletion. The separate TrackStan logo/name update
does not rename the repository or Worker.

References: [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
and [Create Zone API](https://developers.cloudflare.com/api/resources/zones/methods/create/).

## Smooth globe release boundary (#163)

Globe is a browser-only change. Retain the existing private aircraft relay,
photos, routes, curated orbital, Starlink and marine supplement inputs; it
adds no binding, credential, provider endpoint, catalog format or backend
migration. Use the normal checked dev-to-main and exact-current-main deploy
path, including atomic relay-secret delivery.

The pre-globe application/Worker receipt in #359 remains compatible rollback
evidence. Older code ignores the additive stored projection preference, but
its strict parser cannot use a new projection-bearing share fragment.
Rollback does not require clearing preferences, Home, private history or site
data. Record the actual application SHA separately from later docs/Wiki
commits in the [#163 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/163);
do not relabel earlier deployment or rollback evidence as this release.

## Sampled zoom-out context release boundary (#370)

The sampled hand-off is browser-only and uses the existing traffic sources.
It adds no provider request, service, binding, credential, data format or
preference/history migration. Preserve every enabled production input:
`artifact=application`, `aircraft_delivery=oci-private-relay`,
`aircraft_photo_enabled=true`, `flight_route_enabled=true`,
`orbital_catalog_enabled=true`, `starlink_catalog_enabled=true` and
`marine_supplement_enabled=true`.

The compatible predecessor is application
`c925546dc1d722658e4a80a3052dddd1d03ab824`, Worker
`66c72f1d-cb58-497d-87d4-8b3a8c9145bc`. Restoring it returns to the former
hide-all wide-view behavior without clearing user state or changing the live
100 km query contract. The
[#370 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/370)
records the actual deployed application/Worker, exact-SHA checks, real-provider
browser hand-off, normal installed-shell update and Wiki publication.
Documentation commits do not themselves replace that running application.

## Reviewed satellite context release boundary (#369)

Schema-2 enrichment manifest `2026-10-07-v1` is compiled display-only context:
nine unchanged official mission descriptions plus exact COSMOS 1953
community facts under Wikidata CC0. There is no metadata provider, key,
runtime request, new binding, catalog schema change or user-data migration.
The two NASA image bytes are copied unchanged into the new immutable
generation; all prior paths remain available. Preserve every production
input listed in the #370 boundary above.

The compatible predecessor is application
`14f5b2605170d0fbdb0721f6424f2dd940bb8098`, Worker
`cf2bab71-790f-4df1-86c7-b387006f08d6`. Rollback removes the additional
context/reference UI without clearing preferences, Home or private history.
The [#369 delivery receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/369)
records the actual application SHA, Worker version, exact-SHA gates,
browser/source-link acceptance and Wiki publication; this boundary does not
claim that a new rollback exercise occurred.

## Production environment and credentials

The GitHub `production` environment is restricted to the `main` branch and has
no personal approval gate for CLI-owned deployments. Exact technical checks
remain mandatory.

The protected environment supplies these secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the permanent Cloudflare account |
| `CLOUDFLARE_API_TOKEN` | Least-privilege token allowed to deploy this Worker, provision its SQLite Durable Object binding, and resolve/create its one dedicated orbital KV namespace when that feature is enabled |
| `AISSTREAM_API_KEY` | Private AISStream subscription credential, required only for enabled marine supplementation |
| `OPENWATERS_AIS_TOKEN` | Free personal Open Waters token, required only for enabled marine supplementation |
| `OPENWATERS_AIS_IDENTITY_PRIVATE_KEY` | Protected account identity/recovery material; never included in a Worker deployment or browser build |

Private relay bootstrap additionally requires Cloudflare Tunnel Write,
Connectivity Directory Admin, and Connectivity Directory Bind. The existing
token's effective permissions are verified by the protected bootstrap
workflow; a permission failure is reported rather than worked around.

The token is scoped to the selected account and Worker deployment. The
repository-level duplicate token was removed; deployment credentials remain
only in the protected environment. No value belongs in Git, issue text,
`VITE_*`, client JavaScript, or pull-request workflows.

The orbital namespace resolver uses the exact reserved title and fails if more
than one namespace matches. It never deletes or renames a namespace, lists or
mutates KV values, or adopts another titled resource. If the current token
lacks Workers KV Storage permission, activation stops and reports the
technical blocker.

There is deliberately no local production-deploy package script. Permanent
deployments must use the serialized checked workflow so exact-SHA, current-main,
environment, smoke, and rollback evidence stay attached to one operation.

Cloudflare documents an unauthenticated temporary-account path for agents, but
it requires user acceptance of Cloudflare's Terms of Service and Privacy
Policy, must be claimed, and is not the permanent production/CI account model.
LiveTrafficStan does not use that workaround.

## Exact object sharing operations

### Soft Earth night shading (#570)

This client-only refinement replaces the drawn day/night outline with one
locally generated, linearly sampled native image. It changes no production
input, provider, secret, sharing/D1 state, source admission, cadence, saved
preference or installation identity. The existing displayed-time/Pause and
ordinary zoom-fade owners remain. A rejected polygon-band candidate is
preserved in the [scoped native evidence](development-and-testing.md#soft-earth-night-shading-570).

The [delivery receipt on #570](https://github.com/vasilyevstan/LiveTrafficStan/issues/570)
records the exact checked application SHA, Worker version and actual public
acceptance; documentation commits do not establish a running release.
The #563 application/Worker below is the compatible historical predecessor.
Rollback uses the existing checked revert/version path, without migration,
new provider qualification, D1 change or orbital state reset.

### Shared orbital entry and Earth context (#563)

**Historical predecessor, published on 2026-10-24 at 13:09:11 UTC.** Checked #564, the necessary
zero-tree ancestry #566 and dev-to-main #565 deliver application
**`74f67dd8d5e59233979def5328145963c6d5875a`**, Worker
**`9d982778-647d-44e8-92ee-dd76247c582b`**, through successful serialized
[deployment 40096826810](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/40096826810).
Frozen feature `04e3be1d0bee50c71c4fdabcdd103edef5bffa16` and accepted tree
`fd121ac4e881f1964c2812b4a9690fc7af7c6525` remain exact. Feature/dev/ancestry/
updated-dev/promotion/main checks 40096173781 / 40096312359 / 40096479697 /
40096601985 / 40096604361 / 40096726705 pass. The unchanged strict backup-
origin smoke passes; no continuous whole-provider-health claim follows.

After original-dev CI passed, #565 was actually DIRTY/CONFLICTING in README
and the testing guide. #566 resolves only those conflicts with the accepted
bytes. The existing guarded merge immediately restores and deep-verifies
complete original dev/main rules and repository settings; no optional sync
or unchanged-source review is added. All ten production inputs, native
Space-Track, atomic protected secrets, serialization, persistent dev and
ownership/source/physical/retry fences remain. Sharing enable/UUID variables,
D1 identity/schema/caps and private reporting are unchanged; do not repeat
completed Free-account/D1 qualification for this client-only follow-up.

Actual public native acceptance completes at **13:14:36 UTC**. Light desktop
uses the actual 1200x1216 native window; Dark 315x517 is emulated touch.
Current **SL-14 R/B / NORAD 16882** creates one `201` link from the header arrow;
cached Copy adds no creation, and the selectable URL is available. One native
recipient `200` resolution activates session ORBITS from a saved-off preference
and opens exact current details without changing those saved bytes. There
are four ordinary cache-only catalog `200`s across sender/recipient, not GP
acquisitions; Share/Copy, Pause and Return add no catalog reads.
Explicit desktop Return and phone X retain that exact satellite after worker
resumption, with zero raw camera/handler/FOV/pitch-limit restoration errors.
Wide-Earth imagery shows the quiet boundary; captured displayed-time/shade
remains fixed while paused. The captured images do not establish a visible
terminator crossing; unchanged local visual coverage is reused.

The genuinely retained controlled predecessor loads new assets/time origin
through trusted ordinary **REFRESH APP**, preserving actual preference/history-
setting bytes, root scope/control, IndexedDB identity and history epoch.
Normal history-writer revision changes are not preference loss. No old tab
is fabricated, storage cleared, worker unregistered or accepted update repeated.
This is not physical-device/GPU/OS clipboard/keyboard, historical-row-content
or optical-accuracy proof. Independent expanded-phone #554 remains unaccepted
for the complete 120x120 map-space gate.

The compatible predecessor is sharing application
`479a03b96a3a5a1847c40d781f0325edc60356c8` / Worker
`0f7ce603-d149-4476-a8f5-58df3f293f84`, whose initial qualification/receipt
below remain historical. Use the existing checked application revert or
compatible version rollback; no preference migration, D1 reset/deletion or
GP state reset is required. Later documentation/Wiki receipts do not deploy
another application. [Measured evidence](development-and-testing.md#public-follow-up-and-genuine-installed-update-2026-10-24)
records the actual desktop dimensions and preserved observer limitations.

### Production activation and public acceptance (2026-10-24)

**Historical initial sharing release and compatible predecessor.** Application
**`479a03b96a3a5a1847c40d781f0325edc60356c8`**, Worker
**`0f7ce603-d149-4476-a8f5-58df3f293f84`**, was published by the successful
serialized exact-main [deployment 40082635395](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/40082635395)
at **09:38:06 UTC**. Both public origins identify that exact release.
Later canonical/Wiki documentation commits do not deploy another application.
The frozen feature is `e063ea5ef3c357ced8d937724f242b4218ed7da3`; its complete
accepted source tree remains `329efb8ebc5310cb0456f3b66ea93928dba14c4f`.

After the owner confirmed the account-access correction, protected
[setup 40081713255](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/40081713255)
passed at **09:23:13 UTC**: actual Free subscription, shared-account reserve,
D1 access/resource identity and real production-SQL read/write/storage
qualification. The qualified database is `livetrafficstan-object-shares`,
UUID **`e6d157a7-7c1f-43fa-a164-f0eb6e4c9fd3`**. Repository variables
`OBJECT_SHARES_DATABASE_ID` and `OBJECT_SHARING_ENABLED=true` were read back;
there were no production-environment overrides. Source defaults remain off.
Do not repeat the qualification workload against the now-live store merely
to reproduce its already accepted summary.

The earlier subscription-read HTTP 403 stops in runs 40049462583 and
40081433610 are historical zero-resource-write evidence, not a current
activation blocker. [#558](https://github.com/vasilyevstan/LiveTrafficStan/issues/558)
is resolved by the successful guarded operation; the exact cause of those
earlier denials was not established. No permission extraction, plan upgrade,
capacity bypass or new deployment input was used.

All ten deployment inputs were preserved: application, private OCI aircraft,
photos, flight routes, curated/Starlink catalogs, native Space-Track, marine
supplement and airport boards, with exact-SHA CI, production serialization,
atomic protected secrets and existing ownership/source/physical/retry fences.
The previous application `461b56ada8279372b35c01b3f787cd8142f5db4b` / Worker
`4c024bdc-caa7-4d1f-b2de-50630e5b89ad` remains historical rollback evidence;
the preferred sharing rollback below retains D1 for cleanup.

Actual public native-browser acceptance completed at **10:11:03 UTC**.
All three normal inspectors created links with `201`; cached Copy reused
them. Real root-token GET/HEAD handoffs returned uncached `302`, followed
by one native recipient resolution per document. Aircraft and vessel links
opened exact current details; the 315x517 orbital recipient deliberately kept
ORBITS off and displayed dated identity/source context with **zero catalog
requests**. Each saved point was hit-tested uncovered at its useful framing,
with one canvas, unchanged actual recipient preferences and native transport/
clock/worker. A genuine controlled predecessor used trusted **REFRESH APP**
without site-data clearing, preserving real preferences/history settings,
root control and the history database identity.

Public native resolution timings were **174.4-394.6ms**, not a future latency
guarantee. Three additional explicit HTTP receipt probes are recorded
separately; acceptance contributed three creations and six valid resolutions,
not six people. Sharing counts and top-object reports stay in the private D1
console below. Three native official Web Analytics POSTs returned `204` with
no relevant short-link token in their observed payloads; no custom share
events or new exact-host statistics-ingestion claim is made.
[Measured evidence and qualifications](development-and-testing.md#public-object-links-and-installed-update-2026-10-24)
and the [#553 receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/553#issuecomment-6378237652)
retain the local/public distinction and independent #554 limitation.

Sharing uses one reserved D1 database, **`livetrafficstan-object-shares`**,
bound as `OBJECT_SHARES` in the existing Worker. It is separate from orbital
KV/coordinator and marine/board Durable Objects. Source defaults are off.
No account, plan or credential permission is changed by setup or private queries.

First merge the checked default-off implementation and operations to current
`main`. Then dispatch the existing main-only protected workflow:

```bash
gh workflow run prepare-trackstan-domain.yml \
  --repo vasilyevstan/LiveTrafficStan --ref main \
  -f sha=<40-character-current-main-sha> \
  -f operation=object-sharing-setup \
  -f remove_parking_records=false
```

Despite the historical workflow name, sharing setup cannot run DNS or
parking cleanup. It retains exact-current-main validation, successful
exact-SHA CI, the protected production environment and the existing serialized
production-deployment concurrency group. Handle eligible CLI-owned gates
automatically; an approved wait timer is not a personal-approval request.

Setup reads actual account subscriptions, seven complete UTC usage days plus
partial today, D1 storage and database slots before provisioning. The existing
protected token needs the real operations it performs: Billing Read,
Account Analytics Read, D1 discovery/read and D1 creation/write. A denial is
an evidenced technical blocker, not permission to extract credentials, broaden
them silently, buy a plan or retry blindly.

The fixed reserve gate requires peak existing requests plus 2,100 sharing
successful-path invocations <=80,000/day; reads plus 100,000 <=4.5 million;
writes plus 10,000 <=90,000; current writes plus the 40,000 setup reserve
<=90,000; and storage plus 10MiB <=4GiB. It rejects an active non-Free or
ambiguous Workers plan. These adaptive estimates are not a live quota balance,
future traffic guarantee or abuse bound.

The exact reserved database name must be unambiguous. Setup creates the schema,
then qualifies a new/empty store using the real production SQL: 100 creations,
1,000 valid resolutions, 200 distinct still-valid modeled test links across
two days, and 6,000 aggregate rows. The fixtures use ancient days and are
removed in `finally`; no usable synthetic public link or current-day counter
is published. Actual D1 `rows_read`, `rows_written` and `size_after` must prove
the capped workload below 100,000 reads, 10,000 writes and 10MiB. Local SQLite's
simulated metering is not that proof. Inspect a failed operation/resource
before any repeat; do not reset a busy store or adopt unrelated resources.

Only after actual setup/headroom/metering passes, retain the returned UUID
and enable the repository deployment variables:

```bash
gh variable set OBJECT_SHARES_DATABASE_ID --repo vasilyevstan/LiveTrafficStan \
  --body <qualified-database-uuid>
gh variable set OBJECT_SHARING_ENABLED --repo vasilyevstan/LiveTrafficStan \
  --body true
```

The UUID is not a secret. The existing deployment workflow reads these values
for both browser and Worker; no eleventh dispatch input is added. Dispatch
the normal exact-main application deployment with **all existing production
choices preserved**, including native Space-Track, Starlink, marine supplement,
private aircraft, photos, routes and airport boards. A matching enabled
production configuration is dry-run before atomic protected-secret deployment.
No local privileged deployment or feature-branch account access is allowed.

The initial global UTC-day caps are 100 creations / 1,000 valid resolutions.
Captured-view sharing reuses these paths, binding and JSON record with the
optional orbital-only `view: "from-here"` discriminator. There is no schema
migration, new flag, cap/TTL change, account setup or separate view-statistics
category; creations/resolutions remain orbital operations. Deploy browser and
Worker from the same checked source. Older strict parsers can reject marked
records during rollback or in an older installed shell; this is an unavailable
link fallback, not permission to migrate/reset records or broaden validation.
Existing ordinary records remain compatible, and ordinary REFRESH APP updates
the shell without deleting preferences/history.

Daily caps plus rolling 24-hour validity permit about 200 active links and
200KiB payload across midnight, not a hard 100-active-record bound. The
2,100 successful-path invocation estimate includes creates, redirects and
resolutions. Unknown/malformed/expired requests, bots, repeat redirects and
new users' ordinary map polling add costs. One continuously active eligible
aircraft viewer can already make up to 4,320 requests/day. Free does not
mean unlimited visitors or a guarantee that abuse cannot exhaust account
availability; no paid upgrade or faster provider cadence is authorized.

Sharing statistics stay private in the **existing authenticated Cloudflare D1
console**. In Cloudflare, open Workers & Pages / D1, select
`livetrafficstan-object-shares`, and run these fixed read-only queries.
They return at most 30 UTC-day totals and the top 10 public kind/identifier
aggregates, ranked by links created:

```sql
SELECT date(day * 86400, 'unixepoch') AS utc_day,
       SUM(created) AS created, SUM(resolved) AS resolved
FROM object_share_statistics
WHERE day BETWEEN CAST(unixepoch('now') / 86400 AS INTEGER) - 29
              AND CAST(unixepoch('now') / 86400 AS INTEGER)
GROUP BY day
ORDER BY day DESC
LIMIT 30;
```

```sql
SELECT kind, identifier, SUM(created) AS created, SUM(resolved) AS resolved
FROM object_share_statistics
WHERE day BETWEEN CAST(unixepoch('now') / 86400 AS INTEGER) - 29
              AND CAST(unixepoch('now') / 86400 AS INTEGER)
GROUP BY kind, identifier
ORDER BY created DESC, resolved DESC, kind, identifier
LIMIT 10;
```

No reporting page, public admin endpoint, new reporting credential or automatic
reporting request is added. The proposed Actions report was removed before
publication: this repository's Actions output is public even when running a
job requires a protected approval. Setup summaries contain only Free/reserve
check results and synthetic qualification measurements, not account usage,
object counters, identifiers, tokens, positions or visitors.

Created means committed links, not sent messages; resolved means admitted
valid API responses, not people or rendered selection. A canceled HTTP request
may still have committed storage work. Public identifiers are sender-supplied
and may be reassigned. Native Web Analytics remains separate and has no custom
sharing events. Console reporting is optional and cannot hold accepted links
hostage.

Rollback sets `OBJECT_SHARING_ENABLED=false` and uses the same checked
deployment while **retaining `OBJECT_SHARES_DATABASE_ID`**. New actions/APIs
are disabled; root handoff/ordinary-map fallback and bounded cleanup remain.
The existing orbital Cron also cleans sharing; if orbital acquisition is off,
configuration adds `47 * * * *` for cleanup. Expiry is enforced even if deletion
is delayed. Removing the binding or restoring an older pre-feature Worker
also stops that cleanup; document it explicitly rather than promising erasure.
Do not delete the database, reset counters, restore D1 Time Travel, or change
provider state as routine rollback. See [active versus backup retention](data-sources-and-licensing.md#public-object-links).

## Private aircraft transport bootstrap

`.github/workflows/bootstrap-aircraft-relay.yml` creates or verifies exactly
one remote-managed Tunnel and one HTTP VPC Service fixed to
`127.0.0.1:8788`. It is serialized, runs only from exact current `main`, uses
the protected `production` environment, and fails if a same-named resource has
different configuration.

The workflow never publishes the Tunnel token. A caller supplies an ephemeral
RSA public key; the workflow encrypts the token with RSA-OAEP/SHA-256 and
uploads only ciphertext in a one-day artifact. The private key and decrypted
token remain outside GitHub. The repository-owned cloudflared installer reads
the token from standard input and stores it in a root-created `0400` file owned
by the dedicated tunnel user. Full key preparation, installation, canary,
failure interpretation, and cleanup are documented in
[OCI Aircraft Relay](oci-aircraft-relay.md).

## Exact-SHA deployment

`.github/workflows/deploy-production.yml` is manually dispatched only after the
source is present on the default `main` branch:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=oci-private-relay \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true \
  -f orbital_catalog_enabled=true \
  -f starlink_catalog_enabled=true \
  -f marine_supplement_enabled=true \
  -f airport_boards_enabled=true
```

The workflow:

1. requires its workflow ref to be `main`;
2. validates the SHA format without evaluating it as shell code;
3. checks out exactly that SHA;
4. fetches `origin/main` and requires exact equality;
5. fails closed if either Cloudflare credential is absent and, for private
   relay mode, if the protected relay authentication secret is absent or too
   short;
6. validates the committed orbital bootstrap and exact-NORAD NASA enrichment
   manifest/assets without network access;
7. builds the browser with the fixed aircraft-delivery choice plus the
   requested aircraft-photo and plausible-route flags;
8. reruns install, lint, type-check, all tests, build, and the normal
   credential-free Wrangler dry run;
9. when orbital acquisition is enabled, resolves or creates exactly one
   reserved KV namespace;
10. generates and dry-runs the exact Wrangler configuration with either one KV
    binding, one SQLite Durable Object coordinator, and one Cron, or none of
    those orbital resources;
11. re-fetches and rechecks current `main` immediately before deployment;
12. serializes production operations without canceling an in-progress deploy;
13. updates the private Worker secret only when
    `aircraft_delivery=oci-private-relay`;
14. deploys Worker code, exact VPC/KV/Durable Object bindings, trigger state,
    delivery mode, and Static Assets;
15. passes the source SHA as `RELEASE_SHA`;
16. runs the bounded production smoke;
17. records the URL, SHA, aircraft-delivery mode, orbital state/KV namespace,
    route-enabled state, and result in the workflow summary and GitHub
    deployment.

Aircraft delivery is an explicit per-deployment choice:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=worker-proxy \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true
```

`worker-proxy` is the rollback/diagnostic mode that uses shared Cloudflare
egress. `oci-private-relay` keeps the same browser URL and uses the exact
checked VPC Service ID in `wrangler.jsonc`. It requires
`AIRCRAFT_RELAY_AUTH_TOKEN` only in the protected `production` environment;
the workflow writes it to a mode-600 temporary JSON file, passes that file to
the same exact-source `wrangler deploy` through `--secrets-file`, and removes
the file in an `always()` cleanup. It does not run a separate
`wrangler secret put`, so deployment remains valid when a recorded older
Worker version is active after rollback. The secret is never exposed through
a `VITE_*` value, repository variable, command argument, or log. The Worker
adds that bearer credential only to its newly constructed relay request.
Browser cookies, authorization, forwarding headers, and client IP are not
copied. Missing private configuration returns local `503 Retry-After` and
cannot fall back to shared egress.

`adsb-lol-direct` sets the fixed browser endpoint to
`https://api.adsb.lol`; it does not accept a caller-supplied URL. Do not
dispatch direct mode until the provider has approved it and a bounded check
proves that successful and throttled responses permit the production origin.
If the direct CORS smoke fails after deployment, restore the recorded prior
Cloudflare version or redeploy the accepted SHA with `worker-proxy`; do not add
a public relay.

Aircraft-photo activation is an explicit per-deployment choice:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=worker-proxy \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true
```

This flag contains no credential and changes only the browser bundle. Use
`true` only after reviewing the current Planespotters terms and with a bounded
exact-origin browser check ready for the deployed URL. The published
low-volume browser path requires no API key, email, membership account, or
prior provider contact. The photo surface must remain public and free. If the
check cannot read the API response or render the direct
thumbnail/link/credit contract, immediately redeploy the same accepted SHA
with `aircraft_photo_enabled=false`; do not add a proxy or rewrite provider
URLs.

If a newer pull request reaches `main` while an older manual deployment is
validating, the second equality check fails rather than silently promoting the
older SHA.

## Local map tools production acceptance, 2026-10-16

Focused #475/#476/#477/#478 and checked dev-to-main #479 publish application
**`306bb692b812c194d332bed2b190367e931f17a6`**, Worker
**`4255f6bc-6bc4-46e8-a0be-72fddb9805a6`**, through serialized deployment
**`38871737916`** at **08:09:52Z**. Exact promotion/main Validation
`38871401504` / `38871581875` passed. No ancestry repair, merge exception,
protection change or eligible pending environment approval was needed.
Persistent dev and disabled automatic merged-branch deletion remain intact.

Publication succeeded, but the immediate smoke failed the orbital response's
release-SHA assertion. The failed Action/log remains evidence, not a successful
deployment job. Both subsequent full strict-origin smokes passed against the
unchanged source and inputs. No assertion was weakened and no redeploy,
provider override or infrastructure change followed; the specific transient
mismatch mechanism remains unknown.

Assets are `index-DNAs5cZj.js` / `index-D8ShBdFB.css`, installed shell
`805094e97765618b154a` (11 URLs / 3,666,988 bytes). All prior private-aircraft,
photos/routes, curated/Starlink, marine and airport-board choices and atomic
credentials remain enabled. The unchanged immutable OCI relay remains
**`b54962f3cce89ea4757e4b47c829b895ebadc863`**; this browser/domain-only
release required no relay activation, admission reset or credential change.

The genuine predecessor's normal **REFRESH APP** at 08:14:57-08:15:00Z
retained exact raw native-saved preferences, root SW/controller and history
database identity/version, not historical observation-content proof.
Seven deployed native checks plus a narrow non-Home C confirmation pass
the changed desktop/short-phone Light/Dark behavior on one vector map.
Required local gates passed 197 suites / 2,022 tests and all mandatory
lint/typecheck/data/build checks. The precise measured geometry, provider
snapshot and browser qualifications are in
[testing](development-and-testing.md#local-map-tools-shared-production-acceptance-470-473).

Compatible rollback is the accepted predecessor application/relay
`b54962f3cce89ea4757e4b47c829b895ebadc863`, Worker
`0b4841f3-8321-4c7e-9567-72f47dd6bf57`, through the existing serialized
rollback workflow with every production input preserved. There is no
preference/history migration or new backend contract. No extra rollback drill
or documentation redeployment is required. Later canonical receipt commits
and Wiki publication are not the running application SHA.

## Mobile workspace and lookup release boundary (#449)

This release keeps the existing Worker, Static Assets and private aircraft
transport. Fixed same-origin POST `/api/find/aircraft` and `/api/find/ships`
need no new binding, secret, account, cache, service or scheduled work.
Anonymous Open Waters ships are identity-only with original credits; aircraft
exact identifiers use the same selected delivery transport. The protected
deployment must preserve private relay, photos, routes, curated/Starlink,
marine supplementation and airport boards.

Before publishing the browser's aircraft lookup, install the checked exact
main relay source through the existing immutable/checksummed
`deploy-release.sh`. Verify its exact provider-free health, expected service
and prior release, without reading/exporting credentials. Preserve the same
stable egress identity and persistent admission file: point and identifier
work share one in-flight/20-second/Retry-After boundary. The old Worker remains
compatible with the extended relay's point route during this ordering.
Do not open a public relay, extract secrets or use a direct fallback.

After exact-SHA CI and serialized deployment, measure the actual phone
task/selection behavior and one ordinary installed update. Verify explicit
lookup on the fixed POST URL, identity-only ships, qualified original aircraft
position time, shared admission and unaffected ordinary reception; report
source Busy/failure honestly rather than retrying until a chosen result appears.
Reuse accepted unchanged source/UI evidence, not an extra whole-app audit.

There is no presentation/query/history schema migration. Rollback restores the
accepted predecessor Worker/Static Assets through the existing checked path;
that predecessor continues to use the compatible point route on the extended
relay. Restoring the older relay is optional only after the old browser/Worker
contract is active, without clearing admission state. Cached/open new shells
may remain until ordinary refresh and must receive a truthful lookup error,
not a fabricated result. Record running application/relay identities separately
from later documentation-only receipts and publish/verify the matching Wiki.

## Mobile workspace and lookup production acceptance, 2026-10-15

#465 and checked dev-to-main #466 deliver application
**`b54962f3cce89ea4757e4b47c829b895ebadc863`**, Worker
**`0b4841f3-8321-4c7e-9567-72f47dd6bf57`**, through serialized deployment
**`38663282368`** at **01:02:12Z**. Exact feature/dev/ancestry/final-dev/
promotion/main Validation `38661874237`, `38662066131`, `38662475648`,
`38662691396`, `38662699026`, `38662956655` passed. Both production origins
passed strict exact-release smokes. CLI inspection found no eligible pending
environment gate; no safeguard or wait timer was bypassed.

One real documentation-history conflict required tree-neutral #467.
Pre-feature dev exactly equalled then-main; the resolved/merged tree exactly
matched accepted `820f7c5e8ae60b140d11d94d9bcb7fa895ddb796`.
The sole dev merge-method exception was immediately restored/deep-verified;
main safeguards and repository settings stayed unchanged, including disabled
automatic branch deletion. No unchanged-source specialist review was repeated.

Before Worker publication, the existing OCI Run Command path activated the
same exact-main relay from checksummed immutable files. Relay SHA256 is
`9c040027124c0f69927b00ddf4c6f90031f9d56124ac25ec7a5c23254331428f`.
Its expected previous release is
`18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8`. Exact health and both services
passed; admission remained byte-identical
`{"nextAllowedAtMs":1792026010821,"failureCount":0}` and the maintenance
timer remained disabled/inactive. Two startup connection-refused checks were
followed by the deployment script's successful exact-health check; the
physical operation completed with exit 0. No provider request, auth export,
identity change, new resource or admission reset was part of this activation.

The genuine old-shell **REFRESH APP** at 01:03:33-01:03:37Z loaded
`index-DZq1uJMn.js`; CSS is `index-BrInOiYK.css`. Raw native-saved preferences,
root install/controller identity and history database name/version remained;
this clean profile does not establish historical observation-content retention.
Seven production cases, including four short-phone/theme combinations,
same-body Details/Back, two attributed identity-only ship matches and one
qualified real aircraft lookup/navigation, pass with native input and one
map. The 315x517 selected/task union is 61.24%, useful body 160px, with a
120x120 unobscured hit-tested map region. Original clocks, partial/empty
semantics, failed observer receipts and exact browser limits are retained in
[testing](development-and-testing.md#mobile-workspace-and-scoped-discovery-449).

All existing production inputs and atomic credentials remain enabled. The
compatible predecessor is application
`40486a29b5e15ea3be6c0b9fd06180cd68743e2f`, Worker
`24cfe6e4-7b15-4f04-a051-6bfe585ca6d7`; use the canonical serialized rollback
workflow without resetting state. The extended relay remains point-compatible.
No new rollback drill or documentation deployment was performed. Later
receipt-only commits and Wiki publication are not the running application SHA;
#449 records final public byte verification separately.

## Native workspace fullscreen release boundary (#434)

This is a browser-only workspace action, not a Worker, provider or deployment
mode. The standard API owns entry/exit; there is no new secret, endpoint,
binding, dependency, data asset, persistent schema or user-data migration.
Preserve all current enabled production inputs: application artifact,
`oci-private-relay`, aircraft photos, plausible routes, curated orbits,
automatic Starlink sample, marine supplementation and airport boards.

The compatible predecessor is application
`2748f4dbd0cce5ad71b295ee25973ebddbf02907`, Worker
`0d847e8a-c8d4-435a-8e0b-77cc7f80cae9`. Rollback removes the fullscreen
action without altering saved preferences/history or provider infrastructure.
No new rollback drill or production machinery is required for this slice.
The actual checked promotion, deployed application/Worker, strict smokes and
normal installed update are recorded below. Documentation-only commits and
Wiki publication are not another application deployment.

## Native workspace fullscreen production receipt (2026-10-11)

Implementation #435 and checked dev-to-main #436 deliver application
**`96a71b9ce6959e3df7bcddb34b6401f6dee47929`**, Worker
**`2c9aed04-3e82-4fef-8154-ac52ea6e2d03`**, published at
**2026-10-11T13:39:19Z**. It serves `index-CNbqw4Sm.js`,
`index-BQuWWmR1.css` and shell `0e0c9a6c27f167155e96`. Later canonical
receipt/Wiki commits are documentation-only, not the running application SHA.

Accepted implementation `e8e3f8b5ffb43d11d96efa78b1962e16f397daa2`,
final dev `f535d46736453a4adfbd12e620ab1a44278f15c0` and main have the same
complete tree `f28a524f0e9d8987a3cae8a1286f103e94542f80`.
Feature/initial-dev Validation 38143156406 /38143326003 passed.
The one demonstrated hosting-documentation squash-history conflict required
tree-neutral #437, exact-head Validation 38143616199. Its sole dev
merge-method exception was immediately restored at 13:34:45 UTC; original
configurable dev/main safeguards and repository merge/deletion settings
were verified by deep equality. Exact-new-dev and actual release-PR
Validation 38143734970 /38143739102 passed, followed by
[exact-main Validation 38143846768](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38143846768).

Serialized [deployment 38143961058](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38143961058)
and its workers.dev strict smoke passed. The unchanged full strict smoke
also passed on trackstan.xyz. All production inputs remain enabled:
`artifact=application`, `aircraft_delivery=oci-private-relay`, aircraft
photos, plausible routes, curated/Starlink catalogs, marine supplementation
and airport boards. Exact-current-main checks, atomic protected secrets,
production serialization and persistent dev remain unchanged. There was no
cosmetic redeployment, provider/credential change or new rollback exercise.

The feature uses the standard native Fullscreen API on the existing
app-shell: Settings / View entry and a reachable 44px contextual Exit beside
Reset north, including HISTORY/captured paths. No CSS imitation, automatic
entry/reentry, vendor-prefixed layer, persistent field, seventh dock slot,
orientation/keyboard lock, new provider, Worker route/binding, data asset,
dependency or camera/resize controller. Ordinary MapLibre resize can change
the full-canvas footprint, counts and valid selection; the existing 100km
eligibility, cadence/backoff, marine connections and orbital deadlines remain.

Required local gates passed **178 suites /1,624 tests**, lint/typecheck,
four network-free data checks and production-input build. Qualified local
Chrome 155 evidence covers ten Light/Dark desktop/mobile/short/landscape
layouts, 30 open-panel checks, four historical inspectors, captured path/
immutable Return, two pitched/rotated dateline globe views, real map drag,
native API exit, actual entry rejection and synthetic exit-failure recovery.
The focus/short-landscape defects were corrected together. Failed observer
selectors/Escape attempts and nominal magnification are preserved, not
relabelled successful. See [the testing receipt](development-and-testing.md#native-workspace-fullscreen-434).

At **13:40:36-13:40:46 UTC**, ordinary installed **REFRESH APP** replaced
`index-2lX6Irkf.js` with the final deployed script, preserving raw preferences,
history settings/database identity and root scope/controller. Actual Light
390x568 touch and Dark 1280x900 Space entry/exit asserted app-shell
`fullscreenElement`, unchanged raw camera, one vector canvas, hit-testable
44x44 Exit and focus return to the visible Settings summary. Native
fetch/WebSocket/clock, zero orbital reads and zero runtime exceptions passed
without response fixtures. The visible PARTIAL provider state is retained.
Explicit focus/device emulation is not physical-device or OS-hidden proof.
Physical Escape remains untested after macOS denied scoped keystroke input
(1002); standard `document.exitFullscreen()` is proved. Chrome's native
entry resets actual pre-entry page scale 2 to scale 1; no 2x-inside-fullscreen
or application counter-scaling claim is made.

The compatible rollback is the compass application
`2748f4dbd0cce5ad71b295ee25973ebddbf02907`, Worker
`0d847e8a-c8d4-435a-8e0b-77cc7f80cae9`, with the same enabled inputs.
The [#434 receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/434)
records final canonical/Wiki identities and public byte verification
separately. The compass receipt below remains historical/rollback evidence,
including its failed immediate aircraft smoke and later unchanged acceptance.

## Compass reset north production receipt (2026-10-10)

Implementation #429 and checked dev-to-main #430 delivered the historical
compass application **`2748f4dbd0cce5ad71b295ee25973ebddbf02907`**, Worker
**`0d847e8a-c8d4-435a-8e0b-77cc7f80cae9`**, published at
**2026-10-10T20:43:13Z**. It serves `index-2lX6Irkf.js`,
`index-Cnzw5_2m.css` and shell `a19609ab669c520d5b30`. Later receipt/Wiki
commits are documentation-only, not another application deployment.

Accepted implementation `64f64efac9f3c6290f3dbe010aeebad3787cf730`,
dev `e0d5e59f93964a1f23eeafb834d308add4d6a655` and application have the
same tree. Feature/dev/release-head Validation
38084430995 /38084553059 /38084615840 and
[exact-main Validation 38084708449](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38084708449)
passed. No ancestry synchronization, protection change or new release
machinery was needed for the application promotion.

[Deployment 38084765704](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38084765704)
**published successfully but the Action failed**: its immediate strict smoke
received private-aircraft `504`. The installed predecessor had already
produced `200`/`503`. Both subsequent **unchanged full strict smokes** passed
at the exact application SHA: workers.dev at 20:44:35 UTC and trackstan.xyz
at 20:44:54 UTC. There was no redeploy, relaxed assertion, credential change
or provider/infrastructure fix. Preserve the failed Action and partial state;
this is not an uninterrupted aircraft-availability claim.

The feature is a contextual 44px N/needle beside Center, using a wrapped
settled 1-degree tolerance and native bearing-only reset: 250ms, or immediate
under reduced motion. It preserves actual center/zoom/pitch/projection,
HISTORY, valid selection, captured path and saved Return camera. A historical
mobile inspector temporarily reserves its incumbent 70px hidden dock row,
with measured 17px clearance and full row recovery after reset. It adds no
provider, Worker route/binding, secret, dependency, preference/schema,
persistence, location lookup or camera scheduler.

Required local gates passed **177 suites /1,601 tests**, lint/typecheck and
four data checks/build. Accepted local six-layout, keyboard/reduced-motion,
2x, pitched globe/dateline/high-latitude, HISTORY/path/Return, map-drag and
supersession evidence is retained. The final four historical mobile views
kept their 44px X, centered selection and 152/101px body scrollers. Rejected
overlap and observer recording/numerical/resume findings are not relabeled
successful; see [the testing receipt](development-and-testing.md#contextual-compass--reset-north-428).

The genuine installed **REFRESH APP** began at 20:45:30 UTC, replacing
`index-BGCLjay2.js` with the accepted script while preserving raw preferences,
history settings/database identity and root install scope/controller.
After that completed update, an open native credits disclosure obstructed
observer theme setup. The observer's own subsequent Flat setup was restored
through normal trusted Auto globe input, strictly rechecked against baseline,
and only remaining chapters resumed; no storage edit or second update.
At **20:50:25-20:50:31 UTC**, actual Light 390x568 touch and Dark 1280x900
Enter resets reached bearing 0, with exactly unchanged center/zoom/pitch,
Auto globe, one vector map and canvas focus. Native transport/clock, zero
orbital reads and zero runtime exceptions passed. Explicit focus/device
emulation is qualified, not physical-device or OS hidden-state proof.

Every prior production input remains: `artifact=application`,
`aircraft_delivery=oci-private-relay`, aircraft photos, flight routes,
curated/Starlink catalogs, marine supplementation and airport boards enabled.
Atomic secrets, serialization and exact-current-main checks remain.
The compatible rollback is prior application
`d9fb33b00a9ce0e73123b7fe3d0b4c512ec30e47` /
Worker `7dd064d4-f151-431e-8db7-6bf7772bc104`, with the same enabled inputs.
No additional rollback drill or storage/install migration is claimed.

Canonical/Wiki publication is independently verified documentation-only work.
The [#428 receipt](https://github.com/vasilyevstan/LiveTrafficStan/issues/428)
records its later exact SHAs and public byte verification. The earlier
receipts below remain historical and compatible rollback evidence.

## Compact-inspector production receipt (2026-10-10)

Implementation #421 and checked promotion #422 delivered the compact fixed
identity/action header, corner-attached 44px X, full-width body scroller,
purposeful two-line default summaries and north-up Show path. That initial
application **`62826ef1240c5ee9b17001ceea7862f4a05f433f`**, Worker
**`f7da9464-241d-4f26-9a1c-2eace0d72dde`**, passed exact-main Validation
38044559178 and deployment 38044668781. Its real installed update and
MEGASTAR inspector/photo/path acceptance passed, but the retained production
report found two previously untested three-line explanations. Do not
represent that first copy check as successful.

Focused #423, the necessary tree-neutral #425 and checked promotion #424
deliver final application **`d9fb33b00a9ce0e73123b7fe3d0b4c512ec30e47`**,
Worker **`7dd064d4-f151-431e-8db7-6bf7772bc104`**, published at
**10:44:52 UTC**. It serves `index-BGCLjay2.js`, unchanged
`index-vg9GFLql.css` and shell `c303246264f4bac339f0`.
[Exact-main Validation 38045829573](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38045829573)
and serialized [deployment 38045908660](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38045908660)
passed. Both origins passed the unchanged strict-SHA smoke.

Accepted implementation `84bdc2aee804acb3d6fad3fac4aa64cf8bcdb919`,
original dev `9f6d79d03b273984ddc9e7b300634b6f6a3cbaf3`, ancestry head
`e02c0ce47a22c1e6b3fcb6a9955c86c8838ea964`, final dev
`159770d7b2a6d3a5bce1feae422e12ebc263637a` and final application have the
same tree. Correction/original-dev/ancestry/final-dev/promotion Validation
38045472135 /38045530151 /38045675944 /38045747678 /38045750258 passed.
The one actual testing-guide history conflict required #425. Its narrowly
guarded dev merge-method exception was restored and deep-equality verified
in finally, preserving every other protection and repository setting.

Local required gates passed **176 suites /1,573 tests**. The accepted
36-layout, 104-copy-view, whole-photo, 2x and disclosure/map-drag evidence
remains valid for unchanged core source. Retained GPT-5.5 resolved the
layout/camera findings and then only the newly invalidated copy delta;
unchanged provider/lifecycle reviews were not repeated.

Actual acceptance is split by source and requirement:

- **10:25:56 UTC, initial compact application:** six real MEGASTAR
  (MMSI 276829000, IMO 9773064) Light/Dark desktop/mobile inspector and
  whole-photo layouts, persistent X, scrolling/Escape/focus and 2x passed.
  Show path changed bearing **38 -> 0**, and Return restored the original
  center, zoom and bearing. One received-history GET, three bounded Portnet
  reads and one graph asset returned 200 on explicit capture. Six captured
  resize/theme views reused the snapshot without refetch/refit. This is not
  a complete-voyage or real-aircraft-route claim. The 72-copy-view check then
  correctly failed on ORBITS-off and manual-location help.
- **10:46:20-10:46:36 UTC, final correction:** a genuinely new ordinary
  REFRESH APP changed `index-aG8-cFcZ.js` to `index-BGCLjay2.js` in the
  retained installation. Raw preferences/history settings, database and root
  install identity remained equal. Twelve native copy views at 1280x900,
  390x568 and 315x517 in Light/Dark passed: the two hints use one line at
  298/300px and exactly two at 223/225px. Full sample limits remained
  accessible with trusted disclosure input; no curated/Starlink or journey
  request occurred. No application/browser exception was collected.

Native renderer, fetch/WebSocket/clocks and trusted input are distinguished
from callback selection, local fixtures and explicit focus emulation; no
physical-device or new native-hidden guarantee is claimed. A current-document
aircraft 503 remained visible; later strict smoke passed. Uninterrupted
provider availability is not claimed. Release-header evidence is scoped to
the post-update document, retaining predecessor-document responses rather
than confusing them with current-source acceptance.

Every production input remains enabled: OCI private aircraft delivery,
aircraft photos, plausible routes, curated and Starlink catalogs, marine
supplementation and airport boards. There is no provider, dependency, secret,
binding, migration, persistence or scheduler change. The compatible immediate
rollback is the accepted `62826ef...` / `f7da9464...` predecessor; the earlier
depth application/Worker below remains a historical rollback milestone.
Use the existing guarded workflow and unchanged inputs; no new rollback
drill or user-data reset was performed. Later documentation/Wiki commits
do not redeploy or replace this running application.

## Modeled-depth production receipt (2026-10-10)

This is the earlier depth milestone; the current refinement is recorded above.

Initial implementation #413 and release #414 introduced depth context.
The bounded real-source check then found and corrected GEBCO's one-pixel
virtual-image query through #416 and checked promotion #417. Final application
is **`7e0b4954740cee10875e617ba206af5c6ecbe791`**, Worker
**`afd0d208-3d5e-42ca-af68-19b4fd357432`**, published at
**03:42:39.462 UTC**. It serves `index-BKn_3kdg.js`,
`index-BXOYQznj.css`, shell `ce842a2282cfc65f42bd`.

[Exact-main Validation 38021389170](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38021389170)
and serialized [deployment 38021460033](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38021460033)
passed; both production origins passed the unchanged strict-SHA smoke.
Reviewed correction `aeacc104ec2fcb81d19edb95e6cef076f6b05d47` and checked dev
`acb75a09e8fa9e06d004bac3a63ce7c5b81c9d8d` have the same accepted tree.
Correction/source/ancestry/dev/promotion checks 38021013451 /38021128049 /
38021254952 /38021295941 passed. Local gates passed 176 suites /1,567 tests,
lint/typecheck, required data checks, production build and secret-free dry run.

GPT-5.5 accepted the scoped UI/map source and native evidence; Claude Opus
4.8 accepted provider/privacy/bounds/lifecycle and the narrow GEBCO correction.
The one real initial hosting-guide ancestry conflict required tree-neutral
#415. The correction's four real history conflicts were resolved inside
#416, not another workstream. Both necessary dev merge-method exceptions
were immediately restored and equality-verified in finally paths, preserving
every other rule and repository setting. No unchanged-source review repeated.

Actual production acceptance is deliberately split:

- **03:19 UTC, initial depth application:** normal REFRESH APP preserved raw
  preferences/history/database/install identity. Actual matched imagery and
  EMODnet JSON/`atlas_land` values passed six Light/Dark desktop/mobile
  layouts plus 2x magnification, with 6 /3-4 /1-2 rendered labels, 44px depth
  targets/map strip, one map and separate orbital ownership. Twelve regional
  value responses covered approximately 58-92m. Its global check exposed the
  real defect rather than being relabeled successful.
- **03:45 UTC, corrected application:** another genuinely new normal update
  preserved the same raw state. Six 3x3-center, single-feature GEBCO requests
  produced six rendered Monterey values, **57-2,037m**, with one map,
  water-only shading and at most two simultaneous value reads. No board or
  geocoder request occurred. The later same-camera Center/global/Center
  assertion passed without another update or source change.

The corrected observer's final pixel assertion included six predecessor
1x1 requests before the update. Its raw failed report and successful
new-document measurements are retained together. Completion restored the
recorded viewport after CDP detach; a changed/collision-placed label count
and one normal additional cell read are not fixed-count/zero-request
guarantees. No application JavaScript exception was recorded in either
original production window. Native transport/renderer/clocks and trusted
inputs are distinguished from explicit focus emulation, not physical-device
or fresh native-hidden-state proof. See the [acceptance record](development-and-testing.md#modeled-water-depths-412).

The depth slice changes browser source/UI/preferences and the static
origin-specific CSP only. It adds no Worker route, binding, paid source,
credential, database migration or deployment input. Preserve
`aircraft_delivery=oci-private-relay`, aircraft photos, plausible routes,
curated orbital catalog, Starlink, marine supplementation and airport boards
when deploying the exact checked main SHA.

The immediate predecessor was initial depth application
`f7e1caff624f2400f8d93382eae7af659bf7a870`, Worker
`75cee82a-3388-442b-9655-d59a305e45ab`, deployment 38019922975; it has working
regional depths but the documented global-query defect. For complete depth
removal, the compatible journey predecessor is application
`dc1144f182408687ff3fb06249b3c66398e57f74`, Worker
`0253b0ed-57f5-4cac-b85f-1e1708a9b307`. The existing protected exact-version
rollback removes depth UI/requests without changing Home, private history,
the installed identity or backend capabilities. Older code ignores the new
preference and can drop it on a later normal preference save; returning to
the new version then uses default-on if the field is absent. No new rollback
exercise is claimed by this boundary.

Keep the following journey receipt as historical/rollback evidence. Later
canonical/Wiki documentation commits do not redeploy or replace the running
application SHA above. Local replay fixtures remain separate from these
actual-source milestones.

## Captured journey production receipt (2026-10-10)

Implementation [#407](https://github.com/vasilyevstan/LiveTrafficStan/pull/407)
and checked promotion [#408](https://github.com/vasilyevstan/LiveTrafficStan/pull/408)
deliver application **`dc1144f182408687ff3fb06249b3c66398e57f74`**.
Reviewed source `abf36a02fbfb06cbd3235eaec38bc615eea4fd4e` and dev
`7aec342fe722cfcca2c8d64e49decccd486290a1` had identical trees.
Feature/dev/promotion Validation 38013371897 /38013482982 /38013514985 and
[exact-main Validation 38013588767](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38013588767)
passed. No ancestry repair or protection exception was needed.

Serialized [deployment 38013676975](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38013676975)
passed and reported Worker **`0253b0ed-57f5-4cac-b85f-1e1708a9b307`** at
**01:35:18.396 UTC**. Both origins passed strict-SHA smoke. Production serves
`index-62M7Yu4v.js`, `index-G89IhxQ2.css`, shell `f39708f7820a3d662081`.
Every existing private-aircraft/photo/route/orbital/Starlink/marine/
airport-board input remains enabled. There is no new secret, binding,
dependency, migration or live polling path.

Normal **REFRESH APP** and real-provider acceptance at **01:37:17-01:37:31
UTC** preserved raw preferences, history/database and installed-app identity.
One AURELIE capture made one anonymous Open Waters history GET and one
Portnet GET, both `200`, rendering 53 received points in ten separate
observed segments. Unknown endpoints, old/inconsistent Portnet chronology
and gaps remained explicit; no graph request or invented ship connector was
made. Six Light/Dark desktop/mobile captures reused that snapshot without
refit/refetch, retained the 44 px X and one map, reached credits after scrolling,
and returned to the saved local camera. Aircraft `200` provided one object
without an eligible airline callsign; this window does not prove a real
aircraft journey. No airport-board or geocoder request occurred.

The [testing record](development-and-testing.md#captured-journeys-406)
separates actual production data from twelve local aircraft/ship fixtures,
globe/dateline/polar, rotation, cancellation and orbital/Home evidence.
GPT-5.5 and Claude Opus 4.8 resolved their scoped findings; all required local
gates passed with 171 suites /1,535 tests. Native renderer, transport/clocks
and trusted controls are distinguished from callback selection and explicit
focus emulation, not physical-device or native marker-picking evidence.

The compatible predecessor is application
`66743c394f6f89d613f6b06d373180435736db70`, Worker
`0ebf42fc-4ee2-428b-9496-a374f4422408`, recorded below. Preserve all inputs and
atomic secrets for the existing exact-version rollback; no new compatibility
baseline or rollback exercise was needed. Later canonical/Wiki receipt commits
do not redeploy or replace the running application. Default-on water depths
remain separate approved work, not delivered by this release.

## Persistent inspector close production receipt (2026-10-09)

This is the historical predecessor to the captured-journey release above.

Implementation [#401](https://github.com/vasilyevstan/LiveTrafficStan/pull/401)
and checked promotion [#402](https://github.com/vasilyevstan/LiveTrafficStan/pull/402)
delivered application **`66743c394f6f89d613f6b06d373180435736db70`**.
The accepted source was `0eb3b06acc45111810dfb87339a4db21754f4b5c`;
feature/dev/promotion Validation 38005560248 /38005745687 /38005848882
and [exact-main Validation 38006039275](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38006039275)
passed. No ancestry repair, protection change or personal approval was needed.

Serialized [deployment 38006173321](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38006173321)
passed, reporting Worker **`0ebf42fc-4ee2-428b-9496-a374f4422408`** at
**23:49:10.613 UTC**. Both production origins passed strict-SHA smoke.
All current application/private-aircraft/photo/route/orbital/Starlink/marine/
airport-board inputs remain enabled. This changes inspector presentation and
scoped Escape handling, not provider protocols, credentials, dependencies,
bindings, persistence or the map lifecycle.

Production serves `index-CcHJFLWJ.js`, `index-ZvZI8BV2.css`, shell
`d042b07d8ef4d660975f`. Normal **REFRESH APP** and focused acceptance at
**23:51:01-23:51:23 UTC** replaced the ranked-ships bundle without resetting
raw preferences, history/database or install identity. Six actual received-
ship layouts, Light/Dark at 1280x900, 390x568 and 315x517, plus 2x page
magnification retained the 44 px X at top/middle/bottom, no overlapping text,
one scroll owner/canvas and unchanged camera/focus-return behavior.
The all-six-kind 36-layout fixture acceptance and the requested GPT-5.5 /
Claude Opus 4.8 reviews are recorded in
[testing](development-and-testing.md#persistent-inspector-close-400).

Native fetch/WebSocket/clocks and trusted wheel/pointer/touch/Escape are
distinguished from callback-based selection setup and explicit focus
emulation; physical-device, native visibility and marker-picking claims are
not added. No airport-board request occurred. The existing vessel-photo
lookup returned `200`; independent aircraft `503` remained truthful.

The compatible predecessor is application
`28235e72acd9cc9c8b9ac47765dbf45160d59592`, Worker
`f61304d4-f235-4f73-bfbc-5aa7a62944b7`. Preserve its recorded inputs and atomic
secrets for rollback; this UI-only release needs no migration or new rollback
exercise. Later receipt/Wiki commits do not redeploy or replace the running
application. Journey paths and water depths are separate approved work, not
part of this release.

## Ranked ships production receipt (2026-10-09)

This is the historical predecessor to the persistent-close release above.

Implementation [#394](https://github.com/vasilyevstan/LiveTrafficStan/pull/394)
and checked promotion [#395](https://github.com/vasilyevstan/LiveTrafficStan/pull/395)
delivered application **`28235e72acd9cc9c8b9ac47765dbf45160d59592`**.
Feature Validation 37940241529 and original dev Validation 37940934888 passed.
Three actual documentation squash-history conflicts required tree-neutral
[#396](https://github.com/vasilyevstan/LiveTrafficStan/pull/396), with exact-head
Validation 37941300176. The accepted tree stayed
`ba244885ddd301f98d9413b039a7e1b3ec08fac9`; the narrowly guarded dev
merge-method exception was immediately restored and verified.
Final dev/promotion Validation 37941542848 /37941549781 and
[exact-main Validation 37941701838](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37941701838)
passed without another review of unchanged application source.

Serialized [deployment 37941881006](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37941881006)
passed and reported Worker **`f61304d4-f235-4f73-bfbc-5aa7a62944b7`** at
**14:08:45.521 UTC**. Both workers.dev and trackstan.xyz passed the unchanged
strict-SHA smoke. The application artifact, private OCI aircraft path, photos,
plausible routes, both orbital catalogs, marine supplement and airport boards
all remain enabled. No provider, Worker, binding, schema, credential, cadence
or dependency changed.

Production serves `index-CzqaQytu.js`, unchanged `index-Dcf5hrs3.css`, shell
`21cd527e5891f9b89f55`. Normal **REFRESH APP** at **14:09:59-14:10:03 UTC**
replaced `index-DF3lrFa8.js` while retaining raw preferences, history settings/
database identity and root install scope/controller. This includes an already
disabled clustering preference. A later observer failure blindly toggled it;
the observer was corrected, not the application, and the completed installed
transition was reused rather than repeated or reset.

The final **14:12:54-14:13:21 UTC** native production batch accepted both
rankings in twelve Light/Dark layouts at 1280x900, 390x568 and 315x517.
The initial public Tallinn-area view held 38 current length-qualified ships
and 34 with usable draught; each ranking listed 20, with maximum reported
length 333 m and draught 10.3 m. Counts changed with reception and footprint:
the narrow view correctly listed 19 draught matches rather than inventing a
twentieth. These are time-qualified received observations, not complete
coverage or fixed acceptance counts.

One map/outer scroll owner, six mobile slots, 44 px targets and a 44 px mobile
drag strip remain. Native keyboard/touch selection retained the existing
inspector/halo and camera; one ordinary selected-vessel photo lookup returned
`200`. Opening/ranking added no acquisition, ORBITS remained opt-in, each
catalog was read once after enable, and no airport-board request occurred.
Aircraft returned `200` then `503`; that independent failure also existed in
the predecessor baseline. Continuous provider availability is not claimed.

Fetch, WebSocket and clocks were native. Explicit browser focus emulation is
qualified; this is not physical-device or new OS-visibility evidence.
[Testing details](development-and-testing.md#ranked-ships-in-in-view-393)
separate deterministic fixtures, the retained installed-update receipt and
the completed real-provider batch.

The compatible predecessor is application
`a342b3095048f4073d453555e0b5538ff3a063dc`, Worker
`796febd2-9983-4ed4-b8b9-9a7812170c8a`. Existing recorded-version rollback
preserves every input and atomic secrets; no new disabled baseline, migration
or duplicate rollback rehearsal was needed. Later receipt/Wiki commits do
not redeploy the application or replace its running source SHA.

## In view production receipt (2026-10-09)

This is the historical predecessor to the ranked-ships release above.

Implementation [#387](https://github.com/vasilyevstan/LiveTrafficStan/pull/387)
and checked promotion [#388](https://github.com/vasilyevstan/LiveTrafficStan/pull/388)
delivered application **`a342b3095048f4073d453555e0b5538ff3a063dc`**.
Feature, dev, promotion and exact-main Validation passed in
[37899020170](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37899020170),
[37899293594](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37899293594),
[37899447297](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37899447297)
and [37899681346](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37899681346).
No ancestry synchronization or protection change was needed.

Serialized [deployment 37899985158](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37899985158)
passed and reported Worker **`796febd2-9983-4ed4-b8b9-9a7812170c8a`** at
**07:37:32.405 UTC**. Its workers.dev smoke and a separate strict-SHA
`https://trackstan.xyz` smoke passed. The application artifact, private OCI
aircraft path, aircraft photos, plausible routes, both orbital catalogs, marine
supplement and airport boards all remain enabled. No backend schema, binding,
credential, provider or cadence change was introduced.

That release served the accepted `index-DF3lrFa8.js` / `index-Dcf5hrs3.css`,
shell `95b4f318d94816f2973c`. Normal **REFRESH APP** from the retained
`index-xoDcN1BD.js` installation at 07:47 UTC preserved unrelated preferences,
history settings/database identity and root install scope/controller.
Version-1 hydration correctly ignored the old Starlink opt-out without a
startup storage rewrite; the next ordinary save removed the inert field.

Qualified real-browser acceptance finished at **07:58:03 UTC**, reusing the
completed installed transition/eight general layouts and measuring twelve
In view desktop/mobile Light/Dark layouts. They retain one canvas, one outer
scroll owner, six mobile slots, 44 px targets and a 44 px mobile drag strip.
The real whole-world view contained 439 current curated positions plus the
512-record sample: **951 unique modeled objects, 384 shown**, all reachable
over 48 pages. Those are time-qualified observations, not fixed coverage or
display-cap promises. Each catalog returned `200` once after ORBITS enable,
with zero startup reads or panel-induced acquisition. Aircraft independently
returned `503` and then `200`; no uninterrupted availability is claimed.

Browser focus emulation was necessary because the retained tab stayed
natively hidden despite activation. Renderer, trusted input, fetch, WebSocket
and clocks were real; this is not a fresh native hidden-state or physical-device
pass. The unchanged hidden-worker receipt, current deterministic regressions
and local paired HISTORY/off/on checks remain the accepted lifecycle evidence.
Observer corrections did not change or redeploy application code.
[Testing details](development-and-testing.md#in-view-and-automatic-starlink-inclusion-386)
separate fixture counts, production evidence and reuse qualifications.

The compatible predecessor is application
`c0ed2bea4e6291bcb4054df28482fd564012c676`, Worker
`701561eb-4654-492d-b800-3eea5be8978b`. This frontend-only change needs no new
disabled baseline or duplicate rollback exercise. The existing recorded-version
rollback preserves all production inputs and atomic secrets. It restores the
old UI/independent Starlink control; an already retired field then uses the old
client's default, without clearing unrelated preferences or history.
Later receipt/Wiki documentation commits do not redeploy the application or
replace the runtime SHA above.

## Airport-board activation and rollback

### Airport-board production receipt (2026-10-08)

Implementation [#381](https://github.com/vasilyevstan/LiveTrafficStan/pull/381)
and checked promotion [#382](https://github.com/vasilyevstan/LiveTrafficStan/pull/382)
delivered application **`c0ed2bea4e6291bcb4054df28482fd564012c676`**.
Exact-main [Validation 37851146321](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37851146321)
passed. All four serialized production stages passed, including their
unchanged strict-SHA smoke:

| Stage | Actions run | Worker version |
| --- | --- | --- |
| Compatible boards-off baseline | [37851712441](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37851712441) | `6e6e4a72-be9e-402b-aa6a-0b4aef5cfbc6` |
| First enabled activation | [37851931661](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37851931661) | `7f7febad-898f-427d-9aa0-cdbb220610ba` |
| Actual compatible disabled rollback | [37852222944](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37852222944) | `6e6e4a72-be9e-402b-aa6a-0b4aef5cfbc6` |
| Final enabled restoration | [37852403590](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/37852403590) | **`701561eb-4654-492d-b800-3eea5be8978b`** |

Wrangler reported the final version at **22:17:27.063 UTC**. The restored
workers.dev deployment and a separate final `https://trackstan.xyz` smoke
passed. The rollout preserved private OCI aircraft delivery, aircraft photos,
plausible routes, curated orbits, Starlink and the marine supplement. Secrets
were installed atomically; no coordinator was deleted or quota state reset.
The primary fallback is the compatible boards-off version above, not a
pre-airport-coordinator version.

Native Chrome 155 used the normal **REFRESH APP** path at
**22:14:11-22:14:23 UTC**, retaining preferences, history settings/database
identity and root install scope/controller. One explicit real EETN load
returned ten arrivals and eight departures. After rollback/restoration,
**22:18:05-22:18:13 UTC** acceptance returned ten arrivals and nine departures
with one further explicit load. Both used native fetch, WebSocket and clocks,
not provider fixtures; Light/Dark desktop/mobile checks retained one vector
canvas, reachable source credits and a 72 px mobile map gap. No board request
was added by theme, resize, scrolling or direction changes.

The final board returned `200` while aircraft independently returned `503`.
That aircraft condition also occurred in the recorded predecessor baseline;
continuous provider availability is not claimed. Only aggregate/schema
receipts were retained, not raw flights or real-flight screenshots. See
[the bounded acceptance record](development-and-testing.md#on-demand-airport-boards-46).

This receipt and later Wiki/documentation commits do not redeploy the
application or replace its source SHA. In view and automatic Starlink inclusion
were not part of this airport milestone; their separate 2026-10-09 receipt is
recorded above.

### Activation contract

`airport_boards_enabled` is an explicit default-false deployment input. It
controls `VITE_AIRPORT_BOARDS_ENABLED`, Worker `AIRPORT_BOARDS_ENABLED` and the
independent `AIRPORT_BOARD_COORDINATOR` binding. The declarative SQLite export
remains when disabled so operational quota/retry fences are not deleted.
There is no airport Cron, KV namespace or always-on feed connection.

The main-restricted production environment holds `AERODATABOX_RAPIDAPI_KEY`.
`prepare-production-secrets.mjs` adds it only for the enabled mode to the same
exclusive mode-600 temporary secrets file as the required aircraft/marine
credentials. One `wrangler deploy --secrets-file` installs all selected
credentials atomically; `always()` removes the temporary file. Never use a
standalone secret update after a version rollback.

First activation must preserve all current aircraft/photo/route/orbital/
Starlink/marine inputs:

1. Deploy the checked exact-current `main` source with airport boards **off**,
   registering the compatible coordinator export without provider work.
   Record this successful updated-source disabled Worker version.
2. Deploy that same source with `airport_boards_enabled=true`. Existing
   production serialization, environment restriction and exact-SHA checks
   remain. The browser and Worker flags/binding must agree.
3. Check the native installed app and one bounded actual airport board.
   Keep source-update/coverage uncertainty and all other providers truthful;
   retain aggregate evidence, not a raw-flight archive.
4. Restore the recorded compatible disabled version and verify its artifact
   and disabled boundary, then restore the accepted enabled version through
   the existing deployment path. Record the actual version IDs and source.

The primary rollback is the updated-source, board-disabled baseline, not an
older version that predates the coordinator export. Preserve operational
state; do not delete a Durable Object or reset its budget to bypass a platform
compatibility failure. The rollback input records the target board build flag
and injects it only when the target source supports it, retaining byte-exact
older builds. The existing orbital-disabled compatibility wrapper retains the
airport coordinator identity without exposing it.

`smoke-production.mjs` accepts an optional final airport-board flag. Its
`?icao=invalid` check expects `400` when enabled or `404` when disabled, with
the exact release header, no-store and no wildcard CORS. It cannot initialize
the coordinator or consume provider quota. Actual board loading is a separate
bounded release acceptance, not a repeated smoke/polling step.

The global free allowance is at most 200 uncached combined boards per billing
month before other work, not per visitor. HTTP-only demand lets the object
become idle; no cache-maintenance timer keeps it running or shares the marine
owner's always-active lifetime. The first demand checks actual remaining
units/requests and billing countdown through the provider's documented free
health operation. See [the complete source contract](airport-board-evaluation.md)
and #46 for access and actual rollout receipts.

For an enabled application with the existing production features preserved:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=oci-private-relay \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true \
  -f orbital_catalog_enabled=true \
  -f starlink_catalog_enabled=true \
  -f marine_supplement_enabled=true \
  -f airport_boards_enabled=true
```

Use `airport_boards_enabled=false` for the compatible disabled baseline,
changing no other enabled input. A later deployment must preserve this
explicit choice rather than inadvertently taking the new input's default.

## Supplemental marine activation and rollback

`marine_supplement_enabled` is an explicit, default-false deployment input.
It controls both `VITE_MARINE_SUPPLEMENT_ENABLED` in the browser build and
`MARINE_SUPPLEMENT_ENABLED` plus `MARINE_TRAFFIC_RELAY` in the Worker.
`prepare-wrangler-config.mjs` preserves independent orbital/marine bindings.
The declarative `MarineTrafficRelay` SQLite export remains while its binding
is disabled, retaining the operational object identity and quota fences.

The protected environment must contain both provider API credentials before
enabled deployment. `prepare-production-secrets.mjs` writes only required
Worker secrets to an exclusive mode-600 temporary file; one atomic
`wrangler deploy --secrets-file` installs them together with the source and
existing aircraft secret. The workflow deletes that file in `always()`.
It never deploys the Open Waters identity private key or runs a standalone
`wrangler secret put`.

For a first activation:

1. Deploy the checked current `main` source with the marine supplement
   **disabled**, preserving all current aircraft/photo/route/orbital/Starlink
   inputs. Record the successful compatible Cloudflare version.
2. Deploy the same checked SHA with `marine_supplement_enabled=true`.
   Keep the existing protected environment, production serialization,
   exact-current-main checks and private aircraft delivery.
3. Perform the mandatory real-browser marine check below. If the new path
   fails, restore the recorded updated-code, marine-disabled version or
   redeploy the same source disabled. Do not switch to a paid plan or the
   memory-constrained aircraft host to hide a failure.

The historical first marine-activation invocation, before airport boards, was:

```bash
gh workflow run deploy-production.yml \
  --repo vasilyevstan/LiveTrafficStan \
  --ref main \
  -f sha=<40-character-current-main-sha> \
  -f artifact=application \
  -f aircraft_delivery=oci-private-relay \
  -f aircraft_photo_enabled=true \
  -f flight_route_enabled=true \
  -f orbital_catalog_enabled=true \
  -f starlink_catalog_enabled=true \
  -f marine_supplement_enabled=true
```

The browser history database upgrades to version 2 without changing the
record schema, stores, consent, epoch or existing rows. Older version-1 code
cannot open that database; this protects new provider records from its
unknown-provider deletion logic. The primary rollback is therefore the
**updated reader with supplementation disabled**, not an older application
binary and not history deletion. `rollback-production.yml` accepts the target
marine build flag and injects it only if that source supports it, preserving
byte-exact builds of older releases. Target orbital state remains resolved
from the actual Cloudflare version rather than guessed from current flags.

The existing Workers Free allocation is finite. One 128 MB object active all
day calculates to 11,059.2 GB-s against the nominal 13,000 GB-s/day allowance;
incoming WebSocket messages count at 20:1 against 100,000 requests/day. The
relay reserves at most 80,000 request equivalents/day, closes on exhaustion,
preserves UTC retry state across restarts and does no provider work without
viewers. This is bounded best effort, not unlimited free concurrency or a
guarantee of all-day reception under every load.

## Automated production smoke

`scripts/smoke-production.mjs` verifies:

- HTTPS;
- deployed `index.html` bytes equal the validated local build;
- the dynamically discovered `maplibre-gl-worker-*.js` bytes equal the
  validated local build;
- Static Asset security headers;
- the immutable Natural Earth port asset path and caching policy;
- every reviewed immutable vessel-photo byte set, media type, and caching
  policy;
- when enabled, the immutable normalized orbital bootstrap bytes and caching
  policy;
- in `worker-proxy` mode, one same-origin ADSB point request that either
  returns valid aircraft JSON or truthfully preserves an upstream `429` with
  the exact release and `no-store` headers;
- in `oci-private-relay` mode, one successful same-origin aircraft payload
  through the bound private path; a numeric local `503 Retry-After` may delay
  the check for at most twelve attempts and 330 seconds of admission sleep
  inside one nine-minute deadline. Only the relay's explicit local admission
  marker is retryable; upstream `503`, `429`, authentication failure, VPC
  failure, malformed data, or any other status fails activation;
- in `adsb-lol-direct` mode, one browser-origin ADSB point request that returns
  valid aircraft JSON or an explicit `429` and permits the deployed origin
  through CORS;
- one bounded canonical same-origin AWC METAR request or valid 204;
- disabled orbital deployments return `404` from the fixed route; enabled
  deployments return one bounded catalog under the target release's own
  schema, validator, and immutable bootstrap contract, with matching
  digest/ETag/source/retrieval headers, reject queries and non-GET methods, and
  make no upstream provider request;
- the exact `X-LiveTrafficStan-Release` value;
- `no-store` aircraft behavior;
- malformed-coordinate and unsupported-path rejection;
- malformed METAR query and unsupported-method rejection;
- Digitraffic REST preflight and a bounded REST response;
- one Digitraffic MQTT connection, subscription, JSON message, and explicit
  disconnect.

That existing smoke does **not** establish supplemental marine acceptance.
For enabled activation, additionally open the actual production application
in a real browser and verify the `/api/marine/stream` upgrade under the exact
release SHA, both source statuses, real observed positions/attributed details,
MMSI deduplication, vector tiles and rendered vessels in representative
regions. Check that source loss remains partial and that theme, selection,
filters and narrow/touch views preserve the single map and provider
lifecycles. Do not treat a connected empty stream, REST header count or
synthetic fixture as Class B/yacht coverage evidence. Retain aggregate
receipts and screenshots, not a raw AIS archive.

The production smoke does not make a plausible-route or CelesTrak request on
every deploy. The orbital route is storage/bootstrap-only; the first live
CelesTrak refresh is a separately observed Cron event. The exact bundle and
CSP are checked deterministically; browser acceptance selects one known live
callsign when route behavior itself changes. This avoids turning deployment
smoke into recurring third-party traffic.

Static Asset checks use a bounded 60-second retry schedule because a newly
published Cloudflare version can report deployment success before every edge
serves every immutable asset. This bound covers the more-than-15-second Static
Asset switch observed during the V1.5.3 rollback proof without weakening
exact-byte validation. The locally rejected Worker release-header probe cannot
reach an upstream provider. Only a response with the required `400`,
`no-store`, and no-CORS policy plus a different canonical lowercase 40-hex
release SHA receives the same bounded propagation retry. Missing or malformed
headers and all other policy failures fail immediately. After its release
header matches, the smoke makes exactly one accepted live aircraft-provider
request through the selected delivery path. In
`worker-proxy`, an ADSB.lol `429` is recorded as provider throttling rather
than a release regression. Direct mode additionally requires that response to
be browser-readable. In `oci-private-relay`, bounded local `503` guidance may
delay the probe without creating another provider request, but provider `429`
and any failure to reach an eventual valid `200` fail activation.

Canonical run `36642794309` passed this policy at exact source `18082a1e...`.
A separate bounded public proof returned real JSON, then exact-release
`503 Retry-After: 20` with the `admission` marker, then real JSON after the
advised wait. The matching relay had already passed exact local health with
`current` at `18082a1e...`, `previous` at `1f9a2fd...`, and active/enabled
systemd state.

The MQTT check has a 15-second outer deadline, disables reconnect, and force
closes the client. The script never prints provider payloads, METAR reports,
MMSIs, browser coordinates beyond the documented fixed Tallinn fixture,
station IDs beyond the documented EETN fixture, or a secret.

An HTTP/Node smoke is not browser acceptance. V1.5.3 recorded a real browser
check of:

- rendered vector tiles and actual MapLibre worker execution;
- one MapLibre instance through Auto/Light/Dark changes;
- same-origin aircraft data;
- optional same-origin METAR data, source age, attribution, and failure
  isolation;
- one explicit Photon search with current browser CORS, bounded results,
  privacy disclosure, and visible Photon/OpenStreetMap attribution;
- direct Digitraffic REST preflight and secure WebSocket
  CONNACK/SUBACK/messages;
- aircraft/marine failure isolation;
- visible attribution;
- desktop and narrow mobile layouts.

V1.6.0 additionally recorded a rendered browser check of the changed
plausible-route behavior before release: selecting `FIN949` made no route
request, **Find plausible route** made exactly one fixed-origin standing-data
request, the UI rendered HEL to TRD as **Plausible** with the non-authoritative
disclaimer and both attributions, and explicit refresh made one additional
request. The vessel-photo release then added the exact production acceptance
recorded above. Final exact-byte deployment smoke proved the accepted
application artifact and release identity. Private-relay source
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` completed #11 with exact-byte
deployment smoke, eventual real aircraft JSON, rendered desktop/mobile
acceptance, and the measured E2 Micro canary. A truthful shared-egress `429`
remains accepted only in `worker-proxy` rollback/diagnostic mode and is not
proof of reliable aircraft delivery. No browser-automation framework is added
solely for this Issue.

Automatic-route source `3370dfe3f1cc2614feff894643ed865978ec7edc`
then passed exact-main validation `36299844911` and deployment/smoke
`36299895010`, publishing Cloudflare version
`0cbc0b5d-2e7b-49f0-b649-a2d22ac3a83c`. Production selection of live
`BTI877` made exactly one standing-route request and rendered TLL to BCN; a
later aircraft polling refresh made no second route request. Live `FIN7DE`
rendered HEL to TLL. Desktop and 390x844 retained one MapLibre canvas, zero
horizontal overflow, the compact caveat, and both route attributions.

## Monitoring

Use Cloudflare's aggregate Worker analytics and the application UI to monitor:

- dynamic request count and free-allowance headroom;
- response status, especially provider 403/429/5xx versus local 502/504;
- direct plausible-route availability and provider throttling shown in the UI;
- CPU/resource failures;
- missing static assets;
- last successful deployment SHA and version.

Do not equate a successful Worker invocation with HTTP success. A Worker can
correctly execute while returning an upstream 429 or local 504.

Persistent invocation URL logs, Logpush, tracing, and custom request logs remain
disabled because URLs contain rounded camera coordinates or visible weather
station IDs. Cloudflare still processes ordinary request/network metadata as the hosting provider; this
configuration minimizes application-retained location data rather than
claiming the platform observes none.

No log-export pipeline, synthetic provider poll or continuous health service
is added. The separately approved client-side visitor measurement below uses
Cloudflare Web Analytics, not Worker invocation logs.

### Manual Web Analytics account setup (#440)

The approved visitor-analytics work is separate from operational Worker
metrics. Its client and fresh manual collection are accepted following
authorized account setup on 2026-10-13; the dated receipt below preserves
the earlier rejection and recovery. The existing **Prepare TrackStan domain** workflow also offers
the fixed `web-analytics` operation for `trackstan.xyz`. It uses the same
exact-current-main validation, main-only production credentials and
`production-deployment` serialization; it never runs the DNS operation.

The operation reads the account's bounded site list, reuses an exact manual
site, or creates/switches only that site to manual installation, then confirms
any write with a fresh read. It returns only the site's public installation
token and identity, not the account credential or other sites. Account
Settings Read is required for discovery; creation or changing automatic
injection requires Account Settings Write. A denial is reported, not retried
or worked around by broadening the deployment token.

Use the genuine public token in a checked client change with `spa:false`,
exact production-origin gating and no geographic exclusion. Do not enable
automatic and manual beacons together. Site setup alone is not application
deployment, dashboard acceptance or proof of visitor counts. Local Wrangler
login is not required for this protected operation; account access to view
the resulting dashboard remains separate from the public token.

The fixed `web-analytics-read` choice is strictly read-only: it obtains the
existing exact site's public token and reports its real automatic-injection
state, but cannot create or change a site. The first protected setup run
([38167908210](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38167908210))
read the existing site successfully and received HTTP 403 on the attempted
manual-mode PUT. No successful write or retry occurred.

Cloudflare also documents `Cache-Control: no-transform` as an origin-side way
to prevent automatic beacon injection. An explicitly checked manual client
integration may use that header without Account Settings Write. Verify actual
HTML/header output and a single beacon; do not mistake the account's unchanged
automatic setting for proof of duplicate injection, or assume a logged-out
local session blocks the protected read path.

The successful read-only run
[38168459124](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38168459124)
obtained the genuine exact-site public token without writing or exporting
protected credentials. The checked client installs the official hosted module
only at exact `https://trackstan.xyz`, globally including EU visitors, after
React startup and outside React effects. `spa:false` avoids map operations
becoming page views. The backup Workers origin and local/retirement builds
are excluded. There is no custom dashboard, paid plan or analytics Worker.
See [collection and vendor-trust details](data-sources-and-licensing.md#visitor-analytics).

The fixed `web-analytics-statistics` operation is also strictly read-only.
After exact-site discovery it sends one bounded GraphQL aggregate query for
that site's ID, exact `requestHost: trackstan.xyz` and the previous 24 hours.
It reports validated page-view/visit totals and average sampling interval,
not raw visitor/page/referrer records. It reuses the existing protected token,
45-second overall/10-second request deadlines, streamed 128 KiB body cap,
exact-main check and production serialization. Account Analytics Read is
distinct from Account Settings Read; HTTP/GraphQL denial, invalid data and a
complete empty result remain explicit. There is no credential expansion,
write, automatic retry or new workflow. A genuine positive aggregate result
is dashboard-backed data evidence, not a visual dashboard-login receipt.

Disable through `WEB_ANALYTICS_CONFIG.enabled=false` and a checked release,
keeping `no-transform` to prevent edge injection. Normal version rollback
remains available, but a predecessor without that header does not itself
prove analytics off while the account automatic setting remains enabled.
Verify actual bytes/beacon count after either operation. Do not alter DNS,
provider lifecycles, the installed-app shell or account permissions as part
of analytics recovery.

### Visitor analytics production receipt (2026-10-11)

Historical analytics application:
**`4307ae00359aa450db0aaabc2eb39dca408d3e1b`**, Worker
**`22db54e1-5a7e-459b-b051-025a3cfc1cdc`**. Implementation #446 and checked
dev-to-main #447 retain accepted tree
`32145140f84d48e867548e5fd51ccbe7ee984d36`. Exact-head/development/release/
main Validation 38169891824, 38170568727, 38170627664 and 38170813939 passed.
Serialized deployment
[38171231016](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38171231016)
completed at `2026-10-11T20:13:51Z` with the strict backup-origin smoke;
the subsequent primary strict smoke also passed.

The application JS is `index-BHPYO_IB.js`, CSS remains
`index-BQuWWmR1.css`, shell `127ee680f9aa937d06b3` contains 11 URLs /
3,596,132 bytes. Root/index keep `no-transform`; no automatically transformed
HTML is accepted. Application, OCI private aircraft relay, aircraft photos,
plausible routes, curated/Starlink catalogs, marine supplement and airport
boards retain all previously enabled deployment inputs. Secrets remain
atomic/main-only; no provider route, binding, cadence or data migration changed.
The preceding fullscreen application/Worker remains historical compatible
rollback evidence. The later diagnostic release below retains identical
client assets; documentation-only commits do not redeploy the application.

Local required gates passed with **181 suites / 1,672 tests**. Actual official
beacon capture blocked transmission and proved identity-safe selected-object
INP attribution, one map/document/script and no private-state sentinels.
Native production REFRESH APP loaded the new shell with real prior IndexedDB
history still readable, unchanged root/database identity and consent epoch.
Observer cross-tab preference changes and ongoing row revisions are qualified
in [testing](development-and-testing.md#visitor-analytics-440), not asserted
as byte equality of all actively changing state.

Protected strictly read-only statistics run
[38171783640](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38171783640)
returned **5 page views, 5 visits and sampling interval 1**, for exact
`trackstan.xyz` from `2026-10-10T20:20:30.164Z` through
`2026-10-11T20:20:30.164Z`. Account Analytics Read, live schema and real
dashboard-backed aggregate data are established without a write or credential
expansion. No visual dashboard login, unique-person count or populated
referrer/country/browser/device breakdown is claimed.

The initial headed/headless native samples received collector **404** with
matching token, Origin and Referer. The five historical counts did not prove
those rejected reports were received. #448 retains that failed acceptance
and the authorized account-resolution path; no collector override, script
rewrite, custom POST, proxy, credential expansion or denied-PUT retry occurred.

#### Manual collection acceptance (2026-10-13)

After the user saved **Manage site -> Enable with JS Snippet installation**
and confirmed the existing token, normal headed Chrome at
`2026-10-13T05:37:38Z` sent one genuine official page-load POST. It returned
**204**, `Access-Control-Allow-Origin: https://trackstan.xyz`, with CF-Ray
`a49bfe576c221b5d-WAW`. The page had one map, one script, `spa:false`, the
unchanged token and no collector/CORS failure. This is a native report,
not an OPTIONS response, fabricated POST or intercepted success.

Protected read-only
[38352457075](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38352457075)
confirmed the same site/token and **`autoInstall:false`**, with zero writes.
Its complete zero result covered `2026-10-12T05:38:59.599Z` through
`2026-10-13T05:38:59.599Z`; a successful collector response alone was not
treated as received-dashboard-data proof.
After a bounded aggregation wait, read-only
[38352961950](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38352961950)
returned **1 page view / 1 visit, sampling interval 1**, for exact
`trackstan.xyz` from `2026-10-12T05:44:53.019Z` through
`2026-10-13T05:44:53.019Z`. New received data and manual mode are now verified.

#448's collection blocker is resolved; #440's remaining publication records
use this receipt. No application/token/credential change or redeployment was
needed. The exact internal Cloudflare rejection condition is not established
merely by recovery after the setup change. Existing source/privacy/provider/
fullscreen/install evidence remains accepted; UI login, every dimension and
physical-device/global-region coverage are not newly claimed.

### Orbital diagnostics and production validation (2026-10-13)

Historical application/Worker source for this diagnostic milestone was
**`7c188f184bdcb43c7016e46c2ae7a4f8e527f8ee`**, version
**`0603e051-d438-4fa6-a5c0-25de8f09177d`**, through #455/#456 and serialized
[deployment 38443144710](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38443144710).
Exact head/dev/release/main validation 38439938375 /38440761597 /
38441659457 /38442360529 passed. Both origin smokes passed; all enabled
production inputs and atomic/main-only secrets remain. No namespace, source
contract, cadence, admission row, retry deadline or physical fence changed.
The client JS/CSS and shell are byte-identical to the analytics predecessor,
which remains compatible rollback evidence.

The added private GET status method reads the existing producer actor, not
an acquisition endpoint. Existing catalog GET headers now expose bounded
public phases/timestamps/status numbers without attempt IDs or credentials.
At `2026-10-13T18:06:03Z`, actual state was **blocked, upstream HTTP 403**,
with the maximum-safe-integer fence. The shared attempt started
`2026-10-12T14:17:53.618Z`, Starlink at `14:17:58.562Z`. Curated data from
that cycle and Starlink GP from `00:17:56.445Z` are retained but expired.
This establishes the upstream stop, not the exact vendor access rule.

#454 records **181 suites /1,678 tests**, all existing data/build/dry-run
checks, actual vector tiles, independent live aircraft/marine, same-canvas
Dark/Light, native fullscreen/Escape, In view and four desktop/mobile
layouts. An initial theme-observer timing ambiguity was resolved by a narrow
settled native follow-up. Device-metric layouts are not physical-phone or
exhaustive gesture/accessibility acceptance; known mobile work remains #449.

**Satellite restoration was not accepted at this milestone.** The UI correctly
showed C/S UNAVAILABLE after hard expiry. #457 recorded the provider access/
source-contract dependency. No manual GP/SATCAT probe, gate reset, identity
rotation, proxy, timestamp rewrite or expiry extension was used. Policy
retrieval failed during that diagnosis; the October 14 review and recovery
below supersede that blocked state. Static/API smoke alone does not prove
fresh modeled positions or selection.

### Orbital source recovery and fresh production acceptance (2026-10-14)

Current application/Worker source is
**`40486a29b5e15ea3be6c0b9fd06180cd68743e2f`**, Worker
**`24cfe6e4-7b15-4f04-a051-6bfe585ca6d7`**, through implementation #460,
necessary tree-neutral ancestry #461 and checked dev-to-main release #462.
Exact release/main validation 38520644510 /38520823579 passed, followed by
serialized [deployment 38521086886](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/38521086886).
Both strict origin smokes passed. All production inputs remain enabled,
including private aircraft delivery, photos/routes, curated/Starlink,
marine supplement and airport boards; secrets remain atomic and main-only.
Client output is `index-81BCBiGX.js`, unchanged `index-BQuWWmR1.css`, shell
`e6d6eb3c98d628f725b8`. Later receipt-only commits do not redeploy or replace
this running source. Prior diagnostic/rollback receipts remain historical.

Current primary-source policy review and two independent model discussions
selected the smallest reviewed correction, not an unqualified replacement.
The single-use amendment matches the exact completed October 12 stop, keeps
the same producer and full prior admission row, and is consumed atomically
with ordinary admission. Another denial reblocks; inconclusive work keeps
the physical fence, including under older rollback readers. Browser RECHECK
actions still cannot initiate acquisition. See the
[source decision and recovery contract](orbital-data-source-evaluation.md#reviewed-recovery-of-the-october-12-stop).

The normal `06:17Z` Cron consumed that amendment. Read-only status became
`idle` / recovery `verified`; no blocked-status header remained. Full existing
validators then checked both actual KV publications at `06:19:46Z`:

| Publication | Complete records | Source retrieval (UTC) | Publication (UTC) |
| --- | --- | --- | --- |
| Curated schema 2 | 461 | `2026-10-14T06:17:20.153Z` | `06:17:25.469Z` |
| Starlink schema 2 | 512 from 11,100 paired GP/SATCAT rows | GP `06:17:26.625Z`; SATCAT `06:17:27.136Z` | `06:17:27.136Z` |

Curated canonical digest:
`c717cf0b0d96d53a3287e168ddf623b2d8cfc5996e0df005a6d18b1c0e47ea08`;
public body 238,943 bytes, SHA-256
`0c770211d5df9037a95b4253acf4db8360a41faba5d6cb078a0a5e197cb3af0a`.
Starlink canonical digest:
`cb691da325518118722027e226608e43692c8312a12fe95ba17ddf3572e12e39`;
public body 254,343 bytes, SHA-256
`e548725e3d261acf131182b4026576786f6d22351448c0a597c13370ce05bc59`.
Each of the four Starlink inclination bands contributes 128 records; this
is not whole-constellation display. The curated live union changing from
462 to 461 records is not an incomplete immutable-bootstrap rewrite.

Preserved normal admission deadlines are `08:17:20.153Z` for shared work
and `18:17:25.469Z` for actual Starlink work, both on October 14. These are
not-before boundaries, not guaranteed event times. A Cron arriving seconds
early is `not-due`; observe the next normal event, never force acquisition.
`verified` alone describes validated preparation; the complete public-body
checks above separately establish successful KV publication.

Qualified native production acceptance selected **STARLINK-4109 /53268**
at about `06:22Z` and **CZ-2D R/B /28738** at `06:29:03Z`. Current details
show the exact source snapshot, SATCAT type and modeled-not-live caveats.
Six desktop/mobile Light/Dark layouts retain one canvas through theme/resize,
with one read per catalog and no direct CelesTrak work. A subsequent ordinary
REFRESH APP retained current raw preferences, root scope and database names;
its new document legitimately has a new map. The initial uncontrolled-old-
document and failed observer assumptions remain qualified in
[testing](development-and-testing.md#reviewed-orbital-recovery-454-457).
No physical-phone, complete mobile-usability, historical-content retention
or permanent-provider-availability claim is made.

The source is functioning again; its exact earlier HTTP 403 reason remains
unknown. Successful normal reacquisition does not retroactively prove a
permanent ban, a self-inflicted policy violation or a mandatory contact step.
No identity rotation, reset, format switch, forced attempt, timestamp rewrite,
expiry extension, new credential or alternative-provider service was used.

## Rollback

Cloudflare versions contain Worker code, configuration, and Static Assets.
Plausible routes add no separately persisted server resource. Vessel reference
photos and exact-NORAD orbital photographs are part of the same exact Static
Asset version and add no provider, database, Worker route, scheduler, or
deployment credential. The orbital KV namespace is
retained across versions, as is the dormant Durable Object namespace; each
Worker accepts only its supported schema and can fall back to its exact-release
bootstrap.

For an initial deployment:

- record the exact source SHA and first known-good version ID;
- record the previous version as `none - bootstrap`;
- a same-platform prior-version rollback cannot yet be demonstrated.

After a subsequent version exists:

1. record the prior known-good version before promotion;
2. dispatch `.github/workflows/rollback-production.yml` from `main` with the
   exact current `main` SHA, target source SHA, recorded Cloudflare version ID,
   public origin, artifact kind, aircraft-delivery mode, whether that target
   build explicitly set `VITE_AIRCRAFT_ENDPOINT`, and the target version's two
   existing browser feature flags;
3. rerun the same automated smoke and browser checks;
4. keep production operations serialized;
5. record the restored version and evidence.

The rollback workflow shares the `production-deployment` concurrency group and
protected `production` environment with the deployment workflow. It rejects a
stale current-main SHA, a target source commit that is not an ancestor of the
current `main`, malformed version IDs or URLs, and missing Cloudflare
credentials. It checks out and builds the exact target source, restores the
current smoke policy so current provider-throttling semantics are applied
consistently, reads the target Cloudflare version metadata, and derives its
orbital flag from the version's exact plain-text binding. An enabled target
must also contain exactly one orbital KV and one Durable Object binding. The
restored smoke policy feature-detects only exports present in the checked-out
target: schema-1-only and schema-2-only versions receive one default
representation check, while dual versions receive the negotiated checks. It
does not dereference absent current exports, retry the orbital route, or call
CelesTrak. For an orbital-enabled target, the workflow then calls
`wrangler rollback <version-id>`. For a disabled or pre-orbital target after
the coordinator namespace has been provisioned, Cloudflare cannot activate the
old version directly because that would orphan the SQLite Durable Object
class. The workflow instead rebuilds the exact target source and assets behind
an unreachable compatibility export: the coordinator class remains declared
without a binding or Cron, preserving its namespace while target runtime
behavior stays disabled. Both paths require the same production smoke with the
target release SHA. The workflow never trusts a separately remembered orbital
checkbox. Restoring the latest known-good version uses the same workflow as a
second serialized operation; production must never be left on the older
version merely to preserve rollback evidence.

Cron triggers are deployment-level state rather than safely assumed to follow
a version rollback. After `wrangler rollback`, the workflow explicitly applies
one of two checked trigger configs:

- orbital target enabled: restore `17 */2 * * *`;
- orbital target disabled or pre-orbital: remove all Cron triggers.

This prevents a pre-orbital Worker from retaining a scheduled invocation that
it cannot handle and prevents an enabled target from being restored with its
scheduler accidentally disabled. The KV and Durable Object namespaces are
never deleted during rollback.

The orbital activation completed this proof in production:

- run `36488117751` rebuilt pre-orbital source
  `3370dfe3f1cc2614feff894643ed865978ec7edc` behind an unreachable live
  coordinator export, published compatibility version
  `1cb4a5e2-2f62-4d48-8b6f-9089dbb03e3c`, removed all Cron triggers,
  returned `404` from `/api/orbits/catalog`, and passed target smoke;
- run `36488245592` restored exact current source
  `46cb2007bc0cc27d1905fab32db6149a91d17576`, version
  `0138d581-2162-491a-bcb5-619a97cf31fb`, the retained KV/coordinator
  namespaces, Cron `17 */2 * * *`, catalog route, and full production smoke.

The curated schema-2 release repeated the forward/backward proof without
resetting either namespace:

- rollback run `36807920596` restored predecessor schema-1 source
  `f98252f8a22619c67006e4a7c231eebca430dae2` from recorded Cloudflare version
  `2891a8b4-8111-4d7c-be93-1d355ebdf289`, activated version
  `2891a8b4-8111-4d7c-be93-1d355ebdf289`, restored the target Cron state, and passed
  the current target-aware schema-1 smoke;
- restoration run `36808295755` restored exact application source
  `538edd25afa49f62c13e93745b322099f662791d` as version
  `83b98933-a609-405e-b07c-3e4f4ded46e8`, restored dual-representation smoke, and immediately
  served the retained schema-2 KV bundle without another CelesTrak refresh.

Build-time environment presence is part of the recorded artifact identity.
Versions deployed before the selectable aircraft-delivery mode did not set
`VITE_AIRCRAFT_ENDPOINT`; their rollback input must therefore set
`aircraft_endpoint_explicit=false` while retaining
`aircraft_delivery=worker-proxy` for live smoke. Later versions set the
endpoint explicitly and use `aircraft_endpoint_explicit=true`. The workflow
rejects an implicit direct-provider target.

Cloudflare supports rollback among the 100 most recent versions. Older recovery
uses the exact repository SHA and locked dependency/build inputs. The target
version's recorded plausible-route flag is rebuilt explicitly, but no route
database, secret, or quota namespace needs restoration.

Versioned aircraft-metadata, vessel-photo, and port files already retained in
browser or edge immutable caches do not need destructive invalidation. A
forward update or rollback points application code at the corresponding
immutable version path; unreferenced old files are inert.

## Re-evaluation conditions

Revisit the platform or proxy design only when evidence shows:

- sustained traffic exceeds the selected Cloudflare budget;
- Cloudflare egress cannot reliably reach ADSB.lol;
- ADSB.lol changes CORS, authentication, licensing, fields, or access terms;
- measured abuse requires a supported edge rate-control policy;
- a custom domain becomes a concrete product requirement;
- Workers KV, SQLite Durable Object, or Cron pricing, limits, consistency, or
  trigger behavior no longer fits the bounded orbital snapshot contract;
- CelesTrak blocks Cloudflare egress or changes the selected endpoint, cadence,
  schema, or caching/public-display basis;
- a different provider removes the proxy while remaining legally and
  operationally compatible;
- a new client route genuinely needs SPA fallback.

Do not add a general backend, shared live cache, alternate provider, proxy
selector, database, or marine relay in anticipation of those conditions.

## Official sources

Cloudflare:

- [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Static Asset configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Static Asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static Asset billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [`workers.dev`](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Temporary account claims](https://developers.cloudflare.com/workers/platform/claim-deployments/)

Alternative and repository workflow:

- [Netlify pricing](https://www.netlify.com/pricing/)
- [Netlify Vite support](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Provider context:

- [ADSB.lol API](https://www.adsb.lol/docs/open-data/api/)
- [ADSB.lol API source](https://github.com/adsblol/api)
- [VRS Standing Data](https://github.com/vradarserver/standing-data)
- [CelesTrak GP data formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [CelesTrak usage policy](https://celestrak.org/usage-policy.php)
- [CelesTrak SATCAT format](https://celestrak.org/satcat/satcat-format.php)
- [Photon public endpoint terms](https://photon.komoot.io/)
- [Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [Digitraffic marine traffic](https://www.digitraffic.fi/en/marine-traffic/)
- [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/)
