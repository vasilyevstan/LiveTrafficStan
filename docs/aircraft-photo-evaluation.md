# Aircraft Photo Evaluation

## Status

LiveTrafficStan contains a fail-closed Planespotters aircraft-photo path that is
explicitly enabled in the protected V1.6.0 production build. The public feature
uses direct browser JSON and unchanged provider image URLs; the Worker never
proxies or stores photo data.

An earlier local-origin probe on 2026-09-21 failed before readable CORS data
reached the browser. That result was superseded by exact-production-origin
acceptance on 2026-09-23 from
<https://livetrafficstan.syntal.workers.dev>: the hex lookup returned readable
HTTP 200 JSON, the unchanged `https://t.plnspttrs.net` thumbnail rendered at
200 by 137 pixels, and photographer/source metadata plus the exact photo-page
URL remained intact.

The published Photo API terms were rechecked on 2026-09-23. They permit this
low-volume, direct-browser use without an API key, membership account, email,
or prior provider contact. They require a valid browser `Origin` or `Referer`,
public and free access to the photo surface, direct unchanged provider URLs,
visible credit and source-page navigation, bounded JSON caching, and no image
persistence, proxying, rehosting, or API re-exposure. Contact is described for
higher-volume or guaranteed service, not as a prerequisite for this path.

Production remains enabled only while the exact-origin, direct-loading,
unchanged-URL, attribution, bounded-memory, and no-persistence contract
continues to pass. A material provider-policy or origin change requires a new
bounded check and a fail-closed redeployment if acceptance fails.

This is an engineering record, not legal advice. Provider terms and behavior
can change and must be rechecked before any enablement.

The protected production workflow has a required
`aircraft_photo_enabled` dispatch input. Source configuration remains `false`;
the accepted production dispatch explicitly passes `true`. A failed
CORS/provider-contract check requires redeploying an accepted application
source with the flag set back to `false`.

## Official sources

- Photo API, documentation, and API-specific terms:
  <https://www.planespotters.net/photo/api>
- General terms:
  <https://www.planespotters.net/legal/termsofuse>
- Public hex endpoint:
  `https://api.planespotters.net/pub/photos/hex/{ICAO24}`

The Photo API page currently documents that:

- the public API is free and requires no access key;
- browser requests must carry a valid `Origin` or `Referer`;
- the public API is intended to be CORS-enabled, while failed access checks
  receive `403`;
- one latest photo is returned for a hex lookup;
- API JSON may be cached for at most 24 hours;
- image bytes must load directly from the returned thumbnail URL and must not
  be stored, rehosted, proxied, or passed to another client;
- every returned URL must remain unchanged;
- visible photographer credit and an obvious followable photo-page link are
  mandatory;
- a browser thumbnail link must not use `nofollow`;
- photo areas must remain publicly and freely accessible;
- the API and its data must not be re-exposed through another API, feed,
  export, or dataset.

The application deliberately tightens the permitted JSON cache to one hour.

## Accepted application boundary

Only a live aircraft with a syntactically valid six-character ICAO24 is
eligible. Selection itself never starts a lookup. The user can activate
**Load aircraft photo** in selected details, or a fine pointer can remain over
one aircraft marker for 500 ms. Leaving before that dwell cancels the automatic
attempt, and vessels and HISTORY never start one.

The browser then makes one direct request to the exact hex endpoint with
credentials omitted, redirects rejected, `cache: no-store`, an eight-second
deadline, and a 32 KiB response cap. The response is accepted only when it
contains either:

- an empty `photos` array; or
- exactly one photo whose regular thumbnail uses the exact returned provider
  origin `https://cdn.planespotters.net` or
  `https://t.plnspttrs.net`, and whose source page uses
  `https://www.planespotters.net/photo/`.

Returned thumbnail and photo-page strings are validated but not rewritten.
The second thumbnail origin was observed in the live API response from the
exact production browser origin on 2026-09-23; wildcard image origins remain
disallowed.
The regular thumbnail is a plain new-tab link to the returned photo page with
`rel="noopener noreferrer"` and no `nofollow`. Photographer credit is visible
beside it.

