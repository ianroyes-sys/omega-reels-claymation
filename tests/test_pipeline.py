"""Tests for the deterministic, model-free parts of the pipeline.

Run from the repo root:  python3 -m unittest discover -s tests -v
Standard library only: no ffmpeg, numpy or Playwright needed.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REELS = sorted(p.name.split("-")[0] for p in (ROOT / "scripts").glob("*-lines.json"))
UNIVERSES = {"holo", "crt", "arcade", "neon", "silent", "vhs"}
OMEGA_KEYS = {"close-neutral", "close-folded", "close-present", "close-hips", "wide"}


def load(rel):
    return json.loads((ROOT / rel).read_text())


class ReelDataTest(unittest.TestCase):
    """Every shipped reel follows the house rules the skill and build.sh rely on."""

    def test_reels_found(self):
        self.assertGreaterEqual(len(REELS), 1)

    def test_lines_meta_and_cta(self):
        for r in REELS:
            with self.subTest(reel=r):
                meta = load(f"scripts/{r}-lines.json")
                for key in ("title", "repo", "word", "voices", "lines"):
                    self.assertIn(key, meta)
                self.assertRegex(meta["word"], r"^[A-Z]+$")
                last = meta["lines"][-1]
                self.assertEqual(last["who"], "OMEGA")
                self.assertIn(f"Comment {meta['word']}", last["text"])
                ns = [l["n"] for l in meta["lines"]]
                self.assertEqual(ns, sorted(set(ns)), "line numbers unique and ascending")
                self.assertTrue(set(meta.get("skip", [])) <= set(ns))

    def test_no_real_voice_ids(self):
        uuid = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
        for r in REELS:
            with self.subTest(reel=r):
                self.assertIsNone(uuid.search(json.dumps(load(f"scripts/{r}-lines.json")["voices"])))

    def test_plan_covers_every_line(self):
        for r in REELS:
            with self.subTest(reel=r):
                lines = {str(l["n"]) for l in load(f"scripts/{r}-lines.json")["lines"]}
                plan = load(f"scripts/{r}-plan.json")
                self.assertEqual(set(plan), lines)
                ian = [k for k, v in plan.items() if v["src"] == "ian"]
                self.assertLessEqual(len(ian), 6, "Ian's paid lip-sync shots are capped at 6")
                for k, v in plan.items():
                    if v["src"] == "omega":
                        self.assertIn(v["key"], OMEGA_KEYS, k)

    def test_timeline_cues_and_universes(self):
        for r in REELS:
            with self.subTest(reel=r):
                lines = {str(l["n"]) for l in load(f"scripts/{r}-lines.json")["lines"]}
                tl = load(f"ui/reels/{r}.timeline.json")
                ids = [c["id"] for c in tl["cues"]]
                self.assertEqual(ids[0], "coldopen")
                self.assertEqual(ids[-1], "endcard")
                self.assertTrue(set(ids[1:-1]) <= lines)
                self.assertTrue(set(tl.get("universes", {}).values()) <= UNIVERSES)
                self.assertTrue((ROOT / f"ui/reels/{r}.js").exists())


class StageTest(unittest.TestCase):
    """Run make_timeline.py, events.py and package.py against a tiny fake reel in a temp copy."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "scripts").mkdir()
        for f in ("make_timeline.py", "events.py", "package.py"):
            shutil.copy(ROOT / "scripts" / f, self.tmp / "scripts" / f)
        (self.tmp / "ui/reels").mkdir(parents=True)
        (self.tmp / "audio").mkdir()
        (self.tmp / "renders/99").mkdir(parents=True)
        lines = [
            {"n": 1, "who": "IAN", "text": "Omega! I need a demo."},
            {"n": 2, "who": "OMEGA", "text": "Step one."},
            {"n": 3, "who": "IAN", "text": "Cut line."},
            {"n": 4, "who": "OMEGA", "text": "Comment DEMO, and I'll send you the repo."},
        ]
        (self.tmp / "scripts/99-lines.json").write_text(json.dumps(
            {"title": "Demo", "repo": "https://github.com/example/demo", "word": "DEMO", "voices": {}, "lines": lines}))
        (self.tmp / "scripts/99-demo.md").write_text("# Reel 99\n\n## Caption\n\nA caption.\n\nComment DEMO.\n")
        cue = lambda i, card, phase: {"id": str(i), "start": 0, "end": 1, "card": card, "state": {"phase": phase}}
        (self.tmp / "ui/reels/99.timeline.json").write_text(json.dumps({
            "fps": 30, "poseFps": 12, "width": 1080, "height": 900, "duration": 10,
            "universes": {"home": "holo", "step1": "crt", "endcard": "holo"},
            "sfx": {"custom": "ding"},
            "cues": [{"id": "coldopen", "start": 0, "end": 1, "card": "home", "state": {"phase": "cold"}},
                     cue(1, "home", "ask"), cue(2, "step1", "custom"), cue(3, "step1", "x"), cue(4, "home", "post"),
                     {"id": "endcard", "start": 0, "end": 1, "card": "endcard", "state": {"phase": "end"}}]}))
        # line 3 was cut in the edit, so it has no timing
        (self.tmp / "audio/99-timings.json").write_text(json.dumps({"total": 8.0, "lines": [
            {"n": 1, "who": "IAN", "text": "", "start": 0.3, "end": 2.0},
            {"n": 2, "who": "OMEGA", "text": "", "start": 2.1, "end": 4.0},
            {"n": 4, "who": "OMEGA", "text": "", "start": 4.1, "end": 7.6}]}))

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_script(self, name):
        subprocess.run([sys.executable, str(self.tmp / "scripts" / name), "99"], check=True, capture_output=True, text=True)

    def test_make_timeline_retimes_and_drops_cut_lines(self):
        self.run_script("make_timeline.py")
        tl = json.loads((self.tmp / "ui/99-timeline.json").read_text())
        cues = {c["id"]: c for c in tl["cues"]}
        self.assertNotIn("3", cues)
        self.assertEqual((cues["coldopen"]["start"], cues["coldopen"]["end"]), (0.0, 0.3))
        self.assertEqual((cues["1"]["start"], cues["1"]["end"]), (0.3, 2.1))
        self.assertEqual((cues["4"]["start"], cues["4"]["end"]), (4.1, 8.0))
        self.assertEqual((cues["endcard"]["start"], cues["endcard"]["end"]), (8.0, 10.0))
        self.assertEqual(tl["duration"], 10.0)
        self.assertFalse(tl["placeholder"])

    def test_events_marks_universe_jumps_and_sfx(self):
        self.run_script("make_timeline.py")
        self.run_script("events.py")
        ev = json.loads((self.tmp / "audio/99-events.json").read_text())
        jumps = [(e["t"], e["from"], e["to"]) for e in ev["events"] if e["kind"] == "jump"]
        self.assertEqual(jumps, [(2.1, "holo", "crt"), (4.1, "crt", "holo")])
        self.assertEqual([s["universe"] for s in ev["sections"]], ["holo", "crt", "holo"])
        self.assertEqual(ev["sections"][-1]["t1"], 10.0)
        sfx = {e["phase"]: e["name"] for e in ev["events"] if e["kind"] == "sfx"}
        self.assertEqual(sfx["custom"], "ding")      # reel-specific phase from timeline "sfx"
        self.assertEqual(sfx["post"], "ding")        # default map in events.py
        self.assertEqual(sfx["end"], "cta")
        self.assertEqual(len([e for e in ev["events"] if e["kind"] == "line"]), 3)
        ts = [e["t"] for e in ev["events"]]
        self.assertEqual(ts, sorted(ts))

    def test_package_writes_post_and_batch_once(self):
        self.run_script("package.py")
        self.run_script("package.py")
        post = (self.tmp / "renders/99/POST.md").read_text()
        self.assertIn("**Keyword:** DEMO", post)
        self.assertIn("A caption.", post)
        self.assertIn("https://github.com/example/demo", post)
        batch = (self.tmp / "renders/BATCH.md").read_text()
        self.assertEqual(batch.count("| 99 |"), 1)


if __name__ == "__main__":
    unittest.main()
