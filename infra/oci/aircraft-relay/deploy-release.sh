#!/usr/bin/env bash

set -euo pipefail

readonly NODE_VERSION='24.13.1'
readonly NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
readonly NODE_SHA256='30215f90ea3cd04dfbc06e762c021393fa173a1d392974298bbc871a8e461089'
readonly INSTALL_ROOT='/opt/livetrafficstan-aircraft-relay'
readonly ENV_FILE='/etc/livetrafficstan-aircraft-relay.env'
readonly SERVICE_NAME='livetrafficstan-aircraft-relay.service'
readonly SOURCE_ROOT='https://raw.githubusercontent.com/vasilyevstan/LiveTrafficStan'

fail() {
  printf 'relay_deploy_failed reason=%s\n' "$1" >&2
  exit 1
}

require_sha() {
  [[ "$1" =~ ^[0-9a-f]{64}$ ]] || fail "invalid_$2_sha256"
}

[[ "${EUID}" -eq 0 ]] || fail 'root_required'
[[ "$#" -eq 4 ]] || fail 'usage_release_sha_relay_sha_server_sha_unit_sha'

release_sha="$1"
relay_sha="$2"
server_sha="$3"
unit_sha="$4"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid_release_sha'
require_sha "$relay_sha" 'relay'
require_sha "$server_sha" 'server'
require_sha "$unit_sha" 'unit'
[[ -f "$ENV_FILE" ]] || fail 'missing_environment_file'

[[ "$(grep -c '^LTS_RELAY_AUTH_TOKEN=' "$ENV_FILE")" -eq 1 ]] ||
  fail 'invalid_auth_token_entry'
auth_token="$(sed -n 's/^LTS_RELAY_AUTH_TOKEN=//p' "$ENV_FILE")"
[[ "${#auth_token}" -ge 32 ]] || fail 'invalid_auth_token'

temporary_directory="$(mktemp -d)"
cleanup() {
  rm -f \
    "$temporary_directory/$NODE_ARCHIVE" \
    "$temporary_directory/relay.mjs" \
    "$temporary_directory/server.mjs" \
    "$temporary_directory/$SERVICE_NAME" \
    "$temporary_directory/environment" \
    "$temporary_directory/health"
  rmdir "$temporary_directory" 2>/dev/null || true
}
trap cleanup EXIT

install_node() {
  local install_directory="/opt/nodejs/node-v${NODE_VERSION}-linux-x64"

  if [[ -x "$install_directory/bin/node" ]] &&
    [[ "$("$install_directory/bin/node" --version)" == "v${NODE_VERSION}" ]]; then
    ln -sfn "$install_directory/bin/node" /usr/local/bin/node
    return
  fi

  curl -6fsSL \
    --proto '=https' \
    --tlsv1.2 \
    --retry 3 \
    --retry-all-errors \
    --connect-timeout 10 \
    --max-time 180 \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" \
    -o "$temporary_directory/$NODE_ARCHIVE"
  printf '%s  %s\n' \
    "$NODE_SHA256" \
    "$temporary_directory/$NODE_ARCHIVE" |
    sha256sum -c -

  install -d -m 0755 /opt/nodejs
  [[ ! -e "$install_directory" ]] ||
    fail 'unexpected_node_runtime_contents'
  tar -xJf "$temporary_directory/$NODE_ARCHIVE" -C /opt/nodejs
  ln -sfn "$install_directory/bin/node" /usr/local/bin/node
}

download_release_file() {
  local name="$1"
  local expected_sha="$2"

  curl -6fsSL \
    --proto '=https' \
    --tlsv1.2 \
    --retry 3 \
    --retry-all-errors \
    --connect-timeout 10 \
    --max-time 60 \
    "$SOURCE_ROOT/$release_sha/infra/oci/aircraft-relay/$name" \
    -o "$temporary_directory/$name"
  printf '%s  %s\n' "$expected_sha" "$temporary_directory/$name" |
    sha256sum -c -
}

