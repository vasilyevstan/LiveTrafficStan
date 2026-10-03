# Orbital Data Source Evaluation

## Decision

LiveTrafficStan selects **CelesTrak GP/OMM plus CelesTrak SATCAT** for the
bounded orbital-object feature in #162.

The released catalog began with fixed CelesTrak `visual`. Issue #211's
infrastructure contract selects the reviewed ordered union `visual`,
`stations`, `weather`, `gnss`, and `science`, identified as
`celestrak-curated-v1`. It is delivered to browsers only through one scheduled
same-origin Cloudflare snapshot:

```text
Cloudflare Cron, at most once per two hours
  -> one named SQLite Durable Object coordinator
  -> atomic start admission and durable outcome state
  -> visual GP then SATCAT
  -> stations GP then SATCAT
  -> weather GP then SATCAT
  -> gnss GP then SATCAT
  -> science GP then SATCAT
  -> independent group joins plus one strict NORAD-ID union
  -> one final schema-2 Workers KV snapshot write
  -> GET /api/orbits/catalog
  -> local browser SGP4 propagation
```

Browsers do not contact CelesTrak and do not send viewport, Home, geolocation,
selection, cookies, authorization, or arbitrary client headers to the source.

This source-contract slice does not yet add browser catalog discovery or zoom
tiers and must not be released without that follow-on. The feature models
cataloged orbital objects. It does not provide live
telemetry, powered-ascent tracking, reliable operational reentry tracking,
impact prediction, conjunction assessment, or proof of naked-eye visibility.

## Separate Starlink decision

Issue #257 evaluates the official CelesTrak `starlink` group separately from
the five-group curated union. The observed paired source contains more than
11,000 GP records and matching SATCAT records and is several megabytes per
response. Loading the complete group would exceed the reviewed browser record,
snapshot, SGP4, prediction, GeoJSON, picking, and mobile-density budgets.

The released contract validates the complete paired population and preserves a
150-record schema-1 representation. After sorting by inclination, normalized
right ascension of the ascending node, and numeric NORAD ID, sample slot `i`
selects `floor((i + 0.5) * populationCount / sampleCount)`.

Issue #271 adds a schema-2 representation because that population-proportional
sample contains only 32 objects capable of reaching Tallinn's latitude and is
frequently empty over the Baltic. Schema 2 allocates exactly 128 records to
each inclination band `<48`, `48-<60`, `60-<85`, and `>=85` degrees. Each band
fills 16 RAAN by 8 phase targets. Phase is advanced from each element epoch to
the common GP retrieval time before distance comparison; numeric NORAD ID is
the equal-distance tie-breaker. The final 512 records are unique and
canonically ordered. Both samples support bounded modeled context only; they do
not assert statistical representativeness, completeness, current operation,
or optical visibility.

Starlink shares the existing CelesTrak Cron, Durable Object identity, KV
namespace, global terminal state, and provider `Retry-After`. Curated work
remains first. A separate SQLite row records the actual Starlink GP request
start and admits at most one pair per 12 hours; no immediate retry, rotation,
fallback group, truncation, or browser-triggered acquisition exists. Fixed
source URLs, exact evidence, and the immutable generation are recorded in
`src/config/starlinkCatalogSource.json` and its co-located notice.

For the first production activation, an absent row is initialized from the
pinned GP retrieval time below rather than deployment time. Its initial
not-before boundary is therefore `2026-10-02T20:40:03Z`. The immutable sample
may be served before that boundary, but the shared Cron performs no Starlink
provider read; the first admitted request at or after the boundary becomes the
new actual-start anchor.

