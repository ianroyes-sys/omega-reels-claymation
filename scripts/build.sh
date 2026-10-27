#!/bin/bash
# Build every deterministic stage of a reel, from voiced lines + Ian shots to the finished, checked file.
#   bash scripts/build.sh <reel-id> [from-stage]
# Stages: audio omega ui fx sound compose qa   (from-stage skips the ones before it)
# Needs: audio/lines/NN.wav for every line, renders/NN/shots/NN.mp4 for every Ian line, ui/reels/NN.js + NN.timeline.json.
set -euo pipefail
R=${1:?reel id, e.g. 02}
FROM=${2:-audio}
cd "$(dirname "$0")/.."
FF=${FFMPEG:-ffmpeg}
PY_AUDIO=${PYTHON_AUDIO:-python3}          # needs numpy + scipy for sound.py
WHISPER=${WHISPER_CLI:-whisper-cli}         # whisper.cpp CLI, used by the qa stage
WMODEL=${WHISPER_MODEL:-models/ggml-large-v3-turbo.bin}
export FFMPEG="$FF"
MAX_SECONDS=${MAX_SECONDS:-70}            # house rule: about 65 s, hard ceiling 70 s

stages=(audio omega ui fx sound compose qa)
run=0
for s in "${stages[@]}"; do
  [ "$s" = "$FROM" ] && run=1
  [ $run = 1 ] || continue
  echo "== $s"
  case $s in
    audio)
      python3 scripts/build_audio.py "$R" | head -1
      total=$(python3 -c "import json;print(json.load(open('audio/$R-timings.json'))['total'])")
      python3 -c "import sys; sys.exit(0 if $total + 2.0 <= $MAX_SECONDS else 1)" \
        || { echo "✗ dialogue is ${total}s: over the ${MAX_SECONDS}s ceiling. Tighten lines or add SKIP in build_audio.py"; exit 3; } ;;
    omega) python3 scripts/omega_face.py "$R" ;;
    ui)
      python3 scripts/make_timeline.py "$R"
      python3 scripts/events.py "$R"
      (cd ui && FFMPEG="$FF" node render.mjs "$R-timeline.json" "top-$R.mp4" --reel "$R" | tail -1)
      cp "ui/top-$R.mp4" ui/top.mp4 ;;
    fx) python3 scripts/multiverse.py "$R" ;;
    sound)
      python3 scripts/sfxlib.py
      $PY_AUDIO scripts/sound.py "$R" ;;
    compose)
      python3 scripts/compose.py "$R"
      name=$(python3 -c "import json;print(json.load(open('scripts/$R-lines.json')).get('title','Reel $R'))")
      $FF -v error -y -i "renders/$R/$R-final.mp4" -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 192k -movflags +faststart "renders/$R/$R $name.mp4"
      echo "share copy: renders/$R/$R $name.mp4"
      bash scripts/deliver.sh "$R" ;;  # every built reel is also copied to $OMEGA_REELS_DESKTOP
    qa)
      f="renders/$R/$R-final.mp4"
      $FF -v error -y -i "$f" -vf "fps=1/3,scale=270:-1,tile=6x4" -frames:v 1 "renders/$R/qa-sheet.jpg"
      $FF -v error -y -i "$f" -ar 16000 -ac 1 "renders/$R/qa.wav"
      $WHISPER -m "$WMODEL" -f "renders/$R/qa.wav" -nt -np 2>/dev/null > "renders/$R/qa-transcript.txt"
      rm -f "renders/$R/qa.wav"
      lufs=$($FF -nostats -i "$f" -af ebur128 -f null - 2>&1 | grep -E "^[[:space:]]+I:" | tail -1 | awk '{print $2}' || true)
      dur=$($FF -i "$f" 2>&1 | grep -o "Duration: [0-9:.]*" | cut -d' ' -f2 || true)
      printf "duration %s  loudness %s LUFS\nsheet renders/%s/qa-sheet.jpg\ntranscript renders/%s/qa-transcript.txt\n" "$dur" "$lufs" "$R" "$R" | tee "renders/$R/QA.txt" ;;
  esac
done
