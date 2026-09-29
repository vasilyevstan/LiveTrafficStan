# Orbital Purpose and Image Source Evaluation

## Decision

Issue #193 uses a small application-owned manifest indexed by exact canonical
NORAD catalog ID and fenced by the complete reviewed identity. The first
reviewed version,
`2026-09-29-v1`, contains:

| NORAD ID | Current catalog identity | Purpose source | Image |
| --- | --- | --- | --- |
| `20580` | `HST`, `1990-037B`, `PAY` | NASA Science, **About Hubble** | NASA photograph `s125e011615` |
| `25544` | `ISS (ZARYA)`, `1998-067A`, `PAY` | NASA, **Space Station Research and Technology** | NASA photograph `s132e012212` |

Every other orbital object remains explicitly unenriched. A missing record
means purpose and image are unavailable; the application never substitutes a
generic satellite, rocket, mission, operator, or stock image.

The reviewed manifest is static application context. It does not change
CelesTrak acquisition, SGP4 propagation, map crossings, provider health,
traffic models, freshness, history, or the scheduled catalog schema.

## Identity rule

The browser first receives the validated CelesTrak snapshot selected by
Issue #162. Enrichment is accepted only when all four reviewed values match:

1. canonical NORAD catalog ID;
2. current CelesTrak object name;
3. current international designator;
4. exact SATCAT object type.

The lookup also tags the current feature ID, complete catalog snapshot digest,
and immutable manifest version. A renamed, redesignated, retyped, duplicated,
or absent object fails closed to unavailable. Purpose is not inferred from the
name, owner code, catalog group, orbit, launch date, or neighboring records.

## Purpose evidence

### Hubble Space Telescope — NORAD 20580

The reviewed CelesTrak snapshot identifies NORAD `20580` as:

```text
name: HST
international designator: 1990-037B
SATCAT type: PAY
```