The one immutable-source acquisition began at `2026-10-02T08:40:00Z`, after
the conservative 12-hour window. GP completed at `08:40:03Z` and SATCAT at
`08:40:05Z`; each returned 11,125 rows. Decoded sizes were 4,699,409 and
3,684,028 bytes, for 8,383,437 aggregate bytes. The exact NORAD join had zero
extra SATCAT rows. The fixed algorithm published 150 records in a 74,982-byte
canonical snapshot with digest
`16233efe565c8f07f079ae4ad321219ae756931679d167fb2a3f2f52bf5a81d4`.
No retry or second provider read was made. The schema-2 immutable snapshot is
254,275 bytes with digest
`56db2f4d7ea342fa8b1e74f4e2f6567d1f6d416caedeefc021eed3d8a04b71c2`.
Its shell populations are 3,616 / 5,111 / 871 / 1,527 and each contributes
128 records.

A deterministic 24-hour replay uses both immutable snapshots at 145
ten-minute instants. In the Baltic box (54-70 N, 16-40 E), schema 1 averages
0.269 objects and is empty 75.9% of the time; schema 2 averages 2.110 and is
empty 7.6%, with median 2, p90 4, and maximum 6. In northern Europe
(57.5-80 N, 15 W-40 E), schema 1 averages 0.655 and is empty 50.3%; schema 2
averages 5.614 and is empty 0.7%, with median 6, p90 9, and maximum 11.

Production release #267 activated that immutable sample at exact source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`. Before the first safe provider
boundary, the public route served the bootstrap with the exact digest above.
Chrome acceptance made one same-origin request only after the child toggle,
made zero browser CelesTrak requests, reached all 150 rows, and retained one
physical orbital worker. Protected rollback to the pre-Starlink target and
exact-current restoration passed without deleting the KV namespace or named
Durable Object, resetting either admission row, or invoking provider
acquisition manually.

The first ordinary post-release Cron at `2026-10-02T12:17Z` was still before
the bootstrap-derived `20:40:03Z` boundary. A route observation at
`12:17:59.818Z` returned the identical bootstrap source, retrieval/publication
times, 11,125-record population, 150-record sample, canonical digest, and weak
ETag. That is the expected pre-boundary no-replacement outcome.

The first eligible ordinary `22:17Z` event produced the newer complete
generation without manual acquisition. A read-only route request at
`22:17:59.998669Z` completed after `22:18Z` and still returned bootstrap; the
first request strictly after the observer target, at `22:19:00.327863Z`,
returned HTTP 200, `source=kv`, exact release `bba0bf4f...`, GP retrieval
`22:18:01.730Z`, SATCAT retrieval/publication `22:18:02.211Z`, serve time
`22:19:00.626Z`, population 11,125, sample 150, and digest/weak ETag
`3cd7476fd7d42aed1772a85d4f81c27322c73b088bf58ff217e39454f425f0d7`.
The preserved 74,962-byte body and exact headers have SHA-256
`beddf705cd549e11411447ebc0db9ca587144007a150cc52e035fc4aba7453db`
and `be232df809d63a4c0617cf2df6cf16529d1d9bbcddfdd6a0ec1c1c93da3160d7`.
A bounded provider-contract review found no release-blocking inconsistency.

Release #275 at exact application source
`d565b56278e81ff2478ab1e476c269084f2297d4` adds the 512-record
shell-balanced consumer/publication contract without another source probe.
Immediate production evidence retained the prior fresh schema-1 KV generation
for default, wildcard, and combined clients while exact schema 2 exposed the
validated immutable bootstrap. Independent ETags/`304`,
cross-representation `200`, `Vary: Accept`, and schema-2 `q=0` exclusion all
passed. The ordinary `2026-10-03T12:17Z` observation remained on the prior
schema-1 generation through `12:28:56Z`; no manual scheduler or provider
request was substituted for the next ordinary event.

The ordinary `14:17Z` event published the complete aligned pair at
`2026-10-03T14:17:23.055Z`. Both actual production bodies passed the repository
publication validator. The complete population remained 11,125, with zero
extra SATCAT rows and shell populations 3,616 / 5,111 / 871 / 1,527.

