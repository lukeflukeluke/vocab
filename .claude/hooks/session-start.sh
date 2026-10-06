#!/bin/bash
# Installs dependencies in Claude Code cloud sessions so `npm test` works straight away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (not npm ci) so the cached container's node_modules is reused when unchanged.
npm install --no-audit --no-fund

# Playwright is pinned to the version whose Chromium is preinstalled in /opt/pw-browsers.
# Do not download browsers here; just report if the pinned build is missing.
if [ -d /opt/pw-browsers ] && ! ls -d /opt/pw-browsers/chromium-1194 >/dev/null 2>&1; then
  echo "warning: Chromium build 1194 for @playwright/test 1.56.1 not found in /opt/pw-browsers" >&2
fi
