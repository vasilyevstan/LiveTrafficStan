# OCI Aircraft Relay

## Purpose and activation status

Cloudflare Workers' shared outbound network identity can receive an immediate
`429` from ADSB.lol even when the same bounded request succeeds from a normal
residential connection. ADSB.lol's successful responses also do not currently
provide browser CORS that permits a direct production request. LiveTrafficStan
therefore keeps Cloudflare as the public application boundary and adds one
private, fixed-purpose relay:

```text
browser
  -> same-origin Cloudflare Worker /api/aircraft
  -> Workers VPC Service
  -> Cloudflare Tunnel
  -> loopback-only OCI relay
  -> https://api.adsb.lol/v2/point/...
```

The OCI relay service was proven on **2026-09-26** and initially ran release
`76540a21291878b44e7f92ceecb37d03a366c0c7`. Protected bootstrap run
`36267393879` then created remote-managed Tunnel
`361ff78a-2cba-4558-aba9-6990c9be12e2` and HTTP VPC Service
`01a0df44-6600-79a2-a14f-88b6606869fb`. Pinned `cloudflared` `2026.9.3` is
active on the relay VM with four IPv6 QUIC connections and a dedicated
`0400` token file. The Worker binding is checked into `wrangler.jsonc` and is
used only when a protected deployment selects `oci-private-relay`.

The current application source is
`9f5ee37d9ad2bbeedb20a89ea08e7cd5629e36e8`; it continues to use active
relay source `18082a1e78d5bb9b0c2565f1fe82ae675e1cc9a8`, while
`1f9a2fd322f141fe761d3bf00113e1ab60526e6c` remains the relay rollback target.
Canonical production run `37134585858`, attempt 2, passed as running version
`85d1418b-3316-4299-9758-20810aa58898`.

The first same-source run `36627068064` had already deployed healthy
application, orbital, enrichment, weather, and marine surfaces as version
`7b1233c9-3461-440b-ac5f-1d30b02c0525`, but aircraft smoke exposed a recurrent
guest/network `502`. The supported OCI diagnostic reboot moved the instance
through `STOPPING` at `20:35:14Z`, `STARTING` at `20:35:57Z`, and `RUNNING`
at `20:36:28Z`; real bounded ADSB JSON recovered at `20:38:04Z`. No
application rollback, relay source change, credential rotation, provider
fallback, firewall change, cache, or privacy-boundary change was used. #174
records the evidence and is closed.

This component does not move the application to OCI. An OCI, Tunnel, or relay
failure must affect aircraft only; Static Assets, the map, vessels, weather,
search, history, and PWA behavior remain on their existing boundaries.

## Isolation and free-tier boundary

The relay uses a dedicated sibling OCI compartment and does not share BetStan's
compartment, VM, VCN, subnet, route tables, volumes, Kubernetes installation,
IAM principal, credentials, deployment workflow, or lifecycle.

The provisioned workload is intentionally limited to:

- one `VM.Standard.E2.1.Micro`;
- one 50 GB boot volume;
- one dedicated VCN, subnet, NSG, Internet Gateway, and Service Gateway;
- no public IPv4;
- one stable reserved IPv6 address used for ADSB.lol egress;
- no public ingress;
- loopback relay listener `127.0.0.1:8788`;
- Cloudflare Tunnel egress over QUIC/UDP 7844;
- expected incremental monthly OCI cost of zero.

A compartment quota denies A1, GPU, dense, bare-metal, extra volume,
load-balancer, database, object-storage, and paid fallback resources. The
tenancy still shares Oracle account administration, regional service limits,
the Oracle control plane, and physical infrastructure, so this is workload
isolation rather than absolute tenancy isolation.

Provisioning and cleanup must use the exact recorded compartment and resource
OCIDs. Never discover resources by name and delete them tenancy-wide. Before
and after any infrastructure mutation, compare the recorded inventory of
pre-existing instances, volumes, networks, routes, policies, power state, and
cost. Stop if another deployment changes.

## Provider and privacy contract

The relay is not a generic proxy. It accepts only:

```text
GET /v2/point/{latitude}/{longitude}/{radiusNm}
```

The implementation:

- requires a bearer token before starting upstream work;
- accepts only canonical finite coordinates and integer radius 1-54 NM;
- rejects query strings, other methods, encoded separators, and redirects;
- constructs only the fixed ADSB.lol point URL;
- forwards only `Accept: application/json` and the stable LiveTrafficStan
  `User-Agent`;
- never forwards browser cookies, browser authorization, client IP, range,
  forwarding, or arbitrary headers;