| Source | Retrieval on 2026-10-03 (UTC) | Rows | Decoded bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| GP | `14:17:20.296Z` | 11,125 | 4,700,667 | `0db59a3bc7fae26fed83560d9cd3e6e86eabe212f9d1d9f252611a0ade0396d2` |
| SATCAT | `14:17:23.055Z` | 11,125 | 3,684,065 | `0a1d5f5219a38c010ae2d2f17c9faf2e02c689afa6229e48fc8f3726ae17a7bd` |

Schema 1 contained 150 records / 74,962 bytes, canonical digest
`1e570978cdc4854651c1dd5256882273040b8c0980964a0b4307d7b509567c44`,
and raw-body SHA-256
`c91ccd9d4584ff61fa3321fa975e133be358f2061983d2bbd6d714a4706027ba`.
Schema 2 contained 512 records / 254,287 bytes with four exact 128-record
quotas, canonical digest
`cebc2fd1dfe8b58e6dce30ca15dfa1ec0e327d7e1272d2f79690116a6a41356b`,
and raw-body SHA-256
`108318133c427c89dd6db56fa085282e800bf2bc5a09898ce8fd14867f578808`.
Both were served from KV under exact release `d565b562...`. All ten
negotiation/ETag cases passed. The protected predecessor rollback and exact
restoration retained both raw body hashes and publication identities at
`14:30:12.614Z`; no manual provider acquisition was used.

## Evidence method

This decision combines:

- **Documented** facts from current official provider documentation;
- **Observed** bounded HTTP behavior recorded on 2026-09-28 and the final
  coordinated five-group evidence captured on 2026-09-30;
- **Inferred** legal or operational conclusions called out explicitly rather
  than presented as provider guarantees.

Provider behavior and terms can change. The official sources were rechecked
for the 2026-09-28 production activation and the #211 group expansion. The
final source responses and summary are pinned by exact URL, row count, decoded
byte count, and SHA-256. Recheck policy again before any material source,
group, cadence, caching, attribution, or public-display change.

## Selected CelesTrak endpoints

The implementation permits only the ten URLs formed by these five reviewed
groups, in this exact order:

| Group | GP/OMM JSON | SATCAT JSON |
| --- | --- | --- |
| `visual` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json` |
| `stations` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=stations&FORMAT=json` |
| `weather` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=weather&FORMAT=json` |
| `gnss` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=gnss&FORMAT=json` |
| `science` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json` | `https://celestrak.org/satcat/records.php?GROUP=science&FORMAT=json` |

The GP response contains CCSDS Orbit Mean-Elements Message fields needed for
SGP4 propagation. It does **not** contain the public catalog object type.

The SATCAT response supplies `OBJECT_TYPE`:

- `PAY` — payload;
- `R/B` — rocket body;
- `DEB` — debris;
- `UNK` — unknown.

LiveTrafficStan joins and deduplicates by canonical decimal `NORAD_CAT_ID`.
Each group independently requires unique GP and SATCAT IDs and exactly one
matching SATCAT record for every GP record. Validated extra SATCAT records are
allowed. Cross-group name, designator, and type must agree after
outer-whitespace normalization only. It never infers type
from:

- `OBJECT_NAME`;
- an `R/B` or `DEB` suffix;
- group membership;
- orbit shape, drag, altitude, or decay behavior;
- `CLASSIFICATION_TYPE`, which is a security classification rather than an
  object category.

For an overlap, the newest valid OMM epoch wins and ordered group memberships
merge. Equal-epoch differing propagation fields, or any identity/type
conflict, block the whole new snapshot. Canonical serialization stays ordered
by numeric NORAD ID. `displayOrder` is the zero-based index of the first
reviewed source group multiplied by `1,000,000,000`, plus numeric NORAD ID. It
does not encode mission importance.

## Why OMM JSON is required

