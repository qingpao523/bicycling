#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/flyaways/ai-cycling-mvp"
cd "$PROJECT_DIR"

if [ -f ".env.production.local" ]; then
  set -a
  source ".env.production.local"
  set +a
fi

npm run build
PORT="${APP_PORT:-3000}" HOSTNAME="${HOSTNAME:-127.0.0.1}" npm run start -- --port "${APP_PORT:-3000}" --hostname "${HOSTNAME:-127.0.0.1}"