NASA Science's
[About Hubble](https://science.nasa.gov/mission/hubble/overview/about-hubble/)
page identifies Hubble as a large space-based observatory used to observe the
universe and expand understanding of the cosmos. The page reports publication
date `2022-10-06` and modification date `2026-09-11`.

The exact HTML retrieved on `2026-09-29` had SHA-256:

```text
5f1bbc41ffc1234992f53cddeaa3bbbb7c18d920750d885b730932a13cd93493
```

The application uses a short paraphrase rather than presenting the source text
as a live mission-status statement.

### International Space Station — NORAD 25544

The reviewed CelesTrak snapshot identifies NORAD `25544` as:

```text
name: ISS (ZARYA)
international designator: 1998-067A
SATCAT type: PAY
```

NASA's
[Space Station Research and Technology](https://www.nasa.gov/international-space-station/space-station-research-and-technology/)
page identifies the International Space Station as an orbiting laboratory for
research and technology demonstrations, including discoveries not possible on
Earth and future exploration. The page reports publication date `2023-02-27`
and modification date `2026-07-27`.

The exact HTML retrieved on `2026-09-29` had SHA-256:

```text
ff5ff84df1d9ec60d511b6139618165d890ca9d3229ce3236d740e0cfb0d3450
```

The manifest uses a concise paraphrase and makes no claim about current crew,
configuration, operations, safety, or launch/reentry state.

## Image evidence

Both bundled files are exact byte copies of NASA's reviewed `~small.jpg`
alternates. LiveTrafficStan does not crop, resize, retouch, recompress, or
remove metadata from them.

### Hubble photograph

- NASA ID: `s125e011615`
- title: **View of HST during its release from the Shuttle Atlantis**
- capture date: `2009-05-19`
- source page:
  <https://images.nasa.gov/details/s125e011615>
- exact metadata response:
  <https://images-api.nasa.gov/search?nasa_id=s125e011615>
- canonical original:
  <https://images-assets.nasa.gov/image/s125e011615/s125e011615~orig.jpg>
- reviewed source:
  <https://images-assets.nasa.gov/image/s125e011615/s125e011615~small.jpg>
- reviewed/bundled dimensions: `437 x 640`
- reviewed/bundled bytes: `46,716`
- reviewed/bundled SHA-256:
  `adcf73f7e244cfa5f2053b4e0e61d5399278b9f1832d030f3fda618d40cee78e`
- metadata-response SHA-256:
  `b52ec3cbf49c554db3e5085d97b7a51c8e3d60a5641db1d9bdf1dc7a51f1f2d6`

NASA's metadata explicitly names HST, describes its release from Atlantis,
and identifies the asset as an image from Johnson Space Center. The original
JPEG contains Nikon camera EXIF, supporting the photograph classification.

### International Space Station photograph

- NASA ID: `s132e012212`
- title: **Flyaround view of ISS after undocking**
- capture date: `2010-05-23`
- source page:
  <https://images.nasa.gov/details/s132e012212>
- exact metadata response:
  <https://images-api.nasa.gov/search?nasa_id=s132e012212>
- canonical original:
  <https://images-assets.nasa.gov/image/s132e012212/s132e012212~orig.jpg>
- reviewed source:
  <https://images-assets.nasa.gov/image/s132e012212/s132e012212~small.jpg>
- reviewed/bundled dimensions: `640 x 425`
- reviewed/bundled bytes: `48,741`
- reviewed/bundled SHA-256:
  `19b0fc48542f8c543f01a85aced18aadb2bbc162ac8144741d22dd066a2a40f6`
- metadata-response SHA-256:
  `00f18b615bab8c6557ca96c66132e9e6ca0cf174f4b98b8086259aabf3717834`

NASA's metadata explicitly names the International Space Station, describes
the STS-132 post-undocking photograph, and identifies Johnson Space Center.
The original JPEG also contains Nikon camera EXIF.

## Rights and attribution

NASA's
[Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
state that NASA content generally is not subject to copyright in the United
States and may be used for educational or informational web pages. Credit is
requested. Use must not imply NASA endorsement, and NASA identifiers and
insignia remain protected.

The reviewed policy HTML retrieved on `2026-09-29` had SHA-256:

```text
e2b914510c5a295c22ccba384c32ca99282bc9c49fd43ac20d5e27730b558c16
```

The two files use the visible credit **Photo: NASA** and link to the applicable
NASA source page and usage guidelines. The co-located
`public/orbital-enrichment/2026-09-29-v1/LICENSES.md` notice makes clear that
the photographs are not licensed under the repository's Apache-2.0 source-code
license. LiveTrafficStan uses no NASA insignia or logotype as application
branding and makes no endorsement claim.

## Why rocket bodies and debris remain unavailable

CelesTrak's `visual` group contains many exact `R/B` records, but no reviewed
NASA, ESA, or other public primary source was found that assigns an
authoritative current purpose or exact in-orbit photograph to an individual
cataloged rocket body or debris fragment by NORAD ID.

Using the launch vehicle family, original payload mission, object name suffix,
or orbit would be inference. It could also attribute a payload's purpose to a
structurally distinct discarded stage. Account-gated sources such as ESA
DISCOSweb add redistribution restrictions and do not justify a new runtime or
credential boundary for this feature. Rocket-body, debris, and unreviewed
payload enrichment therefore remains unavailable.

Terra / EOS AM-1 (`25994`) was considered as a possible future
purpose-available/image-unavailable record, but its source chain was not
reviewed to the same depth in this release and it is intentionally excluded.

## Browser and request contract

- The two-record JSON manifest is compiled into the application bundle.
- Purpose labels require no request.
- Images are immutable same-origin Static Assets and are not part of the PWA
  application-shell precache.
- No image request occurs before exact orbital selection.
- Ordinary map hover never contacts NASA or another third party.
- Selection permits at most one bounded fetch of the exact immutable path. The
  request omits credentials and referrer, rejects redirects, and has a
  five-second total deadline.
- The response must be exact `200`, declare the reviewed media type, remain at
  the exact manifest byte count while streaming, and match the reviewed
  SHA-256 before the application creates a session Blob URL.
- Concurrent and later uses share only that fulfilled Blob URL. A later hover
  cannot fetch the asset; it can render only a path-to-Blob-URL entry already
  validated by selected details.
- Obsolete in-flight selection work is aborted and removed. Invalid, missing,
  oversized, checksum-failing, timed-out, or decode-failing work never becomes
  ready and remains a terminal failure for that running tab rather than
  creating an uncontrolled retry loop.
- Blob URLs are revoked on invalidation or application teardown.
- External NASA pages are contacted only if the user explicitly follows a
  source or policy link.
- No viewport, Home, geolocation, camera, selection, cookies, credentials,
  referrer-derived personal data, or provider headers are sent to NASA.

## Integrity and rollback

`npm run check:orbital-enrichment` validates without network access:

- manifest schema/version/date and bounded record count;
- canonical sorted unique NORAD IDs;
- exact name, designator, and SATCAT type against the committed visual catalog;
- HTTPS purpose/image/policy provenance and recorded SHA-256 values;
- required NASA credit and co-located notice;
- immutable versioned asset paths;
- JPEG/PNG signatures, dimensions, byte limits, inventory, and SHA-256;
- at least one reviewed image;
- published-version immutability against the pull-request base.

The first manifest is limited to 16 records, 512 KiB per image, and 1 MiB
total; the current two files total `95,457` bytes. Every source, identity,
rights, metadata, or byte change requires a new manifest version and path.

Rollback is byte-exact with the application release. No database, provider
request, scheduler, secret, Worker route, or retained infrastructure resource
is added. A takedown removes the manifest entry and bundled asset in a new
version and deploys that exact source; it never substitutes another object.

## Local rendered acceptance

The clean production build was exercised in headless Chrome 154 at desktop
1280x900 and mobile 390x844/390x568 with browser HTTP caching disabled. The
fixture used the real committed catalog identities for Hubble `20580`, ISS
`25544`, and rocket body `733` (`THOR AGENA D R/B`, exact SATCAT `R/B`).

Measured results:

- zero enrichment-image request before selection;
- exactly one same-origin `Fetch` request for each reviewed image, both exact
  `200 image/jpeg`, neither from disk cache nor the service worker;
- decoded dimensions of 437x640 for Hubble and 640x425 for ISS;
- selected details and the later ISS tooltip used the identical `blob:` URL,
  with no hover, re-selection, or theme-change image request;
- an injected terminal image failure remained unavailable after re-selection
  and did not retry;
- the unreviewed rocket body showed the explicit purpose/image fallback and
  made no image request;
- direct ISS-to-Hubble selection reset the details scroll position;
- mobile details scrolled to their end without horizontal overflow, retained
  attribution, and bounded the image to 160 px at 390x844 and 88 px at
  390x568;
- one MapLibre canvas persisted with no same-origin failure, runtime exception,
  or console error.

## Production release and public-origin acceptance

The exact released application identity is:

- application source:
  `96d67b6da3e395be79acff27b47ad6dee34de309`;
- feature, ancestry, and release PRs: #212, #213, and #214;
- exact merged-`main` validation:
  [36626910897](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36626910897);
- canonical deployment and full smoke:
  [36627748051](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36627748051);
- Cloudflare version: `3d6c692e-1a29-4fa4-bbee-2ab5545d9d57`;
- client asset: `assets/index-Cl87tlUV.js`;
- deployed `index.html` SHA-256:
  `140921b505e2043ded16a4ebb09c11a30c4a5f7b8f4d4b8f55120c5bb7f9b97d`;
- public Wiki:
  `1cedad08275d9e162aab618bea0af2e0bbf4cb43`.

Fresh Chrome 154 exercised the public origin with browser HTTP caching disabled
and real current Hubble, ISS, and NORAD `733` map features. Before selection,
there were zero enrichment-image requests. Exact selection then produced only:

| Asset | Status/type | Content length | Cache policy | Browser cache / Service Worker |
| --- | --- | ---: | --- | --- |
| Hubble `norad-20580.jpg` | `200 image/jpeg` | 46,716 | `public, max-age=31536000, immutable` | neither |
| ISS `norad-25544.jpg` | `200 image/jpeg` | 48,741 | `public, max-age=31536000, immutable` | neither |

Both were application `Fetch` requests, not raw `Image` requests, because the
browser validated bytes before rendering Blob URLs. The decoded dimensions
were exactly 437x640 and 640x425. Production observed:

- one request per reviewed asset and no request before selection;
- identical ISS Blob URL in selected details and the later compact tooltip;
- no image request on hover, theme change, re-selection, or rocket-body
  fallback;
- exact Hubble-to-ISS-to-Hubble identity fencing;
- truthful no-purpose/no-image output for exact `R/B` NORAD `733`;
- a forced terminal image failure that remained unavailable after reselection
  and did not retry;
- zero NASA runtime requests, same-origin failures, loading failures, runtime
  exceptions, or console errors;
- one unchanged MapLibre canvas throughout.

Responsive acceptance measured:

- desktop Hubble image: 220 px rendered height;
- desktop ISS image: 207.1875 px rendered height;
- 390x844: 303.828125 px details panel, 159.984375 px image, exact 931 px
  maximum scroll;
- 390x568: 115 px details panel, 87.984375 px image, exact 1,048 px maximum
  scroll.

Both mobile sizes retained zero horizontal overflow, source/rights text, map
attribution, and one canvas.

The same acceptance loaded one complete same-origin orbital catalog response
with exact release header, schema `1`, 156 records, retrieval
`2026-09-29T18:52:12.000Z`, and digest
`f6183329084286f4fbb5cdfcea16e827e751569e7d5919d9e8222eadf95f017d`.
It still reported `X-LiveTrafficStan-Orbital-Source: bootstrap`; #162 retains
the first successful scheduled KV publication as separate outstanding
evidence.

The first exact-source deployment
[36627068064](https://github.com/vasilyevstan/LiveTrafficStan/actions/runs/36627068064)
had already published healthy application, orbital, and enrichment assets as
Cloudflare version `7b1233c9-3461-440b-ac5f-1d30b02c0525`. It failed only
because the independent private aircraft relay returned HTTP `502`. A
supported OCI diagnostic reboot restored real bounded ADSB JSON, and the
canonical same-source deployment above passed. No enrichment rollback,
provider change, credential change, cache, fallback, or privacy-boundary change
was required; #174 records the recovery and is closed.

## Stop conditions

Leave an object unavailable when any of these conditions holds:

- purpose is not supported by an authoritative source tied unambiguously to
  the exact current identity;
- image identity, photograph/illustration status, credit, public-display
  basis, or transformation rights are unclear;
- the source requires credentials or separate redistribution permission;
- current catalog name, designator, or exact SATCAT type differs from the
  reviewed manifest identity;
- required source/asset hashes, dimensions, notices, or immutable path checks
  fail;
- implementation would add a startup, hover-driven provider, camera-driven,
  or per-propagation request.
