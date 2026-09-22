# Aircraft Photo Evaluation

## Status

LiveTrafficStan contains a disabled-by-default Planespotters aircraft-photo
evaluation path. It is not enabled in the checked production configuration and
must not be described as a released photo feature.

The implementation is complete enough to preserve the reviewed provider
contract, but the required live browser acceptance did not pass on
2026-09-21. One request from the evaluated application origin reached
`https://api.planespotters.net/pub/photos/hex/4CADF9`, then the browser exposed
only `TypeError: Failed to fetch`. Resource Timing recorded status `0`, zero
transferred bytes, and no readable response. No JSON, thumbnail, photographer
credit, or photo-page URL became available. The probe was not repeated.

Production remains disabled for two independent reasons:

1. the evaluated browser origin did not complete the documented CORS path;
2. the Photo API terms page does not expose a dated revision, so it does not
   satisfy the deployment-evidence gate even though the separate general terms
   are dated December 22, 2012.

This is an engineering record, not legal advice. Provider terms and behavior
can change and must be rechecked before any enablement.

## Official sources

- Photo API, documentation, and API-specific terms:
  <https://www.planespotters.net/photo/api>
- General terms:
  <https://www.planespotters.net/legal/termsofuse>
- Public hex endpoint:
  `https://api.planespotters.net/pub/photos/hex/{ICAO24}`

The Photo API page currently documents that:

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
- exactly one photo whose regular thumbnail uses
  `https://cdn.planespotters.net` and whose source page uses
  `https://www.planespotters.net/photo/`.

Returned thumbnail and photo-page strings are validated but not rewritten.
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

Synthetic success proves application behavior, not current provider CORS or
rights authorization.

## Live acceptance result

The one bounded browser-origin probe used:

- application origin: `http://127.0.0.1:5174`;
- ICAO24: `4CADF9`;
- API requests: exactly one;
- request mode: ordinary browser `fetch`, credentials omitted, no-store,
  redirects rejected;
- result: browser fetch failure before readable status, headers, or JSON;
- Resource Timing: response status `0`, transfer size `0`;
- thumbnail requests: zero.

Because the response was not readable, this probe cannot establish current
response shape, returned origins, thumbnail rendering, photographer credit, or
source-page navigation. A Worker proxy is not a workaround: it would violate
the selected direct-browser contract and the API prohibition on proxying and
re-exposing provider data.

Enablement requires all of the following:

1. dated API-terms evidence covering the actual public/free deployment model;
2. provider confirmation that the actual LiveTrafficStan production origin is
   accepted for browser CORS, if origin approval is required;
3. one new bounded check from that exact approved origin proving readable JSON,
   documented hosts, thumbnail rendering, credit, and source-page link;
4. unchanged direct loading, attribution, cache, storage, and service-worker
   behavior.

## Vessel images remain blocked

No automatic vessel-photo source met both exact hull identity and
machine-reliable display-rights requirements. The application therefore shows
no vessel photo section or placeholder.

Future vessel support requires a manually reviewed manifest:

```text
IMO -> Wikidata QID -> Commons file revision -> verified hull photograph
    -> author -> source -> selected license -> license URL -> exact credit
```

MMSI-only, vessel-name, fuzzy, arbitrary runtime P18, sister-ship, class, and
model substitutions remain prohibited. Public pages from MarineTraffic,
VesselFinder, ShipSpotting, JetPhotos, Airliners.net, or similar services are
not integration or display-rights evidence.
