# Aircraft metadata derivative database

This directory contains a compact derivative database generated from the
Mictronics
[aircraft-database](https://github.com/Mictronics/aircraft-database).
Database rights are licensed under the
[Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/),
not under LiveTrafficStan's Apache-2.0 source-code license.

The current immutable version is `2026-09-13-v1`, generated from commit
`1724959f854f540c95f11872bcd377ecfeb698a2`, internal database version 522.
Its co-located `LICENSE` file is the full ODC-By 1.0 text.

The projection keeps only:

- six-character ICAO24 address;
- source registration;
- ICAO type designator;
- source model description;
- configuration code;
- wake-turbulence category;
- an explicit ambiguity flag for globally duplicated registrations.

Owner, operator, photos, notes, and other personal or independently protected
content are excluded. ODC-By licenses database rights but does not warrant the
contents or clear every independent right in them.

`index.json` contains provenance, policy, the type dictionary, and exact shard
metadata. `shards/{PREFIX}.tsv` contains sorted records in one of these forms:

```text
SUFFIX<TAB>REGISTRATION<TAB>TYPE
SUFFIX<TAB>REGISTRATION<TAB>TYPE<TAB>A
```

`A` means the normalized registration is duplicated in the pinned source, so
the runtime must not display the record.

Maintain the dataset with:

```bash
npm run update:aircraft-metadata
npm run check:aircraft-metadata
```

The update command is an explicit maintainer operation. It downloads only the
pinned archive and license, verifies both SHA-256 values, uses the system
`unzip` executable, and replaces only the configured immutable version
directory. The normal integrity check is offline and validates the committed
license, provenance, inventory, hashes, complete TSV grammar, counts, and
45-day publication-age policy.

Any source pin, schema, generator behavior, or generated-byte change requires a
new output version and URL. Previously deployed immutable files may remain in
browser or edge caches and are inert after the application points to the new
version.
