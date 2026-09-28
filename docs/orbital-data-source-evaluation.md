# Orbital Data Source Evaluation

## Decision

LiveTrafficStan selects **CelesTrak GP/OMM plus CelesTrak SATCAT** for the
bounded orbital-object feature in #162.

The first catalog is the fixed CelesTrak `visual` group. It is delivered to
browsers only through one scheduled same-origin Cloudflare snapshot:

```text
Cloudflare Cron, at most once per two hours
  -> one named SQLite Durable Object coordinator
  -> atomic start admission and durable outcome state
  -> fixed CelesTrak visual GP/OMM JSON
  -> fixed CelesTrak visual SATCAT JSON
  -> strict join and validation by NORAD catalog ID
  -> one final schema-versioned Workers KV snapshot write
  -> GET /api/orbits/catalog
  -> local browser SGP4 propagation
```

Browsers do not contact CelesTrak and do not send viewport, Home, geolocation,
selection, cookies, authorization, or arbitrary client headers to the source.

The feature models cataloged orbital objects. It does not provide live
telemetry, powered-ascent tracking, reliable operational reentry tracking,
impact prediction, conjunction assessment, or proof of naked-eye visibility.

## Evidence method

This decision combines:

- **Documented** facts from current official provider documentation;
- **Observed** bounded HTTP behavior recorded on 2026-09-28;
- **Inferred** legal or operational conclusions called out explicitly rather
  than presented as provider guarantees.

Provider behavior and terms can change. The official sources were rechecked for
the 2026-09-28 production activation and recorded in #162. Recheck them again
before any material source, group, cadence, caching, attribution, or
public-display change.

## Selected CelesTrak endpoints

The implementation permits only these two fixed URLs:

```text
https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json
https://celestrak.org/satcat/records.php?GROUP=visual&FORMAT=json
```

The GP response contains CCSDS Orbit Mean-Elements Message fields needed for
SGP4 propagation. It does **not** contain the public catalog object type.

The SATCAT response supplies `OBJECT_TYPE`:

- `PAY` — payload;
- `R/B` — rocket body;
- `DEB` — debris;
- `UNK` — unknown.

LiveTrafficStan joins by canonical decimal `NORAD_CAT_ID`. It never infers type
from:

- `OBJECT_NAME`;
- an `R/B` or `DEB` suffix;
- group membership;
- orbit shape, drag, altitude, or decay behavior;
- `CLASSIFICATION_TYPE`, which is a security classification rather than an
  object category.

Extra SATCAT records are allowed, but every published GP record must have one
unique matching SATCAT record. Missing or duplicate metadata blocks the whole
new snapshot.

## Why OMM JSON is required

CelesTrak states that five-digit catalog numbers were exhausted on 2026-07-11.
New six-digit objects are therefore unavailable through the legacy fixed-width
TLE representation. The app keeps NORAD IDs as canonical decimal strings and
uses OMM-compatible JSON rather than generating TLE lines.

The browser propagation implementation uses a reviewed SGP4 library with
native OMM support. A simple Keplerian approximation or handwritten SGP4
implementation would create avoidable position and pass errors.

## Bounded group observations

One bounded request per group was recorded on 2026-09-28:

| Group | GP records | Decoded bytes | Decision |
|---|---:|---:|---|
| `stations` | 22 | 9,320 | Too narrow for the requested feature |
| `visual` | 156 | 65,205 | Selected |
| `last-30-days` | 183 | 77,173 | Deferred; recent identity can be provisional |
| `active` | more than 16,000 | more than 3.3 MiB | Rejected |

The selected GP response contained:

- 65 payloads;
- 91 rocket bodies;
- no debris records in that particular snapshot.

The matching SATCAT response contained 158 rows. Two rows had no current GP
record, while every GP record had exact SATCAT metadata. This is why the
contract requires a complete GP-to-SATCAT join but does not require equal
response counts.

The sampled element epochs were not all equally fresh:

- median age: about 0.76 days;
- 90th percentile: about 1.05 days;
- oldest record: about 6.58 days.

Snapshot retrieval age and individual element epoch are therefore separate
facts. A recent snapshot does not imply that every element epoch is recent.
The client must display both and omit records beyond its reviewed propagation
age rather than calling the entire catalog current.

## The `visual` group does not mean visible now

CelesTrak's `visual` group is a bounded bright-object list, not a statement
that an object:

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
- uses one named SQLite Durable Object transaction for atomic admission rather
  than treating eventually consistent Workers KV as a lock;
- leaves a fail-closed in-progress gate before provider work and persists the
  provider outcome before publishing;
- performs no immediate retry;
- publishes only after both responses validate completely;
- preserves the prior valid snapshot on failure.

Status handling is fail-closed:

- exact `200` — validate, join, normalize, hash, and publish with one final KV
  write; other successful 2xx statuses, including `206`, are rejected;
- `429` — honor a readable `Retry-After` when it is later than the normal
  cadence, up to seven days;
- `5xx` with readable `Retry-After` — honor the later bounded guidance;
- `429` or `5xx` guidance longer than seven days — enter an operator-reviewed
  blocked state rather than persisting an unsafe deadline;
- `301`, other redirect, `403`, or `404` — enter an operator-reviewed blocked
  state;
- timeout, `5xx` without readable guidance, malformed JSON, unexpected content
  type, oversized response, invalid field, or incomplete join — retain the
  previous snapshot and wait for the next ordinary scheduled event.

If the coordinator cannot persist the outcome, it reports unavailable and
retains its fail-closed in-progress gate. No later Cron contacts CelesTrak
until a reviewed source-contract/coordinator reset. A successful KV put is the
only publication commit; no fallible control write occurs afterward.

There is no group fallback, direct-browser fallback, alternate provider, edge
cache miss fetch, or on-demand upstream request.

## Response and schema bounds

Each upstream response is limited to:

- ten-second total deadline including body read;
- 256 KiB counted response bytes;
- 256 records;
- exact `application/json` media type with at most an optional UTF-8 charset,
  plus valid UTF-8;
- bounded names and identifiers;
- finite, domain-checked OMM numbers;
- unique canonical NORAD IDs.

The normalized published snapshot is limited to 256 KiB and 256 records. It
contains:

- schema and source-contract versions;
- exact GP and SATCAT URLs;
- retrieval instant;
- record count;
- stable NORAD-ID ordering;
- exact object type;
- the OMM fields required for propagation;
- SHA-256 over the normalized snapshot content.

Invalid, aborted, partial, non-`200`, oversized, or checksum-failing work never
replaces the current snapshot. The committed bootstrap checker first bounds
the raw bytes, decodes UTF-8 fatally, rejects unknown output fields, and
requires exact canonical serialization rather than validating a normalized
subset of a larger file.

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

The exact-release bootstrap allows a deterministic first deployment and a
schema-safe rollback before the first Cron succeeds. Workers KV then supplies
new complete snapshots. An incompatible Worker ignores a newer schema and uses
its own validated bootstrap.

The browser feature remains default-off and makes zero startup requests. A
later map implementation may fetch the same-origin snapshot only after
explicit enablement and may revalidate it on a bounded session cadence. Camera,
theme, selection, details, Home, and geolocation changes never affect
acquisition.

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
- the selected group exceeds byte, record, or deadline bounds;
- GP and SATCAT no longer join completely;
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