CelesTrak states that five-digit catalog numbers were exhausted on 2026-07-11.
New six-digit objects are therefore unavailable through the legacy fixed-width
TLE representation. The app keeps NORAD IDs as canonical decimal strings and
uses OMM-compatible JSON rather than generating TLE lines.

The browser propagation implementation uses a reviewed SGP4 library with
native OMM support. A simple Keplerian approximation or handwritten SGP4
implementation would create avoidable position and pass errors.

## Bounded group observations

The final coordinated probe completed at `2026-09-30T18:25:59.094Z`. It made
the exact sequential request set once and captured 353,281 aggregate decoded
bytes:

| Group / response | Rows | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `visual` GP | 156 | 65,172 | `4a69f3af2db28eead1428b465d8bceebbc0599b7b586e8315b951efff863818f` |
| `visual` SATCAT | 158 | 52,060 | `3d6bd9dbdb7e3e0bfa88d965e2f68c5e3aa953bcbc6fa9791b1f17ed3681a5dd` |
| `stations` GP | 22 | 9,303 | `b61ed1bcec9c19232239163b225c1d4d3826a1af0c770f91ddb28d11d009f121` |
| `stations` SATCAT | 22 | 7,302 | `dc26f4beef451fa8ca47f3811294169cebd30e59f61bfba4469d6ffb98cbc8af` |
| `weather` GP | 72 | 29,841 | `1e468ec983d8f51635f90b337b7f40f43c97ce0e7179fad1abe6160bceb8ebb9` |
| `weather` SATCAT | 74 | 24,544 | `6ab5a9d1e3cc08669b336517253f106e3ba3dd411f6bae9f078193852c09f02b` |
| `gnss` GP | 172 | 71,028 | `9837b20e1a3a0c366c0205bfeb6583c67bbd30187f18e0719260cef9dee3ab69` |
| `gnss` SATCAT | 173 | 59,475 | `c902ec719c74f8e883731c1e1b50fcc5d5eca14cb052d882981cbd65020d15a8` |
| `science` GP | 46 | 19,059 | `95646331b480e191f2f48a839012ca855b37758b3149081b7281881ce1800411` |
| `science` SATCAT | 47 | 15,497 | `ac1176d4f8e1c7717d30ccf7fa549f418cc9cdacd6cf4031bfef89b39fc6e9cb` |

All 468 GP rows joined. Six non-conflicting cross-group overlaps reduced the
union to 462 unique objects: 369 payloads, 91 rocket bodies, and 2 debris
objects. SATCAT had no duplicate IDs; validated extras were present for
`visual`, `weather`, `gnss`, and `science` but did not enter the published
union.

The exact normalized bootstrap is 239,460 bytes, file SHA-256
`9716c21b171085c66f48f57396aec745917e7f30211dc48f4f4f94d3687d6159`,
and canonical digest
`5cb57fdeaa99dc585dc6c16e1548aa6e5bd05217f23b28c6ae205b96ee70bde6`.
Its co-located notice is 3,727 bytes with SHA-256
`e4caa98a4ea713c7d24e49aee21c07e25b45a1ad2a75f3e4ba1bac4fac898f2c`.

The earlier 2026-09-28 sampling established that `visual` alone was bounded
and that element epochs are not uniformly fresh (median about 0.76 days, 90th
percentile about 1.05 days, oldest about 6.58 days). Retrieval/publication age
and per-record element epoch remain separate facts. A recent snapshot does not
make every element current.

## Selected and rejected group semantics

- `visual` — selected bounded bright-object context;
- `stations` — selected crewed/station context;
- `weather` — selected weather/environmental satellite context;
- `gnss` — selected navigation constellation context;
- `science` — selected scientific mission context;
- `last-30-days` — rejected because the stable five-group union already meets
  the product target, recent identity/type can be provisional, and the probe
  conflicted with the GNSS name for NORAD `100744`;
- `active` — rejected because the observed response exceeded 16,000 rows and
  3.3 MiB, outside the reviewed product and hard bounds;