- applies a ten-second total deadline and 4 MiB counted response limit;
- preserves upstream status, bounded body, `Content-Type`, and `Retry-After`;
- uses no response cache, retry loop, queue, provider fallback, or stale
  success;
- logs no path, coordinate, authorization value, header, or provider body.

Cloudflare and OCI still process ordinary transport metadata. Rounded query
coordinates transit Cloudflare and ADSB.lol, but the application does not
persist them in relay state or application logs.

## Global provider admission

All tabs and Worker invocations share one provider admission boundary:

- at most one upstream request is in flight;
- upstream requests start no more often than once every 20 seconds;
- an excess request receives local `503` plus bounded `Retry-After` and does
  not reach ADSB.lol;
- that local response alone carries
  `X-LiveTrafficStan-Relay-Status: admission`; upstream responses cannot
  supply the marker because the relay forwards only reviewed response headers;
- an upstream `429` with readable `Retry-After` sets relay-wide backoff;
- an upstream `429` without readable guidance uses bounded exponential backoff
  from 20 seconds through five minutes.

The relay atomically persists only `nextAllowedAtMs` and `failureCount` under
the systemd-managed private state directory. It never persists a coordinate,
request path, provider response, or aircraft record. A controlled test proved
that an immediate request returned `503 Retry-After: 20` and, after a service
restart, the next request still returned `503 Retry-After: 19`.

## Runtime and release layout

The service uses built-in Node.js modules only. It has no package installation,
framework, container, reverse proxy, database, or application cache.

| Component | Pin | SHA-256 |
| --- | --- | --- |
| Node.js Linux x64 archive | `24.13.1` | `30215f90ea3cd04dfbc06e762c021393fa173a1d392974298bbc871a8e461089` |
| cloudflared Linux x86_64 RPM | `2026.9.3` | `58b3221b6a22d23825cb5a0b347600db39e24e5a5e97afa6e0ae67c34ef235ef` |

The relay layout is:

```text
/opt/livetrafficstan-aircraft-relay/releases/<source-sha>/
  relay.mjs
  server.mjs
  livetrafficstan-aircraft-relay.service
/opt/livetrafficstan-aircraft-relay/current -> releases/<source-sha>
/opt/livetrafficstan-aircraft-relay/previous -> releases/<prior-source-sha>
/etc/livetrafficstan-aircraft-relay.env
/var/lib/livetrafficstan-aircraft-relay/admission-state.json
```

The root-owned environment file contains the relay authentication token and
release SHA and has mode `0600`. The state file is owned by the dedicated
service account and has mode `0600`. Neither belongs in Git, a workflow
artifact, an issue, a command argument, or a log.

`deploy-release.sh` accepts an exact 40-character source SHA and SHA-256 values
for the two modules and systemd unit. It downloads only those paths from that
commit, verifies every byte, refuses to overwrite a conflicting immutable
release directory, atomically switches `current`, and requires `/healthz` to
return the exact release SHA. Failed activation restores the prior symlink,
environment release SHA, service unit when available, and service.

Node/V8 requires executable memory. `MemoryDenyWriteExecute=true` caused an
immediate `SIGTRAP`; running Node with `--jitless` then broke built-in `fetch`
because Undici requires WebAssembly. The relay unit deliberately omits those
two incompatible settings while retaining no-new-privileges, private
devices/tmp, protected home/system/kernel/control-group settings, restrictive
address families, and a restrictive umask.

## Exact relay deployment

Create the environment file once through a private management path. Preserve
the token on later deployments:

```text
LTS_RELAY_AUTH_TOKEN=<at-least-32-random-characters>
LTS_RELAY_RELEASE_SHA=<40-character-source-sha>
LTS_RELAY_HOST=127.0.0.1
LTS_RELAY_PORT=8788
LTS_RELAY_STATE_PATH=/var/lib/livetrafficstan-aircraft-relay/admission-state.json
```

From the exact checked-out source, compute the three required hashes:

```bash
sha256sum \
  infra/oci/aircraft-relay/relay.mjs \
  infra/oci/aircraft-relay/server.mjs \
  infra/oci/aircraft-relay/livetrafficstan-aircraft-relay.service
```

Invoke the checked `deploy-release.sh` as root through OCI Run Command or a
short-lived Bastion session, passing the exact source SHA followed by those
three hashes. Do not pass the authentication token as an argument. Verify:

```bash
curl --fail --silent http://127.0.0.1:8788/healthz
systemctl is-active livetrafficstan-aircraft-relay.service
systemctl is-enabled livetrafficstan-aircraft-relay.service
```

