#!/usr/bin/env bash
set -euo pipefail

LABEL="${CLOUDFLARED_ROOT_LABEL:-com.flyaways.ai-cycling-cloudflared}"
PLIST="${CLOUDFLARED_ROOT_PLIST:-/Library/LaunchDaemons/$LABEL.plist}"
ROOT_METRICS="${CLOUDFLARED_ROOT_METRICS:-127.0.0.1:20241}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

/bin/launchctl bootout "system/$LABEL" >/dev/null 2>&1 || true
/bin/rm -f "$PLIST"

while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  /bin/kill -TERM "$pid" >/dev/null 2>&1 || true
done < <(/usr/bin/pgrep -f "cloudflared .*--metrics $ROOT_METRICS" || true)

while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  owner="$(/bin/ps -o user= -p "$pid" 2>/dev/null | /usr/bin/xargs || true)"
  if [[ "$owner" == "root" ]]; then
    /bin/kill -TERM "$pid" >/dev/null 2>&1 || true
  fi
done < <(/usr/bin/pgrep -f "scripts/cloudflared-guard.sh" || true)

printf 'disabled %s and removed %s\n' "$LABEL" "$PLIST"