- broad/specialized groups outside the reviewed five — rejected because the
  product has no reviewed discovery semantics, bounds, or display contract for
  them.

Group membership is not proof that an object is still operational, performing
the group's implied mission, or visible now. In particular, CelesTrak's
`visual` group is not a statement that an object:

- is currently above the user's horizon;
- is sunlit;
- appears during local darkness;
- is bright enough for a particular observer;
- crosses the current map;
- remains operational.

Large historical rocket bodies can be optically bright and are common in this
group. LiveTrafficStan therefore uses **modeled orbital objects** and
**predicted sub-satellite ground track** wording. It does not label the group
as currently visible satellites.

## Cadence and stop behavior

CelesTrak documents that it checks for new GP data only once every two hours
and asks clients to download only what they need, only when used, and only once
per update.

The shared updater therefore:

- starts no more than once every two hours;
- uses one offset UTC Cron rather than a request driven by users;
- calls Cloudflare `controller.noRetry()`;
- sends only `Accept: application/json` and the stable public project
  `User-Agent`;
- uses one named SQLite Durable Object transaction for atomic admission rather
  than treating eventually consistent Workers KV as a lock;
- invokes the Workers runtime `fetch` through `globalThis` so the
  receiver-sensitive host function keeps its required runtime receiver;
- leaves a fail-closed in-progress gate before provider work and persists the
  provider outcome before publishing;
- performs exactly ten strictly sequential, non-overlapping requests under one
  90-second total deadline;
- performs no immediate retry;
- publishes only after every group and the complete union validate;
- preserves the prior valid snapshot on failure.

Status handling is fail-closed:

- exact `200` — continue the fixed sequence; only after all ten responses,
  group joins, and union validation succeed may one final KV write publish;
  other successful 2xx statuses, including `206`, are rejected;
- `429` — honor a readable `Retry-After` when it is later than the normal
  cadence, up to seven days;
- `5xx` with readable `Retry-After` — honor the later bounded guidance;
- `429` or `5xx` guidance longer than seven days — enter an operator-reviewed
  blocked state rather than persisting an unsafe deadline;
- `301`, other redirect, `403`, or `404` — enter an operator-reviewed blocked
  state;
- timeout, `5xx` without readable guidance, malformed JSON, unexpected content
  type, oversized response, invalid field, incomplete join, identity/type
  conflict, or equal-epoch propagation conflict — retain the previous snapshot
  and wait for the next ordinary scheduled event.

If the coordinator cannot persist the outcome, it reports unavailable and
retains its fail-closed in-progress gate. No later Cron contacts CelesTrak
until a reviewed source-contract/coordinator reset. A successful KV put is the
only publication commit; no fallible control write occurs afterward.

The coordinator's durable state schema is versioned independently from the
published catalog schema. Schema 2 deliberately retains the existing
schema-1 row, `lastStartedAt`, attempt sequence, in-progress fence,
`Retry-After`/`nextAllowedAt`, terminal block, class, binding, namespace, and
fixed object name. A catalog-shape revision must not silently discard provider
admission. A reviewed coordinator reset uses a new fixed object name rather
than mutating or deleting the prior Durable Object.

There is no group fallback, direct-browser fallback, alternate provider, edge
cache miss fetch, or on-demand upstream request.

The first production implementation stored the runtime `fetch` function in an
options object and then invoked it as that object's method. Cloudflare rejected
the incorrect receiver with `TypeError: Illegal invocation` before either
fixed CelesTrak request could complete. The #162 repair keeps injected test
fetches unchanged but calls the default host function as
`globalThis.fetch(...)`. It does not reset the named coordinator, bypass its
persisted cadence, or add another acquisition path.

