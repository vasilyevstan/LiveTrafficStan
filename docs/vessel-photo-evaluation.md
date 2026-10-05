# Vessel Photo Evaluation

## Status

LiveTrafficStan loads vessel photographs on selection or stable hover through
Open Waters' existing media lookup. It prefers a valid AIS-reported IMO and
otherwise uses the exact ordinary vessel MMSI. This is a provider lookup, not
independent verification of the transmitting hull. MMSIs can be reassigned.
AISStream and Open Waters both continue supplying traffic alongside
Digitraffic; AISStream's AIS messages are not a photograph feed.

The eight reviewed historical photographs in bundled version
`2026-10-02-v1` remain the first choice for their exact IMOs, without a media
API request. They cover Tarmo, Finlandia, Romantika, Victoria I, Viking XPRS,
MSC Magnifica, Megastar and MyStar. Dynamic coverage is additional and
best-effort, not an expansion of that immutable reviewed library.

Production source `de9d8603bebe1797a1b57cd0b9f99fe343858f8b` verified actual
BALTIC WHALE / reported IMO `9354454` outside that library: a decoded 960x640
Commons image by Eduard47, CC BY-SA 4.0. Stable hover made one metadata
request and details reused it. Native 390x844/568 touch exposed the complete
image, source/license and Close without horizontal overflow or map pan.
The historical file is captioned ANNA SIRKKA; this remains a provider IMO
match, not independent current-transmitter verification. The
[release receipt](https://github.com/vasilyevstan/LiveTrafficStan/pull/333#issuecomment-6001037124)
records exact deployment, rollback and restoration.

The historical eight-photo generation was accepted at application source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`. Protected release validation
run `36996187462`, canonical deployment run `36997443034`, rollback run
`36998162009`, and restoration run `36998245095` passed. The expansion remains
included unchanged in the subsequent application source
`e2b2afaa04466116719310d6286441f8e6ba60ca`, deployed as Cloudflare version
`816506f7-2cb1-4e6c-8626-ae990eb62b8a`. Those assets do not rewrite the
accepted `2026-09-26-v1` bytes, which remain historical
rollback assets.

## Open Waters source contract

The public implementation was reviewed at
[`openwatersio/aiscast@37f97fe2166f8fa55c7789641dca53c85deeac8a`](https://github.com/openwatersio/aiscast/tree/37f97fe2166f8fa55c7789641dca53c85deeac8a),
particularly `client/app/routes/vessel-media.ts`, `client/app/lib/media.server.ts`
and the client photo components. Its route is:

```text
GET https://openwaters.io/ais/vessels/media/{IMO-or-MMSI}
```

It uses exact-number Commons categories and, for IMO, an exact P458 Wikidata
item image. It returns at most eight images with thumbnail URL, dimensions,
Commons file page, artist and license. A 2026-10-05 request for IMO `8919805`
returned eight attributed photographs outside our bundled library. The route
does not send a browser CORS allowance, so the application uses the narrow
same-origin `GET /api/vessel-photos/{number}` Worker route. No key, account,
new service or arbitrary image proxy is required.

The provider can return historical names or imperfect category associations.
The UI therefore labels the reported-number lookup rather than calling it a
reviewed exact-hull photograph. An MMSI lookup additionally warns about
reassignment. There is no name, location, nearby-vessel, sister-ship or fuzzy
fallback.

The browser accepts only supported CC BY, CC BY-SA, CC0 or public-domain
records with bounded artist/license fields, sensible dimensions, a Commons
file page and an allowed Commons thumbnail host. Attribution licenses require
a Creative Commons license link. Unsupported or incomplete nonempty metadata
is an error, not a successful empty result. The image remains a link to its
source with visible artist, source and license. No image bytes are proxied,
modified, rehosted or added to the bundled library.

This is an engineering and attribution record, not legal advice. Source and
license evidence must be re-reviewed before adding or replacing an entry.

## Why the original bundled manifest was selected

At the original review, no selected free runtime provider supplied all of:

- exact selected-hull identity;
- predictable public browser access;
- file-specific author, source, license, and attribution;
- permitted retention or rehosting;
- deterministic failure behavior.

MMSI and vessel names are insufficient identity keys. MMSIs can be reassigned,
names can change or collide, and a class or sister-ship photograph can show a
different hull. Arbitrary runtime Wikidata `P18` or Commons search would also
leave file-specific identity, revision, multi-license, deletion, and
attribution decisions to unreviewed browser behavior.

That reviewed fallback remains:

```text
live AIS vessel
  -> valid exact IMO
  -> reviewed manifest entry
  -> Wikidata item with the same IMO and selected Commons file
  -> fixed Commons file-page revision
  -> bundled, hashed, versioned derivative
  -> selected live vessel details or stable fine-pointer tooltip
```

## Reviewed V2 manifest

The original five vessels were present in the Digitraffic vessel metadata
response and in a current 100 km Tallinn-area location response during the
2026-09-26 review. On 2026-10-02, Tarmo and Romantika were present in the same
Tallinn-area live response; MSC Magnifica reported a current Baltic Sea
position while bound for Copenhagen. The runtime does not depend on those
dated observations; it still requires the live selected object to report the
exact IMO.

| IMO | Vessel | Wikidata | Fixed Commons revision | Author | Selected license | Bundled SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `5352886` | Tarmo | [Q1530233](https://www.wikidata.org/wiki/Q1530233) | [1263937541](https://commons.wikimedia.org/w/index.php?title=File%3ATarmo_1963_IMO_5352886_Tallinn_14_July_2012.JPG&oldid=1263937541) | Pjotr Mahhonin | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `164c64c026545a221c10815a9a0a0242383f8436cf87a10107ff53980a3c1db4` |
| `9214379` | Finlandia | [Q3022529](https://www.wikidata.org/wiki/Q3022529) | [1253024543](https://commons.wikimedia.org/w/index.php?title=File%3AFinlandia_Starboard_Side_Tallinn_24_April_2014.JPG&oldid=1253024543) | Pjotr Mahhonin | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `3c985873116117de641805d301a8dcc6c9b748e3b742693adad8772a52af0c83` |
| `9237589` | Romantika | [Q2576348](https://www.wikidata.org/wiki/Q2576348) | [1019112070](https://commons.wikimedia.org/w/index.php?title=File%3ARomantika%2C_Stockholm%2C_2019_%2804%29.jpg&oldid=1019112070) | Bahnfrend | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `f59a6730513569013a59257cdece8721c63d4f75cb6457e704fd3d030eab6f0a` |
| `9281281` | Victoria I | [Q115464](https://www.wikidata.org/wiki/Q115464) | [1248176797](https://commons.wikimedia.org/w/index.php?title=File%3AVictoria_I_Tallinn.jpg&oldid=1248176797) | Kjet | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `0852b59fba6a2a91a8e305445e4b7618db7db819a52ce9bf5189d8e71c4a952b` |
| `9375654` | Viking XPRS | [Q2301456](https://www.wikidata.org/wiki/Q2301456) | [790437743](https://commons.wikimedia.org/w/index.php?title=File%3AViking_XPRS_arriving_at_Tallinn_2_July_2015.JPG&oldid=790437743) | Pjotr Mahhonin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `da55686ca50685f10f53c7cca1b14743ff3dba18061f7ccdea6cd4490126b4bf` |
| `9387085` | MSC Magnifica | [Q1881854](https://www.wikidata.org/wiki/Q1881854) | [1107507134](https://commons.wikimedia.org/w/index.php?title=File%3AMSC_Magnifica_at_Ocean_Cay_MSC_Marine_Reserve_%28March_12%2C_2024%29_01.jpg&oldid=1107507134) | Kiran891 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `8ca84b8bb135759ed1a6db1753e9da4ec9f58cede9427ae0a891b48c7cd41f8d` |
| `9773064` | Megastar | [Q23137888](https://www.wikidata.org/wiki/Q23137888) | [1215134198](https://commons.wikimedia.org/w/index.php?title=File%3AMegastar_departing_Tallinn_1_February_2017.jpg&oldid=1215134198) | Pjotr Mahhonin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `f404f7d9291a5245769f9d64b3f1d4b52058171d8c8774c094f6890e2633720e` |
| `9892690` | MyStar | [Q97203939](https://www.wikidata.org/wiki/Q97203939) | [1258843739](https://commons.wikimedia.org/w/index.php?title=File%3ATallink_MyStar_arriving_to_Port_of_Tallinn.png&oldid=1258843739) | KarlShipSpotting | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `b9570db89b83502fd7f8e1b5c8c9574ac366870774a8b9b33e8f2a8c47a127d9` |

Romantika and Tarmo each have one exact Wikidata-linked image. Tarmo's harbour
frame contains other vessels in the background, but the foreground hull is
explicitly named Tarmo in the filename and multilingual description and is
filed under the exact `Tarmo (ship, 1963)` category. MSC Magnifica has two
normal-rank Wikidata images; the expansion deliberately selects the newer
single-license CC BY-SA 4.0 Ocean Cay image rather than the older
CC BY-SA 3.0/GFDL dual-licensed file. Its exact-hull category and IMO-specific
Wikidata item prevent substitution of another Musica-class sister ship.

The complete machine-readable evidence is in
`src/config/vesselPhotoManifest.json`. It records:

- exact IMO, review-time vessel name, MMSI, Digitraffic timestamp,
  destination, and operating area;
- Wikidata QID and item URL;
- exact Commons file title, page URL, page revision ID and revision URL;
- the original file URL, media type, dimensions, bytes, and Commons SHA-1;
- the reviewed 960-pixel thumbnail URL, dimensions, bytes, and SHA-256;
- author, source, selected license, license URL, exact credit line, and whether
  attribution is legally required;
- bundled path, media type, dimensions, bytes, SHA-256, alt text, and
  modification notice.

The fixed page revision preserves the evidence reviewed at publication time.
The bundled bytes and checksum preserve the displayed derivative even if a
current Commons page or file later changes.

## Image processing and license handling

Each source was downloaded from the recorded Wikimedia thumbnail URL, resized
to a maximum dimension of 640 pixels, and stripped of embedded metadata. No
image was cropped or visually retouched.

The seven Creative Commons Attribution-ShareAlike derivatives remain under the
same file-specific CC BY-SA version. The CC0 image remains under CC0. Visible
selected-details attribution includes the author, a link to the fixed Commons
revision, the selected license and license URL, and the modification notice.
The co-located
`public/vessel-photos/2026-10-02-v1/LICENSES.md` repeats that information for
the distributed files.

The repository's Apache-2.0 license applies to source code only and does not
relicense these photographs.

## Runtime contract

`src/domain/vesselPhoto.ts` first performs a synchronous bundled lookup from
the selected normalized vessel's existing `imo` field:

- the value must be a safe integer rendered as exactly seven digits;
- the IMO weighted check digit must be valid;
- the exact IMO must exist in the committed manifest;
- the reviewed bundled match never uses MMSI, name, call sign, vessel type,
  class, route or visual similarity as fallback keys.

If no bundled photo exists, a dynamic lookup uses the valid IMO or an ordinary
nine-digit MMSI in `[200000000, 800000000)`. Its full identity contains entity
ID, number kind and number. The shared photo controller fences each revision,
including an IMO arriving after an MMSI lookup and A-to-B-to-A changes.
Selection starts one automatic attempt; hover uses the existing 500 ms dwell.
Aircraft retains its separate Planespotters adapter with the same reusable
controller and automatic selection behavior.

The result identity includes entity ID, exact IMO, and manifest version. React
derives the selected-details result directly on every render, while the map
resolves the same complete identity only after its existing 500 ms
fine-pointer dwell. An A to B to A selection or hover sequence therefore
cannot retain another hull's presentation.

The full photo card appears directly below the selected live ship heading. The
UI says **Exact AIS-reported IMO {IMO} match** and explicitly
describes it as a historical reference image, not a live view or independent
confirmation of the vessel currently reporting that AIS identity. On devices
with a fine hover-capable pointer, remaining over the exact rendered vessel
for 500 ms may add a compact version to the existing map tooltip. That image
links the fixed Commons revision and retains visible author, source, license,
historical-reference, and exact-IMO context. Touch and keyboard users continue
to use selected details for the full record.

Missing usable identity, successful empty response, loading, unsupported
metadata, timeout, offline and provider failure have distinct presentation.
No substitute image is shown. Sub-dwell hover, search results, map markers,
trails and HISTORY start no photo lookup. The tooltip path does not mutate normalized traffic,
provider health, freshness, selection, camera, filters, or MQTT/REST lifecycle.

## Network, cache, privacy, and failure behavior

Bundled matches load only the versioned same-origin image. Dynamic matches use
one fixed same-origin metadata route and directly load the validated unchanged
thumbnail from `thumb.wikimedia.org` or `upload.wikimedia.org`. CSP allows only
those exact additional image origins. Anonymous image loading and
`no-referrer` suppress cross-origin cookies and referrer context.

The Worker permits GET, a checksum-valid IMO or ordinary MMSI, and no query
string or foreign browser Origin. It forwards only Accept and the project
User-Agent to the fixed Open Waters host. It rejects redirects, bounds the
streamed JSON to 128 KiB and eight photos, and applies an eight-second total
upstream deadline. The browser applies a ten-second deadline. Responses are
`no-store`; there is no wildcard CORS, coordinate forwarding, shared Worker
cache, secret, backend image archive or arbitrary URL input.

Open Waters caches genuine empty results for one day, but failed/incomplete
lookups for 900 seconds. An empty response with the latter cache policy maps
to `503` and `Retry-After: 900`, not "no photo". Both `429` and failure
`Retry-After` deadlines block manual/automatic requests across the tab's
hover/details controllers without scheduling retries.

Fulfilled photo or genuine empty metadata may use a 32-entry, one-hour
current-tab LRU. Failed, aborted, partial and rejected responses do not enter
it. Hidden/offline/HISTORY/selection/unmount transitions abort obsolete work.
There is no Web Storage, IndexedDB, service-worker, Cache API or history
persistence for image URLs, metadata or image bytes. The service worker
bypasses the new API and both Commons image hosts.

`public/_headers` gives `/vessel-photos/*` one-year immutable browser caching.
Every changed source, transformation, manifest field, or bundled byte requires
a new manifest/version directory; files are never replaced under an existing
immutable path.

An image load failure is reported with a source-page link. The application
does not replace it with another photo or report success-shaped generic imagery.
Rollback restores the earlier application/static-asset version as one
Cloudflare deployment.

## Deterministic validation

`npm run check:vessel-photos` is network-free and validates:

- schema and immutable version grammar;
- an array of unique exact IMO entries; the current release contains eight,
  while validation deliberately permits a smaller emergency takedown version;
- IMO check digits and review-time MMSI/timestamp fields;
- pinned Wikidata and Commons URL structure;
- supported file-specific licenses and exact license URLs;
- required identity note, credit, source, and modification fields;
- same-origin versioned asset paths with exact IMO filenames;
- the one-year immutable response policy for the versioned path;
- JPEG/PNG signatures, dimensions, byte counts, and SHA-256;
- a 512 KiB per-image and 1 MiB total bundled-byte budget;
- complete co-located license text;
- no orphaned or missing file in the version directory.

Pull-request and protected-branch validation also supplies the exact base
commit. The checker rejects byte, evidence, or manifest changes under an
already published version and rejects reuse of a version path found in
repository history. A changed source, right, transformation, or byte set must
therefore use a new manifest version. The network-free checks validate the
committed review record and its internal consistency; they do not replace the
required human review of the pictured hull and the fixed upstream rights
evidence.

Unit and component tests prove exact-match, distinct invalid/unmatched
unavailable reasons with image omission, selection and tooltip identity
guards, visible attribution, top-of-details placement, sub-dwell/HISTORY
exclusion, and no service-worker shell inclusion. Real-browser acceptance must
additionally verify the eight bundled assets return `200` with immutable cache
headers, a stable desktop hover renders the correct linked image without an
external provider request, matched/unmatched transitions do not flash a stale
hull, and the desktop plus 390-pixel layouts keep the selected-details photo,
source, license, Close action, attribution, and map reachable without
horizontal overflow.

Dynamic regressions additionally cover IMO/MMSI preference and checksum,
full selected identity and returned lookup-number matching, stale callbacks,
shared results/cooldowns, fixed upstream/privacy/redirect rules, bounded body
and timeout handling, supported license/host validation, hover image rendering,
offline/history exclusions and failure-versus-empty wording. Real-browser
acceptance must load an actual current vessel outside the eight bundled IMOs;
HTTP metadata or fixture-only success is insufficient. The 2026-10-05 local
Worker/browser check loaded BALTIC WHALE, reported IMO `9354454`, as a
960 x 640 Commons image credited to Eduard47 under CC BY-SA 4.0. This local
receipt is not a claim that the new application has already been deployed.

The original five-photo production acceptance passed those checks with
deterministic marine fixtures against the deployed application and actual
static assets. It
verified all five 640-pixel images, valid-unmatched IMO `8917601`, invalid IMO
`8917602`, A-to-B-to-A transitions, exact MIME/cache headers, zero external
photo-provider requests, one MapLibre canvas, no horizontal overflow, and no
browser diagnostics at 1280x900, 390x844, and 390x568. The tooltip release
additionally proved zero image request before 500 ms, the exact Finlandia
640x472 JPEG afterward, fixed source/rights context, preserved keyboard focus,
pointer/focus traversal, Escape dismissal back to the map, stale-marker
cleanup, unmatched omission, and no external image-provider request or browser
diagnostic against the production origin.

The eight-photo release repeated the acceptance against exact release source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`. All eight
same-origin assets returned their declared image MIME and
`public, max-age=31536000, immutable`; selected details distinguished the exact
invalid/missing wording from the valid-but-uncovered exact-IMO wording; and an
A-to-B-to-A sequence never paired stale image/title/rights state. Desktop
1280x900 and mobile 390x844/390x568 retained the Close action, photo,
source/license text, attribution, and one MapLibre canvas with no external
photo-provider request or browser diagnostic.

## Adding or removing an entry

1. Confirm the vessel was observed through Digitraffic and reports a valid
   exact IMO.
2. Verify a Wikidata item with the same IMO and the intended Commons image.
3. Review the exact Commons file page and a fixed page revision for hull
   identity, author, source, license choices, restrictions, and deletion
   notices.
4. Select one supported license and record the exact credit.
5. Download a reviewed thumbnail, record its checksum, create the bounded
   derivative, strip metadata, and record the final checksum.
6. Add the new asset under a new immutable manifest version, update the
   manifest and co-located license notice, and run the full validation.

For a takedown or unresolved identity/rights dispute, remove that exact entry
and asset in a new version and deploy it. Do not silently replace it with a
different hull or weaken matching. The ongoing integrity check does not impose
the initial five-photo acceptance minimum, so removal does not depend on
finding a replacement image.

## Yacht limitation

The bundled manifest contains no yachts. AISStream and Open Waters add
best-effort Class B reception, and dynamic media lookup can use an ordinary
MMSI when a yacht has no valid IMO. This does not guarantee that Commons has
an image, that a receiver sees the yacht, or that a reassigned MMSI identifies
the current hull. Existing reported-type and length filters are unchanged.