The health route is provider-free and must return only `status: ok` plus the
exact release SHA. A live authenticated provider probe is separate, bounded,
and rate-conscious.

## Cloudflare Tunnel and VPC Service bootstrap

`.github/workflows/bootstrap-aircraft-relay.yml` is a protected, serialized,
exact-current-`main` operation. It creates or verifies:

- remote-managed Tunnel `livetrafficstan-aircraft-relay`;
- HTTP Workers VPC Service `livetrafficstan-aircraft-relay`;
- fixed origin `127.0.0.1`;
- fixed HTTP port `8788`;
- the exact Tunnel association.

An existing resource with the same name but different configuration is a
hard failure; the workflow does not mutate or adopt it. The protected
Cloudflare token needs Cloudflare Tunnel Write, Connectivity Directory Admin,
and later Connectivity Directory Bind for Worker deployment.

The tunnel token is never printed or uploaded as plaintext. The dispatch
accepts a base64-encoded ephemeral RSA public key, encrypts the token with
RSA-OAEP/SHA-256, uploads only the ciphertext and non-secret service metadata,
retains the artifact for one day, and removes it from the runner after upload.

Example public-key preparation:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out tunnel-handoff-private.pem
openssl pkey -in tunnel-handoff-private.pem -pubout \
  -out tunnel-handoff-public.pem
