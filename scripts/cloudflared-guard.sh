#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/flyaways/ai-cycling-mvp}"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data/manager}"
TOKEN_FILE="${CLOUDFLARE_TUNNEL_TOKEN_FILE:-$DATA_DIR/cloudflared-token.txt}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/opt/homebrew/bin/cloudflared}"
CLOUDFLARED_METRICS="${CLOUDFLARED_METRICS:-127.0.0.1:20241}"
CLOUDFLARED_PROXY_URL="${CLOUDFLARED_PROXY_URL:-http://127.0.0.1:7897}"
CLOUDFLARE_PUBLIC_URL="${CLOUDFLARE_PUBLIC_URL:-https://bick.qingpao.fun/}"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-20}"
FAILURE_LIMIT="${FAILURE_LIMIT:-3}"

CLOUDFLARED_PID_FILE="${CLOUDFLARED_PID_FILE:-$DATA_DIR/cloudflared.pid}"
CLOUDFLARED_LOG="${CLOUDFLARED_LOG:-$DATA_DIR/cloudflared.log}"
CLOUDFLARED_ERR="${CLOUDFLARED_ERR:-$DATA_DIR/cloudflared-err.log}"
SUPERVISOR_LOG="${SUPERVISOR_LOG:-$DATA_DIR/cloudflared-supervisor.log}"

mkdir -p "$DATA_DIR"
cd "$PROJECT_DIR"

log_msg() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$SUPERVISOR_LOG"
}

read_token() {
  if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN"
    return
  fi

  if [[ ! -r "$TOKEN_FILE" ]]; then
    log_msg "missing token file: $TOKEN_FILE"
    exit 1
  fi

  tr -d '[:space:]' < "$TOKEN_FILE"
}

is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

ha_connections() {
  /usr/bin/curl -fsS --max-time 2 "http://$CLOUDFLARED_METRICS/metrics" 2>/dev/null \
    | /usr/bin/awk '/^cloudflared_tunnel_ha_connections/ { print int($2); found=1 } END { if (!found) print 0 }' \
    || printf '0\n'
}

proxy_curl_args=()

configure_proxy_env() {
  proxy_curl_args=()
  if [[ -z "$CLOUDFLARED_PROXY_URL" ]]; then
    return
  fi

  if /usr/bin/curl -fsS --max-time 5 --proxy "$CLOUDFLARED_PROXY_URL" "https://www.cloudflare.com/cdn-cgi/trace" >/dev/null 2>&1; then
    export HTTP_PROXY="$CLOUDFLARED_PROXY_URL"
    export HTTPS_PROXY="$CLOUDFLARED_PROXY_URL"
    export ALL_PROXY="$CLOUDFLARED_PROXY_URL"
    export NO_PROXY="127.0.0.1,localhost,::1"
    proxy_curl_args=(--proxy "$CLOUDFLARED_PROXY_URL")
    log_msg "using proxy for cloudflared edge: $CLOUDFLARED_PROXY_URL"
  else
    unset HTTP_PROXY HTTPS_PROXY ALL_PROXY
    export NO_PROXY="127.0.0.1,localhost,::1"
    log_msg "proxy unavailable, running cloudflared without proxy: $CLOUDFLARED_PROXY_URL"
  fi
}

public_status_code() {
  if [[ -z "$CLOUDFLARE_PUBLIC_URL" ]]; then
    printf '000\n'
    return
  fi

  /usr/bin/curl -sS -o /tmp/ai-cycling-cloudflared-public-check.out \
    -w '%{http_code}\n' \
    --max-time 8 \
    "${proxy_curl_args[@]}" \
    "$CLOUDFLARE_PUBLIC_URL" 2>/dev/null \
    || printf '000\n'
}

child_pid=""

start_child() {
  if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
    log_msg "cloudflared binary not executable: $CLOUDFLARED_BIN"
    exit 1
  fi

  local token
  token="$(read_token)"
  configure_proxy_env
  "$CLOUDFLARED_BIN" tunnel \
    --protocol http2 \
    --metrics "$CLOUDFLARED_METRICS" \
    run \
    --token "$token" \
    >> "$CLOUDFLARED_LOG" \
    2>> "$CLOUDFLARED_ERR" &

  child_pid="$!"
  printf '%s\n' "$child_pid" > "$CLOUDFLARED_PID_FILE"
  log_msg "started cloudflared pid=$child_pid metrics=$CLOUDFLARED_METRICS public=$CLOUDFLARE_PUBLIC_URL"
}

stop_child() {
  local pid="${child_pid:-}"
  if [[ -z "$pid" && -f "$CLOUDFLARED_PID_FILE" ]]; then
    pid="$(cat "$CLOUDFLARED_PID_FILE" 2>/dev/null || true)"
  fi

  if is_running "$pid"; then
    log_msg "stopping cloudflared pid=$pid"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..10}; do
      is_running "$pid" || break
      sleep 1
    done
    if is_running "$pid"; then
      log_msg "force killing cloudflared pid=$pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$CLOUDFLARED_PID_FILE"
  child_pid=""
}

trap 'log_msg "guard received shutdown"; stop_child; exit 0' INT TERM
trap 'stop_child' EXIT

failures=0
while true; do
  if ! is_running "$child_pid"; then
    start_child
    failures=0
  fi

  sleep "$CHECK_INTERVAL_SECONDS"

  if ! is_running "$child_pid"; then
    log_msg "cloudflared exited pid=$child_pid"
    continue
  fi

  ha="$(ha_connections)"
  status="$(public_status_code)"
  if [[ "$ha" =~ ^[0-9]+$ && "$ha" -ge 1 && "$status" =~ ^(2|3)[0-9][0-9]$ ]]; then
    failures=0
    continue
  fi

  failures=$((failures + 1))
  log_msg "unhealthy metrics ha_connections=$ha public_status=$status failures=$failures/$FAILURE_LIMIT"
  if /usr/bin/grep -q '1033' /tmp/ai-cycling-cloudflared-public-check.out 2>/dev/null; then
    log_msg "public probe returned 1033, restarting connector"
    failures="$FAILURE_LIMIT"
  fi

  if [[ "$failures" -ge "$FAILURE_LIMIT" ]]; then
    stop_child
    failures=0
  fi
done