The receiver repair's schema-1 bootstraps remain byte-for-byte at
`/orbital-data/v1/visual-catalog.json` and
`/orbital-data/v2/visual-catalog.json`, and `orbital:catalog:v1` remains the
rollback KV contract. Schema 2 uses the separate key
`orbital:catalog:v2:curated-v1` and never-reused path
`/orbital-data/curated-2026-09-30-v1/catalog.json`. Future bootstrap renewal
must use a new versioned directory and must not become an extra scheduled,
browser, or on-demand provider path.

## Response and schema bounds

Each upstream response is limited to:

- ten-second total deadline including body read;
- 512 records;
- 512 KiB decoded response bytes;
- exact `application/json` media type with at most an optional UTF-8 charset,
  plus valid UTF-8;
- bounded names and identifiers;
- finite, domain-checked OMM numbers;
- unique canonical NORAD IDs.

The source set is fixed and limited to at most six groups; the current
reviewed contract uses five. One complete refresh is limited to 90 seconds and
4 MiB aggregate decoded bytes. The normalized publication is limited to 512
KiB and 512 records and is never truncated. It contains:

- schema and source-contract versions;
- catalog ID `celestrak-curated-v1`;
- ordered source metadata with group, exact GP/SATCAT URLs, and source row
  counts;
- retrieval and publication instants;
- record count;
- stable numeric-NORAD canonical ordering;
- exact NORAD ID, name, international designator, SATCAT object type, and OMM
  propagation fields;
- ordered source groups and deterministic display order;
- SHA-256 canonical digest over the normalized contract content.

Invalid, aborted, partial, non-`200`, oversized, conflicting, timed-out, or
checksum-failing work never replaces the current snapshot. The committed
bootstrap checker bounds bytes, decodes UTF-8 fatally, rejects unknown output
fields, verifies pinned source evidence, and requires exact canonical
serialization rather than validating a normalized subset of a larger file.
Repository history checks reject changing bytes under an already-used
immutable path.

## Browser privacy and lifecycle

`GET /api/orbits/catalog` is a fixed same-origin route. It accepts no query
string and never starts a provider request.

The browser-visible response identifies:

- application release SHA;
- KV or exact-release bootstrap source;
- schema version;
- snapshot digest;
- retrieval time;
- serve time.

The schema-2 route independently validates compatible KV and exact-release
bootstrap candidates and serves the newer `retrievedAt`. Equal timestamps with
the same canonical digest select KV; equal timestamps with different digests
fail closed. Workers KV then supplies new complete snapshots. A rollback
target uses its own schema-1 validator, bootstrap path, and retained v1 KV key;
current smoke discovers those values from the target checkout.

The browser feature remains default-off and makes zero startup requests. The
released browser requests schema 2 with the fixed vendor `Accept`; missing or
other `Accept` values retain schema 1 for predecessor tabs and rollback. The
coordinated #211 release is exact source
`538edd25afa49f62c13e93745b322099f662791d`, initially deployed as Cloudflare
version `83b98933-a609-405e-b07c-3e4f4ded46e8`. Its first ordinary admitted
schema-2 KV publication was retrieved at `2026-10-01T02:17:32.034Z` with
`462` records and digest
`ef7abc9080efe0ec338b1b0e516c54b27c75cd8dfb4239fa1f944f16fbbeb443`,
atomically paired
with the same-retrieval schema-1 visual member. Explicit enablement remains the
only browser catalog trigger. Camera, theme, selection, details, Home, and
geolocation changes never affect acquisition.

## Licensing and attribution assessment

CelesTrak publishes this data openly as part of its nonprofit public orbital
data mission and provides browser-readable endpoints. It does not publish a
conventional formal data-license grant covering every downstream caching and
redistribution question.

The selected basis is therefore:

- fixed, noncommercial, attributed use;
- minimum necessary fields;
- value-added local propagation and map presentation;
- no sale, credential sharing, provider impersonation, or raw full-catalog
  mirror;
- exact provenance and retrieval identity;
- immediate re-review if provider policy changes.

This is an engineering assessment, not legal advice. Production acquisition
must be disabled if current provider text prohibits the fixed caching, public
display, or attribution model.