base64 < tunnel-handoff-public.pem | tr -d '\n'
```

Dispatch from exact current `main`, download the encrypted artifact, and
decrypt locally with matching OAEP/SHA-256 parameters. Keep both private key
and plaintext token outside the repository and delete the plaintext handoff
after installation.

`install-cloudflared.sh` reads the tunnel token from standard input, verifies
the supplied systemd unit SHA-256, downloads the pinned Cloudflare RPM over
IPv6, verifies its checksum, writes a `0400` token file owned by the dedicated
service account, and starts `livetrafficstan-cloudflared.service`. It accepts
both newline-terminated input and the bootstrap artifact's no-trailing-newline
plaintext after decryption.

The cloudflared unit:

- uses `--token-file`, never a token argument or environment value;
- forces QUIC and the VM's IPv6 edge path rather than silently depending on
  HTTP/2 or unavailable public IPv4;
- runs as an unprivileged dedicated user;
- requires the relay service;
- exposes no public hostname and opens no inbound listener;
- retains systemd hardening compatible with the Go binary.

## Validation evidence

The stable OCI IPv6 identity completed four ADSB.lol requests started exactly
20 seconds apart. All four returned HTTP `200`, JSON aircraft arrays, no
redirect, no `Retry-After`, approximately 1.4-1.7 KiB responses, and
approximately 0.04-0.06 second latency.

The deployed relay then passed:

- exact-SHA provider-free health;
- one authenticated `200 application/json` aircraft response;
- canonical path, authentication, timeout, body-cap, redirect, cadence,
  concurrency, backoff, and persistence tests;
- restart-persistent admission state;
- active and enabled systemd state;
- absence of coordinates, authorization, headers, and provider payloads from
  application logs;
- unchanged inventory for the 32 pre-existing tenancy resources;
- unchanged projected monthly OCI cost of `0.0 EUR`.

The first Tunnel connector canary proved:

- four active IPv6 QUIC connections;
- automatic reconnection after controlled cloudflared service and complete VM
  restarts;
- approximately 24 MB connector memory after service restart and 66 MB during
  the immediate post-boot check;
- no connector service restart;
- relay health remained exact and available throughout;
- no public relay route.

Production activation and the final canary additionally proved:

- exact-release Worker requests reached the authenticated private relay and
  returned real `200 application/json` aircraft payloads;
- one relay-local `503 Retry-After: 19` recovered to later `200` responses
  through the existing aircraft scheduler;
- four real aircraft rendered with one MapLibre canvas at desktop and mobile;
- a 70-second sample measured 0.0322% relay CPU, 0.2052% cloudflared CPU, and
  0.2374% combined CPU;
- relay memory was approximately 39 MB and cloudflared approximately 26 MB,
  with approximately 460 MB still available;
- zero service restarts, swap use, or OOM-killer evidence;
- no public relay route or sensitive application logging;
- projected incremental OCI and Cloudflare cost remained zero.

### Recurrent guest/network recovery

The 2026-09-29 recurrence proved that an OCI instance lifecycle of `RUNNING`
does not establish guest agent, connector, or VPC reachability. Production VPC
fetches threw while a bounded Run Command remained `ACCEPTED` without guest
acknowledgement. An ordinary soft reset did not produce durable recovery, and
`REBOOTMIGRATE` was correctly rejected because no maintenance event was
pending.

The supported `DIAGNOSTICREBOOT` showed the explicit lifecycle
`STOPPING -> STARTING -> RUNNING`. Production then progressed truthfully from
connector-startup `502`, through relay-local `503 Retry-After: 7`, to real
`200 application/json`. That recovery established the supported procedure but
did not eliminate the underlying no-SLA guest/network recurrence.

A later exact release activation used the checked `deploy-release.sh` through
the existing noninteractive sudo policy. It verified the deployment script,
relay, server, and unit hashes; preserved the secret and admission state;
switched `current` to `18082a1e...`; retained `1f9a2fd...` as `previous`; and
proved `active`, `enabled`, loopback `status: ok`, and the exact relay release.
Guest-plugin timestamps may remain stale while queued commands later complete;
use command execution state and output, not plugin timestamps alone.

During compact-controls deployment run
`36598727844`, the same isolated path again returned aircraft HTTP `502` while
Static Assets, the Worker release, and the orbital endpoint remained healthy.
The supported diagnostic reboot moved the instance through `STOPPING`,
`STARTING`, and `RUNNING`; four bounded public probes returned `502` before
real `200 application/json` at `2026-09-29T16:39:35Z`. Exact application
source `ddc414e26dd8dacb5a9d4e1f528ccec44dc0bf4f` then passed canonical
deployment run `36599339842` through the unchanged VPC Service, Tunnel, and
relay release.

During map follow-up deployment run `36887715303`, attempt 1 published exact
application source `560a9bb409a92036996e391500ec36b1d7b0e728` as Cloudflare
version `45cccadf-0456-4812-aed3-54286886a3c0`. Smoke reached the exact new
Worker release and healthy Static Assets/orbital surfaces, but only the
unchanged aircraft path returned `502 Aircraft upstream unavailable`. The
supported diagnostic reboot moved the instance through `STOPPING` at
`2026-10-01T15:55:29Z`, `STARTING` at `15:56:34Z`, and `RUNNING` at
`15:56:55Z`. Four bounded public probes remained `502`; the fifth returned real
`200 application/json` at `15:58:24Z`. The exact same authorized deployment
inputs passed every step on attempt 2 as version
`6b6043b8-3a14-49c0-8af3-b5843f8eb09f`. No application rollback, shared-egress
fallback, provider substitution, relay source change, credential rotation, or
firewall change was used.

The smaller-marker deployment repeated the same independent recurrence.
Run `36908605830`, attempt 1, deployed exact application source
`9e1d8c23f9047d0bf57b12bd4abc7d5fcae90f63`; all source validation and the
Worker deployment passed, while only aircraft smoke returned
`502 Aircraft upstream unavailable`. The supported diagnostic reboot moved the
instance through `STOPPING` at `2026-10-01T18:45:05Z`, `STARTING` at
`18:45:57Z`, and `RUNNING` at `18:46:20Z`. Four bounded probes returned `502`,
one returned `504`, and the next returned real `200 application/json` with the
exact release header at `18:48:20Z`. The unchanged workflow passed on attempt
2 as Cloudflare version `d83f68ae-907e-4b2d-a086-00b4fde00372`; no application
rollback, relay change, credential rotation, provider fallback, or firewall
change was used.

The traffic-recovery deployment repeated the aircraft-only recurrence without
any relay code or topology change. Run `36996396517` deployed exact source
`bba0bf4f7a69939e3c07fbeb24470fa959f6f20a`, then only aircraft smoke
returned `502`. One `DIAGNOSTICREBOOT` was requested at
`2026-10-02T10:41:00Z`; OCI reported `STOPPING` at `10:41:02Z`, `STARTING`
at `10:42:10Z`, and `RUNNING` at `10:42:50Z`. Four bounded 20-second probes
remained `502`; the fifth returned real aircraft JSON at `10:44:21Z`.
Unchanged deployment attempt 2 then met an unrelated AWC METAR `504` after
aircraft passed, and unchanged attempt 3 passed the complete smoke. Do not
apply the OCI recovery to an isolated weather-provider failure.

The shell-balanced Starlink deployment repeated the same independent
infrastructure recurrence. Run `37120958690` published exact application
source `d565b56278e81ff2478ab1e476c269084f2297d4` as version
`32bffacf-3f90-4f9c-953b-bb50a6ec0ff4`, then only aircraft smoke returned
`502`. Direct ADSB.lol and all non-aircraft production surfaces were healthy.
One exact-instance `DIAGNOSTICREBOOT` reached `STOPPING` at
`2026-10-03T11:54:26Z`, `STARTING` at `11:55:12Z`, and `RUNNING` at
`11:55:46Z`; bounded probes progressed through four `502`s and one `504`
before real aircraft JSON at `11:57:37Z`. Unchanged run `37121314015` passed
the complete smoke as version `e9e473d1-fac5-4594-b62b-7ba68573efeb`.

The UI release #282 encountered the same isolated failure in deployment
`37134585858`, attempt 1: source `9f5ee37d...` and version
`ef0ff9a6-6a28-46c2-ba1b-550e80674514` were deployed, with only private
aircraft returning `502`. Static/orbital and direct ADSB.lol were healthy;
Worker and relay source/configuration were unchanged. One exact-instance
`DIAGNOSTICREBOOT` was requested at `2026-10-03T15:55:57.881Z`. Observed
states were `STOPPING` at `15:55:59.771Z`, `STARTING` at `15:56:54.566Z`,
and `RUNNING` at `15:57:27.107Z`. Bounded probes returned `502` at
`15:58:16.540Z`, then real JSON with two aircraft at `15:58:39.121Z`.
All eleven before/after resource groups, power state, and cost configuration
matched. The unchanged workflow passed complete smoke at `15:59:57.387Z`
as version `85d1418b-3316-4299-9758-20810aa58898`. No rollback, credential
rotation, provider fallback, new resource, or network-policy change was used.
This is recovery evidence, not a permanent repair; #174 remains open.

After source `18082a1e...` activated the reviewed admission marker and smoke
policy, canonical run `36642794309` passed. A separate bounded production
probe returned real `200 application/json`, then exact-release local
`503 Retry-After: 20` with
`X-LiveTrafficStan-Relay-Status: admission`, then real JSON after the advised
wait. That proof created only two provider requests; the rejected admission
created none.

## Failure interpretation

| Observation | Meaning |
| --- | --- |
| `/healthz` unavailable locally | Relay process, unit, listener, or VM failure |
| Tunnel inactive, relay healthy | cloudflared token, QUIC egress, DNS, clock, or Cloudflare control-plane issue |
| VPC `fetch()` throws | VPC Service, Tunnel association, connector, or private origin unreachable |
| Worker local `503` with `Retry-After: 20` before VPC fetch | Missing/short secret, absent binding, or invalid deployment mode; no shared-egress fallback |
| Relay `401` | Missing or mismatched Worker-to-relay secret |
| Relay local `503` with `Retry-After` and `X-LiveTrafficStan-Relay-Status: admission` | Global cadence/concurrency/backoff admission; no provider request started |
| Unmarked relay-preserved `503` | ADSB.lol returned `503`; fail without an admission retry |
| Relay-preserved `429` | ADSB.lol throttled the stable OCI identity |
| Relay `502` | Upstream network/read/redirect/body-limit failure |
| Relay `504` | Ten-second total upstream deadline exceeded |

Never respond by rotating OCI addresses, changing region, spoofing headers,
adding a public CORS proxy, bypassing the relay admission boundary, or falling
back to Cloudflare's shared egress in the same request.

## Rollback and cleanup

Application rollback must restore a recorded compatible Worker/relay pair.
When the prior Worker does not depend on the new relay, restore the Worker
first, then restore the relay only if necessary. Exact-SHA health and one
bounded provider result are required after restoration.

After private deployment is proven, remove only the exact temporary management
resources recorded for this project:

- Bastion sessions and Bastion;
- temporary SSH security-list rule;
- SSH daemon access used for bootstrap;
- serial-console connection;
- exact temporary upload files.

Do not remove the dedicated compartment, VCN, VM, stable IPv6 address, state
file, relay token, tunnel, or VPC Service during ordinary release cleanup.
Never delete `dev`, another deployment's resource, or a tenancy resource found
only by name.

## Re-evaluation triggers

Stop or explicitly redesign this path if:

- ADSB.lol's published terms prohibit the fixed noncommercial relay;
- the stable OCI identity receives first-request `403` or `429`;
- expected OCI cost is no longer zero;
- Workers VPC leaves free beta without an accepted zero-cost replacement;
- cloudflared cannot run with safe measured E2 Micro headroom;
- private routing or no-sensitive-log behavior cannot be proven;
- OCI reclaims the instance and equivalent free capacity is unavailable;
- any operation would modify or consume capacity required by another
  deployment.

There is no automatic provider, region, instance, or address fallback.
