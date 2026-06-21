#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/Users/flyaways/ai-cycling-mvp}"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data/manager}"
TOKEN_FILE="${CLOUDFLARE_TUNNEL_TOKEN_FILE:-$DATA_DIR/cloudflared-token.txt}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/opt/homebrew/bin/cloudflared}"
CLOUDFLARED_METRICS="${CLOUDFLARED_METRICS:-127.0.0.1:20241}"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-20}"
FAILURE_LIMIT="${FAILURE_LIMIT:-3}"

CLOUDFLARED_PID_FILE="$DATA_DIR/cloudflared.pid"
CLOUDFLARED_LOG="$DATA_DIR/cloudflared.log"
CLOUDFLARED_ERR="$DATA_DIR/cloudflared-err.log"
SUPERVISOR_LOG="$DATA_DIR/cloudflared-supervisor.log"

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

child_pid=""

start_child() {
  if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
    log_msg "cloudflared binary not executable: $CLOUDFLARED_BIN"
    exit 1
  fi

  local token
  token="$(read_token)"
  "$CLOUDFLARED_BIN" tunnel \
    --protocol http2 \
    --metrics "$CLOUDFLARED_METRICS" \
    run \
    --token "$token" \
    >> "$CLOUDFLARED_LOG" \
    2>> "$CLOUDFLARED_ERR" &

  child_pid="$!"
  printf '%s\n' "$child_pid" > "$CLOUDFLARED_PID_FILE"
  log_msg "started cloudflared pid=$child_pid metrics=$CLOUDFLARED_METRICS"
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
  if [[ "$ha" =~ ^[0-9]+$ && "$ha" -ge 1 ]]; then
    failures=0
    continue
  fi

  failures=$((failures + 1))
  log_msg "unhealthy metrics ha_connections=$ha failures=$failures/$FAILURE_LIMIT"

  if [[ "$failures" -ge "$FAILURE_LIMIT" ]]; then
    stop_child
    failures=0
  fi
done
