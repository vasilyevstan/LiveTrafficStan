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
