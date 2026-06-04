#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/flyaways/ai-cycling-mvp"
APP_NAME="AI骑行助手系统管家"
DESKTOP_APP="/Users/flyaways/Desktop/${APP_NAME}.app"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.flyaways.ai-cycling-manager.plist"
MANAGER_LOG="$PROJECT_DIR/data/manager/manager.log"

mkdir -p "$PROJECT_DIR/data/manager"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$LAUNCH_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.flyaways.ai-cycling-manager</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$PROJECT_DIR" && npm run manager >> "$MANAGER_LOG" 2>&1</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>StandardOutPath</key>
  <string>$MANAGER_LOG</string>
  <key>StandardErrorPath</key>
  <string>$MANAGER_LOG</string>
</dict>
</plist>
PLIST

osacompile -l JavaScript -o "$DESKTOP_APP" \
  -e 'function run() {' \
  -e '  var app = Application.currentApplication();' \
  -e '  app.includeStandardAdditions = true;' \
  -e '  app.doShellScript("launchctl bootstrap gui/'"$(id -u)"' '"'"$LAUNCH_AGENT"'"' >/dev/null 2>&1 || true");' \
  -e '  app.doShellScript("open http://127.0.0.1:3210");' \
  -e '}'

echo "Installed manager app at: $DESKTOP_APP"
echo "LaunchAgent written to: $LAUNCH_AGENT"