The selected-details and hover controllers each keep at most one request
active. Selection or hover identity change, pointer leave, close, HISTORY
entry, and unmount abort and revision-invalidate obsolete work. Successful and
no-photo JSON results use one shared current-tab least-recently-used cache of at
most 32 entries for at most one hour, so a completed hover lookup is reused by
selected details. Errors are not cached, throttling is shared and honors
`Retry-After`, and hover failures do not automatically retry.

No photo JSON, URL, credit, or image byte is written to Web Storage, IndexedDB,
the Cache API, the service worker, Worker cache, KV, R2, or a LiveTrafficStan
endpoint. CSP permits only the exact API and thumbnail origins. The service
worker bypasses both origins.

The provider response does not echo ICAO24, registration, construction number,
or the provider's internal fallback decision. The UI therefore says only:

> Photo returned by Planespotters for ICAO24 …

It does not claim independent aircraft-identity verification and never
substitutes a model, airline, or generic photo.

## Deterministic acceptance

Synthetic browser and unit fixtures prove:

- zero photo requests on selection, sub-500 ms aircraft hover, vessel hover,
  and during HISTORY;
- one request only after explicit action or one stable 500 ms aircraft hover;
- A to B to A stale-result rejection and cancellation on leave/unmount;
- shared hover/details cache reuse with no duplicate provider request;
- unchanged API, CDN, and photo-page URLs;
- direct image loading, visible credit, an interactive popup, exact target/rel,
  and no `nofollow`;
- truthful not-found, throttled, timeout, invalid-response, network, forbidden,
  and provider-error states;
- successful and no-photo cache reuse, one-hour expiration, and 32-entry LRU
  eviction;
- no route request, traffic-provider restart, map replacement, selection loss,
  or live-tracking failure;
- no Planespotters content in Web Storage, IndexedDB, Cache API, or generated
  service-worker source;
- no aircraft-photo section for vessels or historical traffic.

Synthetic success proves application behavior; the dated production check
separately proves the current exact-origin provider boundary.

## Live acceptance result

The accepted 2026-09-23 production check used:

- application origin: `https://livetrafficstan.syntal.workers.dev`;
- ICAO24: `4CADF9`;
- API result: readable HTTP 200 JSON;
- request mode: ordinary browser `fetch`, credentials omitted, no-store,
  redirects rejected;
- thumbnail origin: exact returned `https://t.plnspttrs.net`;
- thumbnail result: directly rendered at 200 by 137 pixels;
- attribution: visible photographer/source metadata;
- navigation: exact unchanged Planespotters photo-page URL.

No API response, thumbnail, URL, or credit entered application-managed
persistent storage. A Worker proxy remains prohibited because it would violate
the selected direct-browser contract and the API prohibition on proxying and
re-exposing provider data.

## Vessel photos use a separate bundled contract

Issue
[#114](https://github.com/vasilyevstan/LiveTrafficStan/issues/114) selected the
manual exact-IMO path rather than broadening the Planespotters integration or
adding another runtime provider:

```text
IMO -> Wikidata QID -> fixed Commons file revision -> verified hull photograph
    -> author -> source -> selected license -> license URL -> exact credit
```

Five reviewed ferry photos are bundled as versioned same-origin assets.
MMSI-only, vessel-name, fuzzy, arbitrary runtime P18, sister-ship, class, and
model substitutions remain prohibited. Public pages from MarineTraffic,
VesselFinder, ShipSpotting, JetPhotos, Airliners.net, or similar services are
not integration or display-rights evidence.

The vessel path makes no Planespotters, Commons, Wikidata, tracker, or Worker
request at runtime and never appears in hover or HISTORY. See
[Vessel Reference Photo Evaluation](vessel-photo-evaluation.md) for its
file-specific identity, rights, checksum, attribution, cache, and takedown
contract.
