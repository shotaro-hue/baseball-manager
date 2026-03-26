#!/bin/bash
set -euo pipefail

# リモート環境（Claude Code on the web）以外ではスキップ
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 120000}'

cd "$CLAUDE_PROJECT_DIR"
npm install
