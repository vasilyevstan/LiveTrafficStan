# Aircraft Metadata Evaluation

## Decision

Verified on 2026-09-19, LiveTrafficStan uses a compact, lazily loaded derivative
database generated from the Mictronics
[aircraft-database](https://github.com/Mictronics/aircraft-database).

- Pinned commit:
  `1724959f854f540c95f11872bcd377ecfeb698a2`
- Source publication instant: `2026-09-13T07:35:29Z`
- Internal database version: 522
- Pinned `indexedDB.zip` SHA-256:
  `3f274f21154833d47cae45b5e847c3d47463a212c631384bc79493872beb44dc`
- Pinned license SHA-256:
  `11a6d83734845ad09d809667aa219857a5b985b28c258a2eebf5677668a6bd3b`
- Database license:
  [ODC Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/)
- Immutable application path: `/aircraft-metadata/2026-09-13-v1`

The source README makes the exports available under ODC-By and describes a
weekly update process. ODC-By permits use, extraction, modification, creation
and conveyance of a derivative database subject to attribution and notices. It
licenses database rights, not every independent right in individual contents,
and provides no warranty.

LiveTrafficStan therefore retains only technical factual fields needed for a
selected-aircraft detail view. Owner, operator, operator-directory, photos,
notes, and similar personal or independently protected content are excluded.
The source operator directory is not linked to individual aircraft and cannot
establish the current operating airline.

## Candidate matrix

| Candidate | Rights and currency | Technical fit | Decision |
| --- | --- | --- | --- |
| Mictronics aircraft-database | Export explicitly offered under ODC-By 1.0; weekly source updates; pin and checksums available | ICAO24-keyed aircraft rows plus compact type dictionary; deterministic static projection | Selected |
| OpenSky aircraft database | Current public material describes the metadata database as old and does not provide a redistribution license for bundling | Technically familiar ICAO24 fields, but rights are not established | Rejected |
| ICAO Doc 8643 / Doc 8585 data | Authoritative standards, but complete datasets are not openly licensed for repository redistribution | Would provide type/operator designators but requires licensed access and still would not prove current operator | Rejected |
| tar1090-db combined data | Combines several sources under different or unclear provenance; no single redistribution license covers the combined output | Convenient lookup format, but rights cannot be represented truthfully as one bundled database | Rejected |
| adsbdb and similar APIs | Current display, caching, version, currency, quota, and redistribution rights were not established | Adds runtime provider coupling and failure/quota behavior for non-live context | Rejected |
| National registries | Jurisdiction-specific rights and formats; fragmented global coverage | Larger multi-source integration without global consistency | Rejected |
| Third-party ICAO-address transcriptions | A transcription's CC0 statement does not establish rights to the underlying authoritative allocation table | Does not supply the required model context and creates provenance risk | Rejected |

Re-evaluate the choice if the selected source stops publishing under ODC-By, no
fresh pin is available before the 45-day limit, materially changes field
semantics, or a smaller source establishes equally clear global rights and
currency.

## Projection and measured cost

The pinned archive contains 447,779 aircraft rows and 2,788 type rows. The
validated projection contains:

- 407,368 available aircraft records;
- 403 explicit ambiguous records;
- 196 duplicated normalized registration values in the source;
- 2,774 retained type descriptions;
- 123 non-empty two-hex-prefix shards;
- 6,844,037 raw shard bytes;
- 2,555,150 deterministic Node gzip-9 shard bytes;
- largest raw shard: 377,781 bytes;
- largest gzip-9 shard: 145,154 bytes;
- median shard: 2,902 gzip-9 bytes;
- index/type asset: 132,471 raw / about 43.5 KB gzip-9 bytes.

The one-record difference from an earlier exploratory projection is
intentional: one source registration contains a control-corrupted non-ASCII
sequence and is rejected rather than repaired or displayed. Seven printable
source registrations containing `?` or `=` are retained exactly; no
punctuation is stripped.

A worst-case first lookup transfers one index/type asset and one shard, 188,514
gzip-9 body bytes using the deterministic measurements. Later same-prefix
lookups use the bounded shard cache.

The built immutable version contains 125 files totaling 6,996,485 raw,
2,605,020 gzip-9, or 1,765,419 Brotli-quality-11 bytes, including the index,
license, and all shards. These compression totals are reproducible build
measurements rather than a Cloudflare transfer guarantee.

Compared with the exact pre-Issue-#4 source, the production main JavaScript
increases by 15,023 raw / 4,701 gzip-9 / 3,895 Brotli bytes. CSS increases by
513 raw / 81 gzip-9 / 26 Brotli bytes. No runtime dependency was added.

A deterministic Chrome production-preview check measured exactly two first-use
requests for the AB fixture: 43,877 encoded index bytes plus 111,669 encoded
shard bytes. Selected details appeared 111.8 ms after the click; the observed
upper bound after both resource response ends was 75.5 ms for integrity
checking, validation/parsing, controller publication, React rendering, and the
acceptance poll. This is a local acceptance observation, not a public latency
SLA or an isolated parser microbenchmark.

## Matching and truthfulness

The exact normalized six-character ICAO24 address is the primary key.

1. If live ADS-B supplies a registration, its case-normalized, outer-trimmed
   value must exactly match the database registration.
2. If live registration is absent, an exact ICAO24 record may be displayed only
   with an `ICAO24 only` confidence label. Its registration remains explicitly
   the database registration and never replaces a live field.
3. If both live and database type designators exist, they must exactly match.
4. A globally duplicated registration makes the record unavailable.
5. Missing, malformed, conflicting, future-dated, or stale records are
   unavailable.

There is no registration-only fallback, punctuation removal, callsign matching,
owner lookup, operator inference, or airline inference. Model description stays
the source model description; the UI does not split it into an independently
sourced manufacturer claim.

Static metadata never changes marker artwork. The four existing aircraft
silhouettes remain classified solely from the live ADS-B emitter category.
Configuration and wake category are detail context only.

## Runtime lifecycle

- No metadata request occurs before an aircraft is selected.
- The first selection loads one same-origin index/type asset and at most one
  same-origin prefix shard.
- One five-second deadline covers both requests and body reads.
- Response streams are byte-counted and canceled when they exceed configured
  caps.
- Index and shard contents are fully validated before successful caching.
- The index cache stores only a fulfilled valid index; an eight-entry LRU stores
  only fulfilled valid shards.
- Aborted, rejected, oversized, malformed, checksum-failing, and partial work
  is never cached.
- Controller state is tagged with the complete selected live identity.
  Selection changes abort prior work, and monotonic revisions prevent an old
  A result from appearing after A to B to A selection changes.
- Metadata errors never alter live traffic, health, selection, trail, map,
  provider cadence, or marker classification.

The source publication instant is a dataset-wide age, not per-aircraft
verification. The snapshot is valid through the exact 45-day boundary and
becomes unavailable after `2026-10-28T07:35:29Z`. A publication date more than
24 hours ahead of the browser clock is also invalid. An open cached detail view
reevaluates those clock rules without another request.

## License boundary and attribution

LiveTrafficStan source code remains Apache-2.0. The projected aircraft metadata
is a derivative database conveyed under ODC-By 1.0. Its full license is
co-located at
`public/aircraft-metadata/2026-09-13-v1/LICENSE`, and the project `NOTICE`
records the database attribution separately from source-code attribution.

When metadata is displayed, the selected-aircraft panel visibly identifies the
Mictronics aircraft-database, links ODC-By 1.0, shows the snapshot publication
date, and says that publication age is not per-aircraft verification age.
