#!/bin/bash
# usage: fetch.sh <reel> <n> <url> [<n> <url> ...]  : download finished Ian shots into renders/<reel>/shots/NN.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
reel=$1; shift
mkdir -p "renders/$reel/shots"
while [ $# -gt 1 ]; do
  curl -sf -o "renders/$reel/shots/$(printf "%02d" "$1").mp4" "$2"; shift 2
done
ls "renders/$reel/shots" | wc -l
