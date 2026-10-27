"""Build the event map for a reel: the one list of hit points that the multiverse jumps and the sound design both read.

usage: python3 events.py <reel-id>
reads  ui/<id>-timeline.json (cues with card, phase, universe map), audio/<id>-timings.json
writes audio/<id>-events.json  {"duration", "sections": [{t0, t1, universe}], "events": [{t, kind, ...}]}

Kinds: jump (universe change, the big moment), card (card swap inside a universe), line (a line starts),
       sfx (a phase hit, named in SFX below or in timeline.json "sfx": {phase: kind}).
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
reel = sys.argv[1] if len(sys.argv) > 1 else "01"

# Default phase -> sound. Reels add their own phases in ui/timeline.json "sfx".
SFX = {
    "rejection": "notify", "aligned": "marker", "feeds": "typing", "filtered": "stamp", "build": "typing",
    "rizz": "typing", "nofacts": "strike", "fill": "typing", "card": "card", "stop": "alarm",
    "interview": "success", "draft": "typing", "sendit": "click", "wait": "deny", "end": "cta", "post": "ding",
}

tl = json.load(open(ROOT / f"ui/{reel}-timeline.json"))
timing = json.load(open(ROOT / f"audio/{reel}-timings.json"))
umap = tl.get("universes", {})
sfx_map = {**SFX, **tl.get("sfx", {})}
cues = sorted(tl["cues"], key=lambda c: c["start"])

events, sections = [], []
prev_card, prev_u = None, None
for c in cues:
    card = c.get("card")
    u = umap.get(card, "holo")
    t = round(c["start"], 3)
    if u != prev_u:
        if prev_u is not None:
            events.append({"t": t, "kind": "jump", "from": prev_u, "to": u})
        if sections:
            sections[-1]["t1"] = t
        sections.append({"t0": t, "t1": None, "universe": u})
    elif card != prev_card and prev_card is not None:
        events.append({"t": t, "kind": "card", "card": card})
    ph = c.get("state", {}).get("phase")
    if ph in sfx_map:
        events.append({"t": t, "kind": "sfx", "name": sfx_map[ph], "phase": ph, "dur": round(c["end"] - c["start"], 3)})
    prev_card, prev_u = card, u
sections[-1]["t1"] = tl["duration"]
for ln in timing["lines"]:
    events.append({"t": ln["start"], "kind": "line", "who": ln["who"], "n": ln["n"], "end": ln["end"]})
events.sort(key=lambda e: e["t"])
out = {"duration": tl["duration"], "sections": sections, "events": events}
json.dump(out, open(ROOT / f"audio/{reel}-events.json", "w"), indent=1)
print(len(events), "events;", " -> ".join(f'{s["universe"]}@{s["t0"]:.1f}' for s in sections))
