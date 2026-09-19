# Natural Earth ports

LiveTrafficStan includes a small deterministic projection of Natural Earth
Ports for optional geographic context.

- Source: <https://github.com/nvkelso/natural-earth-vector>
- Tag: `v5.1.2`
- Commit: `f1890d9f152c896d250a77557a5751a93d494776`
- Source file: `geojson/ne_10m_ports.geojson`
- License/status: public domain
- Terms: <https://www.naturalearthdata.com/about/terms-of-use/>
- Source notes:
  <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/>

The projection retains only the Natural Earth ID, name, scalerank, and point
coordinates. It is generalized and incomplete. Natural Earth warns that some
port locations can be approximate by as much as 20 miles. This dataset is not
operational harbour information and must not be used to infer a vessel's
destination, berth, call, ETA, or relationship to a port.

Run `npm run update:ports` only after reviewing and updating the source manifest.
Run `npm run check:ports` for the network-free integrity check. Any source,
projection, generator, or generated-byte change requires a new immutable output
version; regenerating an existing version must produce byte-identical output.
