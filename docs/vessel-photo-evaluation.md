# Vessel Reference Photo Evaluation

## Status

LiveTrafficStan ships a deliberately small, manually reviewed vessel-photo
manifest. Version `2026-10-02-v1` contains eight historical reference
photographs: the original five ferries plus Tarmo, Romantika, and MSC
Magnifica. The three additions were observed through Digitraffic on
2026-10-02 and retain the same exact-IMO, fixed-revision, bundled-asset
contract.

The eight-photo generation is accepted in production at application source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`. Protected release validation
run `36996187462`, canonical deployment run `36997443034`, rollback run
`36998162009`, and restoration run `36998245095` passed. The expansion remains
included unchanged in current application source
`d565b56278e81ff2478ab1e476c269084f2297d4`, deployed as Cloudflare version
`e9e473d1-fac5-4594-b62b-7ba68573efeb`. Those assets do not rewrite the
accepted `2026-09-26-v1` bytes, which remain historical
rollback assets.

The feature is not a general vessel-image lookup. It makes no runtime request
to Wikimedia, Wikidata, a ship tracker, an image API, or a LiveTrafficStan
proxy. A photo is eligible only when the selected or stably hovered live vessel
reports a valid seven-digit IMO that exactly matches one reviewed manifest
entry.

This is an engineering and attribution record, not legal advice. Source and
license evidence must be re-reviewed before adding or replacing an entry.

## Why a bundled manifest was selected

No reviewed free runtime provider supplied all of:

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

The accepted path is therefore:

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

`src/domain/vesselPhoto.ts` performs a synchronous lookup from the selected
normalized vessel's existing `imo` field:

- the value must be a safe integer rendered as exactly seven digits;
- the IMO weighted check digit must be valid;
- the exact IMO must exist in the committed manifest;
- MMSI, name, call sign, vessel type, class, route, or visual similarity are
  never fallback keys.

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

Missing, invalid, or unmatched IMO produces no real image and no placeholder.
Selected details now state whether AIS lacks a valid IMO or whether the valid
exact IMO has no reviewed manifest entry; both states explicitly say that no
substitute is shown. Sub-dwell hover, search results, map markers, trails, and
HISTORY produce no photo. The tooltip path does not mutate normalized traffic,
provider health, freshness, selection, camera, filters, or MQTT/REST lifecycle.

## Network, cache, privacy, and failure behavior

The browser loads only the selected or stable-hover same-origin versioned
asset. There is:

- no Wikimedia or Wikidata runtime request;
- no tracker, gallery, image API, proxy, Worker route, credential, cookie, or
  submitted user data;
- no image URL or metadata persistence in Web Storage or IndexedDB;
- no service-worker precache or runtime-cache path for vessel photographs.

`public/_headers` gives `/vessel-photos/*` one-year immutable browser caching.
Every changed source, transformation, manifest field, or bundled byte requires
a new manifest/version directory; files are never replaced under an existing
immutable path.

An absent asset remains a normal failed image request. The application does not
replace it with another photo or report success-shaped generic imagery.
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

This manifest contains ferries, one icebreaker, and one cruise ship, not
yachts. Digitraffic publishes Class A AIS only, and many yachts either use
Class B AIS or do not carry a stable IMO. The application already renders
truthful sailing-vessel and pleasure-craft silhouettes when reported data meets
the released criteria, but it will show a real yacht photograph only if a
future yacht has the same exact-IMO and file-specific evidence as every entry
above.
