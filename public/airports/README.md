# Generated airport context

This directory contains the immutable OurAirports projection used by the
optional AIRPORTS layer.

- Source and output hashes, counts, versions, and terms are pinned in
  `src/config/airportsSource.json`.
- `npm run update:airports` downloads only the pinned source commit, verifies
  it, and writes the configured version.
- `npm run check:airports` validates the committed output without network
  access.
- Never edit generated GeoJSON by hand or replace bytes under an existing
  output version. Choose a new version after a reviewed source or projection
  change.

OurAirports releases its data to the Public Domain and provides no guarantee of
accuracy or fitness for use. The projected points are static reference context,
not navigation or operational flight data.
