"""Retime ui/timeline.json from real dialogue timings.

usage: python3 make_timeline.py <reel-id>
Reads ui/reels/<id>.timeline.json. Keeps each cue's card/state, drops cues for lines cut from the edit, and writes ui/<id>-timeline.json.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
reel = sys.argv[1] if len(sys.argv) > 1 else "01"
ENDCARD = 2.0

base = json.load(open(ROOT / f"ui/reels/{reel}.timeline.json"))  # cue plan with placeholder times
timing = json.load(open(ROOT / f"audio/{reel}-timings.json"))
starts = {str(l["n"]): l["start"] for l in timing["lines"]}
total = timing["total"]

cues = [c for c in base["cues"] if c["id"] in ("coldopen", "endcard") or c["id"] in starts]
order = [c["id"] for c in cues if c["id"] in starts]
for c in cues:
    if c["id"] == "coldopen":
        c["start"], c["end"] = 0.0, starts[order[0]]
    elif c["id"] == "endcard":
        c["start"], c["end"] = round(total, 3), round(total + ENDCARD, 3)
    else:
        i = order.index(c["id"])
        c["start"] = starts[c["id"]]
        c["end"] = starts[order[i + 1]] if i + 1 < len(order) else round(total, 3)
base.update(cues=cues, duration=round(total + ENDCARD, 3), placeholder=False,
            note=f"Real timings from audio/{reel}-timings.json")
json.dump(base, open(ROOT / f"ui/{reel}-timeline.json", "w"), indent=1)
print(len(cues), "cues, duration", base["duration"])
