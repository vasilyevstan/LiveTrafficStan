#!/usr/bin/env bash

set -euo pipefail

readonly CLOUDFLARED_VERSION='2026.9.3'
readonly CLOUDFLARED_SHA256='58b3221b6a22d23825cb5a0b347600db39e24e5a5e97afa6e0ae67c34ef235ef'
readonly CLOUDFLARED_RPM_URL='https://pkg.cloudflare.com/cloudflared/rpm/x86_64/cloudflared-linux-x86_64.rpm'
readonly TOKEN_FILE='/etc/livetrafficstan-cloudflared-token'
readonly SERVICE_NAME='livetrafficstan-cloudflared.service'

fail() {
  printf 'cloudflared_install_failed reason=%s\n' "$1" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail 'root_required'
[[ "$#" -eq 2 ]] || fail 'usage_service_unit_path_and_sha256'
[[ -f "$1" ]] || fail 'missing_service_unit'
[[ "$2" =~ ^[0-9a-f]{64}$ ]] || fail 'invalid_service_unit_sha256'
printf '%s  %s\n' "$2" "$1" | sha256sum -c -

IFS= read -r tunnel_token
[[ "${#tunnel_token}" -ge 32 ]] || fail 'invalid_tunnel_token'

temporary_rpm="$(mktemp)"
temporary_token=''
cleanup() {
  rm -f "$temporary_rpm"
  if [[ -n "$temporary_token" ]]; then
    rm -f "$temporary_token"
  fi
}
trap cleanup EXIT

curl -6fsSL \
  --proto '=https' \
  --tlsv1.2 \
  --retry 3 \
  --retry-all-errors \
  --connect-timeout 10 \
  --max-time 180 \
  "$CLOUDFLARED_RPM_URL" \
  -o "$temporary_rpm"
printf '%s  %s\n' "$CLOUDFLARED_SHA256" "$temporary_rpm" |
  sha256sum -c -
rpm -Uvh --replacepkgs "$temporary_rpm" >/dev/null
[[ "$(/usr/bin/cloudflared --version)" == *"version $CLOUDFLARED_VERSION "* ]] ||
  fail 'unexpected_cloudflared_version'

id livetrafficstan-cloudflared >/dev/null 2>&1 ||
  useradd --system --home-dir /var/lib/livetrafficstan-cloudflared \
    --shell /sbin/nologin livetrafficstan-cloudflared

temporary_token="$(mktemp)"
printf '%s\n' "$tunnel_token" >"$temporary_token"
unset tunnel_token
install -o livetrafficstan-cloudflared -g livetrafficstan-cloudflared \
  -m 0400 "$temporary_token" "$TOKEN_FILE"
rm -f "$temporary_token"
temporary_token=''
install -o root -g root -m 0644 "$1" "/etc/systemd/system/$SERVICE_NAME"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

for _ in $(seq 1 30); do
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    printf 'cloudflared_version=%s service=active\n' "$CLOUDFLARED_VERSION"
    exit 0
  fi
  sleep 1
done

fail 'service_not_active'
