#!/usr/bin/env bash
# Copy a reel to a posting folder: $OMEGA_REELS_DESKTOP/NN Title/ (default ~/Desktop/Omega Reels) (video, plus POST.md once packaged).
# Usage: bash scripts/deliver.sh NN [NN…]   build.sh runs it after every build; package runs it again to add POST.md. Copies, never moves.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${OMEGA_REELS_DESKTOP:-$HOME/Desktop/Omega Reels}"
mkdir -p "$DEST"
for R in "$@"; do
  name=$(python3 -c "import json;print(json.load(open('scripts/$R-lines.json')).get('title','Reel $R'))")
  src="renders/$R/$R $name.mp4"
  [ -f "$src" ] || { echo "missing $src (run build.sh $R compose)"; exit 1; }
  out="$DEST/$R $name"
  mkdir -p "$out"
  cp "$src" "$out/"
  [ -f "renders/$R/POST.md" ] && cp "renders/$R/POST.md" "$out/POST.md"
  echo "delivered: $out"
done
[ -f renders/BATCH.md ] && cp renders/BATCH.md "$DEST/BATCH.md" || true