write_environment() {
  local deployed_sha="$1"

  {
    printf 'LTS_RELAY_AUTH_TOKEN=%s\n' "$auth_token"
    printf 'LTS_RELAY_RELEASE_SHA=%s\n' "$deployed_sha"
    printf 'LTS_RELAY_HOST=127.0.0.1\n'
    printf 'LTS_RELAY_PORT=8788\n'
    printf 'LTS_RELAY_STATE_PATH=/var/lib/livetrafficstan-aircraft-relay/admission-state.json\n'
  } >"$temporary_directory/environment"
  install -o root -g root -m 0600 \
    "$temporary_directory/environment" \
    "$ENV_FILE"
}

rollback() {
  local previous_target="$1"

  if [[ "$previous_target" =~ ^releases/([0-9a-f]{40})$ ]]; then
    if [[ -f "$INSTALL_ROOT/$previous_target/$SERVICE_NAME" ]]; then
      install -o root -g root -m 0644 \
        "$INSTALL_ROOT/$previous_target/$SERVICE_NAME" \
        "/etc/systemd/system/$SERVICE_NAME"
    fi
    ln -sfn "$previous_target" "$INSTALL_ROOT/current"
    write_environment "${BASH_REMATCH[1]}"
    systemctl daemon-reload
    systemctl restart "$SERVICE_NAME" || true
  else
    systemctl disable --now "$SERVICE_NAME" || true
  fi
}

install_node
download_release_file 'relay.mjs' "$relay_sha"
download_release_file 'server.mjs' "$server_sha"
download_release_file "$SERVICE_NAME" "$unit_sha"

id livetrafficstan-relay >/dev/null 2>&1 ||
  useradd \
    --system \
    --home-dir /var/lib/livetrafficstan-aircraft-relay \
    --shell /sbin/nologin \
    livetrafficstan-relay

release_directory="$INSTALL_ROOT/releases/$release_sha"
if [[ -d "$release_directory" ]]; then
  printf '%s  %s\n' "$relay_sha" "$release_directory/relay.mjs" |
    sha256sum -c -
  printf '%s  %s\n' "$server_sha" "$release_directory/server.mjs" |
    sha256sum -c -
  printf '%s  %s\n' "$unit_sha" "$release_directory/$SERVICE_NAME" |
    sha256sum -c -
else
  install -d -o root -g root -m 0755 "$release_directory"
  install -o root -g root -m 0644 \
    "$temporary_directory/relay.mjs" \
    "$release_directory/relay.mjs"
  install -o root -g root -m 0644 \
    "$temporary_directory/server.mjs" \
    "$release_directory/server.mjs"
  install -o root -g root -m 0644 \
    "$temporary_directory/$SERVICE_NAME" \
    "$release_directory/$SERVICE_NAME"
fi
install -o root -g root -m 0644 \
  "$release_directory/$SERVICE_NAME" \
  "/etc/systemd/system/$SERVICE_NAME"

previous_target=''
if [[ -L "$INSTALL_ROOT/current" ]]; then
  previous_target="$(readlink "$INSTALL_ROOT/current")"
fi

activate_release() {
  write_environment "$release_sha" &&
    ln -sfn "releases/$release_sha" "$INSTALL_ROOT/current" &&
    systemctl daemon-reload &&
    systemctl enable "$SERVICE_NAME" >/dev/null &&
    systemctl restart "$SERVICE_NAME"
}

if ! activate_release; then
  rollback "$previous_target"
  fail 'release_activation'
fi

health_file="$temporary_directory/health"
healthy=false
for _ in $(seq 1 20); do
  if curl -fsS --max-time 3 \
    'http://127.0.0.1:8788/healthz' \
    -o "$health_file"; then
    if python3 - "$health_file" "$release_sha" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as health_file:
    health = json.load(health_file)

if health != {'status': 'ok', 'releaseSha': sys.argv[2]}:
    raise SystemExit(1)
PY
    then
      healthy=true
      break
    fi
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  rollback "$previous_target"
  fail 'health_check'
fi

if [[ "$previous_target" =~ ^releases/[0-9a-f]{40}$ ]] &&
  [[ "$previous_target" != "releases/$release_sha" ]]; then
  ln -sfn "$previous_target" "$INSTALL_ROOT/previous"
fi

printf 'relay_release=%s health=ok\n' "$release_sha"
