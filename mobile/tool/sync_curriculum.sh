#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$(cd "$(dirname "$0")/.." && pwd)/assets/courses"
mkdir -p "$DEST"
find "$ROOT/data" -maxdepth 1 -type f -name '*.json' -print0 | while IFS= read -r -d '' file; do cp "$file" "$DEST/"; done
test -s "$DEST/deutsch.json"
test -s "$DEST/zfa_official_curriculum.json"
echo "Synced $(find "$DEST" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ') curriculum JSON files."
