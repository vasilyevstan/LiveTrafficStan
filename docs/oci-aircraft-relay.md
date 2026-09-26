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

The OCI relay service was proven on **2026-09-26** and is running release
`76540a21291878b44e7f92ceecb37d03a366c0c7`. The Cloudflare Tunnel, Workers VPC
Service, Worker binding, and public application integration are not active
until their exact releases and production evidence are recorded. Current
production therefore continues to report aircraft unavailable when ADSB.lol
throttles Cloudflare's shared egress.

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
service account, and starts `livetrafficstan-cloudflared.service`.

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

Cloudflare Tunnel/VPC canary acceptance still requires:

- active QUIC connections after controlled cloudflared and VM restart;
- bounded representative-rate CPU below 70 percent;
- no OOM, swap storm, or service restart;
- sufficient memory headroom for relay plus cloudflared;
- one Worker-to-relay health and authenticated aircraft request;
- no public relay route or sensitive logging;
- zero incremental OCI and Cloudflare cost.

## Failure interpretation

| Observation | Meaning |
| --- | --- |
| `/healthz` unavailable locally | Relay process, unit, listener, or VM failure |
| Tunnel inactive, relay healthy | cloudflared token, QUIC egress, DNS, clock, or Cloudflare control-plane issue |
| VPC `fetch()` throws | VPC Service, Tunnel association, connector, or private origin unreachable |
| Relay `401` | Missing or mismatched Worker-to-relay secret |
| Relay local `503` with `Retry-After` | Global cadence/concurrency/backoff admission; no provider request started |
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