Visible attribution must state, in substance:

> CelesTrak GP/OMM and SATCAT. Positions modeled locally with SGP4; not live
> telemetry.

## Alternative-source evaluation

### Space-Track.org

Space-Track is the authoritative upstream source, but it is not selected:

- individual authenticated account;
- credentials cannot be exposed in a public browser;
- no suitable browser CORS was observed;
- the current user agreement restricts transfer of received data or analysis
  to other entities without prior approval.

Using one account behind a public proxy would not resolve the onward-transfer
or credential boundary.

### SatNOGS

SatNOGS DB documents CC BY-SA 4.0 data, but it is an amateur-radio satellite
database rather than a general orbital catalog. It has limited rocket-body and
debris coverage and no browser CORS in the observed API responses. SatNOGS
Network schedules ground-station observations; it is not a current-position
source.

### Launch Library 2 / The Space Devs

Launch Library 2 provides launch schedules, statuses, webcasts, and related
event context. It does not provide orbital elements or live ascent positions.
Its documentation also asks integrators to cache rather than have each client
call the API. It could be reviewed later as an independent launch-events
feature, not as a position source.

### N2YO

N2YO offers server-propagated positions and passes but requires a personal API
key, has tighter quotas, did not expose complete browser CORS in the bounded
check, and does not clearly grant this app downstream public redistribution.
It adds a secret/proxy without improving the selected contract.

### wheretheiss.at

This source is simple and keyless but limited to the ISS. It cannot satisfy the
requested satellite and rocket-body catalog.

## Rocket and launch boundary

A cataloged rocket body is a tracked orbital object, usually a spent launch
vehicle stage. It is not evidence of:

- a launch currently in progress;
- powered flight;
- a current uncontrolled reentry;
- a predicted impact location;
- an emergency or hazard.

Newly launched objects may take hours or days to be identified and typed.
LiveTrafficStan does not add `last-30-days` until provisional identity and
replacement behavior receive a separate review.

No reviewed free provider supplies continuous public powered-ascent telemetry.
Launch and reentry tracking remain separate future problems.

## Re-evaluation and stop conditions

Re-evaluate before production and whenever:

- CelesTrak changes its usage policy, endpoints, schema, cadence, or
  attribution guidance;
- a selected group or the aggregate union exceeds byte, record, or deadline
  bounds;
- GP and SATCAT no longer join completely;
- a cross-group overlap conflicts on identity, type, or equal-epoch
  propagation fields;
- six-digit or later catalog IDs fail in the parser or propagator;
- Cloudflare shared egress receives a terminal provider response;
- Workers KV, SQLite Durable Objects, or Cron no longer fits the selected free
  plan;
- a formal source-rights concern is demonstrated;
- the product needs a full catalog, optical visibility, ascent, reentry,
  conjunction, or hazard semantics.

Do not respond by rotating Cloudflare identities, switching groups, adding a
free CORS proxy, scraping tracker sites, or silently falling back to another
provider.

## Official sources

- CelesTrak [GP data formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- CelesTrak [usage policy](https://celestrak.org/usage-policy.php)
- CelesTrak [SATCAT format](https://celestrak.org/satcat/satcat-format.php)
- CelesTrak [GP elements index](https://celestrak.org/NORAD/elements/)
- CCSDS [Orbit Data Messages standard](https://public.ccsds.org/Pubs/502x0b3e1.pdf)
- Space-Track [documentation](https://www.space-track.org/documentation)
- Space-Track [account agreement](https://www.space-track.org/auth/createAccount)
- SatNOGS DB [API documentation](https://docs.satnogs.org/projects/satnogs-db/en/latest/api.html)
- The Space Devs [Launch Library 2](https://thespacedevs.com/llapi)
- N2YO [API documentation](https://www.n2yo.com/api/)
- wheretheiss.at [developer documentation](https://wheretheiss.at/w/developer)
