# Vessel Reference Photo Evaluation

## Status

LiveTrafficStan ships a deliberately small, manually reviewed vessel-photo
manifest. It contains five historical reference photographs for ferries
observed through Digitraffic in the Tallinn-Helsinki operating area on
2026-09-26.

The feature is accepted in production at application source
`86d8395c61c1348d3de8e11a9d7b36ad4f6271cc`. Exact-main validation run
`36248212097` and deployment/smoke run `36248272060` passed; Cloudflare
version `d527f34f-29f8-446a-9499-bb0135c7d361` serves the reviewed assets.
The synchronized public Wiki commit is
`204d4770c94b827834751f0b7335fb105683ae70`.

The feature is not a general vessel-image lookup. It makes no runtime request
to Wikimedia, Wikidata, a ship tracker, an image API, or a LiveTrafficStan
proxy. A photo is eligible only when the selected live vessel reports a valid
seven-digit IMO that exactly matches one reviewed manifest entry.

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
  -> selected live vessel details only
```

## Reviewed V1 manifest

All five vessels were present in the Digitraffic vessel metadata response and
in a current 100 km Tallinn-area location response during the review. The
runtime does not depend on that dated observation; it still requires the live
selected object to report the exact IMO.

| IMO | Vessel | Wikidata | Fixed Commons revision | Author | Selected license | Bundled SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `9214379` | Finlandia | [Q3022529](https://www.wikidata.org/wiki/Q3022529) | [1253024543](https://commons.wikimedia.org/w/index.php?title=File%3AFinlandia_Starboard_Side_Tallinn_24_April_2014.JPG&oldid=1253024543) | Pjotr Mahhonin | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `3c985873116117de641805d301a8dcc6c9b748e3b742693adad8772a52af0c83` |
| `9281281` | Victoria I | [Q115464](https://www.wikidata.org/wiki/Q115464) | [1248176797](https://commons.wikimedia.org/w/index.php?title=File%3AVictoria_I_Tallinn.jpg&oldid=1248176797) | Kjet | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `0852b59fba6a2a91a8e305445e4b7618db7db819a52ce9bf5189d8e71c4a952b` |
| `9375654` | Viking XPRS | [Q2301456](https://www.wikidata.org/wiki/Q2301456) | [790437743](https://commons.wikimedia.org/w/index.php?title=File%3AViking_XPRS_arriving_at_Tallinn_2_July_2015.JPG&oldid=790437743) | Pjotr Mahhonin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `da55686ca50685f10f53c7cca1b14743ff3dba18061f7ccdea6cd4490126b4bf` |
| `9773064` | Megastar | [Q23137888](https://www.wikidata.org/wiki/Q23137888) | [1215134198](https://commons.wikimedia.org/w/index.php?title=File%3AMegastar_departing_Tallinn_1_February_2017.jpg&oldid=1215134198) | Pjotr Mahhonin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `f404f7d9291a5245769f9d64b3f1d4b52058171d8c8774c094f6890e2633720e` |
| `9892690` | MyStar | [Q97203939](https://www.wikidata.org/wiki/Q97203939) | [1258843739](https://commons.wikimedia.org/w/index.php?title=File%3ATallink_MyStar_arriving_to_Port_of_Tallinn.png&oldid=1258843739) | KarlShipSpotting | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `b9570db89b83502fd7f8e1b5c8c9574ac366870774a8b9b33e8f2a8c47a127d9` |

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

The four Creative Commons Attribution-ShareAlike derivatives remain under the
same file-specific CC BY-SA version. The CC0 image remains under CC0. Visible
selected-details attribution includes the author, a link to the fixed Commons
revision, the selected license and license URL, and the modification notice.
The co-located
`public/vessel-photos/2026-09-26-v1/LICENSES.md` repeats that information for
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

The result identity includes selected entity ID, exact IMO, and manifest
version. React derives the result directly on every render and keys the photo
component by that complete identity, so an A to B to A selection sequence
cannot retain another hull's presentation.

The photo appears directly below the selected live ship heading. The UI says
**Reference photo matched to AIS-reported IMO {IMO}** and explicitly describes
it as a historical reference image, not a live view or independent
confirmation of the vessel currently reporting that AIS identity.

Missing, invalid, or unmatched IMO produces no real image and no placeholder.
Photos do not appear in hover, search results, map markers, trails, or HISTORY.
They do not mutate normalized traffic, provider health, freshness, selection,
camera, filters, or MQTT/REST lifecycle.

## Network, cache, privacy, and failure behavior

The browser loads only the selected same-origin versioned asset. There is:

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
- an array of unique exact IMO entries; the initial release contains five,
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

Unit and component tests prove exact-match, invalid/unmatched omission,
selection-identity tagging, visible attribution, top-of-details placement,
HISTORY exclusion, and no service-worker shell inclusion. Real-browser
acceptance must additionally verify the five bundled assets return `200` with
immutable cache headers, the matched/unmatched transitions do not flash a
stale hull, and the desktop plus 390-pixel layouts keep the photo, source,
license, Close action, attribution, and map reachable without horizontal
overflow.

The production acceptance passed those checks with deterministic marine
fixtures against the deployed application and actual static assets. It
verified all five 640-pixel images, valid-unmatched IMO `8917601`, invalid IMO
`8917602`, A-to-B-to-A transitions, exact MIME/cache headers, zero external
photo-provider requests, one MapLibre canvas, no horizontal overflow, and no
browser diagnostics at 1280x900, 390x844, and 390x568.

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

This initial manifest contains ferries, not yachts. Digitraffic publishes
Class A AIS only, and many yachts either use Class B AIS or do not carry a
stable IMO. The application already renders truthful sailing-vessel and
pleasure-craft silhouettes when reported data meets the released criteria, but
it will show a real yacht photograph only if a future yacht has the same
exact-IMO and file-specific evidence as every entry above.
